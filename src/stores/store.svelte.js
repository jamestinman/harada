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
	
	// Save status: 'idle' | 'queued' | 'saving'
	saveStatus = $state('idle');
	isOnline = $state(browser ? navigator.onLine : true);
	lastSyncTime = $state(null);
	syncError = $state(null);
	realtimeSubscription = $state(null);
	
	// Debounce timer for saving
	_saveTimeout = null;
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

		// Initialize on creation (local-first; auth effects handled at module level)
		this.initialize();
	}

	// Initialize harada_chart from localStorage or Supabase
	async initialize() {
		if (!browser || this._isInitialized) return;
		
		// Load from localStorage first (always available)
		const localData = this.loadData(defaultCell, []);
		
		// If online and authenticated, try to load from Supabase and compare timestamps
		if (this.isOnline && authStore.user && supabase) {
			try {
				const supabaseData = await this.loadFromSupabase();
				
				if (supabaseData) {
					// Compare timestamps
					const localTimestamp = this.getLocalTimestamp();
					const supabaseTimestamp = supabaseData.updated_at ? new Date(supabaseData.updated_at).getTime() : 0;
					
					// Check if Supabase data is actually empty (no goals, no todos)
					const supabaseHasData = (supabaseData.grid || []).some(c => c && c.text && c.text.trim()) || (supabaseData.todos || []).length > 0;
					const localHasData = localData.grid.some(c => c && c.text && c.text.trim()) || localData.todos.length > 0;
					
					if (supabaseTimestamp > localTimestamp) {
						// Supabase is more recent, use it
						this.harada_chart = {
							grid: supabaseData.grid || Array.from({ length: 81 }, () => defaultCell()),
							todos: supabaseData.todos || []
						};
						// Update localStorage with Supabase data
						this.saveData(this.harada_chart.grid, this.harada_chart.todos);
					} else if (localTimestamp > supabaseTimestamp) {
						// Local is more recent, use local and sync to Supabase
						this.harada_chart = {
							grid: localData.grid || Array.from({ length: 81 }, () => defaultCell()),
							todos: localData.todos || []
						};
						await this.saveToSupabase(this.harada_chart.grid, this.harada_chart.todos);
					} else {
						// Timestamps are equal - prefer the one with actual data
						if (localHasData && !supabaseHasData) {
							// Local has data but Supabase is empty, use local and sync
							this.harada_chart = {
								grid: localData.grid || Array.from({ length: 81 }, () => defaultCell()),
								todos: localData.todos || []
							};
							await this.saveToSupabase(this.harada_chart.grid, this.harada_chart.todos);
						} else if (supabaseHasData && !localHasData) {
							// Supabase has data but local is empty, use Supabase
							this.harada_chart = {
								grid: supabaseData.grid || Array.from({ length: 81 }, () => defaultCell()),
								todos: supabaseData.todos || []
							};
							this.saveData(this.harada_chart.grid, this.harada_chart.todos);
						} else {
							// Both have data or both are empty - use local (preserve user's current state)
							this.harada_chart = {
								grid: localData.grid || Array.from({ length: 81 }, () => defaultCell()),
								todos: localData.todos || []
							};
							// Sync to Supabase if local has data (ensures first-time login saves local data)
							if (localHasData) {
								await this.saveToSupabase(this.harada_chart.grid, this.harada_chart.todos);
							}
						}
					}
					
					// Subscribe to realtime updates
					this.subscribeToRealtimeUpdates((update) => {
						const currentStr = JSON.stringify(this.harada_chart);
						const updateStr = JSON.stringify({ grid: update.grid, todos: update.todos });
						
						if (currentStr !== updateStr) {
							this.harada_chart = {
								grid: update.grid || Array.from({ length: 81 }, () => defaultCell()),
								todos: update.todos || []
							};
							// Update localStorage when receiving realtime updates
							this.saveData(this.harada_chart.grid, this.harada_chart.todos);
						}
					});
				} else {
					// No Supabase data, use local and upload if there's data
					this.harada_chart = {
						grid: localData.grid || Array.from({ length: 81 }, () => defaultCell()),
						todos: localData.todos || []
					};
					
					const hasLocalData = localData.grid.some(c => c.text.trim()) || localData.todos.length > 0;
					if (hasLocalData) {
						await this.saveToSupabase(this.harada_chart.grid, this.harada_chart.todos);
					}
				}
			} catch (error) {
				console.error('Error initializing from Supabase:', error);
				// Fall back to local data
				this.harada_chart = {
					grid: localData.grid || Array.from({ length: 81 }, () => defaultCell()),
					todos: localData.todos || []
				};
			}
		} else {
			// Offline or not authenticated, use local data
			this.harada_chart = {
				grid: localData.grid || Array.from({ length: 81 }, () => defaultCell()),
				todos: localData.todos || []
			};
		}
		
		this._isInitialized = true;
	}

	// Perform the actual save operation
	async _performSave() {
		if (!browser) return;
		
		this.saveStatus = 'saving';
		
		// Always save to localStorage immediately
		this.saveData(this.harada_chart.grid, this.harada_chart.todos);
    console.log('Saved to localStorage');
		
		// If online and authenticated, save to Supabase
		if (this.isOnline && authStore.user && supabase) {
			try {
				await this.saveToSupabase(this.harada_chart.grid, this.harada_chart.todos);
        console.log('Saved to Supabase');
			} catch (error) {
				console.error('Error saving to Supabase:', error);
				this.syncError = error.message;
			}
		}
		
		this.saveStatus = 'idle';
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

	async saveToSupabase(gridSnapshot, todosSnapshot, title = 'My Harada Chart') {
		if (!browser || !authStore.user || !supabase) return false;

		try {
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
		}
	}

	// Handle auth state changes
	handleAuthChange() {
		if (!browser) return;
		
		// Reset initialization flag so we can reinitialize when auth changes
		this._isInitialized = false;
		
		if (!authStore.user) {
			// User logged out, unsubscribe from realtime
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
