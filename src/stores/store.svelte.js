import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';
import { localGet, localSet, prefGet, prefSet } from '$lib/PersistentStorage.mjs';
import { supabase } from '$lib/supabaseClient.js';
import { synthStore } from './synth.svelte.js';
import {
	buildGoalListMeta,
	buildCustomListMeta,
	updateGoalTimestamp,
	canonicalGoalIndex,
	normalizeTodoListMeta,
	mergeTodoLists,
	defaultNote,
	normalizeNote,
	mergeNoteLists
} from '$lib/todoUtils.js';
import { authStore } from './auth.svelte.js';

const defaultCells = [
  { text: 'Central Goal', index: 4 * 9 + 4 },
  { text: 'Goal 1', index: 10 },
  { text: 'Goal 1', index: 3 * 9 + 3 },
  { text: 'Goal 2', index: 13 },
  { text: 'Goal 2', index: 3 * 9 + 4 },
  { text: 'Goal 3', index: 16 },
  { text: 'Goal 3', index: 3 * 9 + 5 },
  { text: 'Goal 4', index: 37 },
  { text: 'Goal 4', index: 4 * 9 + 3 },
  { text: 'Goal 5', index: 43 },
  { text: 'Goal 5', index: 4 * 9 + 5 },
  { text: 'Goal 6', index: 64 },
  { text: 'Goal 6', index: 5 * 9 + 3 },
  { text: 'Goal 7', index: 67 },
  { text: 'Goal 7', index: 5 * 9 + 4 },
  { text: 'Goal 8', index: 70 },
  { text: 'Goal 8', index: 5 * 9 + 5 }
]

