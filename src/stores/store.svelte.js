import { browser } from '$app/environment';
import { localGet, localSet } from '$lib/PersistentStorage.mjs';
import { supabase } from '$lib/supabaseClient.js';
import { authStore } from './auth.svelte.js';

const STORAGE_KEY = 'harada-chart-data';
const TODO_STORAGE_KEY = 'harada-todos-v1';
const MARKDOWN_STORAGE_KEY = 'harada-markdown-data'; // Legacy - for migration only
const JSON_STORAGE_KEY = 'harada-data-v2'; // Unified JSON format matching Supabase
const LAST_SYNC_KEY = 'harada-last-sync';
const MIGRATION_FLAG_KEY = 'harada-migrated-to-supabase';

class Store {
	activeTab = $state('harada');
	selectedGoalFilter = $state('all'); // 'all' | goalIndex as string
	selectedGoalForNew = $state(''); // filled once goals are known
	sidebarOpen = $state(false);
	syncing = $state(false);
	lastSyncTime = $state(null);
	syncError = $state(null);
	realtimeSubscription = $state(null);

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
										cell.status === 'underway' || cell.status === 'done'
											? cell.status
											: 'todo',
									readme: typeof cell.readme === 'string' ? cell.readme : ''
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
										cell.status === 'underway' || cell.status === 'done'
											? cell.status
											: 'todo',
									readme: typeof cell.readme === 'string' ? cell.readme : ''
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

	// Save data in JSON format (matching Supabase structure)
	saveData(gridSnapshot, todosSnapshot) {
		if (!browser) return;

		// Save in unified JSON format matching Supabase
		const data = {
			grid: gridSnapshot,
			todos: todosSnapshot || [],
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
			this.syncing = true;
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
					title: data.title || 'My Harada Chart'
				};
			}

			return null;
		} catch (error) {
			console.error('Failed to load from Supabase:', error);
			this.syncError = error.message;
			return null;
		} finally {
			this.syncing = false;
		}
	}

	async saveToSupabase(gridSnapshot, todosSnapshot, title = 'My Harada Chart') {
		if (!browser || !authStore.user || !supabase) return false;

		try {
			this.syncing = true;
			this.syncError = null;

			// Use spread operator to avoid DataCloneError with $state objects
			const gridData = Array.isArray(gridSnapshot) ? [...gridSnapshot] : gridSnapshot;
			const todosData = Array.isArray(todosSnapshot) ? [...todosSnapshot] : todosSnapshot;

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
		} finally {
			this.syncing = false;
		}
	}

	async migrateLocalDataToSupabase(defaultCell, goalIndices) {
		if (!browser || !authStore.user) return false;

		// Check if already migrated
		const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG_KEY);
		if (alreadyMigrated) return false;

		// Check if there's existing data in Supabase
		const supabaseData = await this.loadFromSupabase();
		if (supabaseData) {
			// Supabase data exists, mark as migrated and use that
			localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
			return false;
		}

		// Load local data in JSON format
		const localData = this.loadData(defaultCell, goalIndices);

		const hasLocalData =
			localData.grid.some((c) => c.text.trim()) || localData.todos.length > 0;

		if (hasLocalData) {
			console.log('Migrating local data to Supabase...');
			const success = await this.saveToSupabase(localData.grid, localData.todos);
			if (success) {
				localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
				console.log('Migration successful!');
				return true;
			}
		}

		return false;
	}

	async syncWithSupabase(gridSnapshot, todosSnapshot) {
		if (!authStore.user) return;

		// Debounce: don't sync too frequently
		const lastSync = localStorage.getItem(LAST_SYNC_KEY);
		if (lastSync) {
			const timeSinceSync = Date.now() - new Date(lastSync).getTime();
			if (timeSinceSync < 2000) {
				// Less than 2 seconds
				return;
			}
		}

		await this.saveToSupabase(gridSnapshot, todosSnapshot);
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