import { browser } from '$app/environment';
import { localGet, localSet } from '$lib/PersistentStorage.mjs';
import { supabase } from '$lib/supabaseClient.js';
import { mergeTodoLists, buildGoalListMeta, buildCustomListMeta, updateGoalTimestamp } from '$lib/todoUtils.js';
import { authStore } from './auth.svelte.js';

const STORAGE_KEY = 'harada-chart-data';
const TODO_STORAGE_KEY = 'harada-todos-v1';
const MARKDOWN_STORAGE_KEY = 'harada-markdown-data'; // Legacy - for migration only
const JSON_STORAGE_KEY = 'harada-data-v2'; // Unified JSON format matching Supabase
const LAST_SYNC_KEY = 'harada-last-sync';
const MIGRATION_FLAG_KEY = 'harada-migrated-to-supabase';

// Toggle this to enable verbose save/sync logging during debugging
const DEBUG_SAVE = false;

const defaultCell = () => ({ text: '', status: 'todo', readme: '', color: 'default', updated_at: null });

class Store {
  version = $state("0.0.1"); // Note: use tools/updateVersion.sh to update this so it stays in sync with package.json, android, ios
	activeTab = $state('harada');
	selectedGoalFilter = $state('all'); // 'all' | goalIndex as string
	selectedGoalForNew = $state(''); // filled once goals are known
	sidebarOpen = $state(false);
	currentGoalIndex = $state(null); // Current goal index (canonical) for highlighting in SquareMap
	
	// Harada chart state - the single source of truth
	harada_chart = $state({
		grid: Array.from({ length: 81 }, () => defaultCell()),
		todos: []
	});
	
	// Save status: 'idle' | 'dirty' | 'saving'
	saveStatus = $state('idle');
	isOnline = $state(browser ? navigator.onLine : true);
	lastSyncTime = $state(null);
	syncError = $state(null);
	realtimeSubscription = $state(null);
	
	// Internal save coordination flags
	_pendingSave = false;
	_savingPromise = null;
	_isInitialized = false;

