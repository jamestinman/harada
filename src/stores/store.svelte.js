import { browser } from '$app/environment';
import { supabase } from '$lib/supabaseClient.js';
import {
	buildGoalListMeta,
	buildCustomListMeta,
	updateGoalTimestamp,
	normalizeTodoListMeta
} from '$lib/todoUtils.js';
import { authStore } from './auth.svelte.js';

const defaultCell = () => ({ text: '', status: 'todo', readme: '', color: 'default', updated_at: null });

class Store {
	version = $state('0.0.7');
	activeTab = $state('harada');
	selectedGoalFilter = $state('all');
	selectedGoalForNew = $state('');
	sidebarOpen = $state(false);
	currentGoalIndex = $state(null);

	harada_chart = $state({
		grid: Array.from({ length: 81 }, () => defaultCell()),
		todos: []
	});

	saveStatus = $state('idle');
	isLoading = $state(true);
	isOnline = $state(browser ? navigator.onLine : true);
	syncError = $state(null);

	_isInitialized = false;
	_realtimeChannel = null;
	_savingPromise = null;
	_pendingSave = false;

	constructor() {
		if (!browser) return;

		window.addEventListener('online', () => {
			this.isOnline = true;
			if (!this._isInitialized) this.initialize();
		});
		window.addEventListener('offline', () => {
			this.isOnline = false;
		});

		this.initialize();
	}

	async initialize() {
		if (!browser || this._isInitialized) return;

		if (!authStore.user || !supabase) {
			this.isLoading = false;
			this._isInitialized = true;
			return;
		}

		this.isLoading = true;

		try {
			const data = await this.loadFromSupabase();
			if (data) {
				const grid = Array.isArray(data.grid) ? data.grid : [];
				// Ensure we always have exactly 81 cells
				const normalizedGrid = Array.from(
					{ length: 81 },
					(_, i) => (grid[i] ? { ...defaultCell(), ...grid[i] } : defaultCell())
				);
				this.harada_chart = {
					grid: normalizedGrid,
					todos: data.todos || []
				};
			}
		} catch (err) {
			console.error('Failed to initialize from Supabase:', err);
			this.syncError = err.message;
		} finally {
			this.isLoading = false;
			this._isInitialized = true;
		}

		this._subscribeToRealtime();
	}

	// --- Realtime ---

