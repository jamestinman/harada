import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';
import { localGet, localSet, prefGet, prefSet } from '$lib/PersistentStorage.mjs';
import { loadLocalHaradaSnapshot, saveLocalHaradaSnapshot } from '$lib/LocalHaradaDb.js';
import { supabase } from '$lib/supabaseClient.js';
import { clearedCell, isChartUnset, resolveGridCell } from '$lib/haradaGridUtils.js';
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
	mergeNoteLists,
	getTopOrderingForGoalView,
	getGoalViewSiblings,
	isTaskPrimaryOnGoal,
	getTaskGoalIndicesForTodo,
	collectDescendantTaskIds,
	buildGoalBlockRelocateMap,
	getGoalBlockIndexSet,
	getLinkedGoalIndex,
	goalIndexMatchesCanonical,
	appendGoalReadmes,
	PINNED_GOAL_INDEX,
	NO_GOAL_PSEUDO_INDEX,
	isPinnedGoalIndex,
	isNoGoalPseudoIndex,
	isPseudoGoalIndex,
	filterDisplayGoalIndices,
	normalizeViewGoalIndex,
	TODO_ORDER_STEP,
	filterRetainedTodos,
	filterRetainedTaskRows,
	filterLinksForRetainedTasks,
	getRecentlyCompletedCutoffIso,
	shouldRetainTodoInStore,
	todoBelongsToGoalView
} from '$lib/todoUtils.js';
import { authStore } from './auth.svelte.js';
import { fetchUrlContent } from '$lib/urlContent.mjs';
import { parseStandaloneUrl } from '$lib/urlUtils.js';

/** Soft-deleted cloud rows kept for this long before a future purge batch (phase 2). */
export const TRASH_RETENTION_DAYS = 30;

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
const LOCAL_SAVE_DEBOUNCE_MS = 200;
const CLOUD_SYNC_DEBOUNCE_MS = 1200;
const REFRESH_THROTTLE_MS = 10000;
const REALTIME_SELF_ECHO_MS = 3000;

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
	const ordering =
		typeof link.ordering === 'number' && Number.isFinite(link.ordering) ? link.ordering : null;
	const parentId =
		typeof link.parentId === 'string' ? link.parentId : link.parentId === null ? null : null;
	return {
		id: typeof link.id === 'string' && link.id ? link.id : createLinkId('tgl'),
		taskId: link.taskId,
		goalIndex: canonical,
		ordering,
		parentId,
		createdAt,
		updatedAt
	};
}

class Store {
	version = $state('1.0.28');
	activeTab = $state('harada');
	selectedGoalFilter = $state('all');
	selectedGoalForNew = $state('');
	sidebarOpen = $state(false);
	currentGoalIndex = $state(null);
	theme = $state('auto');
	systemPrefersDark = $state(false);
	saveStatus = $state('idle');
	isBootstrapping = $state(true);
	isLoading = $state(true);
	isRefreshing = $state(false);
	initialCloudHydrationStatus = $state('idle');
	remoteAccountHasData = $state(false);
	isOnline = $state(browser ? navigator.onLine : true);
	syncError = $state(null);
  showHowItWorksModal = $state(false);
  showOnboardingWizard = $state(false);

	/** Mobile top bar + desktop sidebar: global task search / quick-add; Enter creates a task and clears this. */
	todoWorkspaceQuery = $state('');

	/**
	 * Mobile todo: true when the TASKS goal-list drawer is showing (not task content).
	 * Distinct from currentGoalIndex / URL - user can be on a goal route while browsing the list.
	 */
	todoMobileShowsGoalList = $state(false);

	/**
	 * Mobile search filter breadth, latched when the query goes from empty to non-empty.
	 * 'all' = All Tasks feed; 'goal' = current /todo/[goal] scope only.
	 */
	todoMobileSearchScope = $state(/** @type {'all' | 'goal'} */ ('all'));
	todoListOrdering = $state(/** @type {'recent' | 'alpha' | 'harada'} */ ('recent'));

	setTodoListOrdering(value) {
		const next =
			value === 'alpha' || value === 'harada' || value === 'recent' ? value : 'recent';
		this.todoListOrdering = next;
		if (!browser) return;
		localSet('todo_list_ordering', next);
	}

	latchTodoMobileSearchScope(showsGoalList, onAllTasksRoute = false) {
		this.todoMobileSearchScope = showsGoalList || onAllTasksRoute ? 'all' : 'goal';
	}

	/** User opened a specific goal (e.g. goal title link) while a mobile search query is active */
	focusTodoMobileSearchOnGoal() {
		this.todoMobileSearchScope = 'goal';
	}

	/** Shared mobile slide-over menu (Nav panel); toggled from todo/notes headers too */
	mobileNavMenuOpen = $state(false);
	composerPanelOpen = $state(false);
	composerPanelTab = $state(/** @type {'task' | 'note' | 'url'} */ ('task'));

	openComposerPanel(tab = 'task') {
		this.composerPanelTab = tab === 'note' ? 'note' : tab === 'url' ? 'url' : 'task';
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

	get activeTheme() {
		return this.theme === 'auto' ? (this.systemPrefersDark ? 'dark' : 'light') : this.theme;
	}

	setTheme(value) {
		const nextTheme = value === 'dark' || value === 'light' || value === 'auto' ? value : 'auto';
		this.theme = nextTheme;
		localSet('theme', nextTheme);
	}

	_updateSystemThemePreference() {
		if (!browser || typeof window.matchMedia !== 'function') return;
		this.systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
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
	_isInitializing = false;
	_realtimeChannel = null;
	_pendingCloudSync = false;
	_refreshPromise = null;
	_localSaveTimer = null;
	_cloudSyncTimer = null;
	_localSavingPromise = null;
	_cloudSavingPromise = null;
	_localSavePending = false;
	_cloudSyncPending = false;
	_dirtyTasks = new Set();
	_dirtyNotes = new Set();
	_dirtyNoteTaskLinks = new Set();
	_dirtyNoteGoalLinks = new Set();
	_dirtyTaskGoalLinks = new Set();
	_dirtyGrid = false;
	_forceFullCloudSync = false;
	_lastRefreshAt = 0;
	_recentWrites = new Map();

	constructor() {
		if (!browser) return;
		const savedTheme = localGet('theme', 'auto');
		this.setTheme(savedTheme);
		this._updateSystemThemePreference();
		const savedTodoListOrdering = localGet('todo_list_ordering', 'recent');
		this.setTodoListOrdering(savedTodoListOrdering);

		if (typeof window.matchMedia === 'function') {
			const media = window.matchMedia('(prefers-color-scheme: dark)');
			media.addEventListener('change', (event) => {
				this.systemPrefersDark = event.matches;
			});
		}

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
			if (!this._isInitialized) return;
			if (document.visibilityState === 'hidden') {
				void this._handleTabHidden();
				return;
			}
			void this._handleTabVisible();
		});
		window.addEventListener('focus', () => {
			if (this._isInitialized) {
				void this._handleTabVisible();
			}
		});
		window.addEventListener('beforeunload', () => {
			if (this._localSaveTimer || this._cloudSyncTimer) {
				void this.saveNow();
			}
		});

		this.initialize();
	}

	async _handleTabHidden() {
		await this.saveNow();
	}

	async _handleTabVisible() {
		if (this._localSavingPromise || this._cloudSavingPromise) {
			await Promise.all(
				[this._localSavingPromise, this._cloudSavingPromise].filter(Boolean)
			);
		}
		if (this._hasPendingDirty()) {
			// Offline edits queue up as dirty state. Native webviews don't reliably
			// fire 'online' after airplane mode ends, so also push on foreground.
			if (this.isOnline && authStore.user && supabase) {
				await this.saveNow();
			}
			return;
		}
		await this.refreshFromSupabase();
	}

	_recordRecentWrite(id) {
		if (!id) return;
		const now = Date.now();
		this._recentWrites.set(id, now);
		// Opportunistically sweep expired keys so the map can't grow unbounded
		// across a long editing session.
		if (this._recentWrites.size > 256) {
			for (const [key, ts] of this._recentWrites) {
				if (now - ts > REALTIME_SELF_ECHO_MS) this._recentWrites.delete(key);
			}
		}
	}

	_isSelfEcho(id) {
		if (!id) return false;
		const ts = this._recentWrites.get(id);
		if (!ts) return false;
		if (Date.now() - ts > REALTIME_SELF_ECHO_MS) {
			this._recentWrites.delete(id);
			return false;
		}
		return true;
	}

	_markTaskDirty(id) {
		if (id) {
			this._dirtyTasks.add(id);
			this._recordRecentWrite(id);
		}
	}

	_markNoteDirty(id) {
		if (id) {
			this._dirtyNotes.add(id);
			this._recordRecentWrite(id);
		}
	}

	_markNoteTaskLinkDirty(link) {
		if (!link) return;
		const key = link.id || `${link.noteId}:${link.taskId}`;
		this._dirtyNoteTaskLinks.add(key);
		this._recordRecentWrite(key);
	}

	_markNoteGoalLinkDirty(link) {
		if (!link) return;
		const key = link.id || `${link.noteId}:${link.goalIndex}`;
		this._dirtyNoteGoalLinks.add(key);
		this._recordRecentWrite(key);
	}

	_markTaskGoalLinkDirty(link) {
		if (!link) return;
		const key = link.id || `${link.taskId}:${link.goalIndex}`;
		this._dirtyTaskGoalLinks.add(key);
		this._recordRecentWrite(key);
	}

	_markGridDirty() {
		this._dirtyGrid = true;
	}

	_hasPendingDirty() {
		return !!(
			this._dirtyTasks.size ||
			this._dirtyNotes.size ||
			this._dirtyNoteTaskLinks.size ||
			this._dirtyNoteGoalLinks.size ||
			this._dirtyTaskGoalLinks.size ||
			this._dirtyGrid
		);
	}

	_recomputeSaveStatus() {
		if (this._localSavingPromise || this._cloudSavingPromise) return;
		// Dirty markers represent "needs cloud sync". For local-only (signed-out) users
		// there's no cloud target, so once we're not actively saving we're idle.
		const cloudPossible = !!(authStore.user && supabase);
		this.saveStatus = cloudPossible && this._hasPendingDirty() ? 'dirty' : 'idle';
	}

	/**
	 * Drop dirty markers whose underlying row no longer exists (deleted tasks/notes/links)
	 * or is still a draft. Deletions are pushed to the cloud via direct soft-delete calls
	 * and captured locally via the full snapshot, so they must not linger in the dirty sets
	 * (which would otherwise keep saveStatus stuck and grow without bound).
	 */
	_pruneStaleDirty() {
		const liveTaskIds = new Set(
			(this.harada_chart.todos || []).filter((t) => t && !t.isDraft).map((t) => t.id)
		);
		for (const id of this._dirtyTasks) {
			if (!liveTaskIds.has(id)) this._dirtyTasks.delete(id);
		}
		const liveNoteIds = new Set((this.notes || []).map((n) => n?.id));
		for (const id of this._dirtyNotes) {
			if (!liveNoteIds.has(id)) this._dirtyNotes.delete(id);
		}
		const liveNoteTaskKeys = new Set(
			(this.noteTaskLinks || []).map((l) => this._linkKey(l, 'noteTask'))
		);
		for (const key of this._dirtyNoteTaskLinks) {
			if (!liveNoteTaskKeys.has(key)) this._dirtyNoteTaskLinks.delete(key);
		}
		const liveNoteGoalKeys = new Set(
			(this.noteGoalLinks || []).map((l) => this._linkKey(l, 'noteGoal'))
		);
		for (const key of this._dirtyNoteGoalLinks) {
			if (!liveNoteGoalKeys.has(key)) this._dirtyNoteGoalLinks.delete(key);
		}
		const liveTaskGoalKeys = new Set(
			(this.taskGoalLinks || []).map((l) => this._linkKey(l, 'taskGoal'))
		);
		for (const key of this._dirtyTaskGoalLinks) {
			if (!liveTaskGoalKeys.has(key)) this._dirtyTaskGoalLinks.delete(key);
		}
	}

	_markAllDirty() {
		for (const todo of this.harada_chart.todos || []) {
			if (todo?.id) this._dirtyTasks.add(todo.id);
		}
		for (const note of this.notes || []) {
			if (note?.id) this._dirtyNotes.add(note.id);
		}
		for (const link of this.noteTaskLinks || []) this._markNoteTaskLinkDirty(link);
		for (const link of this.noteGoalLinks || []) this._markNoteGoalLinkDirty(link);
		for (const link of this.taskGoalLinks || []) this._markTaskGoalLinkDirty(link);
		this._dirtyGrid = true;
		this._forceFullCloudSync = true;
	}