	constructor() {
		if (!browser) return;

		// Listen for online/offline events
		window.addEventListener('online', () => {
			this.isOnline = true;
			this.initialize();
		});
		window.addEventListener('offline', () => {
			this.isOnline = false;
		});

		// Listen for visibility changes - sync when app comes back into focus
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden && this.isOnline && authStore.user && this._isInitialized) {
				// App came back into focus, sync with Supabase
				this.syncOnFocus();
			}
		});

		// Also listen for window focus events (for better cross-browser support)
		window.addEventListener('focus', () => {
			if (this.isOnline && authStore.user && this._isInitialized) {
				// Window gained focus, sync with Supabase
				this.syncOnFocus();
			}
		});

		// Ensure we have a final local snapshot when the page is closed
		window.addEventListener('beforeunload', () => {
			try {
				this.saveData(this.harada_chart.grid, this.harada_chart.todos);
			} catch (error) {
				console.error('Error saving data before unload:', error);
			}
		});

		// Initialize on creation (local-first; auth effects handled at module level)
		this.initialize();
	}

	// Initialize harada_chart from localStorage or Supabase
	async initialize() {
		if (!browser || this._isInitialized) return;
		
		// Load from localStorage first (always available)
		const localData = this.loadData(defaultCell, []);
		const localHasData =
			localData.grid.some((c) => c && c.text && c.text.trim()) || localData.todos.length > 0;

		// Start from local data while we optionally merge with Supabase
		let nextGrid = localData.grid || Array.from({ length: 81 }, () => defaultCell());
		let nextTodos = localData.todos || [];

		// If online and authenticated, try to load from Supabase and merge snapshots
		if (this.isOnline && authStore.user && supabase) {
			try {
				const supabaseData = await this.loadFromSupabase();
				
				if (supabaseData) {
					// Check if Supabase data is actually empty (no goals, no todos)
					const supabaseHasData =
						(supabaseData.grid || []).some((c) => c && c.text && c.text.trim()) ||
						(supabaseData.todos || []).length > 0;

					if (supabaseHasData && localHasData) {
						// Both sides have data – merge per-cell and per-todo
						nextGrid = this._mergeGrid(localData.grid, supabaseData.grid || []);
						nextTodos = mergeTodoLists(localData.todos || [], supabaseData.todos || []);
					} else if (supabaseHasData && !localHasData) {
						// Only Supabase has data – prefer remote
						nextGrid = supabaseData.grid || Array.from({ length: 81 }, () => defaultCell());
						nextTodos = supabaseData.todos || [];
					} else if (!supabaseHasData && localHasData) {
						// Only local has data – prefer local
						nextGrid = localData.grid || Array.from({ length: 81 }, () => defaultCell());
						nextTodos = localData.todos || [];
					}

					// Persist merged/selected snapshot locally and remotely
					this.harada_chart = {
						grid: nextGrid,
						todos: nextTodos
					};
					this.saveData(nextGrid, nextTodos);

					// Push the merged snapshot back to Supabase so devices converge
					if (authStore.user && supabase) {
						await this.saveToSupabase(nextGrid, nextTodos);
					}
					
					// Realtime updates disabled - they were causing conflicts with local edits
					// Instead, we sync when the app comes back into focus (see visibility listener in constructor)
				} else {
					// No Supabase data, use local and upload if there's data
					this.harada_chart = {
						grid: nextGrid,
						todos: nextTodos
					};
					
					if (localHasData && authStore.user && supabase) {
						await this.saveToSupabase(nextGrid, nextTodos);
					}
				}
			} catch (error) {
				console.error('Error initializing from Supabase:', error);
				// Fall back to local data
				this.harada_chart = {
					grid: nextGrid,
					todos: nextTodos
				};
			}
		} else {
			// Offline or not authenticated, use local data
			this.harada_chart = {
				grid: nextGrid,
				todos: nextTodos
			};
		}
		
		this._isInitialized = true;
	}

	// Mark that there are unsaved changes
	markDirty() {
		if (!browser || !this._isInitialized) return;
		this._pendingSave = true;
		// Only move to 'dirty' when currently idle; do not override 'saving'
		if (this.saveStatus === 'idle') {
			this.saveStatus = 'dirty';
		}
	}

	// Save immediately (localStorage + optional Supabase)
	saveNow() {
		if (!browser || !this._isInitialized) return Promise.resolve();
		this.markDirty();
		return this._performSave();
	}

	// Backward-compatible alias for older call sites
	queueSave() {
		return this.saveNow();
	}

	// Perform one concrete save to localStorage and (optionally) Supabase
	async _executeSaveOnce() {
		if (!browser) return;

		// Always save to localStorage immediately
		if (DEBUG_SAVE) {
			console.debug('[Store] Saving to localStorage', {
				todos: (this.harada_chart.todos || []).length,
				grid: (this.harada_chart.grid || []).length,
				at: new Date().toISOString()
			});
		}
		this.saveData(this.harada_chart.grid, this.harada_chart.todos);
		
		// If online and authenticated, save to Supabase
		if (this.isOnline && authStore.user && supabase) {
			try {
				if (DEBUG_SAVE) {
					console.debug('[Store] Saving to Supabase');
				}
				await this.saveToSupabase(this.harada_chart.grid, this.harada_chart.todos);
			} catch (error) {
				console.error('Error saving to Supabase:', error);
				this.syncError = error.message;
			}
		}
	}

	// Coordinate save calls so only one Supabase write is in-flight at a time
	async _performSave() {
		if (!browser) return;

		// If a save is already in-flight, just note that we need to run again afterwards
		if (this._savingPromise) {
			this._pendingSave = true;
			return this._savingPromise;
		}

		this._pendingSave = false;
		this.saveStatus = 'saving';

		const run = async () => {
			// First pass
			await this._executeSaveOnce();

			// If any additional saves were requested while we were saving, run once more
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
				// If more saves were requested while we were saving, reflect that as 'dirty',
				// otherwise return to neutral 'idle'.
				this.saveStatus = this._pendingSave ? 'dirty' : 'idle';
			}
		})();

		return this._savingPromise;
	}

	// Get local timestamp from stored data
	getLocalTimestamp() {
		if (!browser) return 0;
		const jsonData = localGet(JSON_STORAGE_KEY, null);
		if (jsonData && jsonData.updatedAt) {
			return new Date(jsonData.updatedAt).getTime();
		}
		return 0;
	}

	// --- Persistence helpers (IO only, no Harada-specific logic) ---

	loadGrid(defaultCell) {
		if (browser) {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				try {
					const parsed = JSON.parse(saved);

					// Migrate from legacy string[] format to object[]
					if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
						return parsed.map((text) => ({ text, status: 'todo' }));
					}

					// Ensure shape is correct
					if (Array.isArray(parsed)) {
						return parsed.map((cell) => {
							if (cell && typeof cell === 'object') {
								return {
									text: typeof cell.text === 'string' ? cell.text : '',
									status:
										cell.status === 'done'
											? 'done'
											: 'todo',
									readme: typeof cell.readme === 'string' ? cell.readme : '',
									color: typeof cell.color === 'string' ? cell.color : 'default',
									updated_at: typeof cell.updated_at === 'string' ? cell.updated_at : null
								};
							}
							return defaultCell();
						});
					}
				} catch (e) {
					console.error('Failed to parse saved grid JSON:', e);
				}
			}
		}
		return Array.from({ length: 81 }, () => defaultCell());
	}

	loadTodos(goalIndices, defaultGoalIndex) {
		const saved = localGet(TODO_STORAGE_KEY, []);
		if (!Array.isArray(saved)) return [];

		return saved
			.map((t) => {
				if (!t || typeof t !== 'object') return null;
				const goalIndex =
					typeof t.goalIndex === 'number' && goalIndices.includes(t.goalIndex)
						? t.goalIndex
						: defaultGoalIndex;

				return {
					...t,
					goalIndex
				};
			})
			.filter(Boolean);
	}

	// Load data in JSON format (matching Supabase structure)
	loadData(defaultCell, goalIndices) {
		if (!browser) {
			return { grid: Array.from({ length: 81 }, () => defaultCell()), todos: [] };
		}

		// Try to load from new unified JSON format
		const jsonData = localGet(JSON_STORAGE_KEY, null);
		if (jsonData && jsonData.grid && jsonData.todos) {
			try {
				// Validate and normalize grid
				const grid = Array.isArray(jsonData.grid)
					? jsonData.grid.map((cell) => {
							if (cell && typeof cell === 'object') {
								return {
									text: typeof cell.text === 'string' ? cell.text : '',
									status:
										cell.status === 'done'
											? 'done'
											: 'todo',
									readme: typeof cell.readme === 'string' ? cell.readme : '',
									color: typeof cell.color === 'string' ? cell.color : 'default',
									updated_at: typeof cell.updated_at === 'string' ? cell.updated_at : null
								};
							}
							return defaultCell();
						})
					: Array.from({ length: 81 }, () => defaultCell());

				// Ensure grid has 81 cells
				while (grid.length < 81) {
					grid.push(defaultCell());
				}
				if (grid.length > 81) {
					grid.splice(81);
				}

				// Validate and normalize todos
				const todos = Array.isArray(jsonData.todos)
					? jsonData.todos
							.map((t) => {
								if (!t || typeof t !== 'object') return null;
								// Only validate goalIndex if goalIndices is provided
								if (goalIndices.length > 0) {
									const goalIndex =
										typeof t.goalIndex === 'number' && goalIndices.includes(t.goalIndex)
											? t.goalIndex
											: goalIndices[0] ?? 40;
									return { ...t, goalIndex };
								}
								// Otherwise keep the goalIndex as-is
								return { ...t };
							})
							.filter(Boolean)
					: [];

				return { grid, todos };
			} catch (e) {
				console.error('Failed to parse JSON data:', e);
			}
		}

		// Migration: Try to load from legacy markdown format
		const markdownData = localStorage.getItem(MARKDOWN_STORAGE_KEY);
		if (markdownData) {
			try {
				// This will be handled by the component if parseFromMarkdown is available
				// For now, fall through to legacy JSON migration
			} catch (e) {
				console.error('Failed to parse markdown data:', e);
			}
		}

		// Migration: Try to load from legacy separate JSON storage
		const jsonGrid = this.loadGrid(defaultCell);
		const jsonTodos = this.loadTodos(goalIndices, 40);

		const hasData = jsonGrid.some((c) => c.text.trim()) || jsonTodos.length > 0;
		if (hasData) {
			// Migrate to new format
			const data = { grid: jsonGrid, todos: jsonTodos, version: 2 };
			localSet(JSON_STORAGE_KEY, data);
			return { grid: jsonGrid, todos: jsonTodos };
		}

		// Return empty data
		return { grid: Array.from({ length: 81 }, () => defaultCell()), todos: [] };
	}

	// Clone to plain objects so $state proxies serialize correctly (fixes \"row/todo saved but not its text/title\")
	_toPlainGridAndTodos(gridSnapshot, todosSnapshot) {
		const cloneArrayOfObjects = (value) => {
			if (!Array.isArray(value)) return [];
			return value.map((item) => {
				if (item && typeof item === 'object') {
					return { ...item };
				}
				return item;
			});
		};

		return {
			grid: cloneArrayOfObjects(gridSnapshot),
			todos: cloneArrayOfObjects(todosSnapshot)
		};
	}

	// Merge two grid snapshots cell-by-cell based on updated_at timestamps
	_mergeGrid(localGrid, remoteGrid) {
		const safeLocal = Array.isArray(localGrid) ? localGrid : [];
		const safeRemote = Array.isArray(remoteGrid) ? remoteGrid : [];
		const merged = [];

		for (let i = 0; i < 81; i += 1) {
			const localCell = safeLocal[i];
			const remoteCell = safeRemote[i];

			if (!localCell && !remoteCell) {
				merged.push(defaultCell());
				continue;
			}

			const localTime =
				localCell && typeof localCell.updated_at === 'string'
					? new Date(localCell.updated_at).getTime()
					: 0;
			const remoteTime =
				remoteCell && typeof remoteCell.updated_at === 'string'
					? new Date(remoteCell.updated_at).getTime()
					: 0;

			if (remoteTime > localTime) {
				merged.push({
					...defaultCell(),
					...(remoteCell || {}),
					updated_at: remoteCell?.updated_at || localCell?.updated_at || null
				});
			} else {
				merged.push({
					...defaultCell(),
					...(localCell || remoteCell || {}),
					updated_at: localCell?.updated_at || remoteCell?.updated_at || null
				});
			}
		}

		return merged;
	}

	// Save data in JSON format (matching Supabase structure)
	saveData(gridSnapshot, todosSnapshot) {
		if (!browser) return;

		const { grid, todos } = this._toPlainGridAndTodos(gridSnapshot, todosSnapshot);
		const data = {
			grid,
			todos,
			version: 2,
			updatedAt: new Date().toISOString()
		};
		localSet(JSON_STORAGE_KEY, data);
	}

	// Legacy method for migration - loads from markdown if available
	loadFromMarkdown(parseFromMarkdown, serializeToMarkdown, defaultCell, goalIndices) {
		if (browser) {
			const saved = localStorage.getItem(MARKDOWN_STORAGE_KEY);
			if (saved) {
				try {
					return parseFromMarkdown(saved);
				} catch (e) {
					console.error('Failed to parse markdown data:', e);
				}
			}

			// Fallback to JSON format
			return this.loadData(defaultCell, goalIndices);
		}

		return { grid: Array.from({ length: 81 }, () => defaultCell()), todos: [] };
	}

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
						if (
							confirm('Import markdown data? This will replace your current chart and todos.')
						) {
							// Save imported data in JSON format
							this.saveData(parsed.grid, parsed.todos);
							onLoaded(parsed);
						}
					} catch (error) {
						alert('Failed to import markdown: ' + error.message);
					}
				}
			};
			reader.readAsText(file);
		};
		input.click();
	}

	// --- Supabase Integration ---

	async loadFromSupabase() {
		if (!browser || !authStore.user || !supabase) return null;

		try {
			this.syncError = null;

			const { data, error } = await supabase
				.from('harada_charts')
				.select('*')
				.eq('user_id', authStore.user.id)
				.single();

			if (error) {
				// If no chart exists yet, return null (not an error)
				if (error.code === 'PGRST116') {
					return null;
				}
				throw error;
			}

			if (data) {
				this.lastSyncTime = new Date(data.updated_at);
				localStorage.setItem(LAST_SYNC_KEY, data.updated_at);
				return {
					grid: data.grid || [],
					todos: data.todos || [],
					title: data.title || 'My Harada Chart',
					updated_at: data.updated_at
				};
			}

			return null;
		} catch (error) {
			console.error('Failed to load from Supabase:', error);
			this.syncError = error.message;
			return null;
		}
	}

	// Push current data to Supabase (e.g. after creating a todo from composer without going through harada_chart)
	async syncWithSupabase(gridSnapshot, todosSnapshot, title = 'My Harada Chart') {
		return this.saveToSupabase(gridSnapshot, todosSnapshot, title);
	}

	async saveToSupabase(gridSnapshot, todosSnapshot, title = 'My Harada Chart') {
		if (!browser || !authStore.user || !supabase) return false;

		try {
			this.syncError = null;

			// Clone to plain objects so $state proxies serialize correctly (fixes "row saved but not text")
			const { grid: gridData, todos: todosData } = this._toPlainGridAndTodos(gridSnapshot, todosSnapshot);

			const { data, error } = await supabase
				.from('harada_charts')
				.upsert(
					{
						user_id: authStore.user.id,
						grid: gridData,
						todos: todosData,
						title
					},
					{
						onConflict: 'user_id'
					}
				)
				.select()
				.single();

			if (error) throw error;

			if (data) {
				this.lastSyncTime = new Date(data.updated_at);
				localStorage.setItem(LAST_SYNC_KEY, data.updated_at);
			}

			return true;
		} catch (error) {
			console.error('Failed to save to Supabase:', error);
			this.syncError = error.message;
			return false;
		}
	}

	// Sync with Supabase when app comes back into focus
	async syncOnFocus() {
		if (!browser || !this.isOnline || !authStore.user || !supabase || !this._isInitialized) return;
		
		try {
			const supabaseData = await this.loadFromSupabase();
			
			if (supabaseData) {
				const current = this.harada_chart || { grid: [], todos: [] };
				const mergedGrid = this._mergeGrid(current.grid || [], supabaseData.grid || []);
				const mergedTodos = mergeTodoLists(current.todos || [], supabaseData.todos || []);

				const currentStr = JSON.stringify({
					grid: current.grid || [],
					todos: current.todos || []
				});
				const mergedStr = JSON.stringify({ grid: mergedGrid, todos: mergedTodos });

				if (currentStr !== mergedStr) {
					this.harada_chart = {
						grid: mergedGrid,
						todos: mergedTodos
					};
					this.saveData(mergedGrid, mergedTodos);
					// Push merged snapshot back to Supabase so both sides match
					await this.saveToSupabase(mergedGrid, mergedTodos);
				}
			}
		} catch (error) {
			console.error('Error syncing on focus:', error);
			this.syncError = error.message;
		}
	}

	// --- Todo mutation helpers (domain logic) ---

	updateTodo(id, patch) {
		if (!id || !patch) return;

		let nextPatch = patch;

		if (patch?.listType === 'custom') {
			nextPatch = {
				...patch,
				...buildCustomListMeta(patch.listName)
			};
		} else if (typeof patch?.goalIndex === 'number' || patch?.goalIndex === null) {
			nextPatch = {
				...patch,
				...buildGoalListMeta(patch.goalIndex)
			};
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

		this.harada_chart = {
			...this.harada_chart,
			todos: updatedTodos
		};

		const updatedTodo = updatedTodos.find((t) => t.id === id);
		const goalIndexToUpdate = updatedTodo?.goalIndex ?? previousTodo?.goalIndex;

		if (typeof goalIndexToUpdate === 'number') {
			const nextGrid = [...this.harada_chart.grid];
			updateGoalTimestamp(nextGrid, goalIndexToUpdate);
			this.harada_chart = {
				...this.harada_chart,
				grid: nextGrid
			};
		}

		this.saveNow();
	}

	deleteTodo(id) {
		if (!id) return;

		const previousTodos = this.harada_chart.todos || [];
		const todo = previousTodos.find((t) => t.id === id);

		const nextTodos = previousTodos.filter((t) => t.id !== id);

		this.harada_chart = {
			...this.harada_chart,
			todos: nextTodos
		};

		if (todo && typeof todo.goalIndex === 'number') {
			const nextGrid = [...this.harada_chart.grid];
			updateGoalTimestamp(nextGrid, todo.goalIndex);
			this.harada_chart = {
				...this.harada_chart,
				grid: nextGrid
			};
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

		// If marking as done and title is empty, delete it
		if (nextStatus === 'done' && (!todo.title || todo.title.trim() === '')) {
			this.deleteTodo(id);
			return;
		}

		const nextTodos = previousTodos.map((t) =>
			t.id === id ? { ...t, status: nextStatus, updatedAt: Date.now() } : t
		);

		this.harada_chart = {
			...this.harada_chart,
			todos: nextTodos
		};

		if (typeof todo.goalIndex === 'number') {
			const nextGrid = [...this.harada_chart.grid];
			updateGoalTimestamp(nextGrid, todo.goalIndex);
			this.harada_chart = {
				...this.harada_chart,
				grid: nextGrid
			};
		}

		this.saveNow();
	}

	// Handle auth state changes
	handleAuthChange() {
		if (!browser) return;
		
		// Reset initialization flag so we can reinitialize when auth changes
		this._isInitialized = false;
		
		if (!authStore.user) {
			// User logged out, unsubscribe from realtime (if any)
			this.unsubscribeFromRealtimeUpdates();
		} else {
			// User logged in, reinitialize to sync with Supabase
			this.initialize();
		}
	}

	subscribeToRealtimeUpdates(onUpdate) {
		if (!browser || !authStore.user || !supabase) return;

		// Unsubscribe from previous subscription
		if (this.realtimeSubscription) {
			this.realtimeSubscription.unsubscribe();
		}

		this.realtimeSubscription = supabase
			.channel('harada_charts_changes')
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'harada_charts',
					filter: `user_id=eq.${authStore.user.id}`
				},
				(payload) => {
					console.log('Realtime update received:', payload);
					if (payload.new && onUpdate) {
						onUpdate({
							grid: payload.new.grid || [],
							todos: payload.new.todos || [],
							title: payload.new.title
						});
					}
				}
			)
			.subscribe();

		return this.realtimeSubscription;
	}

	unsubscribeFromRealtimeUpdates() {
		if (this.realtimeSubscription) {
			this.realtimeSubscription.unsubscribe();
			this.realtimeSubscription = null;
		}
	}
}

export const store = new Store();