	_subscribeToRealtime() {
		if (!supabase || !authStore.user) return;

		this._unsubscribeRealtime();

		const userId = authStore.user.id;

		this._realtimeChannel = supabase
			.channel(`harada_realtime_${userId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'harada_charts',
					filter: `user_id=eq.${userId}`
				},
				(payload) => {
					if (payload.new?.grid) {
						this._applyRealtimeGridUpdate(payload.new.grid);
					}
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'tasks',
					filter: `user_id=eq.${userId}`
				},
				(payload) => {
					this._applyRealtimeTaskChange(payload);
				}
			)
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					this.syncError = null;
				}
			});
	}

	_unsubscribeRealtime() {
		if (this._realtimeChannel) {
			this._realtimeChannel.unsubscribe();
			this._realtimeChannel = null;
		}
	}

	_applyRealtimeGridUpdate(remoteGrid) {
		if (!Array.isArray(remoteGrid)) return;

		const currentGrid = this.harada_chart.grid;
		let changed = false;

		const nextGrid = currentGrid.map((localCell, i) => {
			const remoteCell = remoteGrid[i];
			if (!remoteCell) return localCell;

			const localTime = localCell?.updated_at ? new Date(localCell.updated_at).getTime() : 0;
			const remoteTime = remoteCell?.updated_at ? new Date(remoteCell.updated_at).getTime() : 0;

			if (remoteTime > localTime) {
				changed = true;
				return { ...defaultCell(), ...remoteCell };
			}
			return localCell;
		});

		if (changed) {
			this.harada_chart = { ...this.harada_chart, grid: nextGrid };
		}
	}

	_applyRealtimeTaskChange(payload) {
		const { eventType, new: newRow, old: oldRow } = payload;
		const id = newRow?.id || oldRow?.id;
		if (!id) return;

		// Soft-deleted or hard-deleted
		if (eventType === 'DELETE' || newRow?.deleted_at) {
			this.harada_chart = {
				...this.harada_chart,
				todos: this.harada_chart.todos.filter((t) => t.id !== id)
			};
			return;
		}

		const remoteTodo = this._taskRowToTodo(newRow);
		if (!remoteTodo) return;

		if (eventType === 'INSERT') {
			// Only add if not already present locally (we add optimistically before save)
			if (!this.harada_chart.todos.find((t) => t.id === remoteTodo.id)) {
				this.harada_chart = {
					...this.harada_chart,
					todos: [...this.harada_chart.todos, remoteTodo]
				};
			}
			return;
		}

		if (eventType === 'UPDATE') {
			const localTodo = this.harada_chart.todos.find((t) => t.id === remoteTodo.id);
			const remoteUpdatedAt = remoteTodo.updatedAt;
			const localUpdatedAt = localTodo?.updatedAt ?? 0;

			// Only apply if remote is strictly newer — protects in-progress local edits
			if (remoteUpdatedAt > localUpdatedAt) {
				this.harada_chart = {
					...this.harada_chart,
					todos: this.harada_chart.todos.map((t) => (t.id === remoteTodo.id ? remoteTodo : t))
				};
			}
		}
	}

	// --- Save ---

	saveNow() {
		if (!browser || !this._isInitialized) return Promise.resolve();
		return this._performSave();
	}

	// Backward-compatible alias
	queueSave() {
		return this.saveNow();
	}

	async _performSave() {
		if (!browser) return;

		if (this._savingPromise) {
			this._pendingSave = true;
			return this._savingPromise;
		}

		this._pendingSave = false;
		this.saveStatus = 'saving';

		const run = async () => {
			await this._executeSaveOnce();
			while (this._pendingSave) {
				this._pendingSave = false;
				await this._executeSaveOnce();
			}
		};

		this._savingPromise = (async () => {
			try {
				await run();
			} finally {
				this._savingPromise = null;
				this.saveStatus = this._pendingSave ? 'dirty' : 'idle';
			}
		})();

		return this._savingPromise;
	}

	async _executeSaveOnce() {
		if (!browser) return;

		if (!authStore.user || !supabase) {
			// Not authenticated — nothing to save to
			this.saveStatus = 'idle';
			return;
		}

		try {
			this.syncError = null;
			await this.saveToSupabase(
				this.harada_chart.grid,
				this.harada_chart.todos,
				'My Harada Chart'
			);
		} catch (err) {
			console.error('Save failed:', err);
			this.syncError = err.message;
		}
	}

	// --- Supabase IO ---

	async loadFromSupabase() {
		if (!browser || !authStore.user || !supabase) return null;

		try {
			this.syncError = null;

			const [chartResult, tasksResult] = await Promise.all([
				supabase.from('harada_charts').select('*').eq('user_id', authStore.user.id).single(),
				supabase.from('tasks').select('*').eq('user_id', authStore.user.id)
			]);

			const { data: chartData, error: chartError } = chartResult;
			const { data: taskRows, error: tasksError } = tasksResult;

			if (tasksError) throw tasksError;
			if (chartError && chartError.code !== 'PGRST116') throw chartError;

			const todos = (taskRows || [])
				.filter((row) => !row.deleted_at)
				.map((row) => this._taskRowToTodo(row))
				.filter(Boolean);

			if (!chartData && todos.length === 0) return null;

			return {
				grid: chartData?.grid || [],
				todos,
				title: chartData?.title || 'My Harada Chart'
			};
		} catch (err) {
			console.error('Failed to load from Supabase:', err);
			this.syncError = err.message;
			return null;
		}
	}

	async saveToSupabase(gridSnapshot, todosSnapshot, title = 'My Harada Chart') {
		if (!browser || !authStore.user || !supabase) return false;

		try {
			this.syncError = null;

			// Clone to plain objects so $state proxies serialize correctly
			const grid = this._toPlainArray(gridSnapshot);

			const { error: chartError } = await supabase
				.from('harada_charts')
				.upsert({ user_id: authStore.user.id, grid, title }, { onConflict: 'user_id' });

			if (chartError) throw chartError;

			const taskRows = (todosSnapshot || [])
				.map((todo) => this._todoToTaskRow(todo, authStore.user.id))
				.filter(Boolean);

			if (taskRows.length > 0) {
				const { error: tasksError } = await supabase.rpc('upsert_tasks_if_newer', {
					in_rows: taskRows
				});
				if (tasksError) throw tasksError;
			}

			return true;
		} catch (err) {
			console.error('Failed to save to Supabase:', err);
			this.syncError = err.message;
			return false;
		}
	}

	// --- Data mapping ---

	_toPlainArray(arr) {
		if (!Array.isArray(arr)) return [];
		return arr.map((item) => (item && typeof item === 'object' ? { ...item } : item));
	}

	_taskRowToTodo(row) {
		if (!row || typeof row !== 'object' || typeof row.id !== 'string') return null;

		const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
		const createdAt = row.created_at ? new Date(row.created_at).getTime() : updatedAt;

		return normalizeTodoListMeta({
			id: row.id,
			title: typeof row.title === 'string' ? row.title : '',
			markdown: typeof row.markdown === 'string' ? row.markdown : '',
			status: row.status === 'done' ? 'done' : 'todo',
			listType: row.list_type === 'custom' ? 'custom' : 'goal',
			listId: typeof row.list_id === 'string' ? row.list_id : 'goal:none',
			listName: typeof row.list_name === 'string' ? row.list_name : null,
			goalIndex: typeof row.goal_index === 'number' ? row.goal_index : null,
			parentId: typeof row.parent_id === 'string' ? row.parent_id : null,
			ordering:
				typeof row.ordering === 'number' && Number.isFinite(row.ordering)
					? row.ordering
					: createdAt,
			createdAt,
			updatedAt
		});
	}

	_todoToTaskRow(todo, userId) {
		if (!todo || typeof todo.id !== 'string') return null;
		const normalized = normalizeTodoListMeta(todo);
		const updatedAtMs =
			typeof normalized.updatedAt === 'number' && Number.isFinite(normalized.updatedAt)
				? normalized.updatedAt
				: Date.now();
		const createdAtMs =
			typeof normalized.createdAt === 'number' && Number.isFinite(normalized.createdAt)
				? normalized.createdAt
				: updatedAtMs;

		return {
			id: normalized.id,
			user_id: userId,
			title: typeof normalized.title === 'string' ? normalized.title : '',
			markdown: typeof normalized.markdown === 'string' ? normalized.markdown : '',
			status: normalized.status === 'done' ? 'done' : 'todo',
			list_type: normalized.listType === 'custom' ? 'custom' : 'goal',
			list_id: typeof normalized.listId === 'string' ? normalized.listId : 'goal:none',
			list_name: typeof normalized.listName === 'string' ? normalized.listName : null,
			goal_index: typeof normalized.goalIndex === 'number' ? normalized.goalIndex : null,
			parent_id: typeof normalized.parentId === 'string' ? normalized.parentId : null,
			ordering:
				typeof normalized.ordering === 'number' && Number.isFinite(normalized.ordering)
					? normalized.ordering
					: createdAtMs,
			created_at: new Date(createdAtMs).toISOString(),
			updated_at: new Date(updatedAtMs).toISOString(),
			deleted_at: null
		};
	}

	// --- Domain mutations ---

	updateTodo(id, patch) {
		if (!id || !patch) return;

		let nextPatch = patch;

		if (patch?.listType === 'custom') {
			nextPatch = { ...patch, ...buildCustomListMeta(patch.listName) };
		} else if (typeof patch?.goalIndex === 'number' || patch?.goalIndex === null) {
			nextPatch = { ...patch, ...buildGoalListMeta(patch.goalIndex) };
		}

		nextPatch = { ...nextPatch, updatedAt: Date.now() };

		const previousTodos = this.harada_chart.todos || [];
		let previousTodo = null;
		for (const todo of previousTodos) {
			if (todo.id === id) {
				previousTodo = todo;
				break;
			}
		}

		const updatedTodos = previousTodos.map((t) => (t.id === id ? { ...t, ...nextPatch } : t));
		this.harada_chart = { ...this.harada_chart, todos: updatedTodos };

		const updatedTodo = updatedTodos.find((t) => t.id === id);
		const goalIndexToUpdate = updatedTodo?.goalIndex ?? previousTodo?.goalIndex;
		if (typeof goalIndexToUpdate === 'number') {
			const nextGrid = [...this.harada_chart.grid];
			updateGoalTimestamp(nextGrid, goalIndexToUpdate);
			this.harada_chart = { ...this.harada_chart, grid: nextGrid };
		}

		this.saveNow();
	}

	deleteTodo(id) {
		if (!id) return;

		const previousTodos = this.harada_chart.todos || [];
		const todo = previousTodos.find((t) => t.id === id);
		const nextTodos = previousTodos.filter((t) => t.id !== id);
		this.harada_chart = { ...this.harada_chart, todos: nextTodos };

		if (todo && typeof todo.goalIndex === 'number') {
			const nextGrid = [...this.harada_chart.grid];
			updateGoalTimestamp(nextGrid, todo.goalIndex);
			this.harada_chart = { ...this.harada_chart, grid: nextGrid };
		}

		// Write a soft-delete to the tasks table so other devices remove it
		if (browser && authStore.user && supabase) {
			const now = new Date().toISOString();
			supabase
				.from('tasks')
				.update({ deleted_at: now, updated_at: now })
				.eq('id', id)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete task:', error);
				});
		}

		this.saveNow();
	}

	cycleTodoStatus(id) {
		if (!id) return;

		const previousTodos = this.harada_chart.todos || [];
		const todo = previousTodos.find((t) => t.id === id);
		if (!todo) return;

		const statuses = ['todo', 'done'];
		const currentIndex = statuses.indexOf(todo.status ?? 'todo');
		const nextStatus = statuses[(currentIndex + 1) % statuses.length];

		if (nextStatus === 'done' && (!todo.title || todo.title.trim() === '')) {
			this.deleteTodo(id);
			return;
		}

		const nextTodos = previousTodos.map((t) =>
			t.id === id ? { ...t, status: nextStatus, updatedAt: Date.now() } : t
		);
		this.harada_chart = { ...this.harada_chart, todos: nextTodos };

		if (typeof todo.goalIndex === 'number') {
			const nextGrid = [...this.harada_chart.grid];
			updateGoalTimestamp(nextGrid, todo.goalIndex);
			this.harada_chart = { ...this.harada_chart, grid: nextGrid };
		}

		this.saveNow();
	}

	// --- Auth ---

	handleAuthChange() {
		if (!browser) return;

		this._isInitialized = false;
		this._unsubscribeRealtime();

		if (!authStore.user) {
			// Logged out — clear to blank state
			this.harada_chart = {
				grid: Array.from({ length: 81 }, () => defaultCell()),
				todos: []
			};
			this.isLoading = false;
			return;
		}

		// Logged in — fetch fresh data and re-subscribe
		this.initialize();
	}

	// Export / import helpers (kept for menu)
	exportMarkdown(serializeToMarkdown, grid, todos) {
		const markdown = serializeToMarkdown(grid, todos);
		const blob = new Blob([markdown], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'harada-chart.md';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	importMarkdown(parseFromMarkdown, onLoaded) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.md,.markdown,text/markdown';
		input.onchange = (e) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (event) => {
				const content = event.target?.result;
				if (typeof content === 'string') {
					try {
						const parsed = parseFromMarkdown(content);
						if (confirm('Import markdown data? This will replace your current chart and todos.')) {
							this.harada_chart = {
								grid: parsed.grid || this.harada_chart.grid,
								todos: parsed.todos || this.harada_chart.todos
							};
							this.saveNow();
							onLoaded(parsed);
						}
					} catch (err) {
						alert('Failed to import markdown: ' + err.message);
					}
				}
			};
			reader.readAsText(file);
		};
		input.click();
	}
}

export const store = new Store();