	_clearDirtyAfterSync({
		taskIds = [],
		noteIds = [],
		noteTaskLinkKeys = [],
		noteGoalLinkKeys = [],
		taskGoalLinkKeys = [],
		grid = false
	} = {}) {
		for (const id of taskIds) this._dirtyTasks.delete(id);
		for (const id of noteIds) this._dirtyNotes.delete(id);
		for (const key of noteTaskLinkKeys) this._dirtyNoteTaskLinks.delete(key);
		for (const key of noteGoalLinkKeys) this._dirtyNoteGoalLinks.delete(key);
		for (const key of taskGoalLinkKeys) this._dirtyTaskGoalLinks.delete(key);
		if (grid) this._dirtyGrid = false;
		if (
			this._dirtyTasks.size === 0 &&
			this._dirtyNotes.size === 0 &&
			this._dirtyNoteTaskLinks.size === 0 &&
			this._dirtyNoteGoalLinks.size === 0 &&
			this._dirtyTaskGoalLinks.size === 0 &&
			!this._dirtyGrid
		) {
			this._forceFullCloudSync = false;
		}
	}

	_clearSaveTimers() {
		if (this._localSaveTimer) {
			clearTimeout(this._localSaveTimer);
			this._localSaveTimer = null;
		}
		if (this._cloudSyncTimer) {
			clearTimeout(this._cloudSyncTimer);
			this._cloudSyncTimer = null;
		}
	}

	_scheduleLocalSave() {
		if (this._localSaveTimer) clearTimeout(this._localSaveTimer);
		this._localSaveTimer = setTimeout(() => {
			this._localSaveTimer = null;
			void this._performLocalSave();
		}, LOCAL_SAVE_DEBOUNCE_MS);
	}

	_scheduleCloudSync() {
		if (this._cloudSyncTimer) clearTimeout(this._cloudSyncTimer);
		this._cloudSyncTimer = setTimeout(() => {
			this._cloudSyncTimer = null;
			void this._performCloudSync();
		}, CLOUD_SYNC_DEBOUNCE_MS);
	}

	_applyRetainedTaskScope() {
		const retainedTodos = filterRetainedTodos(this.harada_chart.todos || []);
		const retainedIds = new Set(retainedTodos.map((todo) => todo.id));
		const currentTodos = this.harada_chart.todos || [];
		const nextNoteTaskLinks = filterLinksForRetainedTasks(this.noteTaskLinks, retainedIds);
		const nextTaskGoalLinks = filterLinksForRetainedTasks(this.taskGoalLinks, retainedIds);
		const changed =
			retainedTodos.length !== currentTodos.length ||
			nextNoteTaskLinks.length !== this.noteTaskLinks.length ||
			nextTaskGoalLinks.length !== this.taskGoalLinks.length;

		if (!changed) return false;

		this.harada_chart = { ...this.harada_chart, todos: retainedTodos };
		this.noteTaskLinks = nextNoteTaskLinks;
		this.taskGoalLinks = nextTaskGoalLinks;
		return true;
	}

	_applyLocalSnapshot(local) {
		if (!local || typeof local !== 'object') return false;

		const localGrid = Array.isArray(local.grid) ? local.grid : [];
		const normalizedLocalGrid = Array.from(
			{ length: 81 },
			(_, i) => (localGrid[i] ? { ...defaultCell(), ...localGrid[i] } : defaultCell())
		);

		const todos = Array.isArray(local.tasks)
			? local.tasks.map((row) => this._taskRowToTodo(row)).filter(Boolean)
			: Array.isArray(local.todos)
				? local.todos.map((todo) => normalizeTodoListMeta(todo))
				: [];

		const notes = Array.isArray(local.notes)
			? local.notes
					.map((note) =>
						note?.updated_at ? this._noteRowToNote(note) : normalizeNote(note)
					)
					.filter(Boolean)
			: [];

		const noteTaskLinks = Array.isArray(local.noteTaskLinks)
			? local.noteTaskLinks
					.map((link) =>
						link?.note_id ? this._noteTaskLinkRowToLink(link) : normalizeNoteTaskLink(link)
					)
					.filter(Boolean)
			: [];
		const noteGoalLinks = Array.isArray(local.noteGoalLinks)
			? local.noteGoalLinks
					.map((link) =>
						link?.note_id ? this._noteGoalLinkRowToLink(link) : normalizeNoteGoalLink(link)
					)
					.filter(Boolean)
			: [];
		const taskGoalLinks = Array.isArray(local.taskGoalLinks)
			? local.taskGoalLinks
					.map((link) =>
						link?.task_id ? this._taskGoalLinkRowToLink(link) : normalizeTaskGoalLink(link)
					)
					.filter(Boolean)
			: [];

		this.harada_chart = {
			grid: normalizedLocalGrid,
			todos
		};
		this.notes = notes;
		this.noteTaskLinks = noteTaskLinks;
		this.noteGoalLinks = noteGoalLinks;
		this.taskGoalLinks = taskGoalLinks;
		this._applyRetainedTaskScope();
		return true;
	}

	_localOwnerUserId() {
		return authStore.user?.id ?? authStore.lastKnownUser?.id ?? null;
	}

	_resetInitialCloudHydration() {
		this.initialCloudHydrationStatus = 'idle';
		this.remoteAccountHasData = false;
	}

	_hasRemoteAccountData(remoteSnapshot) {
		if (!remoteSnapshot || typeof remoteSnapshot !== 'object') return false;
		if (!isChartUnset(remoteSnapshot.grid)) return true;
		return (
			(remoteSnapshot.todos || []).length > 0 ||
			(remoteSnapshot.notes || []).length > 0 ||
			(remoteSnapshot.noteTaskLinks || []).length > 0 ||
			(remoteSnapshot.noteGoalLinks || []).length > 0 ||
			(remoteSnapshot.taskGoalLinks || []).length > 0
		);
	}

	async _loadLocalSnapshot() {
		const userId = this._localOwnerUserId();
		try {
			const indexedDbSnapshot = await loadLocalHaradaSnapshot(userId);
			if (indexedDbSnapshot) return indexedDbSnapshot;
		} catch (err) {
			console.warn('Failed to load Harada IndexedDB mirror:', err);
		}

		try {
			const legacy = await prefGet('harada_chart_local', null);
			if (legacy && typeof legacy === 'object') return legacy;
		} catch (err) {
			console.error('Failed to load local Harada chart:', err);
		}

		return null;
	}

	async initialize() {
		// _isInitializing: boot now stays in-flight for a while offline (the auth
		// wait below), and the 'online' listener may call initialize() again in
		// that window - don't let two boots interleave.
		if (!browser || this._isInitialized || this._isInitializing) return;
		this._isInitializing = true;

		this._setBootstrapping(true);
		this._resetInitialCloudHydration();

		try {
			// 1) Bootstrap from local persistent storage FIRST so the app works
			// offline. The IndexedDB owner comes from the cached last-known user,
			// which is available synchronously. This must not wait on auth: offline
			// with an expired token, supabase-js retries the refresh for ~30-60s,
			// and launching in airplane mode used to sit on a placeholder chart
			// for that whole window.
			const assumedOwnerId = this._localOwnerUserId();
			const local = await this._loadLocalSnapshot();
			if (local) {
				this._applyLocalSnapshot(local);
				this._migrateLegacyTaskMarkdownInMemory();
				this._migratePrimaryTaskNotesInMemory();
				this._migrateLegacyTaskLinksInMemory();
				// Local data is enough to use the app - don't hold the UI while
				// auth and cloud hydration catch up below.
				this._setBootstrapping(false);
			}

			// 2) Wait for the initial session check before touching Supabase.
			if (supabase) {
				await authStore.whenReady();
			}

			// Auth may have resolved to a different owner than the cached one
			// (e.g. lastKnownUser was cleared but a session survived). Reload the
			// mirror for the right owner in that rare case.
			if (this._localOwnerUserId() !== assumedOwnerId) {
				const owned = await this._loadLocalSnapshot();
				if (owned) {
					this._applyLocalSnapshot(owned);
					this._migrateLegacyTaskMarkdownInMemory();
					this._migratePrimaryTaskNotesInMemory();
					this._migrateLegacyTaskLinksInMemory();
				}
			}

			// 3) If not authenticated or Supabase is unavailable, we stay in offline/local-only mode
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

			// 4) If online and authenticated, hydrate from Supabase and overwrite local snapshot
			this.initialCloudHydrationStatus = 'loading';
			this.remoteAccountHasData = false;
			const data = await this.loadFromSupabase();
			if (this.syncError) {
				this.initialCloudHydrationStatus = 'error';
				return;
			}
			this.remoteAccountHasData = this._hasRemoteAccountData(data);
			if (data) {
				await this._mergeAndApplyRemoteSnapshot(data, { persistLocal: true });
				this._migrateLegacyTaskMarkdownInMemory();
				this._migratePrimaryTaskNotesInMemory();
				this._migrateLegacyTaskLinksInMemory();
			}
			this.initialCloudHydrationStatus = 'ready';
		} catch (err) {
			console.error('Failed to initialize from Supabase:', err);
			this.syncError = err.message;
			if (this.initialCloudHydrationStatus === 'loading') {
				this.initialCloudHydrationStatus = 'error';
			}
		} finally {
			if (this._applyRetainedTaskScope()) {
				void this._saveLocally();
			}
			this._setBootstrapping(false);
			this._isInitialized = true;
			this._isInitializing = false;
		}

		// Only attempt realtime subscription when Supabase and auth are available
		if (authStore.user && supabase) {
			this._subscribeToRealtime();
			// Flush any migrated rows or pre-login local edits that still need to be
			// pushed to the cloud. Incremental sync only sends what's actually dirty,
			// so a clean refresh (nothing dirty) is a no-op.
			if (this._hasPendingDirty()) {
				this.queueSave();
			}
		}
	}

	_setBootstrapping(value) {
		this.isBootstrapping = value;
		this.isLoading = value;
	}

	async refreshFromSupabase() {
		if (!browser || !this._isInitialized || !authStore.user || !supabase) return false;
		const now = Date.now();
		if (now - this._lastRefreshAt < REFRESH_THROTTLE_MS) return false;
		if (this._refreshPromise) return this._refreshPromise;

		this.isRefreshing = true;
		this._refreshPromise = (async () => {
			try {
				const data = await this.loadFromSupabase();
				if (!data) return false;
				this._lastRefreshAt = Date.now();
				const applied = await this._mergeAndApplyRemoteSnapshot(data, { persistLocal: true });
				if (this._applyRetainedTaskScope()) {
					await this._saveLocally();
				}
				return applied;
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
			const resolved = resolveGridCell(localCell, remoteGrid[i]);
			if (resolved.changed) changed = true;
			return resolved.cell;
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
		const merged = filterRetainedTodos(
			mergeTodoLists(localTodos, remoteTodos).map((todo) => normalizeTodoListMeta(todo))
		);
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
		const remoteSansDirty = this._dirtyNotes.size
			? remoteNotes.filter((note) => !this._dirtyNotes.has(note.id))
			: remoteNotes;
		let merged = mergeNoteLists(localNotes, remoteSansDirty);
		if (this._dirtyNotes.size) {
			const byId = new Map(merged.map((note) => [note.id, note]));
			for (const note of localNotes) {
				if (this._dirtyNotes.has(note.id)) {
					byId.set(note.id, note);
				}
			}
			merged = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
		}
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
			const retainedIds = new Set(todoMerge.merged.map((todo) => todo.id));
			this.noteTaskLinks = filterLinksForRetainedTasks(this.noteTaskLinks, retainedIds);
			this.taskGoalLinks = filterLinksForRetainedTasks(this.taskGoalLinks, retainedIds);
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

			// Same resolution as the snapshot merge, so the two paths cannot drift.
			const resolved = resolveGridCell(localCell, remoteCell);
			if (!resolved.changed) return localCell;
			changed = true;
			return { ...defaultCell(), ...resolved.cell };
		});

		if (changed) {
			this.harada_chart = { ...this.harada_chart, grid: nextGrid };
		}
	}

	_applyRealtimeTaskChange(payload) {
		const { eventType, new: newRow, old: oldRow } = payload;
		const id = newRow?.id || oldRow?.id;
		if (!id) return;
		if (eventType !== 'DELETE' && this._isSelfEcho(id)) return;

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

		if (!shouldRetainTodoInStore(remoteTodo)) {
			if (this.harada_chart.todos.find((t) => t.id === id)) {
				this.harada_chart = {
					...this.harada_chart,
					todos: this.harada_chart.todos.filter((t) => t.id !== id)
				};
				this.noteTaskLinks = this.noteTaskLinks.filter((link) => link.taskId !== id);
				this.taskGoalLinks = this.taskGoalLinks.filter((link) => link.taskId !== id);
			}
			return;
		}

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

			// Only apply if remote is strictly newer - protects in-progress local edits
			if (remoteUpdatedAt > localUpdatedAt) {
				const mergedUrl =
					(typeof remoteTodo.url === 'string' && remoteTodo.url.trim()) ||
					(typeof localTodo?.url === 'string' && localTodo.url.trim()) ||
					'';
				const nextTodo =
					mergedUrl === (remoteTodo.url || '') ? remoteTodo : { ...remoteTodo, url: mergedUrl };
				this.harada_chart = {
					...this.harada_chart,
					todos: this.harada_chart.todos.map((t) => (t.id === remoteTodo.id ? nextTodo : t))
				};
			}
		}
	}