const defaultCell = (i = null) => {
  var text = "";
  var updated_at = null;
  if (i !== null && defaultCells.find((cell) => cell.index === i)) {
    text = defaultCells.find((cell) => cell.index === i).text;
    updated_at = new Date().toISOString();
  }
  return { text, status: 'todo', readme: '', color: 'default', updated_at }
}
const GOAL_GROUP_ORDER_STEP = 1024;
function createLinkId(prefix) {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isGridBlank(grid) {
	if (!Array.isArray(grid) || grid.length !== 81) return false;
	return grid.every(
		(cell) =>
			cell &&
			cell.text === '' &&
			(cell.status === 'todo' || cell.status === undefined) &&
			(cell.readme === '' || cell.readme === undefined) &&
			(cell.color === 'default' || cell.color === undefined) &&
			(cell.updated_at === null || cell.updated_at === undefined)
	);
}

function createSeededGrid() {
	const grid = Array.from({ length: 81 }, () => defaultCell());
	return grid;
}

function normalizeNoteTaskLink(link) {
	if (!link || typeof link !== 'object') return null;
	if (typeof link.noteId !== 'string' || !link.noteId) return null;
	if (typeof link.taskId !== 'string' || !link.taskId) return null;
	const createdAt =
		typeof link.createdAt === 'number' && Number.isFinite(link.createdAt)
			? link.createdAt
			: Date.now();
	const updatedAt =
		typeof link.updatedAt === 'number' && Number.isFinite(link.updatedAt)
			? link.updatedAt
			: createdAt;
	return {
		id: typeof link.id === 'string' && link.id ? link.id : createLinkId('ntl'),
		noteId: link.noteId,
		taskId: link.taskId,
		isPrimary: link.isPrimary === true,
		createdAt,
		updatedAt
	};
}

function normalizeNoteGoalLink(link) {
	if (!link || typeof link !== 'object') return null;
	if (typeof link.noteId !== 'string' || !link.noteId) return null;
	if (typeof link.goalIndex !== 'number' || Number.isNaN(link.goalIndex)) return null;
	const canonical = canonicalGoalIndex(link.goalIndex);
	const createdAt =
		typeof link.createdAt === 'number' && Number.isFinite(link.createdAt)
			? link.createdAt
			: Date.now();
	const updatedAt =
		typeof link.updatedAt === 'number' && Number.isFinite(link.updatedAt)
			? link.updatedAt
			: createdAt;
	return {
		id: typeof link.id === 'string' && link.id ? link.id : createLinkId('ngl'),
		noteId: link.noteId,
		goalIndex: canonical,
		createdAt,
		updatedAt
	};
}

function normalizeTaskGoalLink(link) {
	if (!link || typeof link !== 'object') return null;
	if (typeof link.taskId !== 'string' || !link.taskId) return null;
	if (typeof link.goalIndex !== 'number' || Number.isNaN(link.goalIndex)) return null;
	const canonical = canonicalGoalIndex(link.goalIndex);
	const createdAt =
		typeof link.createdAt === 'number' && Number.isFinite(link.createdAt)
			? link.createdAt
			: Date.now();
	const updatedAt =
		typeof link.updatedAt === 'number' && Number.isFinite(link.updatedAt)
			? link.updatedAt
			: createdAt;
	return {
		id: typeof link.id === 'string' && link.id ? link.id : createLinkId('tgl'),
		taskId: link.taskId,
		goalIndex: canonical,
		createdAt,
		updatedAt
	};
}

class Store {
	version = $state('1.0.14');
	activeTab = $state('harada');
	selectedGoalFilter = $state('all');
	selectedGoalForNew = $state('');
	sidebarOpen = $state(false);
	currentGoalIndex = $state(null);
	theme = $state(localGet('theme', 'light'));
	saveStatus = $state('idle');
	isBootstrapping = $state(true);
	isLoading = $state(true);
	isRefreshing = $state(false);
	isOnline = $state(browser ? navigator.onLine : true);
	syncError = $state(null);
  showHowItWorksModal = $state(false);

	/** Shared mobile slide-over menu (Nav panel); toggled from todo/notes headers too */
	mobileNavMenuOpen = $state(false);
	composerPanelOpen = $state(false);
	composerPanelTab = $state(/** @type {'task' | 'note'} */ ('task'));

	openComposerPanel(tab = 'task') {
		this.composerPanelTab = tab === 'note' ? 'note' : 'task';
		this.composerPanelOpen = true;
	}

	closeComposerPanel() {
		this.composerPanelOpen = false;
	}

	toggleMobileNavMenu() {
		this.mobileNavMenuOpen = !this.mobileNavMenuOpen;
	}

	/**
	 * Incremented when the To-Do bottom-nav item should open the goals sidebar on /todo.
	 * (Boolean flags on class instances are easy to miss in $effect deps; a counter is reliable.)
	 */
	todoSidebarPulse = $state(0);

	requestTodoSidebarOpen() {
		this.todoSidebarPulse += 1;
	}

	/** True until NotesWorkspace opens the list drawer (bottom nav → list from note detail) */
	notesRevealListDrawer = $state(false);

	pulseNotesOpenList() {
		this.notesRevealListDrawer = true;
	}

	/** Last note the user explicitly opened (mobile bottom nav MRU); persisted */
	lastOpenedNoteId = $state(/** @type {string | null} */ (null));

	/** One-shot: select this note after navigation (MRU / deep focus) */
	pendingSelectNoteId = $state(/** @type {string | null} */ (null));

	/** Mobile notes: right panel showing note content (not list drawer) */
	notesMobileDetailOpen = $state(false);

	recordLastOpenedNote(noteId) {
		const id = noteId ?? null;
		this.lastOpenedNoteId = id;
		if (!browser) return;
		if (id) localSet('harada_last_note_id', id);
		else localStorage.removeItem('harada_last_note_id');
	}

	clearLastOpenedNote() {
		this.recordLastOpenedNote(null);
	}

  setTheme(value) {
    this.theme = value;
    localSet('theme', value);
  }

	harada_chart = $state({
		grid: Array.from({ length: 81 }, () => defaultCell()),
		todos: []
	});
	notes = $state([]);
	noteTaskLinks = $state([]);
	noteGoalLinks = $state([]);
	taskGoalLinks = $state([]);

  getDefaultCell(i) {
    return defaultCell(i);
  }

	_isInitialized = false;
	_realtimeChannel = null;
	_savingPromise = null;
	_pendingSave = false;
	_pendingCloudSync = false;
	_refreshPromise = null;

	constructor() {
		if (!browser) return;

		try {
			const v = localGet('harada_last_note_id', null);
			if (v && typeof v === 'string') {
				this.lastOpenedNoteId = v;
			}
		} catch {
			// ignore
		}

		window.addEventListener('online', () => {
			this.isOnline = true;
			// Flush any pending cloud sync when connectivity returns
			if (this._pendingCloudSync) {
				this.saveNow();
			}
			if (!this._isInitialized) this.initialize();
			if (this._isInitialized) this.refreshFromSupabase();
		});
		window.addEventListener('offline', () => {
			this.isOnline = false;
		});
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && this._isInitialized) {
				this.refreshFromSupabase();
			}
		});
		window.addEventListener('focus', () => {
			if (this._isInitialized) {
				this.refreshFromSupabase();
			}
		});

		this.initialize();
	}

	async initialize() {
		if (!browser || this._isInitialized) return;

		this._setBootstrapping(true);

		try {
			// 1) Bootstrap from local persistent storage so the app works offline
			try {
				const local = await prefGet('harada_chart_local', null);
				if (local && typeof local === 'object') {
					const localGrid = Array.isArray(local.grid) ? local.grid : [];
					const normalizedLocalGrid = Array.from(
						{ length: 81 },
						(_, i) => (localGrid[i] ? { ...defaultCell(), ...localGrid[i] } : defaultCell())
					);
					this.harada_chart = {
						grid: normalizedLocalGrid,
						todos: Array.isArray(local.todos)
							? local.todos.map((todo) => normalizeTodoListMeta(todo))
							: []
					};
					this.notes = Array.isArray(local.notes)
						? local.notes.map((note) => normalizeNote(note))
						: [];
					this.noteTaskLinks = Array.isArray(local.noteTaskLinks)
						? local.noteTaskLinks.map((link) => normalizeNoteTaskLink(link)).filter(Boolean)
						: [];
					this.noteGoalLinks = Array.isArray(local.noteGoalLinks)
						? local.noteGoalLinks.map((link) => normalizeNoteGoalLink(link)).filter(Boolean)
						: [];
					this.taskGoalLinks = Array.isArray(local.taskGoalLinks)
						? local.taskGoalLinks.map((link) => normalizeTaskGoalLink(link)).filter(Boolean)
						: [];
					this._migrateLegacyTaskMarkdownInMemory();
					this._migratePrimaryTaskNotesInMemory();
					this._migrateLegacyTaskLinksInMemory();
				}
			} catch (err) {
				console.error('Failed to load local Harada chart:', err);
			}

			// 2) If not authenticated or Supabase is unavailable, we stay in offline/local-only mode
			// but still want to provide a helpful seeded board if the grid is blank.
			if (!authStore.user || !supabase) {
				if (isGridBlank(this.harada_chart.grid)) {
					this.harada_chart = {
						...this.harada_chart,
						grid: createSeededGrid()
					};
					// Persist the seeded state for next launch
					await this._saveLocally();
				}
				return;
			}

			// 3) If online and authenticated, hydrate from Supabase and overwrite local snapshot
			const data = await this.loadFromSupabase();
			if (data) {
				await this._mergeAndApplyRemoteSnapshot(data, { persistLocal: true });
				this._migrateLegacyTaskMarkdownInMemory();
				this._migratePrimaryTaskNotesInMemory();
				this._migrateLegacyTaskLinksInMemory();
			}
		} catch (err) {
			console.error('Failed to initialize from Supabase:', err);
			this.syncError = err.message;
		} finally {
			this._setBootstrapping(false);
			this._isInitialized = true;
		}

		// Only attempt realtime subscription when Supabase and auth are available
		if (authStore.user && supabase) {
			this._subscribeToRealtime();
		}
	}

	_setBootstrapping(value) {
		this.isBootstrapping = value;
		this.isLoading = value;
	}

	async refreshFromSupabase() {
		if (!browser || !this._isInitialized || !authStore.user || !supabase) return false;
		if (this._refreshPromise) return this._refreshPromise;

		this.isRefreshing = true;
		this._refreshPromise = (async () => {
			try {
				const data = await this.loadFromSupabase();
				if (!data) return false;
				return await this._mergeAndApplyRemoteSnapshot(data, { persistLocal: true });
			} catch (err) {
				console.error('Background refresh failed:', err);
				this.syncError = err.message;
				return false;
			} finally {
				this.isRefreshing = false;
				this._refreshPromise = null;
			}
		})();

		return this._refreshPromise;
	}

	_normalizeGridSnapshot(gridSnapshot) {
		const grid = Array.isArray(gridSnapshot) ? gridSnapshot : [];
		let normalized = Array.from(
			{ length: 81 },
			(_, i) => (grid[i] ? { ...defaultCell(), ...grid[i] } : defaultCell())
		);
		if (isGridBlank(normalized)) normalized = createSeededGrid();
		return normalized;
	}

	mergeGridByUpdatedAt(localGridSnapshot, remoteGridSnapshot) {
		const localGrid = this._normalizeGridSnapshot(localGridSnapshot);
		const remoteGrid = this._normalizeGridSnapshot(remoteGridSnapshot);
		let changed = false;
		const merged = localGrid.map((localCell, i) => {
			const remoteCell = remoteGrid[i];
			const localTime = localCell?.updated_at ? new Date(localCell.updated_at).getTime() : 0;
			const remoteTime = remoteCell?.updated_at ? new Date(remoteCell.updated_at).getTime() : 0;
			if (remoteTime > localTime) {
				changed = true;
				return remoteCell;
			}
			if (remoteTime === localTime && JSON.stringify(remoteCell) !== JSON.stringify(localCell)) {
				changed = true;
				return remoteCell;
			}
			return localCell;
		});
		return { merged, changed };
	}

	mergeTodosByUpdatedAt(localTodosSnapshot, remoteTodosSnapshot) {
		const localTodos = Array.isArray(localTodosSnapshot)
			? localTodosSnapshot.map((todo) => normalizeTodoListMeta(todo))
			: [];
		const remoteTodos = Array.isArray(remoteTodosSnapshot)
			? remoteTodosSnapshot.map((todo) => normalizeTodoListMeta(todo))
			: [];
		const merged = mergeTodoLists(localTodos, remoteTodos).map((todo) => normalizeTodoListMeta(todo));
		const changed =
			merged.length !== localTodos.length ||
			merged.some((todo, idx) => {
				const local = localTodos[idx];
				return !local || JSON.stringify(todo) !== JSON.stringify(local);
			});
		return { merged, changed };
	}

	mergeNotesByUpdatedAt(localNotesSnapshot, remoteNotesSnapshot) {
		const localNotes = Array.isArray(localNotesSnapshot)
			? localNotesSnapshot.map((note) => normalizeNote(note))
			: [];
		const remoteNotes = Array.isArray(remoteNotesSnapshot)
			? remoteNotesSnapshot.map((note) => normalizeNote(note))
			: [];
		const merged = mergeNoteLists(localNotes, remoteNotes);
		const changed =
			merged.length !== localNotes.length ||
			merged.some((note, idx) => {
				const local = localNotes[idx];
				return !local || JSON.stringify(note) !== JSON.stringify(local);
			});
		return { merged, changed };
	}

	mergeNoteTaskLinksByUpdatedAt(localLinksSnapshot, remoteLinksSnapshot) {
		const localLinks = Array.isArray(localLinksSnapshot)
			? localLinksSnapshot.map((link) => normalizeNoteTaskLink(link)).filter(Boolean)
			: [];
		const remoteLinks = Array.isArray(remoteLinksSnapshot)
			? remoteLinksSnapshot.map((link) => normalizeNoteTaskLink(link)).filter(Boolean)
			: [];
		const byComposite = new Map();
		for (const link of [...localLinks, ...remoteLinks]) {
			const key = `${link.noteId}:${link.taskId}`;
			const existing = byComposite.get(key);
			if (!existing || link.updatedAt > existing.updatedAt) {
				byComposite.set(key, link);
			}
		}
		const merged = [...byComposite.values()].sort((a, b) => b.updatedAt - a.updatedAt);
		const changed =
			merged.length !== localLinks.length ||
			merged.some((link, idx) => JSON.stringify(link) !== JSON.stringify(localLinks[idx]));
		return { merged, changed };
	}

	mergeNoteGoalLinksByUpdatedAt(localLinksSnapshot, remoteLinksSnapshot) {
		const localLinks = Array.isArray(localLinksSnapshot)
			? localLinksSnapshot.map((link) => normalizeNoteGoalLink(link)).filter(Boolean)
			: [];
		const remoteLinks = Array.isArray(remoteLinksSnapshot)
			? remoteLinksSnapshot.map((link) => normalizeNoteGoalLink(link)).filter(Boolean)
			: [];
		const byComposite = new Map();
		for (const link of [...localLinks, ...remoteLinks]) {
			const key = `${link.noteId}:${link.goalIndex}`;
			const existing = byComposite.get(key);
			if (!existing || link.updatedAt > existing.updatedAt) {
				byComposite.set(key, link);
			}
		}
		const merged = [...byComposite.values()].sort((a, b) => b.updatedAt - a.updatedAt);
		const changed =
			merged.length !== localLinks.length ||
			merged.some((link, idx) => JSON.stringify(link) !== JSON.stringify(localLinks[idx]));
		return { merged, changed };
	}

	mergeTaskGoalLinksByUpdatedAt(localLinksSnapshot, remoteLinksSnapshot) {
		const localLinks = Array.isArray(localLinksSnapshot)
			? localLinksSnapshot.map((link) => normalizeTaskGoalLink(link)).filter(Boolean)
			: [];
		const remoteLinks = Array.isArray(remoteLinksSnapshot)
			? remoteLinksSnapshot.map((link) => normalizeTaskGoalLink(link)).filter(Boolean)
			: [];
		const byComposite = new Map();
		for (const link of [...localLinks, ...remoteLinks]) {
			const key = `${link.taskId}:${link.goalIndex}`;
			const existing = byComposite.get(key);
			if (!existing || link.updatedAt > existing.updatedAt) {
				byComposite.set(key, link);
			}
		}
		const merged = [...byComposite.values()].sort((a, b) => b.updatedAt - a.updatedAt);
		const changed =
			merged.length !== localLinks.length ||
			merged.some((link, idx) => JSON.stringify(link) !== JSON.stringify(localLinks[idx]));
		return { merged, changed };
	}

	async _mergeAndApplyRemoteSnapshot(data, { persistLocal = false } = {}) {
		const nextRemoteGrid = this._normalizeGridSnapshot(data?.grid || []);
		const nextRemoteTodos = Array.isArray(data?.todos) ? data.todos : [];
		const nextRemoteNotes = Array.isArray(data?.notes) ? data.notes : [];
		const nextRemoteNoteTaskLinks = Array.isArray(data?.noteTaskLinks) ? data.noteTaskLinks : [];
		const nextRemoteNoteGoalLinks = Array.isArray(data?.noteGoalLinks) ? data.noteGoalLinks : [];
		const nextRemoteTaskGoalLinks = Array.isArray(data?.taskGoalLinks) ? data.taskGoalLinks : [];
		const gridMerge = this.mergeGridByUpdatedAt(this.harada_chart.grid, nextRemoteGrid);
		const todoMerge = this.mergeTodosByUpdatedAt(this.harada_chart.todos, nextRemoteTodos);
		const noteMerge = this.mergeNotesByUpdatedAt(this.notes, nextRemoteNotes);
		const noteTaskLinkMerge = this.mergeNoteTaskLinksByUpdatedAt(
			this.noteTaskLinks,
			nextRemoteNoteTaskLinks
		);
		const noteGoalLinkMerge = this.mergeNoteGoalLinksByUpdatedAt(
			this.noteGoalLinks,
			nextRemoteNoteGoalLinks
		);
		const taskGoalLinkMerge = this.mergeTaskGoalLinksByUpdatedAt(
			this.taskGoalLinks,
			nextRemoteTaskGoalLinks
		);

		if (
			!gridMerge.changed &&
			!todoMerge.changed &&
			!noteMerge.changed &&
			!noteTaskLinkMerge.changed &&
			!noteGoalLinkMerge.changed &&
			!taskGoalLinkMerge.changed
		)
			return false;

		if (gridMerge.changed) {
			this.harada_chart = { ...this.harada_chart, grid: gridMerge.merged };
		}
		if (todoMerge.changed) {
			await Promise.resolve();
			this.harada_chart = { ...this.harada_chart, todos: todoMerge.merged };
		}
		if (noteMerge.changed) {
			await Promise.resolve();
			this.notes = noteMerge.merged;
		}
		if (noteTaskLinkMerge.changed) {
			await Promise.resolve();
			this.noteTaskLinks = noteTaskLinkMerge.merged;
		}
		if (noteGoalLinkMerge.changed) {
			await Promise.resolve();
			this.noteGoalLinks = noteGoalLinkMerge.merged;
		}
		if (taskGoalLinkMerge.changed) {
			await Promise.resolve();
			this.taskGoalLinks = taskGoalLinkMerge.merged;
		}

		if (persistLocal) {
			await this._saveLocally();
		}
		return true;
	}

  isNative() {
    if (!(browser || false)) return false;
    return ['ios', 'android'].includes(Capacitor.getPlatform());
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
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'notes',
					filter: `user_id=eq.${userId}`
				},
				(payload) => {
					this._applyRealtimeNoteChange(payload);
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'note_task_links',
					filter: `user_id=eq.${userId}`
				},
				(payload) => {
					this._applyRealtimeNoteTaskLinkChange(payload);
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'note_goal_links',
					filter: `user_id=eq.${userId}`
				},
				(payload) => {
					this._applyRealtimeNoteGoalLinkChange(payload);
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'task_goal_links',
					filter: `user_id=eq.${userId}`
				},
				(payload) => {
					this._applyRealtimeTaskGoalLinkChange(payload);
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
			this.noteTaskLinks = this.noteTaskLinks.filter((link) => link.taskId !== id);
			this.taskGoalLinks = this.taskGoalLinks.filter((link) => link.taskId !== id);
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

	_applyRealtimeNoteChange(payload) {
		const { eventType, new: newRow, old: oldRow } = payload;
		const id = newRow?.id || oldRow?.id;
		if (!id) return;

		if (eventType === 'DELETE' || newRow?.deleted_at) {
			this.notes = this.notes.filter((note) => note.id !== id);
			this.noteTaskLinks = this.noteTaskLinks.filter((link) => link.noteId !== id);
			this.noteGoalLinks = this.noteGoalLinks.filter((link) => link.noteId !== id);
			return;
		}

		const remoteNote = this._noteRowToNote(newRow);
		if (!remoteNote) return;

		if (eventType === 'INSERT') {
			if (!this.notes.find((note) => note.id === remoteNote.id)) {
				this.notes = [remoteNote, ...this.notes];
			}
			return;
		}

		if (eventType === 'UPDATE') {
			const localNote = this.notes.find((note) => note.id === remoteNote.id);
			const remoteUpdatedAt = remoteNote.updatedAt;
			const localUpdatedAt = localNote?.updatedAt ?? 0;
			if (remoteUpdatedAt > localUpdatedAt) {
				this.notes = this.notes
					.map((note) => (note.id === remoteNote.id ? remoteNote : note))
					.sort((a, b) => b.updatedAt - a.updatedAt);
			}
		}
	}

	_applyRealtimeNoteTaskLinkChange(payload) {
		const { eventType, new: newRow, old: oldRow } = payload;
		const key = `${newRow?.note_id || oldRow?.note_id}:${newRow?.task_id || oldRow?.task_id}`;
		if (!key) return;
		if (eventType === 'DELETE' || newRow?.deleted_at) {
			this.noteTaskLinks = this.noteTaskLinks.filter(
				(link) => `${link.noteId}:${link.taskId}` !== key
			);
			return;
		}
		const remoteLink = this._noteTaskLinkRowToLink(newRow);
		if (!remoteLink) return;
		if (remoteLink.isPrimary) {
			this.noteTaskLinks = this.noteTaskLinks.filter(
				(link) =>
					!(
						link.taskId === remoteLink.taskId &&
						link.isPrimary === true &&
						link.noteId !== remoteLink.noteId
					)
			);
		}
		const existing = this.noteTaskLinks.find(
			(link) => link.noteId === remoteLink.noteId && link.taskId === remoteLink.taskId
		);
		if (!existing) {
			this.noteTaskLinks = [remoteLink, ...this.noteTaskLinks];
			return;
		}
		if (remoteLink.updatedAt > (existing.updatedAt ?? 0)) {
			this.noteTaskLinks = this.noteTaskLinks.map((link) =>
				link.noteId === remoteLink.noteId && link.taskId === remoteLink.taskId ? remoteLink : link
			);
		}
	}

	_applyRealtimeNoteGoalLinkChange(payload) {
		const { eventType, new: newRow, old: oldRow } = payload;
		const key = `${newRow?.note_id || oldRow?.note_id}:${newRow?.goal_index || oldRow?.goal_index}`;
		if (!key) return;
		if (eventType === 'DELETE' || newRow?.deleted_at) {
			this.noteGoalLinks = this.noteGoalLinks.filter(
				(link) => `${link.noteId}:${link.goalIndex}` !== key
			);
			return;
		}
		const remoteLink = this._noteGoalLinkRowToLink(newRow);
		if (!remoteLink) return;
		const existing = this.noteGoalLinks.find(
			(link) => link.noteId === remoteLink.noteId && link.goalIndex === remoteLink.goalIndex
		);
		if (!existing) {
			this.noteGoalLinks = [remoteLink, ...this.noteGoalLinks];
			return;
		}
		if (remoteLink.updatedAt > (existing.updatedAt ?? 0)) {
			this.noteGoalLinks = this.noteGoalLinks.map((link) =>
				link.noteId === remoteLink.noteId && link.goalIndex === remoteLink.goalIndex
					? remoteLink
					: link
			);
		}
	}

	_applyRealtimeTaskGoalLinkChange(payload) {
		const { eventType, new: newRow, old: oldRow } = payload;
		const key = `${newRow?.task_id || oldRow?.task_id}:${newRow?.goal_index || oldRow?.goal_index}`;
		if (!key) return;
		if (eventType === 'DELETE' || newRow?.deleted_at) {
			this.taskGoalLinks = this.taskGoalLinks.filter(
				(link) => `${link.taskId}:${link.goalIndex}` !== key
			);
			return;
		}
		const remoteLink = this._taskGoalLinkRowToLink(newRow);
		if (!remoteLink) return;
		const existing = this.taskGoalLinks.find(
			(link) => link.taskId === remoteLink.taskId && link.goalIndex === remoteLink.goalIndex
		);
		if (!existing) {
			this.taskGoalLinks = [remoteLink, ...this.taskGoalLinks];
			return;
		}
		if (remoteLink.updatedAt > (existing.updatedAt ?? 0)) {
			this.taskGoalLinks = this.taskGoalLinks.map((link) =>
				link.taskId === remoteLink.taskId && link.goalIndex === remoteLink.goalIndex
					? remoteLink
					: link
			);
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

		try {
			this._migrateLegacyTaskLinksInMemory();
			// Always save locally so offline mode works even without Supabase
			await this._saveLocally();

			if (!authStore.user || !supabase) {
				// Not authenticated — nothing to save to the cloud
				this.saveStatus = 'idle';
				return;
			}

			this.syncError = null;
			await this.saveToSupabase(
				this.harada_chart.grid,
				(this.harada_chart.todos || []).filter((todo) => !todo?.isDraft),
				this.notes,
				this.noteTaskLinks,
				this.noteGoalLinks,
				this.taskGoalLinks,
				'My Harada Chart'
			);
		} catch (err) {
			console.error('Save failed:', err);
			this.syncError = err.message;
		}
	}

	async _saveLocally() {
		if (!browser) return;
		try {
			const plainGrid = this._toPlainArray(this.harada_chart.grid);
			const plainTodos = Array.isArray(this.harada_chart.todos)
				? this.harada_chart.todos
						.filter((t) => !t?.isDraft)
						.map((t) => (t && typeof t === 'object' ? { ...t } : t))
				: [];
			const plainNotes = Array.isArray(this.notes)
				? this.notes.map((note) => (note && typeof note === 'object' ? { ...note } : note))
				: [];
			const plainNoteTaskLinks = Array.isArray(this.noteTaskLinks)
				? this.noteTaskLinks.map((link) => (link && typeof link === 'object' ? { ...link } : link))
				: [];
			const plainNoteGoalLinks = Array.isArray(this.noteGoalLinks)
				? this.noteGoalLinks.map((link) => (link && typeof link === 'object' ? { ...link } : link))
				: [];
			const plainTaskGoalLinks = Array.isArray(this.taskGoalLinks)
				? this.taskGoalLinks.map((link) => (link && typeof link === 'object' ? { ...link } : link))
				: [];
			await prefSet('harada_chart_local', {
				grid: plainGrid,
				todos: plainTodos,
				notes: plainNotes,
				noteTaskLinks: plainNoteTaskLinks,
				noteGoalLinks: plainNoteGoalLinks,
				taskGoalLinks: plainTaskGoalLinks,
				savedAt: new Date().toISOString()
			});
		} catch (err) {
			console.error('Failed to save Harada chart locally:', err);
		}
	}

	// --- Supabase IO ---

	async loadFromSupabase() {
		if (!browser || !authStore.user || !supabase) return null;

		try {
			this.syncError = null;

			const [
				chartResult,
				tasksResult,
				notesResult,
				noteTaskLinksResult,
				noteGoalLinksResult,
				taskGoalLinksResult
			] =
				await Promise.all([
				supabase.from('harada_charts').select('*').eq('user_id', authStore.user.id).single(),
				supabase.from('tasks').select('*').eq('user_id', authStore.user.id).is('deleted_at', null),
				supabase.from('notes').select('*').eq('user_id', authStore.user.id).is('deleted_at', null),
				supabase.from('note_task_links').select('*').eq('user_id', authStore.user.id).is('deleted_at', null),
				supabase.from('note_goal_links').select('*').eq('user_id', authStore.user.id).is('deleted_at', null),
				supabase.from('task_goal_links').select('*').eq('user_id', authStore.user.id).is('deleted_at', null)
			]);

			const { data: chartData, error: chartError } = chartResult;
			const { data: taskRows, error: tasksError } = tasksResult;
			const { data: noteRows, error: notesError } = notesResult;
			const { data: noteTaskLinkRows, error: noteTaskLinksError } = noteTaskLinksResult;
			const { data: noteGoalLinkRows, error: noteGoalLinksError } = noteGoalLinksResult;
			const { data: taskGoalLinkRows, error: taskGoalLinksError } = taskGoalLinksResult;

			if (tasksError) throw tasksError;
			if (notesError) throw notesError;
			if (noteTaskLinksError) throw noteTaskLinksError;
			if (noteGoalLinksError) throw noteGoalLinksError;
			if (taskGoalLinksError) throw taskGoalLinksError;
			if (chartError && chartError.code !== 'PGRST116') throw chartError;

			const todos = (taskRows || []).map((row) => this._taskRowToTodo(row)).filter(Boolean);
			const notes = (noteRows || [])
				.map((row) => this._noteRowToNote(row))
				.filter(Boolean)
				.sort((a, b) => b.updatedAt - a.updatedAt);
			const noteTaskLinks = (noteTaskLinkRows || [])
				.map((row) => this._noteTaskLinkRowToLink(row))
				.filter(Boolean);
			const noteGoalLinks = (noteGoalLinkRows || [])
				.map((row) => this._noteGoalLinkRowToLink(row))
				.filter(Boolean);
			const taskGoalLinks = (taskGoalLinkRows || [])
				.map((row) => this._taskGoalLinkRowToLink(row))
				.filter(Boolean);

			if (
				!chartData &&
				todos.length === 0 &&
				notes.length === 0 &&
				noteTaskLinks.length === 0 &&
				noteGoalLinks.length === 0 &&
				taskGoalLinks.length === 0
			)
				return null;

			return {
				grid: chartData?.grid || [],
				todos,
				notes,
				noteTaskLinks,
				noteGoalLinks,
				taskGoalLinks,
				title: chartData?.title || 'My Harada Chart'
			};
		} catch (err) {
			console.error('Failed to load from Supabase:', err);
			this.syncError = err.message;
			return null;
		}
	}

	async saveToSupabase(
		gridSnapshot,
		todosSnapshot,
		notesSnapshot,
		noteTaskLinksSnapshot,
		noteGoalLinksSnapshot,
		taskGoalLinksSnapshot,
		title = 'My Harada Chart'
	) {
		if (!browser || !authStore.user || !supabase) return false;

		// If we're offline, remember that we have local changes that still need
		// to be pushed once connectivity is restored.
		if (!this.isOnline) {
			this._pendingCloudSync = true;
			return false;
		}

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
			const noteRows = (notesSnapshot || [])
				.map((note) => this._noteToRow(note, authStore.user.id))
				.filter(Boolean);
			const noteTaskLinkRows = (noteTaskLinksSnapshot || [])
				.map((link) => this._noteTaskLinkToRow(link, authStore.user.id))
				.filter(Boolean);
			const noteGoalLinkRows = (noteGoalLinksSnapshot || [])
				.map((link) => this._noteGoalLinkToRow(link, authStore.user.id))
				.filter(Boolean);
			const taskGoalLinkRows = (taskGoalLinksSnapshot || [])
				.map((link) => this._taskGoalLinkToRow(link, authStore.user.id))
				.filter(Boolean);

			if (taskRows.length > 0) {
				const { error: tasksError } = await supabase.rpc('upsert_tasks_if_newer', {
					in_rows: taskRows
				});
				if (tasksError) throw tasksError;
			}
			if (noteRows.length > 0) {
				const { error: notesError } = await supabase.rpc('upsert_notes_if_newer', {
					in_rows: noteRows
				});
				if (notesError) throw notesError;
			}
			if (noteTaskLinkRows.length > 0) {
				const { error: noteTaskLinksError } = await supabase.rpc(
					'upsert_note_task_links_if_newer',
					{
						in_rows: noteTaskLinkRows
					}
				);
				if (noteTaskLinksError) throw noteTaskLinksError;
			}
			if (noteGoalLinkRows.length > 0) {
				const { error: noteGoalLinksError } = await supabase.rpc(
					'upsert_note_goal_links_if_newer',
					{
						in_rows: noteGoalLinkRows
					}
				);
				if (noteGoalLinksError) throw noteGoalLinksError;
			}
			if (taskGoalLinkRows.length > 0) {
				const { error: taskGoalLinksError } = await supabase.rpc(
					'upsert_task_goal_links_if_newer',
					{
						in_rows: taskGoalLinkRows
					}
				);
				if (taskGoalLinksError) throw taskGoalLinksError;
			}

			this._pendingCloudSync = false;
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
			pinned: row.pinned === true,
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
		if (normalized.isDraft) return null;
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
			pinned: normalized.pinned === true,
			ordering:
				typeof normalized.ordering === 'number' && Number.isFinite(normalized.ordering)
					? normalized.ordering
					: createdAtMs,
			created_at: new Date(createdAtMs).toISOString(),
			updated_at: new Date(updatedAtMs).toISOString(),
			deleted_at: null
		};
	}

	_noteRowToNote(row) {
		if (!row || typeof row !== 'object' || typeof row.id !== 'string') return null;
		const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
		const createdAt = row.created_at ? new Date(row.created_at).getTime() : updatedAt;
		return normalizeNote({
			id: row.id,
			content: typeof row.content === 'string' ? row.content : '',
			createdAt,
			updatedAt
		});
	}

	_noteToRow(note, userId) {
		if (!note || typeof note.id !== 'string') return null;
		const normalized = normalizeNote(note);
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
			content: typeof normalized.content === 'string' ? normalized.content : '',
			created_at: new Date(createdAtMs).toISOString(),
			updated_at: new Date(updatedAtMs).toISOString(),
			deleted_at: null
		};
	}

	_noteTaskLinkRowToLink(row) {
		if (!row || typeof row !== 'object') return null;
		return normalizeNoteTaskLink({
			id: row.id,
			noteId: row.note_id,
			taskId: row.task_id,
			isPrimary: row.is_primary === true,
			createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
			updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
		});
	}

	_noteTaskLinkToRow(link, userId) {
		const normalized = normalizeNoteTaskLink(link);
		if (!normalized) return null;
		return {
			id: normalized.id,
			user_id: userId,
			note_id: normalized.noteId,
			task_id: normalized.taskId,
			is_primary: normalized.isPrimary === true,
			created_at: new Date(normalized.createdAt).toISOString(),
			updated_at: new Date(normalized.updatedAt).toISOString(),
			deleted_at: null
		};
	}

	_noteGoalLinkRowToLink(row) {
		if (!row || typeof row !== 'object') return null;
		return normalizeNoteGoalLink({
			id: row.id,
			noteId: row.note_id,
			goalIndex: row.goal_index,
			createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
			updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
		});
	}

	_noteGoalLinkToRow(link, userId) {
		const normalized = normalizeNoteGoalLink(link);
		if (!normalized) return null;
		return {
			id: normalized.id,
			user_id: userId,
			note_id: normalized.noteId,
			goal_index: normalized.goalIndex,
			created_at: new Date(normalized.createdAt).toISOString(),
			updated_at: new Date(normalized.updatedAt).toISOString(),
			deleted_at: null
		};
	}

	_taskGoalLinkRowToLink(row) {
		if (!row || typeof row !== 'object') return null;
		return normalizeTaskGoalLink({
			id: row.id,
			taskId: row.task_id,
			goalIndex: row.goal_index,
			createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
			updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
		});
	}

	_taskGoalLinkToRow(link, userId) {
		const normalized = normalizeTaskGoalLink(link);
		if (!normalized) return null;
		return {
			id: normalized.id,
			user_id: userId,
			task_id: normalized.taskId,
			goal_index: normalized.goalIndex,
			created_at: new Date(normalized.createdAt).toISOString(),
			updated_at: new Date(normalized.updatedAt).toISOString(),
			deleted_at: null
		};
	}

	// --- Domain mutations ---

	_migrateLegacyTaskMarkdownInMemory() {
		const legacyTodos = (this.harada_chart.todos || []).filter(
			(todo) =>
				typeof todo?.id === 'string' &&
				typeof todo?.markdown === 'string' &&
				todo.markdown.trim().length > 0 &&
				!this.noteTaskLinks.some((link) => link.taskId === todo.id)
		);
		if (legacyTodos.length === 0) return;
		const now = Date.now();
		const newLinks = [];
		const newNotes = [];
		const newGoalLinks = [];
		const updatedTodos = this.harada_chart.todos.map((todo) => {
			const legacy = legacyTodos.find((t) => t.id === todo.id);
			if (!legacy) return todo;
			const note = defaultNote({ content: legacy.markdown });
			newNotes.push(note);
			newLinks.push(
				normalizeNoteTaskLink({
					noteId: note.id,
					taskId: legacy.id,
					isPrimary: true,
					createdAt: now,
					updatedAt: now
				})
			);
			if (typeof legacy.goalIndex === 'number') {
				newGoalLinks.push(
					normalizeNoteGoalLink({
						noteId: note.id,
						goalIndex: legacy.goalIndex,
						createdAt: now,
						updatedAt: now
					})
				);
			}
			return { ...todo, markdown: '', updatedAt: now };
		});
		this.notes = [...newNotes, ...this.notes];
		this.noteTaskLinks = [...newLinks.filter(Boolean), ...this.noteTaskLinks];
		this.noteGoalLinks = [...newGoalLinks.filter(Boolean), ...this.noteGoalLinks];
		this.harada_chart = { ...this.harada_chart, todos: updatedTodos };
	}

	_migratePrimaryTaskNotesInMemory() {
		const todos = this.harada_chart.todos || [];
		if (!Array.isArray(todos) || todos.length === 0) return;
		let changed = false;
		const nextLinks = [...this.noteTaskLinks];
		for (const todo of todos) {
			if (!todo?.id) continue;
			const linksForTask = nextLinks
				.filter((link) => link.taskId === todo.id)
				.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
			if (linksForTask.length === 0) continue;
			const primaryLinks = linksForTask.filter((link) => link.isPrimary === true);
			if (primaryLinks.length === 1) continue;
			const preferred = primaryLinks[0] || linksForTask[0];
			const ts = Date.now();
			for (const link of linksForTask) {
				const shouldBePrimary = link === preferred;
				if (link.isPrimary !== shouldBePrimary) {
					link.isPrimary = shouldBePrimary;
					link.updatedAt = ts;
					changed = true;
				}
			}
		}
		if (changed) this.noteTaskLinks = nextLinks;
	}

	_migrateLegacyTaskLinksInMemory() {
		const todos = this.harada_chart.todos || [];
		if (!Array.isArray(todos) || todos.length === 0) return;
		const now = Date.now();
		const newGoalLinks = [];
		const existingGoalLinks = new Set(
			this.taskGoalLinks.map((link) => `${link.taskId}:${link.goalIndex}`)
		);
		for (const todo of todos) {
			if (!todo?.id) continue;
			if (
				typeof todo.goalIndex === 'number' &&
				!existingGoalLinks.has(`${todo.id}:${canonicalGoalIndex(todo.goalIndex)}`)
			) {
				newGoalLinks.push(
					normalizeTaskGoalLink({
						taskId: todo.id,
						goalIndex: todo.goalIndex,
						createdAt: now,
						updatedAt: now
					})
				);
			}
		}
		if (newGoalLinks.length > 0) {
			this.taskGoalLinks = [...newGoalLinks.filter(Boolean), ...this.taskGoalLinks];
		}
	}

	/**
	 * After adding or changing a goal-linked todo, refresh the goal cell timestamp and
	 * move that goal's section to the top of the All Tasks list (via todo_group_ordering).
	 */
	bumpGoalAfterTodoActivity(goalIndex) {
		if (typeof goalIndex !== 'number') return;

		const canonical = canonicalGoalIndex(goalIndex);

		const updatedTodos = this.harada_chart.todos || [];
		const nextGrid = [...this.harada_chart.grid];
		updateGoalTimestamp(nextGrid, canonical);

		const goalsWithTodos = new Set();
		for (const todo of updatedTodos) {
			if (
				(todo.listType === 'goal' || !todo.listType) &&
				!todo.isDraft &&
				todo.status !== 'done' &&
				typeof todo.goalIndex === 'number'
			) {
				goalsWithTodos.add(canonicalGoalIndex(todo.goalIndex));
			}
		}

		let minOrdering = null;
		for (const idx of goalsWithTodos) {
			if (idx === canonical) continue;
			const cell = nextGrid[idx];
			const ordering =
				typeof cell?.todo_group_ordering === 'number' && Number.isFinite(cell.todo_group_ordering)
					? cell.todo_group_ordering
					: (idx + 1) * GOAL_GROUP_ORDER_STEP;
			if (minOrdering === null || ordering < minOrdering) {
				minOrdering = ordering;
			}
		}

		const newOrdering =
			minOrdering === null ? GOAL_GROUP_ORDER_STEP : minOrdering - GOAL_GROUP_ORDER_STEP;

		const existingCell = nextGrid[canonical] || defaultCell();
		nextGrid[canonical] = {
			...existingCell,
			todo_group_ordering: newOrdering
		};

		this.harada_chart = { ...this.harada_chart, grid: nextGrid };
	}

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

		const materializesDraft =
			previousTodo?.isDraft === true &&
			((typeof nextPatch.title === 'string' && nextPatch.title.trim().length > 0) ||
				(typeof nextPatch.markdown === 'string' && nextPatch.markdown.trim().length > 0) ||
				nextPatch.isDraft === false);
		if (materializesDraft) {
			nextPatch = { ...nextPatch, isDraft: false };
		}

		// First apply the patch to the target todo itself
		let updatedTodos = previousTodos.map((t) => (t.id === id ? { ...t, ...nextPatch } : t));

		// If we changed this todo's list/goal, propagate that change to all of its descendants
		const updatedTodoForMeta = updatedTodos.find((t) => t.id === id);
		if (updatedTodoForMeta && previousTodo) {
			const listChanged =
				updatedTodoForMeta.listId !== previousTodo.listId ||
				updatedTodoForMeta.listType !== previousTodo.listType ||
				updatedTodoForMeta.goalIndex !== previousTodo.goalIndex;

			if (listChanged) {
				const ts = Date.now();
				const byId = new Map();
				for (const todo of updatedTodos) {
					if (todo && typeof todo.id === 'string') {
						byId.set(todo.id, todo);
					}
				}

				function isDescendant(candidateId, ancestorId) {
					let current = byId.get(candidateId);
					const seen = new Set();
					while (current && current.parentId) {
						if (seen.has(current.id)) break;
						seen.add(current.id);
						if (current.parentId === ancestorId) return true;
						current = byId.get(current.parentId);
					}
					return false;
				}

				const sharedMeta = {
					listId: updatedTodoForMeta.listId,
					listType: updatedTodoForMeta.listType,
					listName: updatedTodoForMeta.listName ?? null,
					goalIndex: updatedTodoForMeta.goalIndex ?? null
				};

				updatedTodos = updatedTodos.map((todo) => {
					if (!todo || todo.id === id) return todo;
					if (!isDescendant(todo.id, id)) return todo;
					return { ...todo, ...sharedMeta, updatedAt: ts };
				});
			}
		}

		this.harada_chart = { ...this.harada_chart, todos: updatedTodos };

		const updatedTodo = updatedTodos.find((t) => t.id === id);
		if (updatedTodo && previousTodo) {
			const now = Date.now();
			const updatedGoal =
				typeof updatedTodo.goalIndex === 'number' ? canonicalGoalIndex(updatedTodo.goalIndex) : null;
			if (
				typeof updatedGoal === 'number' &&
				!this.taskGoalLinks.some((link) => link.taskId === id && link.goalIndex === updatedGoal)
			) {
				this.taskGoalLinks = [
					normalizeTaskGoalLink({
						taskId: id,
						goalIndex: updatedGoal,
						createdAt: now,
						updatedAt: now
					}),
					...this.taskGoalLinks
				].filter(Boolean);
			}

		}
		const goalIndexToUpdate = updatedTodo?.goalIndex ?? previousTodo?.goalIndex;
		if (typeof goalIndexToUpdate === 'number') {
			this.bumpGoalAfterTodoActivity(goalIndexToUpdate);
		}

		this.saveNow();
	}

	deleteTodo(id) {
		if (!id) return;

		const previousTodos = this.harada_chart.todos || [];
		const todo = previousTodos.find((t) => t.id === id);
		const nextTodos = previousTodos.filter((t) => t.id !== id);
		this.harada_chart = { ...this.harada_chart, todos: nextTodos };
		this.noteTaskLinks = this.noteTaskLinks.filter((link) => link.taskId !== id);
		this.taskGoalLinks = this.taskGoalLinks.filter((link) => link.taskId !== id);

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
			supabase
				.from('note_task_links')
				.update({ deleted_at: now, updated_at: now })
				.eq('task_id', id)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete task note links:', error);
				});
			supabase
				.from('task_goal_links')
				.update({ deleted_at: now, updated_at: now })
				.eq('task_id', id)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete task goal links:', error);
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

		// Play a subtle completion "ping" when a task is marked done (browser only)
		if (browser && nextStatus === 'done') {
			try {
				synthStore.playBell();
			} catch (err) {
				console.error('Failed to play completion sound:', err);
			}
		}

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

	createNote({ content = '' } = {}) {
		const note = defaultNote({ content });
		this.notes = [note, ...this.notes];
		this.saveNow();
		return note;
	}

	updateNote(id, patch = {}) {
		if (!id || !patch) return;
		const ts = Date.now();
		this.notes = this.notes
			.map((note) => {
				if (note.id !== id) return note;
				return normalizeNote({
					...note,
					...patch,
					updatedAt: ts
				});
			})
			.sort((a, b) => b.updatedAt - a.updatedAt);
		this.saveNow();
	}

	getNotesForTask(taskId) {
		if (!taskId) return [];
		const noteIds = new Set(
			this.noteTaskLinks.filter((link) => link.taskId === taskId).map((link) => link.noteId)
		);
		return this.notes
			.filter((note) => noteIds.has(note.id))
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	getPrimaryNoteForTask(taskId) {
		if (!taskId) return null;
		const primaryLink = this.noteTaskLinks
			.filter((link) => link.taskId === taskId && link.isPrimary === true)
			.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
		if (!primaryLink) return null;
		return this.notes.find((note) => note.id === primaryLink.noteId) || null;
	}

	getFreeNotesForTask(taskId) {
		if (!taskId) return [];
		const noteIds = new Set(
			this.noteTaskLinks
				.filter((link) => link.taskId === taskId && link.isPrimary !== true)
				.map((link) => link.noteId)
		);
		return this.notes
			.filter((note) => noteIds.has(note.id))
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	isPrimaryTaskNote(noteId) {
		if (!noteId) return false;
		return this.noteTaskLinks.some((link) => link.noteId === noteId && link.isPrimary === true);
	}

	getNotesForGoal(goalIndex) {
		if (typeof goalIndex !== 'number') return [];
		const noteIds = new Set(
			this.noteGoalLinks
				.filter((link) => link.goalIndex === canonicalGoalIndex(goalIndex))
				.map((link) => link.noteId)
		);
		return this.notes
			.filter((note) => noteIds.has(note.id))
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	getLinkedTaskIdsForNote(noteId) {
		if (!noteId) return [];
		return this.noteTaskLinks.filter((link) => link.noteId === noteId).map((link) => link.taskId);
	}

	getLinkedGoalIndicesForNote(noteId) {
		if (!noteId) return [];
		return this.noteGoalLinks.filter((link) => link.noteId === noteId).map((link) => link.goalIndex);
	}

	getLinkedGoalIndicesForTask(taskId) {
		if (!taskId) return [];
		const linked = [];
		for (const link of this.taskGoalLinks) {
			if (link.taskId === taskId) linked.push(link.goalIndex);
		}
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (typeof todo?.goalIndex === 'number') linked.push(canonicalGoalIndex(todo.goalIndex));
		return [...new Set(linked)].sort((a, b) => a - b);
	}

	linkNoteToTask(noteId, taskId, { isPrimary = false } = {}) {
		if (!noteId || !taskId) return;
		if (isPrimary) {
			this.noteTaskLinks = this.noteTaskLinks.filter(
				(link) => !(link.taskId === taskId && link.isPrimary === true && link.noteId !== noteId)
			);
		}
		const existing = this.noteTaskLinks.find((link) => link.noteId === noteId && link.taskId === taskId);
		if (existing) {
			if (existing.isPrimary === isPrimary) return;
			this.noteTaskLinks = this.noteTaskLinks.map((link) =>
				link.noteId === noteId && link.taskId === taskId
					? { ...link, isPrimary, updatedAt: Date.now() }
					: link
			);
			this.saveNow();
			return;
		}
		this.noteTaskLinks = [
			normalizeNoteTaskLink({ noteId, taskId, isPrimary, createdAt: Date.now(), updatedAt: Date.now() }),
			...this.noteTaskLinks
		].filter(Boolean);
		this.saveNow();
	}

	unlinkNoteFromTask(noteId, taskId) {
		if (!noteId || !taskId) return;
		this.noteTaskLinks = this.noteTaskLinks.filter(
			(link) => !(link.noteId === noteId && link.taskId === taskId)
		);
		if (browser && authStore.user && supabase) {
			const now = new Date().toISOString();
			supabase
				.from('note_task_links')
				.update({ deleted_at: now, updated_at: now })
				.eq('note_id', noteId)
				.eq('task_id', taskId)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete note/task link:', error);
				});
		}
		this.saveNow();
	}

	linkNoteToGoal(noteId, goalIndex, options = {}) {
		if (!noteId || typeof goalIndex !== 'number') return;
		const persist = options.persist !== false;
		const canonical = canonicalGoalIndex(goalIndex);
		if (this.noteGoalLinks.some((link) => link.noteId === noteId && link.goalIndex === canonical)) return;
		this.noteGoalLinks = [
			normalizeNoteGoalLink({
				noteId,
				goalIndex: canonical,
				createdAt: Date.now(),
				updatedAt: Date.now()
			}),
			...this.noteGoalLinks
		].filter(Boolean);
		if (persist) this.saveNow();
	}

	unlinkNoteFromGoal(noteId, goalIndex) {
		if (!noteId || typeof goalIndex !== 'number') return;
		const canonical = canonicalGoalIndex(goalIndex);
		this.noteGoalLinks = this.noteGoalLinks.filter(
			(link) => !(link.noteId === noteId && link.goalIndex === canonical)
		);
		if (browser && authStore.user && supabase) {
			const now = new Date().toISOString();
			supabase
				.from('note_goal_links')
				.update({ deleted_at: now, updated_at: now })
				.eq('note_id', noteId)
				.eq('goal_index', canonical)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete note/goal link:', error);
				});
		}
		this.saveNow();
	}

	linkTaskToGoal(taskId, goalIndex) {
		if (!taskId || typeof goalIndex !== 'number') return;
		const canonical = canonicalGoalIndex(goalIndex);
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (!todo) return;
		const alreadyLinked = this.taskGoalLinks.some(
			(link) => link.taskId === taskId && link.goalIndex === canonical
		);
		if (!alreadyLinked) {
			this.taskGoalLinks = [
				normalizeTaskGoalLink({
					taskId,
					goalIndex: canonical,
					createdAt: Date.now(),
					updatedAt: Date.now()
				}),
				...this.taskGoalLinks
			].filter(Boolean);
		}
		if (typeof todo.goalIndex !== 'number') {
			this.updateTodo(taskId, buildGoalListMeta(canonical));
			return;
		}
		this.bumpGoalAfterTodoActivity(canonical);
		this.saveNow();
	}

	unlinkTaskFromGoal(taskId, goalIndex) {
		if (!taskId || typeof goalIndex !== 'number') return;
		const canonical = canonicalGoalIndex(goalIndex);
		this.taskGoalLinks = this.taskGoalLinks.filter(
			(link) => !(link.taskId === taskId && link.goalIndex === canonical)
		);
		const remainingGoal = this.taskGoalLinks.find((link) => link.taskId === taskId)?.goalIndex ?? null;
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (todo && typeof todo.goalIndex === 'number' && canonicalGoalIndex(todo.goalIndex) === canonical) {
			this.updateTodo(taskId, buildGoalListMeta(remainingGoal));
		}
		if (browser && authStore.user && supabase) {
			const now = new Date().toISOString();
			supabase
				.from('task_goal_links')
				.update({ deleted_at: now, updated_at: now })
				.eq('task_id', taskId)
				.eq('goal_index', canonical)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete task/goal link:', error);
				});
		}
		this.saveNow();
	}

	createLinkedTaskNote(taskId, { content = '', goalIndex = null, isPrimary = false } = {}) {
		const note = this.createNote({ content });
		this.linkNoteToTask(note.id, taskId, { isPrimary });
		if (typeof goalIndex === 'number') this.linkNoteToGoal(note.id, goalIndex);
		return note;
	}

	setPrimaryNoteForTask(taskId, { content = '', goalIndex = null } = {}) {
		if (!taskId) return null;
		const primary = this.getPrimaryNoteForTask(taskId);
		if (primary) {
			this.updateNote(primary.id, { content });
			return primary;
		}
		if (!String(content || '').trim()) return null;
		return this.createLinkedTaskNote(taskId, { content, goalIndex, isPrimary: true });
	}

	deleteNote(id) {
		if (!id) return;
		this.notes = this.notes.filter((note) => note.id !== id);
		this.noteTaskLinks = this.noteTaskLinks.filter((link) => link.noteId !== id);
		this.noteGoalLinks = this.noteGoalLinks.filter((link) => link.noteId !== id);

		if (browser && authStore.user && supabase) {
			const now = new Date().toISOString();
			supabase
				.from('notes')
				.update({ deleted_at: now, updated_at: now })
				.eq('id', id)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete note:', error);
				});
		}

		this.saveNow();
	}

	// --- Auth ---

	handleAuthChange() {
		if (!browser) return;

		this._isInitialized = false;
		this._unsubscribeRealtime();

		if (!authStore.user) {
			// If we're offline, the session may have expired and Supabase fired SIGNED_OUT
			// even though the user hasn't intentionally logged out. Keep local data intact
			// so nothing is lost — it will sync when connectivity and session are restored.
			if (!this.isOnline) {
				this._setBootstrapping(false);
				return;
			}
			// Logged out online — show a helpful seeded board for new/pre-login users
			if ((this.harada_chart.todos || []).length === 0 && isGridBlank(this.harada_chart.grid)) {
				this.harada_chart = {
					grid: createSeededGrid(),
					todos: []
				};
				this.notes = [];
				this.noteTaskLinks = [];
				this.noteGoalLinks = [];
				this.taskGoalLinks = [];
			}
			this._setBootstrapping(false);
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

	clearAll() {
    // console.log("Grid at first:",this.harada_chart.grid);
		this.harada_chart = {
			grid: Array.from({ length: 81 }, (_, i) => defaultCell()),
			todos: []
		};
		this.notes = [];
		this.noteTaskLinks = [];
		this.noteGoalLinks = [];
		this.taskGoalLinks = [];
    localSet('harada_onboarding_seen', false);
    console.log("Grid is now:",this.harada_chart.grid);
		this.saveNow();
	}
}

export const store = new Store();
