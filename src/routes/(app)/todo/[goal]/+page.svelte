<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { afterNavigate, goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import {
		nomenclatureToIndex,
		indexToNomenclature,
		renderMarkdown,
		getNoteTitle,
		defaultTodo,
		canonicalGoalIndex,
		getLinkedGoalIndex,
		getParentGoalIndex,
		getSubGoalIndices,
		normalizeTodoListMeta,
		buildGoalListMeta,
		buildCustomListMeta,
		updateGoalTimestamp,
		buildTaskNoteIndexMaps,
		buildAllTasksFeed,
		buildFeedPinnedRows
	} from '$lib/todoUtils.js';
	import TodoList from '$components/TodoList.svelte';
	import WorkspaceToolbar from '$components/WorkspaceToolbar.svelte';
	import { navComposerHandlers } from '$stores/navComposerHandlers.svelte.js';
	import {
		persistTodoMobileSidebar,
		readTodoMobileSidebarOpen,
		isWorkspaceNarrowLayout
	} from '$lib/workspaceNavResume.js';
	import { Trash2 } from 'lucide-svelte';

	// Use store.harada_chart directly - it's reactive
	const grid = $derived(store.harada_chart.grid);
	const todos = $derived(store.harada_chart.todos);
	const notes = $derived(store.notes);
	const noteTaskLinks = $derived(store.noteTaskLinks);
	const noteGoalLinks = $derived(store.noteGoalLinks);
	const taskGoalLinks = $derived(store.taskGoalLinks);
	const taskNoteIndexMaps = $derived.by(() =>
		buildTaskNoteIndexMaps(notes, noteTaskLinks, taskGoalLinks, todos)
	);
	const taskGoalKeySet = $derived.by(() => {
		const keys = new Set();
		for (const link of taskGoalLinks) keys.add(`${link.taskId}:${link.goalIndex}`);
		return keys;
	});
	const linkedTaskIdSet = $derived.by(() => {
		const ids = new Set();
		for (const link of taskGoalLinks) ids.add(link.taskId);
		return ids;
	});
	const dataLoaded = $derived(!store.isBootstrapping);
	const targetTodoId = $derived(page.url.searchParams.get('task') || null);
	let activeGoalTab = $state('tasks');
	let activeTodoId = $state(null);
	let focusTodoId = $state(null);
	let skipTaskScroll = false;

	function requestTaskFocus(id) {
		if (!id) return;
		focusTodoId = id;
	}

	function handleFocusTitleHandled() {
		focusTodoId = null;
	}

	function clearHighlight() {
		activeTodoId = null;
		if (targetTodoId) goto(page.url.pathname, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function setHighlightedTaskId(id) {
		if (!id) return;
		activeTodoId = id;
	}
	// Goal editing state (declared early so it can be used in derived values)
	let isEditingGoal = $state(false);
	let editedGoalTitle = $state('');
	let editedGoalDescription = $state('');
	let goalTitleInputElement = $state(null);
	let goalDescriptionTextareaElement = $state(null);
	let selectedColor = $state('default');
	/** URL param of the last goal this page considered "navigated to" (avoids auto-edit on grid flicker from sync). */
	let lastAutoEditGoalParam = $state(/** @type {string | null} */ (null));

	// Get goal param reactively
	const goalParam = $derived(page.params.goal);

	// Compute goal indices (only depends on grid structure, not grid content)
	const goalIndices = $derived.by(() => {
		return Array.from({ length: 81 }, (_, i) => i);
	});

	// Compute parent goal index
	const parentGoalIndex = $derived.by(() => {
		if (!goalParam) return null;
		const parsed = nomenclatureToIndex(goalParam, goalIndices);
		if (parsed === null) return null;
		const canonical = canonicalGoalIndex(parsed);
		return getParentGoalIndex(canonical);
	});

	// Compute goal index from param
	const goalIndex = $derived.by(() => {
		if (!goalParam) return null;
		const parsed = nomenclatureToIndex(goalParam, goalIndices);
		return parsed === null ? null : canonicalGoalIndex(parsed);
	});

	// Handle invalid goal param and update store's currentGoalIndex
	$effect(() => {
		if (!browser || !dataLoaded) return;
		if (goalIndex === null && goalParam) {
			goto('/todo', { replaceState: true });
			return;
		}
		// Update store's currentGoalIndex for SquareMap highlighting
		if (goalIndex !== null) {
			store.currentGoalIndex = goalIndex;
		}
	});

	// Compute goal label - use edited title while editing to prevent reactivity issues
	const goalLabel = $derived.by(() => {
		if (goalIndex === null) return '';
		// If editing, use the edited title to prevent reactivity from resetting the display
		if (isEditingGoal) {
			return editedGoalTitle.trim() || indexToNomenclature(goalIndex);
		}
		return getGoalLabelFromIndex(goalIndex);
	});

	// Compute parent goal label
	const parentGoalLabel = $derived.by(() => {
		if (parentGoalIndex === null) return null;
		return getGoalLabelFromIndex(parentGoalIndex);
	});

	// Helper function - just return the text or code, no prefix
	function getGoalLabelFromIndex(index) {
		if (index === null || index < 0 || index > 80) return 'Unknown';
		const cell = grid[index];
		const text = (cell?.text ?? '').trim();
		return text || indexToNomenclature(index);
	}

	const ORDER_STEP = 1024;
	const GOAL_GROUP_ORDER_STEP = 1024;

	function getTodoOrdering(todo) {
		if (typeof todo?.ordering === 'number' && Number.isFinite(todo.ordering)) return todo.ordering;
		if (typeof todo?.createdAt === 'number' && Number.isFinite(todo.createdAt)) return todo.createdAt;
		return 0;
	}

	function getGoalGroupOrdering(goalIdx) {
		const cell = grid[goalIdx];
		if (typeof cell?.todo_group_ordering === 'number' && Number.isFinite(cell.todo_group_ordering)) {
			return cell.todo_group_ordering;
		}
		return (goalIdx + 1) * GOAL_GROUP_ORDER_STEP;
	}

	function getSiblingTodos(listId, parentId, excludeId = null) {
		return todos
			.filter((t) => t.listId === listId && (t.parentId ?? null) === (parentId ?? null) && t.id !== excludeId)
			.sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b));
	}

	function getTopOrdering(listId, parentId) {
		const siblings = getSiblingTodos(listId, parentId);
		if (siblings.length === 0) return ORDER_STEP;
		return getTodoOrdering(siblings[0]) - ORDER_STEP;
	}

	function normalizeSiblingOrderings(listId, parentId) {
		const siblings = getSiblingTodos(listId, parentId);
		const updates = new Map(siblings.map((todo, index) => [todo.id, (index + 1) * ORDER_STEP]));
		const ts = Date.now();
		store.harada_chart.todos = store.harada_chart.todos.map((todo) =>
			updates.has(todo.id)
				? { ...todo, ordering: updates.get(todo.id), updatedAt: ts }
				: todo
		);
	}

	function getOrderingAfter(listId, parentId, currentTodoId) {
		let siblings = getSiblingTodos(listId, parentId);
		let currentIndex = siblings.findIndex((t) => t.id === currentTodoId);
		if (currentIndex === -1) return getTopOrdering(listId, parentId);

		let currentOrdering = getTodoOrdering(siblings[currentIndex]);
		let nextSibling = siblings[currentIndex + 1];
		if (!nextSibling) return currentOrdering + ORDER_STEP;

		let nextOrdering = getTodoOrdering(nextSibling);
		if (nextOrdering - currentOrdering <= 1) {
			normalizeSiblingOrderings(listId, parentId);
			siblings = getSiblingTodos(listId, parentId);
			currentIndex = siblings.findIndex((t) => t.id === currentTodoId);
			currentOrdering = getTodoOrdering(siblings[currentIndex]);
			nextSibling = siblings[currentIndex + 1];
			if (!nextSibling) return currentOrdering + ORDER_STEP;
			nextOrdering = getTodoOrdering(nextSibling);
		}

		return currentOrdering + (nextOrdering - currentOrdering) / 2;
	}

	function moveTodo(todoId, destination) {
		const todo = store.harada_chart.todos.find((t) => t.id === todoId);
		if (!todo || !destination) return;

		const targetListId = destination.listId ?? todo.listId;
		const targetParentId = destination.parentId ?? null;
		const afterTodoId = destination.afterTodoId ?? null;
		const ordering = afterTodoId
			? getOrderingAfter(targetListId, targetParentId, afterTodoId)
			: getTopOrdering(targetListId, targetParentId);

		updateTodo(todoId, {
			listType: destination.listType ?? todo.listType,
			listId: targetListId,
			listName:
				destination.listType === 'custom'
					? destination.listName || todo.listName || 'New list'
					: null,
			goalIndex:
				destination.listType === 'goal'
					? (destination.goalIndex ?? null)
					: null,
			parentId: targetParentId,
			ordering
		});
	}

	// Get goal markdown/readme - use edited description while editing
	const goalMarkdown = $derived.by(() => {
		if (goalIndex === null) return '';
		// If editing, use the edited description to prevent reactivity issues
		if (isEditingGoal) {
			return editedGoalDescription.trim();
		}
		const cell = grid[goalIndex];
		return (cell?.readme ?? '').trim();
	});

	// Keep editor draft state aligned with the currently viewed goal whenever
	// we're not actively editing. This prevents stale/blank drafts from carrying
	// over during route changes or initial page hydration.
	$effect(() => {
		if (goalIndex === null || isEditingGoal) return;
		const cell = grid[goalIndex];
		editedGoalTitle = (cell?.text ?? '').trim();
		editedGoalDescription = (cell?.readme ?? '').trim();
		selectedColor = cell?.color || 'default';
	});

	// Update selectedColor when goal changes (but not while editing to prevent reactivity issues)
	$effect(() => {
		if (isEditingGoal) return; // Don't update while editing
		const currentGoalIndex = goalIndex;
		const currentGrid = grid;
		if (currentGoalIndex !== null && currentGrid[currentGoalIndex]) {
			selectedColor = currentGrid[currentGoalIndex].color || 'default';
		}
	});

	// Check if goal has no custom title (just the default nomenclature)
	const hasNoCustomTitle = $derived.by(() => {
		if (goalIndex === null) return false;
		const cell = grid[goalIndex];
		const text = (cell?.text ?? '').trim();
		return !text || text === indexToNomenclature(goalIndex);
	});

	// Auto-start editing goal title only when landing on this goal via navigation.
	// Background refresh (tab focus / visibility) can temporarily change merged grid
	// cells and make hasNoCustomTitle true; re-running startEditingGoal(true) then
	// clears editedGoalTitle and looks like the title "disappeared".
	$effect(() => {
		if (!dataLoaded || goalIndex === null || isEditingGoal) return;
		if (store.isRefreshing) return;
		const param = goalParam ?? null;
		if (param === null) return;
		const justNavigatedHere = param !== lastAutoEditGoalParam;
		if (justNavigatedHere) lastAutoEditGoalParam = param;
		if (!justNavigatedHere || !hasNoCustomTitle) return;
		startEditingGoal(true);
	});

	// Get all goals for dropdown
	const allGoals = $derived.by(() => {
		const uniqueCanonical = [...new Set(goalIndices.map((idx) => canonicalGoalIndex(idx)))];
		return uniqueCanonical.map((idx) => {
			const cell = grid[idx];
			const text = (cell?.text ?? '').trim();
			return {
				index: idx,
				code: indexToNomenclature(idx),
				label: text || indexToNomenclature(idx),
				isMainGoal: Math.floor(idx / 9) === 4 && idx % 9 === 4,
				updated_at: cell?.updated_at || null
			};
		}).sort((a, b) => {
			// Main goal always first
			if (a.isMainGoal) return -1;
			if (b.isMainGoal) return 1;
			
			// Sort by updated_at descending (most recently updated first)
			const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
			const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
			if (aTime !== bTime) {
				return bTime - aTime; // Descending order
			}
			
			// Fallback to index order if timestamps are equal or both null
			return a.index - b.index;
		});
	});

	// Helper function to calculate indent level based on parent relationships
	function getIndentLevel(todoId, todosList) {
		let level = 0;
		let currentId = todoId;
		const visited = new Set();
		
		while (currentId) {
			if (visited.has(currentId)) break; // Prevent infinite loops
			visited.add(currentId);
			
			const todo = todosList.find(t => t.id === currentId);
			if (!todo || !todo.parentId) break;
			
			level++;
			currentId = todo.parentId;
		}
		
		return level;
	}

	// Helper function to organize todos with hierarchy
	function organizeTodosWithHierarchy(todosList) {
		const byParent = new Map();
		const ids = new Set(todosList.map((todo) => todo.id));
		for (const todo of todosList) {
			const parentKey = todo.parentId && ids.has(todo.parentId) ? todo.parentId : '__root__';
			if (!byParent.has(parentKey)) byParent.set(parentKey, []);
			byParent.get(parentKey).push(todo);
		}

		for (const siblingList of byParent.values()) {
			siblingList.sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b));
		}

		const ordered = [];
		function walk(parentId = null) {
			const key = parentId ?? '__root__';
			const siblings = byParent.get(key) || [];
			for (const todo of siblings) {
				ordered.push(todo);
				walk(todo.id);
			}
		}

		walk(null);
		return ordered;
	}

	function getVisibleGoalTodos(targetGoalIndex) {
		const filtered = todos.filter((t) => {
			const matchesGoal =
				(t.listType === 'goal' || !t.listType) &&
				(t.goalIndex === targetGoalIndex ||
					taskGoalKeySet.has(`${t.id}:${targetGoalIndex}`));
			const isCompleted = t.status === 'done';
			return matchesGoal && (showCompleted || !isCompleted);
		});
		return organizeTodosWithHierarchy(filtered);
	}

	function getGoalScopeIndices() {
		if (goalIndex === null) return [];

		// Outer block centers (B2, E2, etc.) should show their full local 3x3 child grid.
		if (goalIndex !== 40) {
			const row = Math.floor(goalIndex / 9);
			const col = goalIndex % 9;
			const isOuterBlockCenter = row % 3 === 1 && col % 3 === 1;
			if (isOuterBlockCenter) {
				const childIndices = [];
				for (let r = row - 1; r <= row + 1; r++) {
					for (let c = col - 1; c <= col + 1; c++) {
						if (r < 0 || r > 8 || c < 0 || c > 8) continue;
						childIndices.push(r * 9 + c);
					}
				}
				// Keep current goal first, then show the rest of the child groups.
				return [goalIndex, ...childIndices.filter((idx) => idx !== goalIndex)];
			}
		}

		const subGoalIndices = getSubGoalIndices(goalIndex).map((idx) => canonicalGoalIndex(idx));
		// Dedupe so central pairs (e.g. B2 + D4, E2 + E4) appear only once.
		const canonicalSet = new Set([goalIndex, ...subGoalIndices]);
		return [...canonicalSet];
	}

	const goalGroups = $derived.by(() => {
		const indices = getGoalScopeIndices();

		// Default behavior: one group per goal
		return indices
			.map((idx) => ({
				id: `goal-${idx}`,
				goalIndex: idx,
				label: getGoalLabelFromIndex(idx),
				href: `/todo/${indexToNomenclature(idx)}`,
				addTitle: idx === goalIndex ? 'Add todo to this goal' : 'Add todo to this sub-goal',
				todos: getVisibleGoalTodos(idx)
			}))
			.filter((group) => group.todos.length > 0);
	});

	const goalTasksCount = $derived.by(() =>
		goalGroups.reduce((sum, g) => sum + (g.todos?.filter((t) => !t.isDraft).length ?? 0), 0)
	);

	function getVisibleGoalGroupsByOrdering() {
		const uniqueCanonical = [...new Set(goalIndices.map((idx) => canonicalGoalIndex(idx)))];
		return uniqueCanonical
			.map((idx) => ({
				id: `goal-${idx}`,
				goalIndex: idx,
				label: getGoalLabelFromIndex(idx),
				href: `/todo/${indexToNomenclature(idx)}`,
				todos: getVisibleGoalTodos(idx),
				goalOrdering: getGoalGroupOrdering(idx)
			}))
			.filter((group) => group.todos.length > 0)
			.sort((a, b) => {
				if (a.goalOrdering !== b.goalOrdering) {
					return a.goalOrdering - b.goalOrdering;
				}
				return a.goalIndex - b.goalIndex;
			});
	}

	const goalMenuItems = $derived.by(() =>
		getVisibleGoalGroupsByOrdering().map((group) => ({
			id: group.id,
			goalIndex: group.goalIndex,
			label: group.label,
			href: group.href,
			count: group.todos.length
		}))
	);

	const allTasksFeed = $derived.by(() =>
		buildAllTasksFeed({
			todos,
			grid,
			taskGoalKeySet,
			linkedTaskIdSet,
			getTodoOrdering
		})
	);
	const allTasksTodoGroups = $derived(allTasksFeed.todoGroups);
	const allTasksGroupsByTodoId = $derived(allTasksFeed.groupsByTodoId);
	const allTasksFeedPinnedRows = $derived(buildFeedPinnedRows(todos, getTodoOrdering));

	const associatedGoalNotes = $derived.by(() => {
		if (typeof goalIndex !== 'number') return [];
		const goalTaskIds = new Set(
			todos
				.filter(
					(todo) =>
						(todo.listType === 'goal' || !todo.listType) &&
						(todo.goalIndex === goalIndex ||
							taskGoalKeySet.has(`${todo.id}:${goalIndex}`))
				)
				.map((todo) => todo.id)
		);
		const linkedIds = new Set(
			noteGoalLinks
				.filter((link) => link.goalIndex === goalIndex)
				.map((link) => link.noteId)
		);
		for (const link of noteTaskLinks) {
			if (goalTaskIds.has(link.taskId)) linkedIds.add(link.noteId);
		}
		return notes
			.filter((note) => linkedIds.has(note.id) && !store.isPrimaryTaskNote(note.id))
			.sort((a, b) => b.updatedAt - a.updatedAt);
	});

	let mobileMenuOpen = $state(false);
	let mobileSidebarHydrated = $state(false);
	let prevTodoWorkspaceQuery = $state('');

	/** Tailwind `md` (768px): only one of desktop vs mobile goal/todo trees mounts - duplicate inputs + TodoList caused goal title / focus bugs. */
	let todoDesktopLayout = $state(
		browser ? window.matchMedia('(min-width: 768px)').matches : false
	);

	const mobileTodoSearchActive = $derived(
		!todoDesktopLayout && store.todoWorkspaceQuery.trim().length > 0
	);

	const mobileSearchUsesAllTasks = $derived(
		mobileTodoSearchActive && store.todoMobileSearchScope === 'all'
	);

	const desktopGlobalSearchActive = $derived(
		todoDesktopLayout && store.todoWorkspaceQuery.trim().length > 0
	);

	let goalSearchQuery = $state('');

	onMount(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		const syncTodoLayout = () => {
			todoDesktopLayout = mq.matches;
		};
		syncTodoLayout();
		mq.addEventListener('change', syncTodoLayout);

		if (isWorkspaceNarrowLayout() && readTodoMobileSidebarOpen()) {
			mobileMenuOpen = true;
		}
		mobileSidebarHydrated = true;

		return () => mq.removeEventListener('change', syncTodoLayout);
	});

	$effect(() => {
		if (!browser || !mobileSidebarHydrated) return;
		if (!page.url.pathname.startsWith('/todo')) return;
		if (!isWorkspaceNarrowLayout()) return;
		persistTodoMobileSidebar(mobileMenuOpen);
	});

	$effect(() => {
		if (!browser) return;
		if (todoDesktopLayout) {
			store.todoMobileShowsGoalList = false;
			return;
		}
		store.todoMobileShowsGoalList = mobileMenuOpen;
	});

	$effect(() => {
		if (!browser || todoDesktopLayout) return;
		const q = store.todoWorkspaceQuery;
		const trimmed = q.trim();
		const started = !prevTodoWorkspaceQuery.trim() && trimmed;
		prevTodoWorkspaceQuery = q;
		if (started) {
			store.latchTodoMobileSearchScope(mobileMenuOpen, false);
		}
	});

	/** Re-opened goal list while a query is active → search across all tasks again */
	$effect(() => {
		if (!browser || todoDesktopLayout) return;
		if (!store.todoWorkspaceQuery.trim() || !mobileMenuOpen) return;
		store.latchTodoMobileSearchScope(true, false);
	});

	$effect(() => {
		if (!browser || todoDesktopLayout) return;
		if (!store.todoWorkspaceQuery.trim()) return;
		activeGoalTab = 'tasks';
		mobileMenuOpen = false;
	});

	$effect(() => {
		if (!browser || !dataLoaded || !targetTodoId) return;
		activeGoalTab = 'tasks';
		mobileMenuOpen = false;
		activeTodoId = targetTodoId;
		if (todos.find((todo) => todo.id === targetTodoId)?.status === 'done') {
			showCompleted = true;
		}
	});

	afterNavigate(() => {
		if (!browser) return;
		if (!todoDesktopLayout && store.todoWorkspaceQuery.trim()) {
			store.focusTodoMobileSearchOnGoal();
			mobileMenuOpen = false;
		}
		if (!dataLoaded) return;
		const task = page.url.searchParams.get('task');
		if (!task) return;
		activeTodoId = task;
		if (skipTaskScroll) {
			skipTaskScroll = false;
			return;
		}
		void tick().then(() => scrollToLinkedTask(task));
	});

	function scrollToLinkedTask(todoId, attempt = 0) {
		if (!browser || !todoId) return;
		const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(todoId) : todoId;
		const el = document.querySelector(`[data-todo-item-id="${escaped}"]`);
		if (!el) {
			if (attempt < 8) {
				setTimeout(() => scrollToLinkedTask(todoId, attempt + 1), 50);
			}
			return;
		}
		el.scrollIntoView({ behavior: attempt === 0 ? 'smooth' : 'auto', block: 'nearest' });
	}

	// When this goal has no todos, ensure one blank todo exists so the user can type immediately
	$effect(() => {
		if (goalIndex === null || !dataLoaded) return;
		if (goalGroups.length === 0) {
			addTodo(goalIndex, { draft: true });
		}
	});

	// Todo management functions
	function addTodo(targetGoalIndex = goalIndex, { draft = false } = {}) {
		if (targetGoalIndex === null) return;
		const listMeta = buildGoalListMeta(targetGoalIndex);
		const todo = {
			...defaultTodo(),
			...listMeta,
			isDraft: draft,
			parentId: null,
			ordering: getTopOrdering(listMeta.listId, null)
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];

		if (!draft && typeof targetGoalIndex === 'number') {
			store.bumpGoalAfterTodoActivity(targetGoalIndex);
		}

		// Set active todo ID so it gets focused
		activeTodoId = todo.id;
		if (!draft) store.registerTodoMutation(todo.id, { immediate: true });
		return todo;
	}

	function navigateToNewTask(todo) {
		if (!todo?.id) return;
		const meta = normalizeTodoListMeta(todo);
		const q = new URLSearchParams({ task: todo.id }).toString();
		if (meta.listType === 'custom') {
			goto(`/todo?${q}`);
			return;
		}
		if (typeof meta.goalIndex === 'number') {
			goto(`/todo/${indexToNomenclature(meta.goalIndex)}?${q}`);
			return;
		}
		goto(`/todo?${q}`);
	}

	function submitQuickAddTask() {
		const title = store.todoWorkspaceQuery.trim();
		if (!title) return;
		store.todoWorkspaceQuery = '';
		createTodoFromComposer({ title, shouldNavigate: false });
	}

	function submitQuickAddGoalTask() {
		const title = goalSearchQuery.trim();
		if (!title) return;
		goalSearchQuery = '';
		createTodoFromComposer({ title, shouldNavigate: false });
	}

	function createTodoFromComposer({ title, markdown, goalIndex: selectedGoalIndex, listType, listName, shouldNavigate = true } = {}) {
		// Handle case when called without parameters (from "+ New Task" button)
		// Add to current goal when on a goal page
		if (!title && !markdown && selectedGoalIndex === undefined && !listType && !listName) {
			if (goalIndex !== null) {
				const listMeta = buildGoalListMeta(goalIndex);
				const todo = {
					...defaultTodo(),
					...listMeta,
					parentId: null,
					ordering: getTopOrdering(listMeta.listId, null)
				};
				store.harada_chart.todos = [...store.harada_chart.todos, todo];
				store.bumpGoalAfterTodoActivity(goalIndex);
				activeTodoId = todo.id;
				store.registerTodoMutation(todo.id, { immediate: true });
				if (shouldNavigate) navigateToNewTask(todo);
			}
			return;
		}
		
		if (listType === 'custom' || (listName && listName.trim())) {
			const customMeta = buildCustomListMeta(listName);
			const todo = {
				...defaultTodo(),
				title: title || '',
				markdown: '',
				...customMeta,
				parentId: null,
				ordering: getTopOrdering(customMeta.listId, null)
			};
			store.harada_chart.todos = [...store.harada_chart.todos, todo];
			if (markdown?.trim()) {
				store.setPrimaryNoteForTask(todo.id, { content: markdown.trim() });
			}
			store.registerTodoMutation(todo.id, { immediate: true });
			if (shouldNavigate) navigateToNewTask(todo);
			return;
		}
		const targetGoalIndex =
			typeof selectedGoalIndex === 'number' ? canonicalGoalIndex(selectedGoalIndex) : goalIndex;
		if (targetGoalIndex === null) return;
		const todo = {
			...defaultTodo(),
			title: title || '',
			markdown: '',
			...buildGoalListMeta(targetGoalIndex),
			parentId: null,
			ordering: getTopOrdering(`goal:${targetGoalIndex}`, null)
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];
		if (markdown?.trim()) {
			store.setPrimaryNoteForTask(todo.id, { content: markdown.trim(), goalIndex: targetGoalIndex });
		}

		if (typeof targetGoalIndex === 'number') {
			store.bumpGoalAfterTodoActivity(targetGoalIndex);
		}

		activeTodoId = todo.id;
		store.registerTodoMutation(todo.id, { immediate: true });
		if (shouldNavigate) navigateToNewTask(todo);
	}

	function createNoteFromComposer(content = '') {
		if (goalIndex === null) {
			const note = store.createNote({ content });
			store.pendingSelectNoteId = note.id;
			goto('/notes');
			return;
		}
		const note = store.createNote({ content });
		store.pendingSelectNoteId = note.id;
		store.linkNoteToGoal(note.id, goalIndex);
		goto(`/notes/${indexToNomenclature(goalIndex)}`);
	}

	$effect(() => {
		navComposerHandlers.onCreateTodo = createTodoFromComposer;
		navComposerHandlers.onCreateNote = createNoteFromComposer;
		return () => navComposerHandlers.clear();
	});

	function updateTodo(id, patch) {
		store.updateTodo(id, patch);
	}

	function getLinkedNotesForTodo(todoId) {
		return taskNoteIndexMaps.freeNotesByTaskId.get(todoId) ?? [];
	}

	function getPrimaryNoteForTodo(todoId) {
		return taskNoteIndexMaps.primaryNoteByTaskId.get(todoId) ?? null;
	}

	function getLinkedGoalIndicesForTodo(todoId) {
		return taskNoteIndexMaps.goalIndicesByTaskId.get(todoId) ?? [];
	}

	function upsertPrimaryNoteForTodo(todoId, content, group) {
		if (content?.trim()) {
			store.updateTodo(todoId, { isDraft: false });
		}
		const maybeGoalIndex = group?.groupType === 'goal' ? group.goalIndex : goalIndex;
		store.setPrimaryNoteForTask(todoId, { content, goalIndex: maybeGoalIndex });
	}

	function isUnassignedNoGoalTodo(t) {
		return (
			(t.listType === 'goal' || !t.listType) &&
			t.goalIndex == null &&
			!linkedTaskIdSet.has(t.id)
		);
	}

	function noGoalGroupMeta() {
		const noGoal = allTasksTodoGroups.find((g) => g.id === 'no-goal');
		return (
			noGoal ?? {
				id: 'no-goal',
				groupType: 'no-goal',
				goalIndex: null,
				label: '',
				href: null,
				addTitle: 'Add todo without goal',
				todos: []
			}
		);
	}

	function resolveAllTasksGroupForTodo(todo) {
		const t = normalizeTodoListMeta(todo);
		if (isUnassignedNoGoalTodo(t) && t.pinned === true) {
			return noGoalGroupMeta();
		}
		return allTasksGroupsByTodoId.get(t.id) ?? null;
	}

	function deleteTodo(id) {
		store.deleteTodo(id);
	}

	function cycleTodoStatus(id) {
		store.cycleTodoStatus(id);
	}

	function createNextTodo(currentTodoId, targetGoalIndex = goalIndex) {
		if (targetGoalIndex === null) return null;
		const currentTodo = store.harada_chart.todos.find((t) => t.id === currentTodoId);
		if (!currentTodo) return null;
		const normalizedCurrentTodo = normalizeTodoListMeta(currentTodo);
		const targetListId = normalizedCurrentTodo.listId;
		const targetParentId = normalizedCurrentTodo.parentId ?? null;
		const newOrdering = getOrderingAfter(targetListId, targetParentId, currentTodoId);

		const newTodo = {
			...defaultTodo(),
			goalIndex: normalizedCurrentTodo.goalIndex,
			listType: normalizedCurrentTodo.listType,
			listId: normalizedCurrentTodo.listId,
			listName: normalizedCurrentTodo.listName || null,
			parentId: targetParentId,
			ordering: newOrdering
		};
		store.harada_chart.todos = [...store.harada_chart.todos, newTodo];
		activeTodoId = newTodo.id;
		requestTaskFocus(newTodo.id);

		if (typeof targetGoalIndex === 'number') {
			store.bumpGoalAfterTodoActivity(targetGoalIndex);
		}

		store.registerTodoMutation(newTodo.id, { immediate: true });
		return newTodo;
	}

	function makeSubtask(currentTodoId, targetGoalIndex = goalIndex) {
		const goalTodosList = getVisibleGoalTodos(targetGoalIndex);
		// Find current todo's index in the organized list
		const currentIndex = goalTodosList.findIndex((t) => t.id === currentTodoId);
		if (currentIndex <= 0) return; // Can't make first todo a subtask
		
		const currentTodo = store.harada_chart.todos.find((t) => t.id === currentTodoId);
		if (!currentTodo) return;
		
		// Find the previous todo (potential parent)
		const previousTodo = goalTodosList[currentIndex - 1];
		if (!previousTodo) return;
		
		// Check if already a child of the previous todo
		if (currentTodo.parentId === previousTodo.id) return;
		
		// Make this todo a direct child of the todo directly above it.
		updateTodo(currentTodoId, { parentId: previousTodo.id });
	}

	function outdentTodo(currentTodoId) {
		const currentTodo = store.harada_chart.todos.find((t) => t.id === currentTodoId);
		if (!currentTodo || !currentTodo.parentId) return; // Can't outdent if no parent
		
		// Find the parent todo
		const parentTodo = store.harada_chart.todos.find(t => t.id === currentTodo.parentId);
		if (!parentTodo) return;
		
		// Make the current todo a sibling of its parent (child of parent's parent)
		updateTodo(currentTodoId, { parentId: parentTodo.parentId || null });
	}

	function canIndentTodo(todoId, targetGoalIndex = goalIndex) {
		const goalTodosList = getVisibleGoalTodos(targetGoalIndex);
		const currentIndex = goalTodosList.findIndex((t) => t.id === todoId);
		if (currentIndex <= 0) return false; // Can't indent first todo
		
		const currentTodo = store.harada_chart.todos.find((t) => t.id === todoId);
		if (!currentTodo) return false;
		
		const previousTodo = goalTodosList[currentIndex - 1];
		if (!previousTodo) return false;
		
		// Can indent if not already a child of the previous todo
		return currentTodo.parentId !== previousTodo.id;
	}

	function canOutdentTodo(todoId) {
		const currentTodo = store.harada_chart.todos.find((t) => t.id === todoId);
		if (!currentTodo) return false;
		
		// Can outdent if has a parent
		return currentTodo.parentId !== null;
	}

	function deleteAndFocusPrevious(currentTodoId, targetGoalIndex = goalIndex) {
		const goalTodosList = getVisibleGoalTodos(targetGoalIndex);
		const currentIndex = goalTodosList.findIndex((t) => t.id === currentTodoId);
		
		// Delete the current todo
		deleteTodo(currentTodoId);
		
		if (currentIndex > 0) {
			const previousTodo = goalTodosList[currentIndex - 1];
			if (previousTodo) requestTaskFocus(previousTodo.id);
		}
	}

	// saveTodos removed - persistence now happens on explicit save points.

	let showCompleted = $state(false);

	// Available colors for goals
	const goalColors = [
		{ value: 'default', label: 'Default', classes: '' },
		{ value: 'bg-rose-600 border-rose-400 text-white', label: 'Rose', preview: 'bg-rose-600' },
		{ value: 'bg-amber-600 border-amber-400 text-white', label: 'Amber', preview: 'bg-amber-600' },
		{ value: 'bg-lime-600 border-lime-400 text-white', label: 'Lime', preview: 'bg-lime-600' },
	];

	// Initialize edited content when entering edit mode
	function startEditingGoal(blankIfNoTitle = false) {
		if (goalIndex === null) return;
		const cell = grid[goalIndex];
		const title = (cell?.text ?? '').trim();
		const description = (cell?.readme ?? '').trim();
		
		// If blankIfNoTitle is true and there's no custom title, start with blank title
		if (blankIfNoTitle && (!title || title === indexToNomenclature(goalIndex))) {
			editedGoalTitle = '';
			editedGoalDescription = description || '';
		} else {
			editedGoalTitle = title || '';
			editedGoalDescription = description || '';
		}
		
		selectedColor = cell?.color || 'default';
		isEditingGoal = true;
		// Focus the title input after it renders
		setTimeout(() => {
			if (goalTitleInputElement) {
				goalTitleInputElement.focus();
				goalTitleInputElement.select();
			}
		}, 0);
	}

	// Update color for the goal
	function updateGoalColor(color) {
		if (goalIndex === null) return;
		
		if (!store.harada_chart.grid[goalIndex]) {
			store.harada_chart.grid[goalIndex] = { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
		}
		store.harada_chart.grid[goalIndex].color = color;
		selectedColor = color;

		const linkedGoalIndex = getLinkedGoalIndex(goalIndex);
		if (linkedGoalIndex !== null) {
			if (!store.harada_chart.grid[linkedGoalIndex]) {
				store.harada_chart.grid[linkedGoalIndex] = { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
			}
			store.harada_chart.grid[linkedGoalIndex].color = color;
		}

		// Stamp updated_at so the cloud merge can win conflicts cleanly and
		// doesn't wipe the cell on a tab-return refresh.
		updateGoalTimestamp(store.harada_chart.grid, goalIndex);

		// Force reactivity by reassigning
		store.harada_chart.grid = [...store.harada_chart.grid];
		store.registerGridMutation({ immediate: true });
	}

	// Save edited goal content
	function saveGoalEdit() {
		if (goalIndex === null || !isEditingGoal) return;
		
		const title = editedGoalTitle.trim();
		const description = editedGoalDescription.trim();
		const existingTitle = (store.harada_chart.grid[goalIndex]?.text ?? '').trim();
		// Prevent accidental blank saves from wiping an existing custom title.
		// Use the explicit clear action when users want to remove title + description.
		const finalTitle = title === '' && existingTitle ? existingTitle : title;
		
		// Update grid
		if (!store.harada_chart.grid[goalIndex]) {
			store.harada_chart.grid[goalIndex] = { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
		}
		store.harada_chart.grid[goalIndex].text = finalTitle;
		store.harada_chart.grid[goalIndex].readme = description;
		store.harada_chart.grid[goalIndex].color = selectedColor;
		updateGoalTimestamp(store.harada_chart.grid, goalIndex);

		const linkedGoalIndex = getLinkedGoalIndex(goalIndex);
		if (linkedGoalIndex !== null) {
			if (!store.harada_chart.grid[linkedGoalIndex]) {
				store.harada_chart.grid[linkedGoalIndex] = { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
			}
			store.harada_chart.grid[linkedGoalIndex].text = finalTitle;
			store.harada_chart.grid[linkedGoalIndex].readme = description;
			store.harada_chart.grid[linkedGoalIndex].status = store.harada_chart.grid[goalIndex].status;
			store.harada_chart.grid[linkedGoalIndex].color = selectedColor;
		}
		
		// Force reactivity by reassigning
		store.harada_chart.grid = [...store.harada_chart.grid];
		
		isEditingGoal = false;

		store.registerGridMutation({ immediate: true });
	}

	// Clear the goal's name and description (tasks and sub-goals are preserved)
	function clearGoal() {
		if (goalIndex === null) return;

		// Ensure the current goal cell exists in the grid
		if (!store.harada_chart.grid[goalIndex]) {
			store.harada_chart.grid[goalIndex] = {
				text: '',
				status: 'todo',
				readme: '',
				color: 'default',
				updated_at: null
			};
		}

		// Clear the goal's title and description for this cell
		store.harada_chart.grid[goalIndex].text = '';
		store.harada_chart.grid[goalIndex].readme = '';

		// Also clear the linked goal cell, if any, to keep them in sync
		const linkedGoalIndex = getLinkedGoalIndex(goalIndex);
		if (linkedGoalIndex !== null) {
			if (!store.harada_chart.grid[linkedGoalIndex]) {
				store.harada_chart.grid[linkedGoalIndex] = {
					text: '',
					status: 'todo',
					readme: '',
					color: 'default',
					updated_at: null
				};
			}
			store.harada_chart.grid[linkedGoalIndex].text = '';
			store.harada_chart.grid[linkedGoalIndex].readme = '';
		}

		// Update timestamp and force reactivity
		updateGoalTimestamp(store.harada_chart.grid, goalIndex);
		store.harada_chart.grid = [...store.harada_chart.grid];

		// Reset local editing state
		editedGoalTitle = '';
		editedGoalDescription = '';
		isEditingGoal = false;

		// Persist changes and return to HaradaChart screen
		store.registerGridMutation({ immediate: true });
		goto('/todo', { replaceState: true });
	}

	// Cancel editing
	function cancelGoalEdit() {
		isEditingGoal = false;
		editedGoalTitle = '';
		editedGoalDescription = '';
	}

	// Navigate up one level in the goal hierarchy
	function moveUpALevel() {
		if (parentGoalIndex !== null) {
			const parentCode = indexToNomenclature(parentGoalIndex);
			goto(`/todo/${parentCode}`);
		} else {
			goto('/todo');
		}
	}
</script>

<svelte:head>
	<title>{goalLabel} - Todos - Haradato</title>
</svelte:head>

<div class="p-4 pb-24 md:p-8 md:pb-8">
	<div class="mx-auto max-w-7xl">
		<div class="mb-3 md:hidden">
			<WorkspaceToolbar
				mode="mobile"
				inputMode="quickAdd"
				bind:quickAddText={store.todoWorkspaceQuery}
				onQuickAdd={submitQuickAddTask}
				showSidebarToggle={!mobileMenuOpen && !mobileTodoSearchActive}
				onSidebarToggle={() => (mobileMenuOpen = true)}
				showHamburger={false}
				composeTabDefault="task"
			/>
		</div>

		<div class="hidden gap-8 md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
		<aside class="h-[calc(100vh-5.5rem)] overflow-y-auto px-2 pt-2 pb-3">
			<h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">TASKS</h2>
			<div class="mb-3 px-1">
				<WorkspaceToolbar
					mode="desktop"
					inputMode="search"
					bind:searchText={store.todoWorkspaceQuery}
					composeTabDefault="task"
				/>
			</div>
				<div class="relative ml-2 border-l border-slate-200/50 pl-2 dark:border-slate-700/40 space-y-0.5">
					<a
						href="/todo"
						class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-500/10 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200"
					>
						<span>All Tasks</span>
						<span class="text-xs opacity-50">{todos.filter((t) => !t.isDraft && t.status !== 'done').length}</span>
					</a>
					{#each goalMenuItems as item (item.id)}
						<a
							href={item.href}
							class={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition ${
								item.goalIndex === goalIndex
									? 'bg-violet-500/20 text-violet-800 dark:bg-violet-500/25 dark:text-violet-200'
									: 'text-slate-700 hover:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-white/5'
							}`}
							aria-current={item.goalIndex === goalIndex ? 'page' : undefined}
						>
							<span class="truncate pr-3">{item.label}</span>
							<span class="text-xs opacity-50">{item.count}</span>
						</a>
					{/each}
				</div>
			</aside>

			<div class="min-w-0">
				{#if !dataLoaded}
					<div class="flex items-center justify-center py-12">
						<div class="goal-loading-message">Loading...</div>
					</div>
				{:else if goalIndex === null}
					<div class="flex items-center justify-center py-12">
						<div class="goal-loading-message">Invalid goal. Redirecting...</div>
					</div>
				{:else}
					{#if todoDesktopLayout}
					{#if desktopGlobalSearchActive}
						<TodoList
							groups={allTasksTodoGroups}
							isMainTodoFeed={true}
							feedPinnedRows={allTasksFeedPinnedRows}
							resolveGroupForTodo={resolveAllTasksGroupForTodo}
							{allGoals}
							onUpdate={updateTodo}
							onDelete={deleteTodo}
							onToggleStatus={cycleTodoStatus}
							onCreateNext={(todoId, group) => createNextTodo(todoId, group?.goalIndex ?? null)}
							onDeletePrevious={(todoId, group) => deleteAndFocusPrevious(todoId, group?.goalIndex ?? null)}
							onMakeSubtask={(todoId, group) => makeSubtask(todoId, group?.goalIndex ?? null)}
							onOutdent={(todoId) => outdentTodo(todoId)}
							onTitleFocus={setHighlightedTaskId}
							getIndentLevel={(todoId, group) => getIndentLevel(todoId, group.todos)}
							canIndent={(todoId, group) => canIndentTodo(todoId, group?.goalIndex ?? null)}
							canOutdent={(todoId) => canOutdentTodo(todoId)}
							onCreateTodo={createTodoFromComposer}
							onMoveTodo={moveTodo}
							allowCrossListMove={true}
							enableGroupDrag={false}
							searchText={store.todoWorkspaceQuery}
							{targetTodoId}
							activeTodoId={activeTodoId}
							{focusTodoId}
							onFocusTitleHandled={handleFocusTitleHandled}
							{getPrimaryNoteForTodo}
							{getLinkedNotesForTodo}
							{getLinkedGoalIndicesForTodo}
							onUpsertPrimaryNote={upsertPrimaryNoteForTodo}
							onClearHighlight={clearHighlight}
						/>
					{:else}
					<div class="mb-6 hidden md:block">
						<WorkspaceToolbar
							mode="desktop"
							inputMode="quickAdd"
							bind:quickAddText={goalSearchQuery}
							onQuickAdd={submitQuickAddGoalTask}
							composeTabDefault="task"
						/>
					</div>
					<!-- Header -->
					<div class="mb-6">
						<div class="mb-4 flex items-start justify-between gap-4">
							<div class="flex-1">
								{#if isEditingGoal}
									<div class="space-y-3">
										<input
											type="text"
											bind:this={goalTitleInputElement}
											bind:value={editedGoalTitle}
											class="!text-2xl font-bold"
											placeholder="Goal title"
											onkeydown={(e) => {
												if (e.key === 'Enter') {
													e.preventDefault();
													saveGoalEdit();
												} else if (e.key === 'Escape') {
													e.preventDefault();
													cancelGoalEdit();
												} else if (e.key === 'Tab' && !e.shiftKey && !editedGoalDescription) {
													e.preventDefault();
													setTimeout(() => {
														if (goalDescriptionTextareaElement) goalDescriptionTextareaElement.focus();
													}, 0);
												}
											}}
										/>
										<textarea
											bind:this={goalDescriptionTextareaElement}
											bind:value={editedGoalDescription}
											class="!min-h-[6rem] resize-none"
											placeholder="Add description (supports markdown)..."
											onkeydown={(e) => {
												if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
													e.preventDefault();
													saveGoalEdit();
												} else if (e.key === 'Escape') {
													e.preventDefault();
													cancelGoalEdit();
												}
											}}
										></textarea>
									</div>
								{:else}
									<button
										type="button"
										onclick={startEditingGoal}
										class="text-left w-full cursor-pointer group"
									>
										<h1 class="goal-header-title">
											{goalLabel || indexToNomenclature(goalIndex)}
										</h1>
										{#if goalMarkdown}
											<div class="markdown mt-2 text-sm leading-relaxed transition-colors">
												{@html renderMarkdown(goalMarkdown)}
											</div>
										{:else}
											<div class="goal-header-placeholder">
												Click to add description...
											</div>
										{/if}
									</button>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-end gap-2">
								<div class="flex gap-1">
									{#each goalColors as color}
										<button
											type="button"
											class="goal-color-button {selectedColor === color.value
												? 'goal-color-selected'
												: 'goal-color-unselected'} {color.preview || 'goal-color-default-bg'}"
											title={color.label}
											onclick={() => updateGoalColor(color.value)}
										></button>
									{/each}
								</div>
								<label class="flex cursor-pointer select-none items-center gap-1.5 text-sm text-slate-800 dark:text-slate-200">
									<input
										type="checkbox"
										bind:checked={showCompleted}
										class="h-3.5 w-3.5 rounded border text-violet-600 focus:ring-2 focus:ring-violet-500/50"
									/>
									<span>Show completed</span>
								</label>
							</div>
						</div>

					<div class="mb-4 flex flex-wrap items-center gap-2">
						<div class="ml-auto flex items-center gap-2">
							{#if isEditingGoal}
								<button
									type="button"
									onclick={clearGoal}
									class="rounded-md border px-2 py-1.5 text-sm font-semibold shadow-sm transition hover:border-rose-500 hover:bg-rose-900/40 hover:text-rose-200"
									title="Clear goal name and description"
								>
									<Trash2 class="w-4 h-4" />
								</button>
								<button
									type="button"
									onclick={saveGoalEdit}
									class="rounded-md border border-violet-600/70 bg-violet-600/90 px-4 py-1.5 text-sm font-semibold text-black shadow-sm transition hover:bg-violet-500"
								>
									Save
								</button>
								<button
									type="button"
									onclick={cancelGoalEdit}
									class="todo-desktop-cancel"
								>
									Cancel
								</button>
							{/if}
						</div>
					</div>
					<div class="mb-4 flex items-center gap-6 border-b border-slate-300/70 dark:border-slate-700/60">
						<button
							type="button"
							onclick={() => (activeGoalTab = 'tasks')}
							class={`goal-tab ${activeGoalTab === 'tasks' ? 'goal-tab-active' : ''}`}
						>
							<span>Tasks</span>
							<span class="goal-tab-count">{goalTasksCount}</span>
						</button>
						<button
							type="button"
							onclick={() => (activeGoalTab = 'notes')}
							class={`goal-tab ${activeGoalTab === 'notes' ? 'goal-tab-active' : ''}`}
						>
							<span>Notes</span>
							<span class="goal-tab-count">{associatedGoalNotes.length}</span>
						</button>
					</div>
				</div>
					{#if activeGoalTab === 'tasks'}
						<TodoList
							groups={goalGroups}
							{allGoals}
							onAddToGroup={(group) => addTodo(group.goalIndex)}
							onUpdate={updateTodo}
							onDelete={deleteTodo}
							onToggleStatus={cycleTodoStatus}
							onCreateNext={(todoId, group) => createNextTodo(todoId, group.goalIndex)}
							onDeletePrevious={(todoId, group) => deleteAndFocusPrevious(todoId, group.goalIndex)}
							onMakeSubtask={(todoId, group) => makeSubtask(todoId, group.goalIndex)}
							onOutdent={(todoId) => outdentTodo(todoId)}
							onTitleFocus={setHighlightedTaskId}
							getIndentLevel={(todoId, group) => getIndentLevel(todoId, group.todos)}
							canIndent={(todoId, group) => canIndentTodo(todoId, group.goalIndex)}
							canOutdent={(todoId) => canOutdentTodo(todoId)}
							disableAutoFocus={hasNoCustomTitle || isEditingGoal}
							onCreateTodo={createTodoFromComposer}
							onMoveTodo={moveTodo}
							allowCrossListMove={false}
							enableGroupDrag={false}
							searchText={goalSearchQuery}
						{targetTodoId}
						activeTodoId={activeTodoId}
						{focusTodoId}
						onFocusTitleHandled={handleFocusTitleHandled}
						{getPrimaryNoteForTodo}
						{getLinkedNotesForTodo}
						{getLinkedGoalIndicesForTodo}
						onUpsertPrimaryNote={upsertPrimaryNoteForTodo}
						onClearHighlight={clearHighlight}
					/>
				{:else}
					<div class="space-y-3">
						<div class="mb-6 hidden lg:block">
								<button
									type="button"
									onclick={() => createNoteFromComposer()}
									class="rounded-btn"
								>
									+ New note
								</button>
							</div>
							{#if associatedGoalNotes.length === 0}
								<div class="todo-empty-section-card">
									<p class="todo-empty-section-text">No notes linked to this goal yet.</p>
								</div>
							{:else}
								{#each associatedGoalNotes as note (note.id)}
									<a
										href={`/notes/${indexToNomenclature(goalIndex)}`}
										onclick={() => (store.pendingSelectNoteId = note.id)}
										class="block rounded-md border border-slate-700/70 p-3 transition hover:border-violet-500/50 hover:bg-violet-500/10"
									>
										<div class="text-sm font-semibold">{getNoteTitle(note.content)}</div>
										<div class="mt-1 line-clamp-2 text-xs text-slate-400">{note.content}</div>
									</a>
								{/each}
							{/if}
						</div>
					{/if}
					{/if}
					{/if}
				{/if}
			</div>
		</div>

		{#if mobileTodoSearchActive}
			{#if dataLoaded && goalIndex !== null}
				{#if mobileSearchUsesAllTasks}
					<TodoList
						groups={allTasksTodoGroups}
						isMainTodoFeed={true}
						feedPinnedRows={allTasksFeedPinnedRows}
						resolveGroupForTodo={resolveAllTasksGroupForTodo}
						{allGoals}
						onUpdate={updateTodo}
						onDelete={deleteTodo}
						onToggleStatus={cycleTodoStatus}
						onCreateNext={(todoId, group) => createNextTodo(todoId, group?.goalIndex ?? null)}
						onDeletePrevious={(todoId, group) => deleteAndFocusPrevious(todoId, group?.goalIndex ?? null)}
						onMakeSubtask={(todoId, group) => makeSubtask(todoId, group?.goalIndex ?? null)}
						onOutdent={(todoId) => outdentTodo(todoId)}
						onTitleFocus={setHighlightedTaskId}
						getIndentLevel={(todoId, group) => getIndentLevel(todoId, group.todos)}
						canIndent={(todoId, group) => canIndentTodo(todoId, group?.goalIndex ?? null)}
						canOutdent={(todoId) => canOutdentTodo(todoId)}
						onCreateTodo={createTodoFromComposer}
						onMoveTodo={moveTodo}
						allowCrossListMove={true}
						enableGroupDrag={false}
						searchText={store.todoWorkspaceQuery}
						{targetTodoId}
						activeTodoId={activeTodoId}
						{focusTodoId}
						onFocusTitleHandled={handleFocusTitleHandled}
						{getPrimaryNoteForTodo}
						{getLinkedNotesForTodo}
						{getLinkedGoalIndicesForTodo}
						onUpsertPrimaryNote={upsertPrimaryNoteForTodo}
						onClearHighlight={clearHighlight}
					/>
				{:else}
					<TodoList
						groups={goalGroups}
						{allGoals}
						onAddToGroup={(group) => addTodo(group.goalIndex)}
						onUpdate={updateTodo}
						onDelete={deleteTodo}
						onToggleStatus={cycleTodoStatus}
						onCreateNext={(todoId, group) => createNextTodo(todoId, group.goalIndex)}
						onDeletePrevious={(todoId, group) => deleteAndFocusPrevious(todoId, group.goalIndex)}
						onMakeSubtask={(todoId, group) => makeSubtask(todoId, group.goalIndex)}
						onOutdent={(todoId) => outdentTodo(todoId)}
						onTitleFocus={setHighlightedTaskId}
						getIndentLevel={(todoId, group) => getIndentLevel(todoId, group.todos)}
						canIndent={(todoId, group) => canIndentTodo(todoId, group.goalIndex)}
						canOutdent={(todoId) => canOutdentTodo(todoId)}
						disableAutoFocus={hasNoCustomTitle || isEditingGoal}
						onCreateTodo={createTodoFromComposer}
						onMoveTodo={moveTodo}
						allowCrossListMove={false}
						enableGroupDrag={false}
						searchText={store.todoWorkspaceQuery}
						{targetTodoId}
						activeTodoId={activeTodoId}
						{focusTodoId}
						onFocusTitleHandled={handleFocusTitleHandled}
						{getPrimaryNoteForTodo}
						{getLinkedNotesForTodo}
						{getLinkedGoalIndicesForTodo}
						onUpsertPrimaryNote={upsertPrimaryNoteForTodo}
						onClearHighlight={clearHighlight}
					/>
				{/if}
			{/if}
		{:else}
		<div class="md:hidden overflow-hidden">
			<div
				class="flex w-[200%] transition-transform duration-300 ease-out"
				style={`transform: translateX(${mobileMenuOpen ? '0%' : '-50%'});`}
			>
				<div class="w-1/2 pr-4">
				<div class="h-[calc(100vh-8rem)] overflow-y-auto px-2 pt-2 pb-3">
					<h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">TASKS</h2>
					<div class="relative ml-2 border-l border-slate-200/50 pl-2 dark:border-slate-700/40 space-y-0.5">
						<a
							href="/todo"
							onclick={() => (mobileMenuOpen = false)}
							class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-500/10 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200"
						>
							<span>All Tasks</span>
							<span class="text-xs opacity-50">{todos.filter((t) => !t.isDraft && t.status !== 'done').length}</span>
						</a>
						{#each goalMenuItems as item (item.id)}
							<a
								href={item.href}
								onclick={() => (mobileMenuOpen = false)}
								class={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition ${
									item.goalIndex === goalIndex
										? 'bg-violet-500/20 text-violet-800 dark:bg-violet-500/25 dark:text-violet-200'
										: 'text-slate-700 hover:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-white/5'
								}`}
								aria-current={item.goalIndex === goalIndex ? 'page' : undefined}
							>
								<span class="truncate pr-3">{item.label}</span>
								<span class="text-xs opacity-50">{item.count}</span>
							</a>
						{/each}
					</div>
				</div>
				</div>

				<div class="w-1/2 pl-2">
					{#if !dataLoaded}
						<div class="flex items-center justify-center py-12">
							<div class="goal-loading-message">Loading...</div>
						</div>
					{:else if goalIndex === null}
						<div class="flex items-center justify-center py-12">
							<div class="goal-loading-message">Invalid goal. Redirecting...</div>
						</div>
					{:else}
						{#if !todoDesktopLayout}
						<div class="mb-6">
							<div class="mb-4 flex items-start justify-between gap-4">
								<div class="flex-1">
									{#if isEditingGoal}
										<div class="space-y-3">
											<input
												type="text"
												bind:this={goalTitleInputElement}
												bind:value={editedGoalTitle}
												class="!text-2xl font-bold"
												placeholder="Goal title"
												onkeydown={(e) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														saveGoalEdit();
													} else if (e.key === 'Escape') {
														e.preventDefault();
														cancelGoalEdit();
													} else if (e.key === 'Tab' && !e.shiftKey && !editedGoalDescription) {
														e.preventDefault();
														setTimeout(() => {
															if (goalDescriptionTextareaElement) goalDescriptionTextareaElement.focus();
														}, 0);
													}
												}}
											/>
											<textarea
												bind:this={goalDescriptionTextareaElement}
												bind:value={editedGoalDescription}
												class="!min-h-[6rem] resize-none"
												placeholder="Add description (supports markdown)..."
												onkeydown={(e) => {
													if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
														e.preventDefault();
														saveGoalEdit();
													} else if (e.key === 'Escape') {
														e.preventDefault();
														cancelGoalEdit();
													}
												}}
											></textarea>
										</div>
									{:else}
										<button
											type="button"
											onclick={startEditingGoal}
											class="text-left w-full cursor-pointer group"
										>
											<h1 class="goal-header-title">
												{goalLabel || indexToNomenclature(goalIndex)}
											</h1>
											{#if goalMarkdown}
												<div class="markdown mt-2 text-sm leading-relaxed transition-colors">
													{@html renderMarkdown(goalMarkdown)}
												</div>
											{:else}
												<div class="goal-header-placeholder">
													Click to add description...
												</div>
											{/if}
										</button>
									{/if}
								</div>
								<div class="flex shrink-0 flex-col items-end gap-2">
									<div class="flex gap-1">
										{#each goalColors as color}
											<button
												type="button"
												class="goal-color-button {selectedColor === color.value
													? 'goal-color-selected'
													: 'goal-color-unselected'} {color.preview || 'goal-color-default-bg'}"
												title={color.label}
												onclick={() => updateGoalColor(color.value)}
											></button>
										{/each}
									</div>
									<label class="flex cursor-pointer select-none items-center gap-1.5 text-sm text-slate-300">
										<input
											type="checkbox"
											bind:checked={showCompleted}
											class="h-3.5 w-3.5 rounded border text-violet-600 focus:ring-2 focus:ring-violet-500/50"
										/>
										<span>Show completed</span>
									</label>
								</div>
							</div>
						<div class="mb-4 flex flex-wrap items-center gap-2">
							<div class="ml-auto flex items-center gap-2">
								{#if isEditingGoal}
									<button
										type="button"
										onclick={clearGoal}
										class="rounded-md border px-2 py-1.5 text-sm font-semibold shadow-sm transition hover:border-rose-500 hover:bg-rose-900/40 hover:text-rose-200"
										title="Clear goal name and description"
									>
										<Trash2 class="w-4 h-4" />
									</button>
									<button
										type="button"
										onclick={saveGoalEdit}
										class="rounded-md border border-violet-600/70 bg-violet-600/90 px-4 py-1.5 text-sm font-semibold text-black shadow-sm transition hover:bg-violet-500"
									>
										Save
									</button>
									<button
										type="button"
										onclick={cancelGoalEdit}
										class="todo-desktop-cancel"
									>
										Cancel
									</button>
								{/if}
							</div>
						</div>
						<div class="mb-4 flex items-center gap-6 border-b border-slate-300/70 dark:border-slate-700/60">
							<button
								type="button"
								onclick={() => (activeGoalTab = 'tasks')}
								class={`goal-tab ${activeGoalTab === 'tasks' ? 'goal-tab-active' : ''}`}
							>
								<span>Tasks</span>
								<span class="goal-tab-count">{goalTasksCount}</span>
							</button>
							<button
								type="button"
								onclick={() => (activeGoalTab = 'notes')}
								class={`goal-tab ${activeGoalTab === 'notes' ? 'goal-tab-active' : ''}`}
							>
								<span>Notes</span>
								<span class="goal-tab-count">{associatedGoalNotes.length}</span>
							</button>
						</div>
					</div>
						{#if activeGoalTab === 'tasks'}
							<TodoList
								groups={goalGroups}
								{allGoals}
								onAddToGroup={(group) => addTodo(group.goalIndex)}
								onUpdate={updateTodo}
								onDelete={deleteTodo}
								onToggleStatus={cycleTodoStatus}
								onCreateNext={(todoId, group) => createNextTodo(todoId, group.goalIndex)}
								onDeletePrevious={(todoId, group) => deleteAndFocusPrevious(todoId, group.goalIndex)}
								onMakeSubtask={(todoId, group) => makeSubtask(todoId, group.goalIndex)}
								onOutdent={(todoId) => outdentTodo(todoId)}
								onTitleFocus={setHighlightedTaskId}
								getIndentLevel={(todoId, group) => getIndentLevel(todoId, group.todos)}
								canIndent={(todoId, group) => canIndentTodo(todoId, group.goalIndex)}
								canOutdent={(todoId) => canOutdentTodo(todoId)}
								disableAutoFocus={hasNoCustomTitle || isEditingGoal}
								onCreateTodo={createTodoFromComposer}
								onMoveTodo={moveTodo}
								allowCrossListMove={false}
								enableGroupDrag={false}
								searchText={store.todoWorkspaceQuery}
							{targetTodoId}
							activeTodoId={activeTodoId}
							{focusTodoId}
							onFocusTitleHandled={handleFocusTitleHandled}
							{getPrimaryNoteForTodo}
							{getLinkedNotesForTodo}
							{getLinkedGoalIndicesForTodo}
							onUpsertPrimaryNote={upsertPrimaryNoteForTodo}
							onClearHighlight={clearHighlight}
						/>
					{:else}
						<div class="space-y-3">
							<div class="mb-4">
									<button
										type="button"
										onclick={() => createNoteFromComposer()}
										class="rounded-btn w-full"
									>
										+ New note
									</button>
								</div>
								{#if associatedGoalNotes.length === 0}
									<div class="todo-empty-section-card">
										<p class="todo-empty-section-text">No notes linked to this goal yet.</p>
									</div>
								{:else}
									{#each associatedGoalNotes as note (note.id)}
										<a
											href={`/notes/${indexToNomenclature(goalIndex)}`}
											onclick={() => (store.pendingSelectNoteId = note.id)}
											class="block rounded-md border border-slate-700/70 p-3 transition hover:border-violet-500/50 hover:bg-violet-500/10"
										>
											<div class="text-sm font-semibold">{getNoteTitle(note.content)}</div>
											<div class="mt-1 line-clamp-2 text-xs text-slate-400">{note.content}</div>
										</a>
									{/each}
								{/if}
							</div>
						{/if}
						{/if}
					{/if}
				</div>
			</div>
		</div>
		{/if}
	</div>
</div>