	_applyRealtimeNoteChange(payload) {
		const { eventType, new: newRow, old: oldRow } = payload;
		const id = newRow?.id || oldRow?.id;
		if (!id) return;
		if (eventType !== 'DELETE' && this._isSelfEcho(id)) return;

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
		if (!key || key === ':') return;
		if (eventType !== 'DELETE' && this._isSelfEcho(key)) return;
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
		if (!key || key.includes('undefined')) return;
		if (eventType !== 'DELETE' && this._isSelfEcho(key)) return;
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
		if (!key || key.includes('undefined')) return;
		if (eventType !== 'DELETE' && this._isSelfEcho(key)) return;
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

	registerTodoMutation(id, { immediate = false } = {}) {
		this._markTaskDirty(id);
		return immediate ? this.saveNow() : this.queueSave();
	}

	registerGridMutation({ immediate = false } = {}) {
		this._markGridDirty();
		return immediate ? this.saveNow() : this.queueSave();
	}

	_softDeleteNoteGoalLinkInCloud(link) {
		if (!browser || !authStore.user || !supabase) return Promise.resolve();
		if (!link?.noteId) return Promise.resolve();
		const now = new Date().toISOString();
		let query = supabase
			.from('note_goal_links')
			.update({ deleted_at: now, updated_at: now })
			.eq('user_id', authStore.user.id);
		if (link.id) {
			query = query.eq('id', link.id);
		} else {
			query = query
				.eq('note_id', link.noteId)
				.eq('goal_index', canonicalGoalIndex(link.goalIndex));
		}
		return query.then(({ error }) => {
			if (error) console.error('Failed to soft-delete note/goal link:', error);
		});
	}

	_softDeleteTaskGoalLinkInCloud(link) {
		if (!browser || !authStore.user || !supabase) return Promise.resolve();
		if (!link?.taskId) return Promise.resolve();
		const now = new Date().toISOString();
		let query = supabase
			.from('task_goal_links')
			.update({ deleted_at: now, updated_at: now })
			.eq('user_id', authStore.user.id);
		if (link.id) {
			query = query.eq('id', link.id);
		} else {
			query = query
				.eq('task_id', link.taskId)
				.eq('goal_index', canonicalGoalIndex(link.goalIndex));
		}
		return query.then(({ error }) => {
			if (error) console.error('Failed to soft-delete task/goal link:', error);
		});
	}

	/**
	 * Remap todos and goal-scoped links when Harada chart cells move or swap.
	 * Awaits cloud soft-deletes for old link rows before applying in-memory remaps
	 * (goal_index is part of the unique key, so deletes must land before upserts).
	 */
	async applyGoalIndexSwapMap(swapMap) {
		if (!swapMap || swapMap.size === 0) return;

		const now = Date.now();
		const noteGoalRemaps = [];
		const taskGoalRemaps = [];

		for (const link of this.noteGoalLinks || []) {
			const mapped = swapMap.get(link.goalIndex);
			if (mapped !== undefined) noteGoalRemaps.push({ link, mapped });
		}
		for (const link of this.taskGoalLinks || []) {
			const mapped = swapMap.get(link.goalIndex);
			if (mapped !== undefined) taskGoalRemaps.push({ link, mapped });
		}

		await Promise.all([
			...noteGoalRemaps.map(({ link }) => this._softDeleteNoteGoalLinkInCloud(link)),
			...taskGoalRemaps.map(({ link }) => this._softDeleteTaskGoalLinkInCloud(link))
		]);

		const currentTodos = this.harada_chart.todos || [];
		this.harada_chart.todos = currentTodos.map((todo) => {
			if (todo?.listType && todo.listType !== 'goal') return todo;
			const gIdx = typeof todo?.goalIndex === 'number' ? todo.goalIndex : null;
			if (gIdx === null) return todo;
			const mapped = swapMap.get(gIdx);
			if (mapped === undefined) return todo;
			this._markTaskDirty(todo.id);
			return {
				...todo,
				goalIndex: mapped,
				listType: 'goal',
				listId: `goal:${mapped}`,
				updatedAt: now
			};
		});

		if (noteGoalRemaps.length > 0) {
			const remapByKey = new Map(
				noteGoalRemaps.map(({ link, mapped }) => [`${link.noteId}:${link.goalIndex}`, mapped])
			);
			this.noteGoalLinks = (this.noteGoalLinks || []).map((link) => {
				const mapped = remapByKey.get(`${link.noteId}:${link.goalIndex}`);
				if (mapped === undefined) return link;
				const remapped = normalizeNoteGoalLink({
					noteId: link.noteId,
					goalIndex: mapped,
					createdAt: link.createdAt,
					updatedAt: now
				});
				this._markNoteGoalLinkDirty(remapped);
				return remapped;
			});
		}

		if (taskGoalRemaps.length > 0) {
			const remapByKey = new Map(
				taskGoalRemaps.map(({ link, mapped }) => [`${link.taskId}:${link.goalIndex}`, mapped])
			);
			this.taskGoalLinks = (this.taskGoalLinks || []).map((link) => {
				const mapped = remapByKey.get(`${link.taskId}:${link.goalIndex}`);
				if (mapped === undefined) return link;
				const remapped = normalizeTaskGoalLink({
					taskId: link.taskId,
					goalIndex: mapped,
					ordering: link.ordering,
					parentId: link.parentId ?? null,
					createdAt: link.createdAt,
					updatedAt: now
				});
				this._markTaskGoalLinkDirty(remapped);
				return remapped;
			});
		}
	}

	_taskOnGoalBlock(taskId, blockIndices) {
		const todo = (this.harada_chart.todos || []).find((t) => t.id === taskId);
		if (todo && typeof todo.goalIndex === 'number' && blockIndices.has(todo.goalIndex)) {
			return { via: 'primary', goalIndex: todo.goalIndex };
		}
		for (const link of this.taskGoalLinks || []) {
			if (link.taskId === taskId && blockIndices.has(link.goalIndex)) {
				return { via: 'link', goalIndex: link.goalIndex };
			}
		}
		return null;
	}

	_noteOnGoalBlock(noteId, blockIndices) {
		return (this.noteGoalLinks || []).some(
			(link) => link.noteId === noteId && blockIndices.has(link.goalIndex)
		);
	}

	/**
	 * Drop all task/note links to a single goal. Tasks with no remaining real goals move to Z2.
	 */
	clearGoalBlock(canonicalIndex) {
		if (typeof canonicalIndex !== 'number') return;

		const canonical = canonicalGoalIndex(canonicalIndex);
		const matchesClearedGoal = (goalIndex) => goalIndexMatchesCanonical(goalIndex, canonical);

		const cloudDeletes = [];
		const noteLinksToDrop = new Set();
		const taskLinksToDrop = new Set();
		const affectedTaskIds = new Set();

		for (const link of this.noteGoalLinks || []) {
			if (!matchesClearedGoal(link.goalIndex)) continue;
			cloudDeletes.push(this._softDeleteNoteGoalLinkInCloud(link));
			noteLinksToDrop.add(`${link.noteId}:${link.goalIndex}`);
		}

		for (const link of this.taskGoalLinks || []) {
			if (!matchesClearedGoal(link.goalIndex)) continue;
			cloudDeletes.push(this._softDeleteTaskGoalLinkInCloud(link));
			taskLinksToDrop.add(`${link.taskId}:${link.goalIndex}`);
			affectedTaskIds.add(link.taskId);
		}

		for (const todo of this.harada_chart.todos || []) {
			if (todo?.listType && todo.listType !== 'goal') continue;
			if (typeof todo?.goalIndex === 'number' && matchesClearedGoal(todo.goalIndex)) {
				affectedTaskIds.add(todo.id);
			}
		}

		if (noteLinksToDrop.size > 0) {
			this.noteGoalLinks = (this.noteGoalLinks || []).filter(
				(link) => !noteLinksToDrop.has(`${link.noteId}:${link.goalIndex}`)
			);
		}

		if (taskLinksToDrop.size > 0) {
			this.taskGoalLinks = (this.taskGoalLinks || []).filter(
				(link) => !taskLinksToDrop.has(`${link.taskId}:${link.goalIndex}`)
			);
		}

		for (const taskId of affectedTaskIds) {
			const todo = this.harada_chart.todos.find((t) => t.id === taskId);
			if (!todo || (todo.listType && todo.listType !== 'goal')) continue;

			const primaryInClearedGoal =
				typeof todo.goalIndex === 'number' && matchesClearedGoal(todo.goalIndex);

			if (!primaryInClearedGoal) {
				const remainingGoals = getTaskGoalIndicesForTodo(todo, this.taskGoalLinks);
				if (remainingGoals.length === 0 && todo.goalIndex == null) {
					this.ensureNoGoalTaskLink(taskId);
				}
				continue;
			}

			const remainingGoals = getTaskGoalIndicesForTodo(
				{ ...todo, goalIndex: null },
				this.taskGoalLinks
			);
			this.updateTodo(taskId, buildGoalListMeta(remainingGoals[0] ?? null));
		}

		if (noteLinksToDrop.size > 0 || taskLinksToDrop.size > 0 || affectedTaskIds.size > 0) {
			if (cloudDeletes.length > 0) {
				void Promise.all(cloudDeletes).catch((err) => {
					console.error('Failed to soft-delete goal links:', err);
				});
			}
			this.saveNow();
		}
	}

	/**
	 * Merge source goal block into target: relocate tasks/notes, dedupe links, clear source.
	 */
	async mergeGoalBlocks(sourceCanonical, targetCanonical, { mergedTitle = '' } = {}) {
		if (sourceCanonical === targetCanonical) return;
		if (sourceCanonical === 40 || targetCanonical === 40) return;

		const relocateMap = buildGoalBlockRelocateMap(sourceCanonical, targetCanonical);
		const sourceBlock = getGoalBlockIndexSet(sourceCanonical);
		const targetBlock = getGoalBlockIndexSet(targetCanonical);
		const now = Date.now();

		const cloudDeletes = [];
		const noteLinksToDrop = new Set();
		const taskLinksToDrop = new Set();

		for (const link of this.noteGoalLinks || []) {
			if (!sourceBlock.has(link.goalIndex)) continue;
			if (this._noteOnGoalBlock(link.noteId, targetBlock)) {
				cloudDeletes.push(this._softDeleteNoteGoalLinkInCloud(link));
				noteLinksToDrop.add(`${link.noteId}:${link.goalIndex}`);
			}
		}

		for (const link of this.taskGoalLinks || []) {
			if (!sourceBlock.has(link.goalIndex)) continue;
			if (this._taskOnGoalBlock(link.taskId, targetBlock)) {
				cloudDeletes.push(this._softDeleteTaskGoalLinkInCloud(link));
				taskLinksToDrop.add(`${link.taskId}:${link.goalIndex}`);
			}
		}

		for (const todo of this.harada_chart.todos || []) {
			if (todo?.listType && todo.listType !== 'goal') continue;
			if (typeof todo?.goalIndex !== 'number' || !sourceBlock.has(todo.goalIndex)) continue;
			if (this._taskOnGoalBlock(todo.id, targetBlock)) {
				this._markTaskDirty(todo.id);
			}
		}

		const noteGoalRemaps = [];
		for (const link of this.noteGoalLinks || []) {
			if (!sourceBlock.has(link.goalIndex)) continue;
			if (noteLinksToDrop.has(`${link.noteId}:${link.goalIndex}`)) continue;
			const mapped = relocateMap.get(link.goalIndex);
			if (mapped !== undefined) noteGoalRemaps.push({ link, mapped });
		}

		const taskGoalRemaps = [];
		for (const link of this.taskGoalLinks || []) {
			if (!sourceBlock.has(link.goalIndex)) continue;
			if (taskLinksToDrop.has(`${link.taskId}:${link.goalIndex}`)) continue;
			const mapped = relocateMap.get(link.goalIndex);
			if (mapped !== undefined) taskGoalRemaps.push({ link, mapped });
		}

		for (const { link } of noteGoalRemaps) {
			cloudDeletes.push(this._softDeleteNoteGoalLinkInCloud(link));
		}
		for (const { link } of taskGoalRemaps) {
			cloudDeletes.push(this._softDeleteTaskGoalLinkInCloud(link));
		}

		await Promise.all(cloudDeletes);

		this.harada_chart.todos = (this.harada_chart.todos || []).map((todo) => {
			if (todo?.listType && todo.listType !== 'goal') return todo;
			const gIdx = typeof todo?.goalIndex === 'number' ? todo.goalIndex : null;
			if (gIdx === null || !sourceBlock.has(gIdx)) return todo;

			const onTarget = this._taskOnGoalBlock(todo.id, targetBlock);
			if (onTarget) {
				this._markTaskDirty(todo.id);
				return {
					...todo,
					goalIndex: onTarget.goalIndex,
					listType: 'goal',
					listId: `goal:${onTarget.goalIndex}`,
					updatedAt: now
				};
			}

			const mapped = relocateMap.get(gIdx);
			if (mapped === undefined) return todo;
			this._markTaskDirty(todo.id);
			return {
				...todo,
				goalIndex: mapped,
				listType: 'goal',
				listId: `goal:${mapped}`,
				updatedAt: now
			};
		});

		if (noteGoalRemaps.length > 0 || noteLinksToDrop.size > 0) {
			const remapByKey = new Map(
				noteGoalRemaps.map(({ link, mapped }) => [`${link.noteId}:${link.goalIndex}`, mapped])
			);
			this.noteGoalLinks = (this.noteGoalLinks || [])
				.filter((link) => !noteLinksToDrop.has(`${link.noteId}:${link.goalIndex}`))
				.map((link) => {
					const mapped = remapByKey.get(`${link.noteId}:${link.goalIndex}`);
					if (mapped === undefined) return link;
					const remapped = normalizeNoteGoalLink({
						noteId: link.noteId,
						goalIndex: mapped,
						createdAt: link.createdAt,
						updatedAt: now
					});
					this._markNoteGoalLinkDirty(remapped);
					return remapped;
				});
		}

		if (taskGoalRemaps.length > 0 || taskLinksToDrop.size > 0) {
			const remapByKey = new Map(
				taskGoalRemaps.map(({ link, mapped }) => [`${link.taskId}:${link.goalIndex}`, mapped])
			);
			this.taskGoalLinks = (this.taskGoalLinks || [])
				.filter((link) => !taskLinksToDrop.has(`${link.taskId}:${link.goalIndex}`))
				.map((link) => {
					const mapped = remapByKey.get(`${link.taskId}:${link.goalIndex}`);
					if (mapped === undefined) return link;
					const remapped = normalizeTaskGoalLink({
						taskId: link.taskId,
						goalIndex: mapped,
						ordering: link.ordering,
						parentId: link.parentId ?? null,
						createdAt: link.createdAt,
						updatedAt: now
					});
					this._markTaskGoalLinkDirty(remapped);
					return remapped;
				});
		}

		const grid = [...this.harada_chart.grid];
		const sourceCell = grid[sourceCanonical] ?? {};
		const targetCell = grid[targetCanonical] ?? {};
		const mergedReadme = appendGoalReadmes(targetCell.readme, sourceCell.readme);
		const title = (mergedTitle ?? '').trim();
		const timestamp = new Date().toISOString();

		const nextTargetCell = {
			...targetCell,
			text: title,
			readme: mergedReadme,
			updated_at: timestamp
		};
		grid[targetCanonical] = nextTargetCell;
		const targetLinked = getLinkedGoalIndex(targetCanonical);
		if (targetLinked !== null) {
			grid[targetLinked] = { ...nextTargetCell };
		}

		// clearedCell, not defaultCell: the clear must carry a timestamp or sync
		// resurrects the old text, and it must not re-seed placeholder titles.
		for (const index of sourceBlock) {
			grid[index] = clearedCell(timestamp);
		}

		this.harada_chart = {
			...this.harada_chart,
			grid,
			todos: this.harada_chart.todos
		};
		updateGoalTimestamp(this.harada_chart.grid, targetCanonical);
		this.registerGridMutation({ immediate: true });
	}

	/**
	 * Merge / absorb a single goal cell into another single goal cell.
	 * Moves the source cell's tasks, notes and links onto the target cell, then
	 * clears the source cell. Used for non-central goal → non-central goal merges
	 * and non-central goal → central goal absorption.
	 * @param {number} sourceIndex
	 * @param {number} targetIndex
	 * @param {{ mergedTitle?: string | null }} [options] When mergedTitle is null the
	 *   target's existing title is kept (absorption); otherwise it is replaced.
	 */
	async mergeGoalCells(sourceIndex, targetIndex, { mergedTitle = null } = {}) {
		if (typeof sourceIndex !== 'number' || typeof targetIndex !== 'number') return;
		if (sourceIndex === targetIndex) return;

		const now = Date.now();

		const noteOnTarget = (noteId) =>
			(this.noteGoalLinks || []).some(
				(l) => l.noteId === noteId && l.goalIndex === targetIndex
			);
		const taskOnTarget = (taskId) =>
			(this.taskGoalLinks || []).some(
				(l) => l.taskId === taskId && l.goalIndex === targetIndex
			) ||
			(this.harada_chart.todos || []).some(
				(t) => t.id === taskId && t.goalIndex === targetIndex
			);

		const cloudDeletes = [];
		const noteLinksToDrop = new Set();
		const taskLinksToDrop = new Set();

		for (const link of this.noteGoalLinks || []) {
			if (link.goalIndex !== sourceIndex) continue;
			if (noteOnTarget(link.noteId)) {
				cloudDeletes.push(this._softDeleteNoteGoalLinkInCloud(link));
				noteLinksToDrop.add(`${link.noteId}:${link.goalIndex}`);
			}
		}
		for (const link of this.taskGoalLinks || []) {
			if (link.goalIndex !== sourceIndex) continue;
			if (taskOnTarget(link.taskId)) {
				cloudDeletes.push(this._softDeleteTaskGoalLinkInCloud(link));
				taskLinksToDrop.add(`${link.taskId}:${link.goalIndex}`);
			}
		}

		const noteRemaps = (this.noteGoalLinks || []).filter(
			(l) => l.goalIndex === sourceIndex && !noteLinksToDrop.has(`${l.noteId}:${l.goalIndex}`)
		);
		const taskRemaps = (this.taskGoalLinks || []).filter(
			(l) => l.goalIndex === sourceIndex && !taskLinksToDrop.has(`${l.taskId}:${l.goalIndex}`)
		);
		for (const link of noteRemaps) cloudDeletes.push(this._softDeleteNoteGoalLinkInCloud(link));
		for (const link of taskRemaps) cloudDeletes.push(this._softDeleteTaskGoalLinkInCloud(link));

		await Promise.all(cloudDeletes);

		this.harada_chart.todos = (this.harada_chart.todos || []).map((todo) => {
			if (todo?.listType && todo.listType !== 'goal') return todo;
			if (todo?.goalIndex !== sourceIndex) return todo;
			this._markTaskDirty(todo.id);
			return {
				...todo,
				goalIndex: targetIndex,
				listType: 'goal',
				listId: `goal:${targetIndex}`,
				updatedAt: now
			};
		});

		this.noteGoalLinks = (this.noteGoalLinks || [])
			.filter((l) => !noteLinksToDrop.has(`${l.noteId}:${l.goalIndex}`))
			.map((l) => {
				if (l.goalIndex !== sourceIndex) return l;
				const remapped = normalizeNoteGoalLink({
					noteId: l.noteId,
					goalIndex: targetIndex,
					createdAt: l.createdAt,
					updatedAt: now
				});
				this._markNoteGoalLinkDirty(remapped);
				return remapped;
			});

		this.taskGoalLinks = (this.taskGoalLinks || [])
			.filter((l) => !taskLinksToDrop.has(`${l.taskId}:${l.goalIndex}`))
			.map((l) => {
				if (l.goalIndex !== sourceIndex) return l;
				const remapped = normalizeTaskGoalLink({
					taskId: l.taskId,
					goalIndex: targetIndex,
					ordering: l.ordering,
					parentId: l.parentId ?? null,
					createdAt: l.createdAt,
					updatedAt: now
				});
				this._markTaskGoalLinkDirty(remapped);
				return remapped;
			});

		const grid = [...this.harada_chart.grid];
		const sourceCell = grid[sourceIndex] ?? {};
		const targetCell = grid[targetIndex] ?? {};
		const mergedReadme = appendGoalReadmes(targetCell.readme, sourceCell.readme);
		const timestamp = new Date().toISOString();
		const title =
			mergedTitle == null ? (targetCell.text ?? '') : (mergedTitle ?? '').trim();

		const nextTargetCell = {
			...targetCell,
			text: title,
			readme: mergedReadme,
			updated_at: timestamp
		};
		grid[targetIndex] = nextTargetCell;
		const targetLinked = getLinkedGoalIndex(targetIndex);
		if (targetLinked !== null) grid[targetLinked] = { ...nextTargetCell };

		// clearedCell, not defaultCell: the clear must carry a timestamp or sync
		// resurrects the old text, and it must not re-seed placeholder titles.
		grid[sourceIndex] = clearedCell(timestamp);
		const sourceLinked = getLinkedGoalIndex(sourceIndex);
		if (sourceLinked !== null) grid[sourceLinked] = clearedCell(timestamp);

		this.harada_chart = {
			...this.harada_chart,
			grid,
			todos: this.harada_chart.todos
		};
		updateGoalTimestamp(this.harada_chart.grid, targetIndex);
		this.registerGridMutation({ immediate: true });
	}

	// --- Save ---

	saveNow() {
		if (!browser || !this._isInitialized) return Promise.resolve();
		this._clearSaveTimers();
		return this._flushAllSaves();
	}

	// Debounced save for routine edits - local at 200ms, cloud at 1200ms
	queueSave() {
		if (!browser || !this._isInitialized) return Promise.resolve();
		this.saveStatus = 'dirty';
		this._scheduleLocalSave();
		this._scheduleCloudSync();
		return Promise.resolve();
	}

	async _flushAllSaves() {
		await Promise.all([this._performLocalSave(), this._performCloudSync()]);
	}

	async _performLocalSave() {
		if (!browser) return;
		// If a save is already running, request another pass once it settles so the
		// latest in-memory state is always persisted (edits during an in-flight write
		// must not be dropped).
		if (this._localSavingPromise) {
			this._localSavePending = true;
			return this._localSavingPromise;
		}

		this._localSavingPromise = (async () => {
			try {
				this.saveStatus = 'saving';
				do {
					this._localSavePending = false;
					await this._saveLocally();
				} while (this._localSavePending);
			} catch (err) {
				console.error('Local save failed:', err);
			} finally {
				this._localSavingPromise = null;
				this._recomputeSaveStatus();
			}
		})();

		return this._localSavingPromise;
	}

	async _performCloudSync() {
		if (!browser) return;
		if (this._cloudSavingPromise) {
			this._cloudSyncPending = true;
			return this._cloudSavingPromise;
		}

		this._cloudSavingPromise = (async () => {
			try {
				this._migrateLegacyTaskLinksInMemory();
				// Keep dirty sets bounded even when signed out (deleted rows are handled
				// via the local snapshot + direct soft-delete calls).
				this._pruneStaleDirty();
				if (!authStore.user || !supabase) {
					return;
				}

				this.saveStatus = 'saving';
				this.syncError = null;
				do {
					this._cloudSyncPending = false;
					await this.saveToSupabase(
						this.harada_chart.grid,
						(this.harada_chart.todos || []).filter((todo) => !todo?.isDraft),
						this.notes,
						this.noteTaskLinks,
						this.noteGoalLinks,
						this.taskGoalLinks,
						'My Harada Chart'
					);
				} while (this._cloudSyncPending);
			} catch (err) {
				console.error('Cloud sync failed:', err);
				this.syncError = err.message;
			} finally {
				this._cloudSavingPromise = null;
				this._recomputeSaveStatus();
			}
		})();

		return this._cloudSavingPromise;
	}

	_linkKey(link, kind) {
		if (!link) return null;
		if (link.id) return link.id;
		if (kind === 'noteTask') return `${link.noteId}:${link.taskId}`;
		if (kind === 'noteGoal') return `${link.noteId}:${link.goalIndex}`;
		if (kind === 'taskGoal') return `${link.taskId}:${link.goalIndex}`;
		return null;
	}

	_isLinkDirty(link, dirtySet, kind) {
		if (this._forceFullCloudSync) return true;
		const key = this._linkKey(link, kind);
		return key ? dirtySet.has(key) : false;
	}

	async _saveLocally() {
		if (!browser) return;
		try {
			const plainGrid = this._toPlainArray(this.harada_chart.grid);
			const plainTodos = filterRetainedTodos(
				Array.isArray(this.harada_chart.todos)
					? this.harada_chart.todos
							.filter((t) => !t?.isDraft)
							.map((t) => (t && typeof t === 'object' ? { ...t } : t))
					: []
			);
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

			const userId = this._localOwnerUserId();
			const taskRows = plainTodos
				.map((todo) => this._todoToTaskRow(todo, userId))
				.filter(Boolean);
			const persistedTaskIds = new Set(taskRows.map((row) => row.id));
			const noteRows = plainNotes.map((note) => this._noteToRow(note, userId)).filter(Boolean);
			const noteTaskLinkRows = plainNoteTaskLinks
				.map((link) => this._noteTaskLinkToRow(link, userId))
				.filter(Boolean)
				.filter((row) => persistedTaskIds.has(row.task_id));
			const noteGoalLinkRows = plainNoteGoalLinks
				.map((link) => this._noteGoalLinkToRow(link, userId))
				.filter(Boolean);
			const taskGoalLinkRows = plainTaskGoalLinks
				.map((link) => this._taskGoalLinkToRow(link, userId))
				.filter(Boolean)
				.filter((row) => persistedTaskIds.has(row.task_id));

			let savedToIndexedDb = false;
			try {
				savedToIndexedDb = await saveLocalHaradaSnapshot({
					userId,
					grid: plainGrid,
					tasks: taskRows,
					notes: noteRows,
					noteTaskLinks: noteTaskLinkRows,
					noteGoalLinks: noteGoalLinkRows,
					taskGoalLinks: taskGoalLinkRows,
					title: 'My Harada Chart'
				});
			} catch (err) {
				console.warn('Failed to save Harada IndexedDB mirror:', err);
			}

			if (!savedToIndexedDb) {
				await prefSet('harada_chart_local', {
					grid: plainGrid,
					todos: plainTodos,
					notes: plainNotes,
					noteTaskLinks: plainNoteTaskLinks,
					noteGoalLinks: plainNoteGoalLinks,
					taskGoalLinks: plainTaskGoalLinks,
					savedAt: new Date().toISOString()
				});
			}
		} catch (err) {
			console.error('Failed to save Harada chart locally:', err);
		}
	}

	// --- Supabase IO ---

	async loadFromSupabase() {
		if (!browser || !authStore.user || !supabase) return null;

		try {
			this.syncError = null;
			const completedCutoffIso = getRecentlyCompletedCutoffIso();

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
				supabase
					.from('tasks')
					.select('*')
					.eq('user_id', authStore.user.id)
					.is('deleted_at', null)
					.or(`status.eq.todo,and(status.eq.done,updated_at.gte."${completedCutoffIso}")`),
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

			const retainedTaskRows = filterRetainedTaskRows(taskRows || []);
			const retainedTaskIds = new Set(retainedTaskRows.map((row) => row.id));
			const todos = retainedTaskRows.map((row) => this._taskRowToTodo(row)).filter(Boolean);
			const notes = (noteRows || [])
				.map((row) => this._noteRowToNote(row))
				.filter(Boolean)
				.sort((a, b) => b.updatedAt - a.updatedAt);
			const noteTaskLinks = (noteTaskLinkRows || [])
				.map((row) => this._noteTaskLinkRowToLink(row))
				.filter(Boolean)
				.filter((link) => retainedTaskIds.has(link.taskId));
			const noteGoalLinks = (noteGoalLinkRows || [])
				.map((row) => this._noteGoalLinkRowToLink(row))
				.filter(Boolean);
			const taskGoalLinks = (taskGoalLinkRows || [])
				.map((row) => this._taskGoalLinkRowToLink(row))
				.filter(Boolean)
				.filter((link) => retainedTaskIds.has(link.taskId));

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

		// Deleted rows (handled via direct soft-delete calls) and lingering drafts must
		// not keep the dirty sets populated forever.
		this._pruneStaleDirty();

		const fullSync = this._forceFullCloudSync;
		const hasDirty =
			fullSync ||
			this._dirtyGrid ||
			this._dirtyTasks.size > 0 ||
			this._dirtyNotes.size > 0 ||
			this._dirtyNoteTaskLinks.size > 0 ||
			this._dirtyNoteGoalLinks.size > 0 ||
			this._dirtyTaskGoalLinks.size > 0;

		if (!hasDirty) return true;

		try {
			this.syncError = null;

			const syncedTaskIds = [];
			const syncedNoteIds = [];
			const syncedNoteTaskLinkKeys = [];
			const syncedNoteGoalLinkKeys = [];
			const syncedTaskGoalLinkKeys = [];

			if (fullSync || this._dirtyGrid) {
				const grid = this._toPlainArray(gridSnapshot);
				const { error: chartError } = await supabase
					.from('harada_charts')
					.upsert({ user_id: authStore.user.id, grid, title }, { onConflict: 'user_id' });
				if (chartError) throw chartError;
			}

			const taskRows = (todosSnapshot || [])
				.filter((todo) => fullSync || this._dirtyTasks.has(todo.id))
				.map((todo) => this._todoToTaskRow(todo, authStore.user.id))
				.filter(Boolean);
			const persistedTaskIds = new Set(
				(todosSnapshot || [])
					.map((todo) => this._todoToTaskRow(todo, authStore.user.id))
					.filter(Boolean)
					.map((row) => row.id)
			);
			const noteRows = (notesSnapshot || [])
				.filter((note) => fullSync || this._dirtyNotes.has(note.id))
				.map((note) => this._noteToRow(note, authStore.user.id))
				.filter(Boolean);
			const noteTaskLinkRows = (noteTaskLinksSnapshot || [])
				.filter((link) => this._isLinkDirty(link, this._dirtyNoteTaskLinks, 'noteTask'))
				.map((link) => this._noteTaskLinkToRow(link, authStore.user.id))
				.filter(Boolean)
				.filter((row) => persistedTaskIds.has(row.task_id));
			const noteGoalLinkRows = (noteGoalLinksSnapshot || [])
				.filter((link) => this._isLinkDirty(link, this._dirtyNoteGoalLinks, 'noteGoal'))
				.map((link) => this._noteGoalLinkToRow(link, authStore.user.id))
				.filter(Boolean);
			const taskGoalLinkRows = (taskGoalLinksSnapshot || [])
				.filter((link) => this._isLinkDirty(link, this._dirtyTaskGoalLinks, 'taskGoal'))
				.map((link) => this._taskGoalLinkToRow(link, authStore.user.id))
				.filter(Boolean)
				.filter((row) => persistedTaskIds.has(row.task_id));

			if (taskRows.length > 0) {
				const { error: tasksError } = await supabase.rpc('upsert_tasks_if_newer', {
					in_rows: taskRows
				});
				if (tasksError) throw tasksError;
				syncedTaskIds.push(...taskRows.map((row) => row.id));
			}
			if (noteRows.length > 0) {
				const { error: notesError } = await supabase.rpc('upsert_notes_if_newer', {
					in_rows: noteRows
				});
				if (notesError) throw notesError;
				syncedNoteIds.push(...noteRows.map((row) => row.id));
			}
			if (noteTaskLinkRows.length > 0) {
				const { error: noteTaskLinksError } = await supabase.rpc(
					'upsert_note_task_links_if_newer',
					{
						in_rows: noteTaskLinkRows
					}
				);
				if (noteTaskLinksError) throw noteTaskLinksError;
				syncedNoteTaskLinkKeys.push(
					...noteTaskLinkRows.map((row) => row.id || `${row.note_id}:${row.task_id}`)
				);
			}
			if (noteGoalLinkRows.length > 0) {
				const { error: noteGoalLinksError } = await supabase.rpc(
					'upsert_note_goal_links_if_newer',
					{
						in_rows: noteGoalLinkRows
					}
				);
				if (noteGoalLinksError) throw noteGoalLinksError;
				syncedNoteGoalLinkKeys.push(
					...noteGoalLinkRows.map((row) => row.id || `${row.note_id}:${row.goal_index}`)
				);
			}
			if (taskGoalLinkRows.length > 0) {
				const { error: taskGoalLinksError } = await supabase.rpc(
					'upsert_task_goal_links_if_newer',
					{
						in_rows: taskGoalLinkRows
					}
				);
				if (taskGoalLinksError) throw taskGoalLinksError;
				syncedTaskGoalLinkKeys.push(
					...taskGoalLinkRows.map((row) => row.id || `${row.task_id}:${row.goal_index}`)
				);
			}

			this._clearDirtyAfterSync({
				taskIds: syncedTaskIds,
				noteIds: syncedNoteIds,
				noteTaskLinkKeys: syncedNoteTaskLinkKeys,
				noteGoalLinkKeys: syncedNoteGoalLinkKeys,
				taskGoalLinkKeys: syncedTaskGoalLinkKeys,
				grid: fullSync || this._dirtyGrid
			});

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
			url: typeof row.url === 'string' ? row.url : '',
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
			url: typeof normalized.url === 'string' && normalized.url ? normalized.url : null,
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
			ordering: row.ordering,
			parentId: typeof row.parent_id === 'string' ? row.parent_id : null,
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
			ordering: normalized.ordering,
			parent_id: typeof normalized.parentId === 'string' ? normalized.parentId : null,
			created_at: new Date(normalized.createdAt).toISOString(),
			updated_at: new Date(normalized.updatedAt).toISOString(),
			deleted_at: null
		};
	}

	_buildTaskGoalKeySet() {
		const keys = new Set();
		for (const link of this.taskGoalLinks ?? []) {
			keys.add(`${link.taskId}:${link.goalIndex}`);
		}
		for (const todo of this.harada_chart.todos ?? []) {
			if (typeof todo?.goalIndex === 'number' && todo.id) {
				keys.add(`${todo.id}:${canonicalGoalIndex(todo.goalIndex)}`);
			}
		}
		return keys;
	}

	_applyCanonicalGoalIndex(goalIndex) {
		if (isPseudoGoalIndex(goalIndex)) return goalIndex;
		return canonicalGoalIndex(goalIndex);
	}

	applyTodoOrderingInGoalView(taskId, goalIndex, ordering) {
		if (!taskId || typeof goalIndex !== 'number' || typeof ordering !== 'number') return;
		const canonical = this._applyCanonicalGoalIndex(goalIndex);
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (!todo) return;
		if (isTaskPrimaryOnGoal(todo, canonical)) {
			this.updateTodo(taskId, { ordering });
			return;
		}
		this.ensureTaskGoalLink(taskId, canonical, { ordering });
	}

	ensureTaskGoalLink(taskId, goalIndex, { ordering = null, parentId = undefined } = {}) {
		if (!taskId || typeof goalIndex !== 'number') return null;
		const canonical = this._applyCanonicalGoalIndex(goalIndex);
		const taskGoalKeySet = this._buildTaskGoalKeySet();
		const existingIndex = this.taskGoalLinks.findIndex(
			(link) => link.taskId === taskId && link.goalIndex === canonical
		);
		const now = Date.now();

		if (existingIndex === -1) {
			const resolvedOrdering =
				typeof ordering === 'number'
					? ordering
					: getTopOrderingForGoalView(this.harada_chart.todos, canonical, {
							taskGoalKeySet,
							taskGoalLinks: this.taskGoalLinks,
							parentId: parentId ?? null
						});
			const link = normalizeTaskGoalLink({
				taskId,
				goalIndex: canonical,
				ordering: resolvedOrdering,
				parentId: parentId ?? null,
				createdAt: now,
				updatedAt: now
			});
			this.taskGoalLinks = [link, ...this.taskGoalLinks].filter(Boolean);
			this._markTaskGoalLinkDirty(link);
			this.queueSave();
			return link;
		}

		const existing = this.taskGoalLinks[existingIndex];
		const updated = normalizeTaskGoalLink({
			...existing,
			...(typeof ordering === 'number' ? { ordering } : {}),
			...(parentId !== undefined ? { parentId } : {}),
			updatedAt: now
		});
		this.taskGoalLinks = this.taskGoalLinks.map((entry, index) =>
			index === existingIndex ? updated : entry
		);
		this._markTaskGoalLinkDirty(updated);
		this.queueSave();
		return updated;
	}

	adoptTaskGoalsFrom(taskId, sourceTodo, { viewGoalIndex = null } = {}) {
		if (!taskId || !sourceTodo) return;
		const goals = new Set(
			filterDisplayGoalIndices(getTaskGoalIndicesForTodo(sourceTodo, this.taskGoalLinks))
		);
		if (typeof viewGoalIndex === 'number' && !isPseudoGoalIndex(viewGoalIndex)) {
			goals.add(this._applyCanonicalGoalIndex(viewGoalIndex));
		}
		for (const goalIndex of goals) {
			this.ensureTaskGoalLink(taskId, goalIndex);
		}
		if (typeof viewGoalIndex === 'number') {
			this.ensureTaskGoalLink(taskId, viewGoalIndex);
		}
		if (isPinnedGoalIndex(viewGoalIndex) || goals.has(PINNED_GOAL_INDEX)) {
			const todo = this.harada_chart.todos.find((t) => t.id === taskId);
			if (todo && todo.pinned !== true) {
				this._setTaskPinnedFlag(taskId, true);
			}
		}
	}

	pinTask(taskId) {
		if (!taskId) return;
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (!todo) return;
		this.ensureTaskGoalLink(taskId, PINNED_GOAL_INDEX);
		if (todo.pinned !== true) this._setTaskPinnedFlag(taskId, true);
	}

	unpinTask(taskId) {
		if (!taskId) return;
		this.unlinkTaskFromGoal(taskId, PINNED_GOAL_INDEX);
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (todo?.pinned === true) this._setTaskPinnedFlag(taskId, false);
	}

	ensureNoGoalTaskLink(taskId, { ordering = null, parentId = undefined } = {}) {
		if (!taskId) return null;
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (!todo || todo.goalIndex != null) return null;
		return this.ensureTaskGoalLink(taskId, NO_GOAL_PSEUDO_INDEX, { ordering, parentId });
	}

	_setTaskPinnedFlag(taskId, pinned) {
		const ts = Date.now();
		this.harada_chart = {
			...this.harada_chart,
			todos: this.harada_chart.todos.map((t) =>
				t.id === taskId ? { ...t, pinned: pinned === true, updatedAt: ts } : t
			)
		};
		this._markTaskDirty(taskId);
		this.queueSave();
	}

	pinNote(noteId) {
		this.linkNoteToGoal(noteId, PINNED_GOAL_INDEX);
	}

	unpinNote(noteId) {
		this.unlinkNoteFromGoal(noteId, PINNED_GOAL_INDEX);
	}

	isNotePinned(noteId) {
		return this.noteGoalLinks.some(
			(link) => link.noteId === noteId && link.goalIndex === PINNED_GOAL_INDEX
		);
	}

	getPinnedTaskCount() {
		const taskGoalKeySet = this._buildTaskGoalKeySet();
		return (this.harada_chart.todos ?? []).filter(
			(t) =>
				!t?.isDraft &&
				t.status !== 'done' &&
				todoBelongsToGoalView(t, PINNED_GOAL_INDEX, taskGoalKeySet)
		).length;
	}

	normalizeGoalViewOrderings(goalIndex, parentId = null) {
		if (typeof goalIndex !== 'number') return;
		const canonical = this._applyCanonicalGoalIndex(goalIndex);
		const taskGoalKeySet = this._buildTaskGoalKeySet();
		const siblings = getGoalViewSiblings(this.harada_chart.todos, canonical, {
			parentId,
			taskGoalKeySet,
			taskGoalLinks: this.taskGoalLinks
		});
		siblings.forEach((todo, index) => {
			this.applyTodoOrderingInGoalView(todo.id, canonical, (index + 1) * TODO_ORDER_STEP);
		});
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
			// Primary task notes stay on the task; they are not standalone goal notes.
			return { ...todo, markdown: '', updatedAt: now };
		});
		this.notes = [...newNotes, ...this.notes];
		this.noteTaskLinks = [...newLinks.filter(Boolean), ...this.noteTaskLinks];
		this.noteGoalLinks = [...newGoalLinks.filter(Boolean), ...this.noteGoalLinks];
		this.harada_chart = { ...this.harada_chart, todos: updatedTodos };
		for (const note of newNotes) this._markNoteDirty(note.id);
		for (const link of newLinks) this._markNoteTaskLinkDirty(link);
		for (const link of newGoalLinks) this._markNoteGoalLinkDirty(link);
		for (const legacy of legacyTodos) this._markTaskDirty(legacy.id);
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
					this._markNoteTaskLinkDirty(link);
				}
			}
		}
		if (changed) this.noteTaskLinks = nextLinks;

		const primaryNoteIds = new Set();
		for (const link of this.noteTaskLinks) {
			const noteId = this.getEffectivePrimaryNoteIdForTask(link.taskId);
			if (noteId) primaryNoteIds.add(noteId);
		}
		if (primaryNoteIds.size > 0) {
			const nextGoalLinks = [];
			for (const link of this.noteGoalLinks) {
				if (primaryNoteIds.has(link.noteId)) {
					this._markNoteGoalLinkDirty(link);
					changed = true;
					continue;
				}
				nextGoalLinks.push(link);
			}
			if (changed) this.noteGoalLinks = nextGoalLinks;
		}

		if (changed) this.queueSave();
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
			for (const link of newGoalLinks) this._markTaskGoalLinkDirty(link);
		}
	}

	/**
	 * After adding or changing a goal-linked todo, refresh the goal cell timestamp and
	 * move that goal's section to the top of the All Tasks list (via todo_group_ordering).
	 */
	bumpGoalAfterTodoActivity(goalIndex) {
		if (typeof goalIndex !== 'number' || isPinnedGoalIndex(goalIndex)) return;

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
		this._markGridDirty();
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
		let listChanged = false;
		if (updatedTodoForMeta && previousTodo) {
			listChanged =
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
					this._markTaskDirty(todo.id);
					return { ...todo, ...sharedMeta, updatedAt: ts };
				});
			}
		}

		this.harada_chart = { ...this.harada_chart, todos: updatedTodos };

		const updatedTodo = updatedTodos.find((t) => t.id === id);
		this._markTaskDirty(id);

		if (updatedTodo && previousTodo) {
			const now = Date.now();
			const updatedGoal =
				typeof updatedTodo.goalIndex === 'number' ? canonicalGoalIndex(updatedTodo.goalIndex) : null;
			if (
				typeof updatedGoal === 'number' &&
				!this.taskGoalLinks.some((link) => link.taskId === id && link.goalIndex === updatedGoal)
			) {
				const newLink = normalizeTaskGoalLink({
					taskId: id,
					goalIndex: updatedGoal,
					ordering: updatedTodo.ordering,
					createdAt: now,
					updatedAt: now
				});
				this.taskGoalLinks = [newLink, ...this.taskGoalLinks].filter(Boolean);
				this._markTaskGoalLinkDirty(newLink);
			}

			const isNoGoalList =
				(updatedTodo.listType === 'goal' || !updatedTodo.listType) && updatedTodo.goalIndex == null;
			if (isNoGoalList) {
				this.ensureNoGoalTaskLink(id);
			} else {
				this.unlinkTaskFromGoal(id, NO_GOAL_PSEUDO_INDEX);
			}
		}

		const orderingFields = [
			'goalIndex',
			'listType',
			'listId',
			'listName',
			'parentId',
			'ordering',
			'status',
			'pinned',
			'isDraft'
		];
		const affectsGoalOrdering = orderingFields.some((key) => key in patch);
		const goalIndexToUpdate = updatedTodo?.goalIndex ?? previousTodo?.goalIndex;
		if (typeof goalIndexToUpdate === 'number' && affectsGoalOrdering) {
			this.bumpGoalAfterTodoActivity(goalIndexToUpdate);
		}

		this.queueSave();
	}

	async enrichTodoFromUrl(todoId, candidate) {
		const url = parseStandaloneUrl(candidate);
		if (!url || !todoId) return;

		this.updateTodo(todoId, { url });
		this.registerTodoMutation(todoId, { immediate: true });

		try {
			const content = await fetchUrlContent(url);
			if (content?.title) {
				this.updateTodo(todoId, { title: String(content.title).trim(), url });
				this.registerTodoMutation(todoId, { immediate: true });
			}
		} catch (error) {
			console.warn('[enrichTodoFromUrl]', error);
		}
	}

	deleteTodo(id) {
		if (!id) return;

		const previousTodos = this.harada_chart.todos || [];
		const todo = previousTodos.find((t) => t.id === id);
		const nextTodos = previousTodos.filter((t) => t.id !== id);
		this.harada_chart = { ...this.harada_chart, todos: nextTodos };
		this.noteTaskLinks = this.noteTaskLinks.filter((link) => link.taskId !== id);
		this.taskGoalLinks = this.taskGoalLinks.filter((link) => link.taskId !== id);
		this._markTaskDirty(id);

		if (todo && typeof todo.goalIndex === 'number') {
			const nextGrid = [...this.harada_chart.grid];
			updateGoalTimestamp(nextGrid, todo.goalIndex);
			this.harada_chart = { ...this.harada_chart, grid: nextGrid };
			this._markGridDirty();
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
		this._markTaskDirty(id);

		if (typeof todo.goalIndex === 'number') {
			const nextGrid = [...this.harada_chart.grid];
			updateGoalTimestamp(nextGrid, todo.goalIndex);
			this.harada_chart = { ...this.harada_chart, grid: nextGrid };
			this._markGridDirty();
		}

		this.queueSave();
	}

	createNote({ content = '' } = {}) {
		const note = defaultNote({ content });
		this.notes = [note, ...this.notes];
		this._markNoteDirty(note.id);
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
		this._markNoteDirty(id);
		this.queueSave();
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

	getEffectivePrimaryNoteIdForTask(taskId) {
		if (!taskId) return null;
		const linksForTask = this.noteTaskLinks
			.filter((link) => link.taskId === taskId)
			.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
		if (linksForTask.length === 0) return null;
		const explicitPrimary =
			linksForTask
				.filter((link) => link.isPrimary === true)
				.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
		return (explicitPrimary ?? linksForTask[0]).noteId;
	}

	getPrimaryNoteForTask(taskId) {
		const noteId = this.getEffectivePrimaryNoteIdForTask(taskId);
		if (!noteId) return null;
		return this.notes.find((note) => note.id === noteId) || null;
	}

	getFreeNotesForTask(taskId) {
		if (!taskId) return [];
		const primaryNoteId = this.getEffectivePrimaryNoteIdForTask(taskId);
		const noteIds = new Set(
			this.noteTaskLinks
				.filter((link) => link.taskId === taskId && link.noteId !== primaryNoteId)
				.map((link) => link.noteId)
		);
		return this.notes
			.filter((note) => noteIds.has(note.id))
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	isPrimaryTaskNote(noteId) {
		if (!noteId) return false;
		for (const link of this.noteTaskLinks) {
			if (link.noteId !== noteId) continue;
			if (this.getEffectivePrimaryNoteIdForTask(link.taskId) === noteId) return true;
		}
		return false;
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
		return filterDisplayGoalIndices(
			this.noteGoalLinks.filter((link) => link.noteId === noteId).map((link) => link.goalIndex)
		);
	}

	getLinkedGoalIndicesForTask(taskId) {
		if (!taskId) return [];
		const linked = [];
		for (const link of this.taskGoalLinks) {
			if (link.taskId === taskId) linked.push(link.goalIndex);
		}
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (typeof todo?.goalIndex === 'number') linked.push(canonicalGoalIndex(todo.goalIndex));
		return filterDisplayGoalIndices([...new Set(linked)]).sort((a, b) => a - b);
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
			this._markNoteTaskLinkDirty(existing);
			this.queueSave();
			return;
		}
		const newLink = normalizeNoteTaskLink({
			noteId,
			taskId,
			isPrimary,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		this.noteTaskLinks = [newLink, ...this.noteTaskLinks].filter(Boolean);
		this._markNoteTaskLinkDirty(newLink);
		this.queueSave();
	}

	unlinkNoteFromTask(noteId, taskId) {
		if (!noteId || !taskId) return;
		const existing = this.noteTaskLinks.find(
			(link) => link.noteId === noteId && link.taskId === taskId
		);
		this.noteTaskLinks = this.noteTaskLinks.filter(
			(link) => !(link.noteId === noteId && link.taskId === taskId)
		);
		if (existing) this._markNoteTaskLinkDirty(existing);
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
		const canonical = normalizeViewGoalIndex(goalIndex);
		if (this.noteGoalLinks.some((link) => link.noteId === noteId && link.goalIndex === canonical))
			return;
		const newLink = normalizeNoteGoalLink({
			noteId,
			goalIndex: canonical,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		this.noteGoalLinks = [newLink, ...this.noteGoalLinks].filter(Boolean);
		this._markNoteGoalLinkDirty(newLink);
		if (persist) this.queueSave();
	}

	unlinkNoteFromGoal(noteId, goalIndex) {
		if (!noteId || typeof goalIndex !== 'number') return;
		const canonical = normalizeViewGoalIndex(goalIndex);
		const existing = this.noteGoalLinks.find(
			(link) => link.noteId === noteId && link.goalIndex === canonical
		);
		this.noteGoalLinks = this.noteGoalLinks.filter(
			(link) => !(link.noteId === noteId && link.goalIndex === canonical)
		);
		if (existing) this._markNoteGoalLinkDirty(existing);
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
		this.queueSave();
	}

	linkTaskToGoal(taskId, goalIndex) {
		if (!taskId || typeof goalIndex !== 'number' || isPseudoGoalIndex(goalIndex)) return;
		const canonical = canonicalGoalIndex(goalIndex);
		const todo = this.harada_chart.todos.find((t) => t.id === taskId);
		if (!todo) return;
		const todos = this.harada_chart.todos || [];
		const tasksToLink = new Set([taskId, ...collectDescendantTaskIds(taskId, todos)]);
		const now = Date.now();
		const taskGoalKeySet = new Set(
			(this.taskGoalLinks ?? []).map((link) => `${link.taskId}:${link.goalIndex}`)
		);
		const newLinks = [];
		for (const id of tasksToLink) {
			const alreadyLinked = this.taskGoalLinks.some(
				(link) => link.taskId === id && link.goalIndex === canonical
			);
			if (alreadyLinked) continue;
			const ordering = getTopOrderingForGoalView(this.harada_chart.todos, canonical, {
				taskGoalKeySet,
				taskGoalLinks: this.taskGoalLinks
			});
			newLinks.push(
				normalizeTaskGoalLink({
					taskId: id,
					goalIndex: canonical,
					ordering,
					createdAt: now,
					updatedAt: now
				})
			);
		}
		if (newLinks.length > 0) {
			this.taskGoalLinks = [...newLinks, ...this.taskGoalLinks].filter(Boolean);
			for (const link of newLinks) this._markTaskGoalLinkDirty(link);
		}
		if (typeof todo.goalIndex !== 'number') {
			this.updateTodo(taskId, buildGoalListMeta(canonical));
			return;
		}
		this.bumpGoalAfterTodoActivity(canonical);
		this.queueSave();
	}

	unlinkTaskFromGoal(taskId, goalIndex) {
		if (!taskId || typeof goalIndex !== 'number') return;
		const canonical = this._applyCanonicalGoalIndex(goalIndex);
		const todos = this.harada_chart.todos || [];
		const taskIds = new Set([taskId]);
		if (!isPseudoGoalIndex(canonical)) {
			for (const id of collectDescendantTaskIds(taskId, todos)) {
				taskIds.add(id);
			}
		}

		const removedLinks = (this.taskGoalLinks ?? []).filter(
			(link) => taskIds.has(link.taskId) && link.goalIndex === canonical
		);
		this.taskGoalLinks = (this.taskGoalLinks ?? []).filter(
			(link) => !(taskIds.has(link.taskId) && link.goalIndex === canonical)
		);
		for (const link of removedLinks) this._markTaskGoalLinkDirty(link);

		for (const id of taskIds) {
			const todo = this.harada_chart.todos.find((t) => t.id === id);
			if (!todo) continue;

			const primaryOnUnlinkedGoal =
				typeof todo.goalIndex === 'number' && canonicalGoalIndex(todo.goalIndex) === canonical;

			if (primaryOnUnlinkedGoal) {
				const remainingGoals = getTaskGoalIndicesForTodo(
					{ ...todo, goalIndex: null },
					this.taskGoalLinks
				);
				this.updateTodo(id, buildGoalListMeta(remainingGoals[0] ?? null));
				continue;
			}

			const remainingRealGoals = getTaskGoalIndicesForTodo(todo, this.taskGoalLinks);
			if (remainingRealGoals.length === 0 && todo.goalIndex == null) {
				this.ensureNoGoalTaskLink(id);
			}
		}

		if (browser && authStore.user && supabase && removedLinks.length > 0) {
			const now = new Date().toISOString();
			for (const link of removedLinks) {
				supabase
					.from('task_goal_links')
					.update({ deleted_at: now, updated_at: now })
					.eq('task_id', link.taskId)
					.eq('goal_index', canonical)
					.eq('user_id', authStore.user.id)
					.then(({ error }) => {
						if (error) console.error('Failed to soft-delete task/goal link:', error);
					});
			}
		}
		this.queueSave();
	}

	createLinkedTaskNote(taskId, { content = '', goalIndex = null, isPrimary = false } = {}) {
		const note = this.createNote({ content });
		this.linkNoteToTask(note.id, taskId, { isPrimary });
		// Standalone goal notes only — primary task notes live on the task, not in goal Notes tabs.
		if (!isPrimary && typeof goalIndex === 'number') this.linkNoteToGoal(note.id, goalIndex);
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
		this._markNoteDirty(id);

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
			supabase
				.from('note_task_links')
				.update({ deleted_at: now, updated_at: now })
				.eq('note_id', id)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete note task links:', error);
				});
			supabase
				.from('note_goal_links')
				.update({ deleted_at: now, updated_at: now })
				.eq('note_id', id)
				.eq('user_id', authStore.user.id)
				.then(({ error }) => {
					if (error) console.error('Failed to soft-delete note goal links:', error);
				});
		}

		this.saveNow();
	}

	/**
	 * Soft-deleted items live in Supabase with `deleted_at` set. Local memory/IndexedDB
	 * drop them immediately on delete, so trash requires a signed-in cloud fetch.
	 * Phase 2: purge rows older than TRASH_RETENTION_DAYS (batch/cron) + optional local
	 * tombstones for offline restore.
	 */
	async loadTrash() {
		if (!browser || !authStore.user || !supabase) {
			return { items: [], error: null, requiresSignIn: !authStore.user };
		}

		const userId = authStore.user.id;
		const [tasksRes, notesRes] = await Promise.all([
			supabase
				.from('tasks')
				.select('*')
				.eq('user_id', userId)
				.not('deleted_at', 'is', null)
				.order('deleted_at', { ascending: false }),
			supabase
				.from('notes')
				.select('*')
				.eq('user_id', userId)
				.not('deleted_at', 'is', null)
				.order('deleted_at', { ascending: false })
		]);

		if (tasksRes.error || notesRes.error) {
			const message = tasksRes.error?.message || notesRes.error?.message || 'Failed to load trash';
			return { items: [], error: message, requiresSignIn: false };
		}

		/** @type {Array<{ id: string; kind: 'task' | 'bookmark' | 'note'; title: string; preview: string; dateAt: string; url?: string }>} */
		const items = [];

		for (const row of tasksRes.data ?? []) {
			const item = this._trashItemFromTaskRow(row, row.deleted_at);
			if (item) items.push(item);
		}

		for (const row of notesRes.data ?? []) {
			const note = this._noteRowToNote(row);
			if (!note) continue;
			const content = typeof note.content === 'string' ? note.content.trim() : '';
			const firstLine = content.split(/\r?\n/).find((line) => line.trim()) || '';
			items.push({
				id: note.id,
				kind: 'note',
				title: firstLine || 'Untitled note',
				preview: content,
				dateAt: row.deleted_at
			});
		}

		items.sort((a, b) => {
			const aTime = a.dateAt ? new Date(a.dateAt).getTime() : 0;
			const bTime = b.dateAt ? new Date(b.dateAt).getTime() : 0;
			return bTime - aTime;
		});

		return { items, error: null, requiresSignIn: false };
	}

	_trashItemFromTaskRow(row, dateIso) {
		const todo = this._taskRowToTodo(row);
		if (!todo) return null;
		const isBookmark =
			!!(todo.url && String(todo.url).trim()) || !!parseStandaloneUrl(todo.title);
		const title =
			(todo.title && todo.title.trim()) ||
			(isBookmark && todo.url ? todo.url : '') ||
			'Untitled task';
		return {
			id: todo.id,
			kind: isBookmark ? 'bookmark' : 'task',
			title,
			preview: typeof todo.markdown === 'string' ? todo.markdown.trim() : '',
			dateAt: dateIso || row.updated_at || null,
			url: todo.url || ''
		};
	}

	async loadCompletedTrash() {
		if (!browser || !authStore.user || !supabase) {
			return { items: [], error: null, requiresSignIn: !authStore.user };
		}

		const userId = authStore.user.id;
		const { data, error } = await supabase
			.from('tasks')
			.select('*')
			.eq('user_id', userId)
			.eq('status', 'done')
			.is('deleted_at', null)
			.order('updated_at', { ascending: false });

		if (error) {
			return { items: [], error: error.message || 'Failed to load completed', requiresSignIn: false };
		}

		/** @type {Array<{ id: string; kind: 'task' | 'bookmark' | 'note'; title: string; preview: string; dateAt: string; url?: string }>} */
		const items = [];
		for (const row of data ?? []) {
			const item = this._trashItemFromTaskRow(row, row.updated_at);
			if (item) items.push(item);
		}

		return { items, error: null, requiresSignIn: false };
	}

	async restoreCompletedItem(id) {
		if (!browser || !authStore.user || !supabase || !id) {
			return { success: false, error: 'Sign in required to restore' };
		}

		const userId = authStore.user.id;
		const now = new Date().toISOString();

		try {
			const { data: restoredTask, error } = await supabase
				.from('tasks')
				.update({ status: 'todo', updated_at: now })
				.eq('id', id)
				.eq('user_id', userId)
				.eq('status', 'done')
				.is('deleted_at', null)
				.select('*')
				.maybeSingle();
			if (error) throw error;
			if (!restoredTask) {
				return { success: false, error: 'Item no longer found in completed' };
			}

			const [taskGoalRes, noteTaskRes] = await Promise.all([
				supabase
					.from('task_goal_links')
					.select('*')
					.eq('task_id', id)
					.eq('user_id', userId)
					.is('deleted_at', null),
				supabase
					.from('note_task_links')
					.select('*')
					.eq('task_id', id)
					.eq('user_id', userId)
					.is('deleted_at', null)
			]);
			if (taskGoalRes.error) throw taskGoalRes.error;
			if (noteTaskRes.error) throw noteTaskRes.error;

			const todo = this._taskRowToTodo(restoredTask);
			if (!todo) {
				return { success: false, error: 'Failed to restore task data' };
			}
			const without = (this.harada_chart.todos || []).filter((t) => t.id !== todo.id);
			this.harada_chart = { ...this.harada_chart, todos: [...without, todo] };
			this._markTaskDirty(todo.id);

			const taskGoalLinks = (taskGoalRes.data ?? [])
				.map((row) => this._taskGoalLinkRowToLink(row))
				.filter(Boolean);
			const noteTaskLinks = (noteTaskRes.data ?? [])
				.map((row) => this._noteTaskLinkRowToLink(row))
				.filter(Boolean);
			this.taskGoalLinks = this._upsertLinksById(this.taskGoalLinks, taskGoalLinks);
			this.noteTaskLinks = this._upsertLinksById(this.noteTaskLinks, noteTaskLinks);
			for (const link of taskGoalLinks) this._markTaskGoalLinkDirty(link);
			for (const link of noteTaskLinks) this._markNoteTaskLinkDirty(link);

			this.saveNow();
			return { success: true, error: null };
		} catch (err) {
			console.error('Failed to restore completed item:', err);
			return { success: false, error: err?.message || 'Failed to restore' };
		}
	}

	async softDeleteCompletedItem(id) {
		if (!id) return { success: false, error: 'Missing id' };

		if ((this.harada_chart.todos || []).some((t) => t.id === id)) {
			this.deleteTodo(id);
			return { success: true, error: null };
		}

		if (!browser || !authStore.user || !supabase) {
			return { success: false, error: 'Sign in required to delete' };
		}

		const userId = authStore.user.id;
		const now = new Date().toISOString();

		try {
			const { data, error } = await supabase
				.from('tasks')
				.update({ deleted_at: now, updated_at: now })
				.eq('id', id)
				.eq('user_id', userId)
				.is('deleted_at', null)
				.select('id')
				.maybeSingle();
			if (error) throw error;
			if (!data) {
				return { success: false, error: 'Item no longer found in completed' };
			}

			await Promise.all([
				supabase
					.from('note_task_links')
					.update({ deleted_at: now, updated_at: now })
					.eq('task_id', id)
					.eq('user_id', userId),
				supabase
					.from('task_goal_links')
					.update({ deleted_at: now, updated_at: now })
					.eq('task_id', id)
					.eq('user_id', userId)
			]);

			return { success: true, error: null };
		} catch (err) {
			console.error('Failed to soft-delete completed item:', err);
			return { success: false, error: err?.message || 'Failed to delete' };
		}
	}

	async emptyCompletedTrash() {
		if (!browser || !authStore.user || !supabase) {
			return { success: false, error: 'Sign in required to empty completed' };
		}

		const userId = authStore.user.id;
		const now = new Date().toISOString();

		try {
			const { data, error } = await supabase
				.from('tasks')
				.update({ deleted_at: now, updated_at: now })
				.eq('user_id', userId)
				.eq('status', 'done')
				.is('deleted_at', null)
				.select('id');
			if (error) throw error;

			const ids = (data ?? []).map((row) => row.id).filter(Boolean);
			if (ids.length > 0) {
				await Promise.all([
					supabase
						.from('note_task_links')
						.update({ deleted_at: now, updated_at: now })
						.in('task_id', ids)
						.eq('user_id', userId),
					supabase
						.from('task_goal_links')
						.update({ deleted_at: now, updated_at: now })
						.in('task_id', ids)
						.eq('user_id', userId)
				]);
				const idSet = new Set(ids);
				this.harada_chart = {
					...this.harada_chart,
					todos: (this.harada_chart.todos || []).filter((t) => !idSet.has(t.id))
				};
				this.noteTaskLinks = this.noteTaskLinks.filter((link) => !idSet.has(link.taskId));
				this.taskGoalLinks = this.taskGoalLinks.filter((link) => !idSet.has(link.taskId));
				this.saveNow();
			}

			return { success: true, error: null };
		} catch (err) {
			console.error('Failed to empty completed trash:', err);
			return { success: false, error: err?.message || 'Failed to empty completed' };
		}
	}

	_upsertLinksById(existing, incoming, idKey = 'id') {
		const next = [...(existing ?? [])];
		for (const link of incoming ?? []) {
			if (!link) continue;
			const idx = next.findIndex(
				(row) =>
					(link[idKey] && row[idKey] === link[idKey]) ||
					(link.noteId &&
						link.taskId &&
						row.noteId === link.noteId &&
						row.taskId === link.taskId) ||
					(link.noteId &&
						typeof link.goalIndex === 'number' &&
						row.noteId === link.noteId &&
						row.goalIndex === link.goalIndex) ||
					(link.taskId &&
						typeof link.goalIndex === 'number' &&
						row.taskId === link.taskId &&
						row.goalIndex === link.goalIndex)
			);
			if (idx >= 0) next[idx] = link;
			else next.push(link);
		}
		return next;
	}

	async _restoreSoftDeletedLinks(table, ids, now) {
		if (!ids.length) return;
		const { error } = await supabase
			.from(table)
			.update({ deleted_at: null, updated_at: now })
			.in('id', ids)
			.eq('user_id', authStore.user.id);
		if (error) throw error;
	}

	async _activePeerIds(table, ids) {
		if (!ids.length) return new Set();
		const { data, error } = await supabase
			.from(table)
			.select('id')
			.in('id', ids)
			.eq('user_id', authStore.user.id)
			.is('deleted_at', null);
		if (error) throw error;
		return new Set((data ?? []).map((row) => row.id));
	}

	async restoreTrashItem(kind, id) {
		if (!browser || !authStore.user || !supabase || !id) {
			return { success: false, error: 'Sign in required to restore' };
		}

		const userId = authStore.user.id;
		const now = new Date().toISOString();
		const isNote = kind === 'note';

		try {
			if (isNote) {
				const { data: restoredNote, error } = await supabase
					.from('notes')
					.update({ deleted_at: null, updated_at: now })
					.eq('id', id)
					.eq('user_id', userId)
					.not('deleted_at', 'is', null)
					.select('*')
					.maybeSingle();
				if (error) throw error;
				if (!restoredNote) {
					return { success: false, error: 'Item no longer found in trash' };
				}

				const { data: softNoteTaskLinks, error: softNoteTaskErr } = await supabase
					.from('note_task_links')
					.select('*')
					.eq('note_id', id)
					.eq('user_id', userId)
					.not('deleted_at', 'is', null);
				if (softNoteTaskErr) throw softNoteTaskErr;

				const taskIds = [...new Set((softNoteTaskLinks ?? []).map((row) => row.task_id).filter(Boolean))];
				const liveTaskIds = await this._activePeerIds('tasks', taskIds);
				const noteTaskIdsToRestore = (softNoteTaskLinks ?? [])
					.filter((row) => liveTaskIds.has(row.task_id))
					.map((row) => row.id)
					.filter(Boolean);

				// Avoid unique primary conflicts if the task already has an active primary note
				const primaryCandidates = (softNoteTaskLinks ?? []).filter(
					(row) => noteTaskIdsToRestore.includes(row.id) && row.is_primary === true
				);
				for (const row of primaryCandidates) {
					const { data: existingPrimary } = await supabase
						.from('note_task_links')
						.select('id')
						.eq('task_id', row.task_id)
						.eq('user_id', userId)
						.eq('is_primary', true)
						.is('deleted_at', null)
						.maybeSingle();
					if (existingPrimary) {
						await supabase
							.from('note_task_links')
							.update({ is_primary: false, updated_at: now })
							.eq('id', row.id)
							.eq('user_id', userId);
					}
				}

				const { data: softNoteGoalLinks, error: softNoteGoalErr } = await supabase
					.from('note_goal_links')
					.select('id')
					.eq('note_id', id)
					.eq('user_id', userId)
					.not('deleted_at', 'is', null);
				if (softNoteGoalErr) throw softNoteGoalErr;

				await this._restoreSoftDeletedLinks(
					'note_task_links',
					noteTaskIdsToRestore,
					now
				);
				await this._restoreSoftDeletedLinks(
					'note_goal_links',
					(softNoteGoalLinks ?? []).map((row) => row.id).filter(Boolean),
					now
				);

				const [noteTaskRes, noteGoalRes] = await Promise.all([
					supabase
						.from('note_task_links')
						.select('*')
						.eq('note_id', id)
						.eq('user_id', userId)
						.is('deleted_at', null),
					supabase
						.from('note_goal_links')
						.select('*')
						.eq('note_id', id)
						.eq('user_id', userId)
						.is('deleted_at', null)
				]);
				if (noteTaskRes.error) throw noteTaskRes.error;
				if (noteGoalRes.error) throw noteGoalRes.error;

				const note = this._noteRowToNote(restoredNote);
				if (note) {
					const without = this.notes.filter((n) => n.id !== note.id);
					this.notes = [note, ...without];
					this._markNoteDirty(note.id);
				}

				const noteTaskLinks = (noteTaskRes.data ?? [])
					.map((row) => this._noteTaskLinkRowToLink(row))
					.filter(Boolean);
				const noteGoalLinks = (noteGoalRes.data ?? [])
					.map((row) => this._noteGoalLinkRowToLink(row))
					.filter(Boolean);
				this.noteTaskLinks = this._upsertLinksById(this.noteTaskLinks, noteTaskLinks);
				this.noteGoalLinks = this._upsertLinksById(this.noteGoalLinks, noteGoalLinks);
				for (const link of noteTaskLinks) this._markNoteTaskLinkDirty(link);
				for (const link of noteGoalLinks) this._markNoteGoalLinkDirty(link);
			} else {
				const { data: restoredTask, error } = await supabase
					.from('tasks')
					.update({ deleted_at: null, updated_at: now })
					.eq('id', id)
					.eq('user_id', userId)
					.not('deleted_at', 'is', null)
					.select('*')
					.maybeSingle();
				if (error) throw error;
				if (!restoredTask) {
					return { success: false, error: 'Item no longer found in trash' };
				}

				const { data: softTaskGoalLinks, error: softTaskGoalErr } = await supabase
					.from('task_goal_links')
					.select('id')
					.eq('task_id', id)
					.eq('user_id', userId)
					.not('deleted_at', 'is', null);
				if (softTaskGoalErr) throw softTaskGoalErr;

				const { data: softNoteTaskLinks, error: softNoteTaskErr } = await supabase
					.from('note_task_links')
					.select('*')
					.eq('task_id', id)
					.eq('user_id', userId)
					.not('deleted_at', 'is', null);
				if (softNoteTaskErr) throw softNoteTaskErr;

				const noteIds = [
					...new Set((softNoteTaskLinks ?? []).map((row) => row.note_id).filter(Boolean))
				];
				const liveNoteIds = await this._activePeerIds('notes', noteIds);
				const noteTaskIdsToRestore = (softNoteTaskLinks ?? [])
					.filter((row) => liveNoteIds.has(row.note_id))
					.map((row) => row.id)
					.filter(Boolean);

				const primaryCandidates = (softNoteTaskLinks ?? []).filter(
					(row) => noteTaskIdsToRestore.includes(row.id) && row.is_primary === true
				);
				for (const row of primaryCandidates) {
					const { data: existingPrimary } = await supabase
						.from('note_task_links')
						.select('id')
						.eq('task_id', id)
						.eq('user_id', userId)
						.eq('is_primary', true)
						.is('deleted_at', null)
						.maybeSingle();
					if (existingPrimary) {
						await supabase
							.from('note_task_links')
							.update({ is_primary: false, updated_at: now })
							.eq('id', row.id)
							.eq('user_id', userId);
					}
				}

				await this._restoreSoftDeletedLinks(
					'task_goal_links',
					(softTaskGoalLinks ?? []).map((row) => row.id).filter(Boolean),
					now
				);
				await this._restoreSoftDeletedLinks('note_task_links', noteTaskIdsToRestore, now);

				const [taskGoalRes, noteTaskRes] = await Promise.all([
					supabase
						.from('task_goal_links')
						.select('*')
						.eq('task_id', id)
						.eq('user_id', userId)
						.is('deleted_at', null),
					supabase
						.from('note_task_links')
						.select('*')
						.eq('task_id', id)
						.eq('user_id', userId)
						.is('deleted_at', null)
				]);
				if (taskGoalRes.error) throw taskGoalRes.error;
				if (noteTaskRes.error) throw noteTaskRes.error;

				const todo = this._taskRowToTodo(restoredTask);
				if (!todo) {
					return { success: false, error: 'Failed to restore task data' };
				}
				if (shouldRetainTodoInStore(todo)) {
					const without = (this.harada_chart.todos || []).filter((t) => t.id !== todo.id);
					this.harada_chart = { ...this.harada_chart, todos: [...without, todo] };
					this._markTaskDirty(todo.id);
				}

				const taskGoalLinks = (taskGoalRes.data ?? [])
					.map((row) => this._taskGoalLinkRowToLink(row))
					.filter(Boolean);
				const noteTaskLinks = (noteTaskRes.data ?? [])
					.map((row) => this._noteTaskLinkRowToLink(row))
					.filter(Boolean);
				this.taskGoalLinks = this._upsertLinksById(this.taskGoalLinks, taskGoalLinks);
				this.noteTaskLinks = this._upsertLinksById(this.noteTaskLinks, noteTaskLinks);
				for (const link of taskGoalLinks) this._markTaskGoalLinkDirty(link);
				for (const link of noteTaskLinks) this._markNoteTaskLinkDirty(link);
			}

			this.saveNow();
			return { success: true, error: null };
		} catch (err) {
			console.error('Failed to restore trash item:', err);
			return { success: false, error: err?.message || 'Failed to restore' };
		}
	}

	async permanentlyDeleteTrashItem(kind, id) {
		if (!browser || !authStore.user || !supabase || !id) {
			return { success: false, error: 'Sign in required to permanently delete' };
		}

		const userId = authStore.user.id;
		const table = kind === 'note' ? 'notes' : 'tasks';

		try {
			const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', userId);
			if (error) throw error;

			if (kind === 'note') {
				this.notes = this.notes.filter((note) => note.id !== id);
				this.noteTaskLinks = this.noteTaskLinks.filter((link) => link.noteId !== id);
				this.noteGoalLinks = this.noteGoalLinks.filter((link) => link.noteId !== id);
			} else {
				this.harada_chart = {
					...this.harada_chart,
					todos: (this.harada_chart.todos || []).filter((t) => t.id !== id)
				};
				this.noteTaskLinks = this.noteTaskLinks.filter((link) => link.taskId !== id);
				this.taskGoalLinks = this.taskGoalLinks.filter((link) => link.taskId !== id);
			}

			this.saveNow();
			return { success: true, error: null };
		} catch (err) {
			console.error('Failed to permanently delete trash item:', err);
			return { success: false, error: err?.message || 'Failed to permanently delete' };
		}
	}

	async emptyTrash() {
		if (!browser || !authStore.user || !supabase) {
			return { success: false, error: 'Sign in required to empty trash' };
		}

		const userId = authStore.user.id;

		try {
			const [tasksRes, notesRes] = await Promise.all([
				supabase.from('tasks').delete().eq('user_id', userId).not('deleted_at', 'is', null),
				supabase.from('notes').delete().eq('user_id', userId).not('deleted_at', 'is', null)
			]);
			if (tasksRes.error) throw tasksRes.error;
			if (notesRes.error) throw notesRes.error;

			this.saveNow();
			return { success: true, error: null };
		} catch (err) {
			console.error('Failed to empty trash:', err);
			return { success: false, error: err?.message || 'Failed to empty trash' };
		}
	}

	// --- Auth ---

	handleAuthChange() {
		if (!browser || authStore.loading) return;

		this._isInitialized = false;
		this._unsubscribeRealtime();
		this._resetInitialCloudHydration();

		if (!authStore.user) {
			// If we're offline, the session may have expired and Supabase fired SIGNED_OUT
			// even though the user hasn't intentionally logged out. Keep local data intact
			// so nothing is lost - it will sync when connectivity and session are restored.
			if (!this.isOnline) {
				this._setBootstrapping(false);
				return;
			}
			// Logged out online - show a helpful seeded board for new/pre-login users
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

		// Logged in - fetch fresh data and re-subscribe
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
		this.harada_chart = {
			grid: Array.from({ length: 81 }, (_, i) => defaultCell()),
			todos: []
		};
		this.notes = [];
		this.noteTaskLinks = [];
		this.noteGoalLinks = [];
		this.taskGoalLinks = [];
		this._markAllDirty();
		this.saveNow();
	}
}

export const store = new Store();
