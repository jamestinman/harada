<script>
	import { onMount, tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import {
		indexToNomenclature,
		canonicalGoalIndex,
		defaultTodo,
		normalizeTodoListMeta,
		buildGoalListMeta,
		buildCustomListMeta,
		getNoteTitle,
		buildFeedPinnedRows,
		buildAllTasksFeed,
		filterDisplayGoalIndices,
		NO_GOAL_PSEUDO_INDEX,
		PINNED_GOAL_INDEX,
		taskHasRealGoalMembership,
		buildTaskNoteIndexMaps,
		resolveTopOrderingForNewTodo,
		executeTodoMove,
		getGoalViewIndentLevel
	} from '$lib/todoUtils.js';
	import TodoList from '$components/TodoList.svelte';
	import TodoSidebarNav from '$components/TodoSidebarNav.svelte';
	import WorkspaceToolbar from '$components/WorkspaceToolbar.svelte';
	import { navComposerHandlers } from '$stores/navComposerHandlers.svelte.js';
	import {
		persistTodoMobileSidebar,
		readTodoMobileSidebarOpen,
		isWorkspaceNarrowLayout
	} from '$lib/workspaceNavResume.js';

	let activeMainFeed = $state('todos');
	let initialTodoListReady = $state(false);
	let isNarrowLayout = $state(false);

  // Todos are normalized on load/mutation in the store
	const grid = $derived(store.harada_chart.grid);
	const todos = $derived(store.harada_chart.todos);
	const notes = $derived(store.notes);
	const noteTaskLinks = $derived(store.noteTaskLinks);
	const taskGoalLinks = $derived(store.taskGoalLinks);
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
	const todoListReady = $derived(initialTodoListReady && dataLoaded);
	const targetTodoId = $derived(page.url.searchParams.get('task') || null);
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

	// Clear currentGoalIndex when on the all tasks page
	$effect(() => {
		if (dataLoaded) {
			store.currentGoalIndex = null;
		}
	});

	// Helper functions
	function getGoalIndices() {
		return Array.from({ length: 81 }, (_, i) => i);
	}

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

	function getGoalGroupOrdering(goalIndex) {
		const cell = grid[goalIndex];
		if (typeof cell?.todo_group_ordering === 'number' && Number.isFinite(cell.todo_group_ordering)) {
			return cell.todo_group_ordering;
		}
		return (goalIndex + 1) * GOAL_GROUP_ORDER_STEP;
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
		for (const id of updates.keys()) store.registerTodoMutation(id);
	}

	function getVisibleGoalGroupsByOrdering() {
		return tasksFeed.goalGroups;
	}

	function normalizeGoalGroupOrderings(groups) {
		const nextGrid = [...store.harada_chart.grid];
		groups.forEach((group, index) => {
			const goalIndex = group.goalIndex;
			if (!nextGrid[goalIndex]) {
				nextGrid[goalIndex] = {
					text: '',
					status: 'todo',
					readme: '',
					color: 'default',
					updated_at: null
				};
			}
			nextGrid[goalIndex] = {
				...nextGrid[goalIndex],
				todo_group_ordering: (index + 1) * GOAL_GROUP_ORDER_STEP
			};
		});
		store.harada_chart.grid = nextGrid;
	}

	function getGoalGroupOrderingAfter(groups, afterGoalIndex) {
		if (!afterGoalIndex && afterGoalIndex !== 0) {
			if (groups.length === 0) return GOAL_GROUP_ORDER_STEP;
			return groups[0].goalOrdering - GOAL_GROUP_ORDER_STEP;
		}

		const currentIndex = groups.findIndex((group) => group.goalIndex === afterGoalIndex);
		if (currentIndex === -1) return GOAL_GROUP_ORDER_STEP;
		const currentOrdering = groups[currentIndex].goalOrdering;
		const nextGroup = groups[currentIndex + 1];
		if (!nextGroup) return currentOrdering + GOAL_GROUP_ORDER_STEP;
		const nextOrdering = nextGroup.goalOrdering;
		if (nextOrdering - currentOrdering <= 1) {
			normalizeGoalGroupOrderings(groups);
			return getGoalGroupOrderingAfter(getVisibleGoalGroupsByOrdering(), afterGoalIndex);
		}
		return currentOrdering + (nextOrdering - currentOrdering) / 2;
	}

	function moveGoalGroup(draggedGroupId, targetGroupId, dropMode) {
		if (!draggedGroupId || !targetGroupId || draggedGroupId === targetGroupId) return;
		const draggedGoalIndex = Number(draggedGroupId.replace('goal-', ''));
		const targetGoalIndex = Number(targetGroupId.replace('goal-', ''));
		if (Number.isNaN(draggedGoalIndex) || Number.isNaN(targetGoalIndex)) return;

		const visibleGoalGroups = getVisibleGoalGroupsByOrdering();
		const withoutDragged = visibleGoalGroups.filter((group) => group.goalIndex !== draggedGoalIndex);
		const targetIndex = withoutDragged.findIndex((group) => group.goalIndex === targetGoalIndex);
		if (targetIndex === -1) return;

		const previousIndex = dropMode === 'before' ? targetIndex - 1 : targetIndex;
		const previousGoalIndex = previousIndex >= 0 ? withoutDragged[previousIndex].goalIndex : null;
		const newOrdering = getGoalGroupOrderingAfter(withoutDragged, previousGoalIndex);

		const nextGrid = [...store.harada_chart.grid];
		if (!nextGrid[draggedGoalIndex]) {
			nextGrid[draggedGoalIndex] = {
				text: '',
				status: 'todo',
				readme: '',
				color: 'default',
				updated_at: null
			};
		}
		nextGrid[draggedGoalIndex] = {
			...nextGrid[draggedGoalIndex],
			todo_group_ordering: newOrdering
		};
		store.harada_chart.grid = nextGrid;
		store.registerGridMutation({ immediate: true });
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
		executeTodoMove({
			store,
			todoId,
			destination,
			todos,
			taskGoalKeySet,
			taskGoalLinks,
			getListOrderingAfter: getOrderingAfter,
			getListTopOrdering: getTopOrdering
		});
	}


	function getIndentLevel(todoId, todosList) {
		let level = 0;
		let currentId = todoId;
		const visited = new Set();
		while (currentId) {
			if (visited.has(currentId)) break;
			visited.add(currentId);
			const current = todosList.find((t) => t.id === currentId);
			if (!current || !current.parentId) break;
			level++;
			currentId = current.parentId;
		}
		return level;
	}

	function isUnassignedNoGoalTodo(t) {
		return (
			(t.listType === 'goal' || !t.listType) &&
			t.goalIndex == null &&
			!taskHasRealGoalMembership(t, taskGoalLinks)
		);
	}

	function noGoalGroupMeta() {
		const noGoal = todoGroups.find((g) => g.id === 'no-goal');
		return (
			noGoal ?? {
				id: 'no-goal',
				groupType: 'no-goal',
				goalIndex: NO_GOAL_PSEUDO_INDEX,
				label: '',
				href: null,
				addTitle: 'Add todo without goal',
				todos: []
			}
		);
	}

	function getVisibleGroupTodos(group) {
		return group?.todos ?? [];
	}

	// Get all goals for dropdown
	const goalIndices = [...new Set(getGoalIndices().map((idx) => canonicalGoalIndex(idx)))];
	const allGoals = $derived.by(() => {
		return goalIndices.map((idx) => {
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

	// Build render groups in a single O(n) pass
	const tasksFeed = $derived.by(() =>
		buildAllTasksFeed({
			todos,
			grid,
			taskGoalKeySet,
			linkedTaskIdSet,
			taskGoalLinks,
			getTodoOrdering
		})
	);
	const todoGroups = $derived(tasksFeed.todoGroups);
	const goalMenuItems = $derived(tasksFeed.goalMenuItems);
	const allTodos = $derived(tasksFeed.allTodos);
	const groupsByTodoId = $derived(tasksFeed.groupsByTodoId);

	const taskNoteIndexMaps = $derived.by(() =>
		buildTaskNoteIndexMaps(notes, noteTaskLinks, taskGoalLinks, todos)
	);

	let allTasksSearchQuery = $state('');

	const desktopGlobalSearchActive = $derived(
		!isNarrowLayout && store.todoWorkspaceQuery.trim().length > 0
	);

	const viewSearchQuery = $derived(
		isNarrowLayout || desktopGlobalSearchActive
			? store.todoWorkspaceQuery
			: allTasksSearchQuery
	);

	const allNotes = $derived.by(() => {
		const query = viewSearchQuery.trim().toLowerCase();
		const sorted = store.notes
			.filter((note) => !store.isPrimaryTaskNote(note.id))
			.sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
		if (!query) return sorted;
		return sorted.filter((note) => {
			const content = (note?.content ?? '').toLowerCase();
			const title = getNoteTitle(note?.content ?? '').toLowerCase();
			return title.includes(query) || content.includes(query);
		});
	});

	const pinnedTaskCount = $derived(store.getPinnedTaskCount());

	const feedPinnedRows = $derived(
		buildFeedPinnedRows(todos, getTodoOrdering, { taskGoalKeySet, taskGoalLinks })
	);

	const feedPinnedGroup = $derived({
		id: 'goal-pinned-feed',
		groupType: 'goal',
		goalIndex: PINNED_GOAL_INDEX,
		label: 'Pinned',
		href: '/todo/Z1',
		addTitle: 'Add pinned task',
		todos: feedPinnedRows.map((row) => row.todo)
	});

	const mobileTodoSearchActive = $derived(
		isNarrowLayout && store.todoWorkspaceQuery.trim().length > 0
	);

	let mobileMenuOpen = $state(false);
	let mobileSidebarHydrated = $state(false);
	let prevTodoWorkspaceQuery = $state('');

	onMount(() => {
		const mountStart = performance.now();
		const requestedView = page.url.searchParams.get('view');
		if (requestedView === 'notes') activeMainFeed = 'notes';

		const syncNarrowLayout = () => {
			isNarrowLayout = isWorkspaceNarrowLayout();
		};
		syncNarrowLayout();
		window.addEventListener('resize', syncNarrowLayout);

		if (isNarrowLayout && readTodoMobileSidebarOpen()) {
			mobileMenuOpen = true;
		}
		mobileSidebarHydrated = true;
		requestAnimationFrame(() => {
			initialTodoListReady = true;
		});
		return () => window.removeEventListener('resize', syncNarrowLayout);
	});

	$effect(() => {
		if (!browser || !mobileSidebarHydrated) return;
		if (!page.url.pathname.startsWith('/todo')) return;
		if (!isWorkspaceNarrowLayout()) return;
		persistTodoMobileSidebar(mobileMenuOpen);
	});

	$effect(() => {
		if (!browser) return;
		if (!isNarrowLayout) {
			store.todoMobileShowsGoalList = false;
			return;
		}
		store.todoMobileShowsGoalList = mobileMenuOpen;
	});

	$effect(() => {
		if (!browser || !isNarrowLayout) return;
		const q = store.todoWorkspaceQuery;
		const trimmed = q.trim();
		const started = !prevTodoWorkspaceQuery.trim() && trimmed;
		prevTodoWorkspaceQuery = q;
		if (started) {
			store.latchTodoMobileSearchScope(mobileMenuOpen, true);
		}
	});

	$effect(() => {
		if (!browser || !isNarrowLayout) return;
		if (!store.todoWorkspaceQuery.trim() || !mobileMenuOpen) return;
		store.latchTodoMobileSearchScope(true, true);
	});

	$effect(() => {
		if (!browser || !isNarrowLayout) return;
		if (!store.todoWorkspaceQuery.trim()) return;
		activeMainFeed = 'todos';
		mobileMenuOpen = false;
	});

	$effect(() => {
		if (!browser || !dataLoaded || !targetTodoId) return;
		activeMainFeed = 'todos';
		mobileMenuOpen = false;
		activeTodoId = targetTodoId;
	});

	afterNavigate(() => {
		if (!browser || !dataLoaded) return;
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

	let lastTodoSidebarPulseSynced = $state(-1);

	$effect(() => {
		const pulse = store.todoSidebarPulse;
		const path = (page.url.pathname || '/').replace(/\/+$/, '') || '/';
		if (path !== '/todo') {
			lastTodoSidebarPulseSynced = pulse;
			return;
		}
		if (lastTodoSidebarPulseSynced < 0) {
			lastTodoSidebarPulseSynced = pulse;
			return;
		}
		if (pulse !== lastTodoSidebarPulseSynced) {
			lastTodoSidebarPulseSynced = pulse;
			mobileMenuOpen = true;
		}
	});



	// Todo management
	function updateTodo(id, patch) {
		store.updateTodo(id, patch);
	}

	function deleteTodo(id) {
		store.deleteTodo(id);
	}

	function cycleTodoStatus(id) {
		store.cycleTodoStatus(id);
	}

	function addTodoForGoal(goalIndex, title = '') {
		const listMeta = buildGoalListMeta(goalIndex);
		const todo = {
			...defaultTodo(),
			...listMeta,
			parentId: null,
			ordering: resolveTopOrderingForNewTodo(todos, listMeta, {
				taskGoalKeySet,
				linkedTaskIdSet,
				taskGoalLinks
			}),
			title
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];

		if (goalIndex == null) {
			store.ensureNoGoalTaskLink(todo.id, { ordering: todo.ordering, parentId: null });
		}

		if (typeof goalIndex === 'number') {
			store.bumpGoalAfterTodoActivity(goalIndex);
		}

		// Set active todo ID so it gets focused
		activeTodoId = todo.id;
		store.registerTodoMutation(todo.id, { immediate: true });
		return todo;
	}

	function addTodoToCustomList(listId, listName, title = '', markdown = '') {
		const customListMeta = buildCustomListMeta(listName);
		const todo = {
			...defaultTodo(),
			title,
			markdown,
			...customListMeta,
			listId,
			parentId: null,
			ordering: resolveTopOrderingForNewTodo(todos, customListMeta, {
				taskGoalKeySet,
				taskGoalLinks
			})
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];
		activeTodoId = todo.id;
		store.registerTodoMutation(todo.id, { immediate: true });
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

	function submitQuickAddAllTasksTask() {
		const title = allTasksSearchQuery.trim();
		if (!title) return;
		allTasksSearchQuery = '';
		createTodoFromComposer({ title, shouldNavigate: false });
	}

	function createTodoFromComposer({ title, markdown, goalIndex, listType, listName, shouldNavigate = true } = {}) {
		// Handle case when called without parameters (from "+ New Task" button)
		// Add to no-goal list when not on a specific goal page
		if (!title && !markdown && goalIndex === undefined && !listType && !listName) {
			const created = addTodoForGoal(null, '');
			if (created && shouldNavigate) navigateToNewTask(created);
			return;
		}
		
		if (listType === 'custom' || (listName && listName.trim())) {
			const customMeta = buildCustomListMeta(listName);
			const created = addTodoToCustomList(customMeta.listId, customMeta.listName, title || '', '');
			if (created && markdown?.trim()) {
				store.setPrimaryNoteForTask(created.id, { content: markdown.trim() });
			}
			if (created && shouldNavigate) navigateToNewTask(created);
			return;
		}
		const normalizedGoalIndex =
			typeof goalIndex === 'number' ? canonicalGoalIndex(goalIndex) : null;
		// Allow null goalIndex for no-goal todos
		const created = addTodoForGoal(normalizedGoalIndex, title || '');
		if (created && markdown?.trim()) {
			store.setPrimaryNoteForTask(created.id, { content: markdown.trim(), goalIndex: normalizedGoalIndex });
		}
		if (created && shouldNavigate) navigateToNewTask(created);
	}

	function createNoteFromComposer(content = '') {
		const note = store.createNote({ content });
		store.pendingSelectNoteId = note.id;
		goto('/notes');
	}

	function openNote(noteId) {
		if (!noteId) return;
		store.pendingSelectNoteId = noteId;
		goto('/notes');
	}

	function getNotePreview(content = '') {
		return content
			.replace(/\s+/g, ' ')
			.replace(/^#+\s*/g, '')
			.trim();
	}

	function formatUpdatedAt(timestamp) {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const now = new Date();
		const msPerDay = 86400000;
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const noteDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const daysDiff = Math.round((today.getTime() - noteDay.getTime()) / msPerDay);
		if (daysDiff === 0) {
			return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		} else if (daysDiff < 7) {
			return date.toLocaleDateString(undefined, { weekday: 'long' });
		} else if (date.getFullYear() === now.getFullYear()) {
			return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		} else {
			return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
		}
	}

	function getNoteGoalLabel(noteId) {
		const link = store.noteGoalLinks?.find((l) => l.noteId === noteId);
		if (!link) return null;
		const cell = grid[link.goalIndex];
		return (cell?.text ?? '').trim() || indexToNomenclature(link.goalIndex);
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
		const maybeGoalIndex = group?.groupType === 'goal' ? group.goalIndex : null;
		store.setPrimaryNoteForTask(todoId, { content, goalIndex: maybeGoalIndex });
	}

	$effect(() => {
		navComposerHandlers.onCreateTodo = createTodoFromComposer;
		navComposerHandlers.onCreateNote = createNoteFromComposer;
		return () => navComposerHandlers.clear();
	});

	function createNextTodo(currentTodoId, group, instanceContext = null) {
		const currentTodo = store.harada_chart.todos.find((t) => t.id === currentTodoId);
		if (!currentTodo) return null;
		const normalizedCurrentTodo = normalizeTodoListMeta(currentTodo);
		const isPinnedDuplicateInstance = instanceContext?.renderedInstance === 'pinned-duplicate';
		const targetMeta = isPinnedDuplicateInstance
			? buildGoalListMeta(null)
			: {
					listType: normalizedCurrentTodo.listType,
					listId: normalizedCurrentTodo.listId,
					listName: normalizedCurrentTodo.listName || null,
					goalIndex: normalizedCurrentTodo.goalIndex
				};
		const targetListId = targetMeta.listId;
		const targetParentId = isPinnedDuplicateInstance
			? null
			: (normalizedCurrentTodo.parentId ?? null);
		const newOrdering = getOrderingAfter(targetListId, targetParentId, currentTodoId);
		
		// Create new todo
		const newTodo = {
			...defaultTodo(),
			goalIndex: targetMeta.goalIndex,
			listType: targetMeta.listType,
			listId: targetMeta.listId,
			listName: targetMeta.listName,
			parentId: targetParentId,
			ordering: newOrdering
		};

		store.harada_chart.todos = [...store.harada_chart.todos, newTodo];
		activeTodoId = newTodo.id;
		requestTaskFocus(newTodo.id);

		if (targetMeta.goalIndex == null && targetMeta.listType !== 'custom') {
			store.ensureNoGoalTaskLink(newTodo.id, { ordering: newOrdering, parentId: targetParentId });
		}

		if (typeof targetMeta.goalIndex === 'number') {
			store.bumpGoalAfterTodoActivity(targetMeta.goalIndex);
		}

		store.registerTodoMutation(newTodo.id, { immediate: true });

		return newTodo;
	}

	function makeSubtask(currentTodoId, group) {
		const groupTodosList = getVisibleGroupTodos(group);
		const currentIndex = groupTodosList.findIndex((t) => t.id === currentTodoId);
		if (currentIndex <= 0) return;
		const currentTodo = store.harada_chart.todos.find((t) => t.id === currentTodoId);
		const previousTodo = groupTodosList[currentIndex - 1];
		if (!currentTodo || !previousTodo) return;
		if (currentTodo.parentId === previousTodo.id) return;
		updateTodo(currentTodoId, { parentId: previousTodo.id });
	}

	function outdentTodo(currentTodoId) {
		const currentTodo = store.harada_chart.todos.find((t) => t.id === currentTodoId);
		if (!currentTodo || !currentTodo.parentId) return;
		const parentTodo = store.harada_chart.todos.find((t) => t.id === currentTodo.parentId);
		if (!parentTodo) return;
		updateTodo(currentTodoId, { parentId: parentTodo.parentId || null });
	}

	function canIndentTodo(todoId, group) {
		const groupTodosList = getVisibleGroupTodos(group);
		const currentIndex = groupTodosList.findIndex((t) => t.id === todoId);
		if (currentIndex <= 0) return false;
		const currentTodo = store.harada_chart.todos.find((t) => t.id === todoId);
		const previousTodo = groupTodosList[currentIndex - 1];
		if (!currentTodo || !previousTodo) return false;
		return currentTodo.parentId !== previousTodo.id;
	}

	function canOutdentTodo(todoId) {
		const currentTodo = store.harada_chart.todos.find((t) => t.id === todoId);
		return Boolean(currentTodo?.parentId);
	}

	function deleteAndFocusPrevious(currentTodoId, group) {
		const goalTodosList = getVisibleGroupTodos(group);
		
		// Find the current todo's index in the goal todos
		const currentIndex = goalTodosList.findIndex((t) => t.id === currentTodoId);
		
		// Delete the current todo
		deleteTodo(currentTodoId);
		
		if (currentIndex > 0) {
			const previousTodo = goalTodosList[currentIndex - 1];
			if (previousTodo) requestTaskFocus(previousTodo.id);
		}
	}
</script>

<svelte:head>
	<title>All Tasks - Haradato</title>
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

		{#if !isNarrowLayout}
		<div class="grid gap-8 grid-cols-[18rem_minmax(0,1fr)]">
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
				<TodoSidebarNav
					{goalMenuItems}
					allTasksCount={allTodos.length}
					pinnedCount={pinnedTaskCount}
					showAllTasksActive={activeMainFeed === 'todos'}
					onAllTasksClick={() => (activeMainFeed = 'todos')}
				/>
			</aside>

			<div class="min-w-0">
				{#if !desktopGlobalSearchActive}
					<div class="mb-6">
						<WorkspaceToolbar
							mode="desktop"
							inputMode="quickAdd"
							bind:quickAddText={allTasksSearchQuery}
							onQuickAdd={submitQuickAddAllTasksTask}
							composeTabDefault="task"
						/>
					</div>
				{/if}
				{#if activeMainFeed === 'todos'}
					{#if !desktopGlobalSearchActive}
						<p class="page-subtitle mb-6">
							{allTodos.length} todo{allTodos.length !== 1 ? 's' : ''} across {todoGroups.filter((g) => g.id !== 'no-goal').length} goal{todoGroups.filter((g) => g.id !== 'no-goal').length !== 1 ? 's' : ''}
						</p>
					{/if}
					{#if todoListReady}
						<TodoList
							groups={todoGroups}
							isMainTodoFeed={true}
							{feedPinnedRows}
							{feedPinnedGroup}
							{allGoals}
							onUpdate={updateTodo}
							onDelete={deleteTodo}
							onToggleStatus={cycleTodoStatus}
							onCreateNext={createNextTodo}
							onDeletePrevious={deleteAndFocusPrevious}
							onMakeSubtask={makeSubtask}
							onOutdent={(todoId) => outdentTodo(todoId)}
							onTitleFocus={setHighlightedTaskId}
							getIndentLevel={(todoId, group) =>
								typeof group?.goalIndex === 'number'
									? getGoalViewIndentLevel(todoId, group.goalIndex, group.todos, taskGoalLinks)
									: getIndentLevel(todoId, group.todos)}
							canIndent={canIndentTodo}
							canOutdent={(todoId) => canOutdentTodo(todoId)}
							onCreateTodo={createTodoFromComposer}
							onMoveTodo={moveTodo}
							useGoalViewOrdering={true}
							{taskGoalLinks}
							{taskGoalKeySet}
							allowCrossListMove={true}
							enableGroupDrag={true}
							onMoveGroup={moveGoalGroup}
							searchText={viewSearchQuery}
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
					<div class="todo-panel p-6 text-sm text-slate-700 dark:text-slate-300">
						{dataLoaded ? 'Preparing task list...' : 'Loading tasks...'}
					</div>
					{/if}
				{:else}
					<p class="page-subtitle mb-6">
						{allNotes.length} note{allNotes.length !== 1 ? 's' : ''}, newest first
					</p>
					{#if allNotes.length === 0}
						<div class="todo-panel p-6 text-sm text-slate-700 dark:text-slate-300">No notes match this view.</div>
					{:else}
						<div class="space-y-0.5">
							{#each allNotes as note (note.id)}
								<button
									type="button"
									onclick={() => openNote(note.id)}
									class="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-500/10 dark:hover:bg-white/5"
								>
									<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{getNoteTitle(note.content)}</p>
									<div class="flex items-baseline gap-1.5 mt-0.5">
										<span class="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatUpdatedAt(note.updatedAt)}</span>
										<span class="truncate text-xs text-slate-500 dark:text-slate-400">{getNotePreview(note.content) || 'No content yet'}</span>
									</div>
									{#if getNoteGoalLabel(note.id)}
										<p class="truncate text-xs text-slate-400 dark:text-slate-500 mt-0.5">{getNoteGoalLabel(note.id)}</p>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>

		{:else if mobileTodoSearchActive}
			{#if activeMainFeed === 'todos'}
				{#if todoListReady}
					<TodoList
						groups={todoGroups}
						isMainTodoFeed={true}
						{feedPinnedRows}
						{feedPinnedGroup}
						{allGoals}
						onUpdate={updateTodo}
						onDelete={deleteTodo}
						onToggleStatus={cycleTodoStatus}
						onCreateNext={createNextTodo}
						onDeletePrevious={deleteAndFocusPrevious}
						onMakeSubtask={makeSubtask}
						onOutdent={(todoId) => outdentTodo(todoId)}
						onTitleFocus={setHighlightedTaskId}
						getIndentLevel={(todoId, group) =>
							typeof group?.goalIndex === 'number'
								? getGoalViewIndentLevel(todoId, group.goalIndex, group.todos, taskGoalLinks)
								: getIndentLevel(todoId, group.todos)}
						canIndent={canIndentTodo}
						canOutdent={(todoId) => canOutdentTodo(todoId)}
						onCreateTodo={createTodoFromComposer}
						onMoveTodo={moveTodo}
						useGoalViewOrdering={true}
						{taskGoalLinks}
						{taskGoalKeySet}
						allowCrossListMove={true}
						enableGroupDrag={true}
						onMoveGroup={moveGoalGroup}
						searchText={viewSearchQuery}
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
					<div class="todo-panel p-4 text-sm text-slate-700 dark:text-slate-300">
						{dataLoaded ? 'Preparing task list...' : 'Loading tasks...'}
					</div>
				{/if}
			{:else}
				<p class="page-subtitle mb-4">
					{allNotes.length} note{allNotes.length !== 1 ? 's' : ''}, newest first
				</p>
				{#if allNotes.length === 0}
					<div class="todo-panel p-4 text-sm text-slate-700 dark:text-slate-300">No notes match this view.</div>
				{:else}
					<div class="space-y-0.5">
						{#each allNotes as note (note.id)}
							<button
								type="button"
								onclick={() => openNote(note.id)}
								class="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-500/10 dark:hover:bg-white/5"
							>
								<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{getNoteTitle(note.content)}</p>
								<div class="flex items-baseline gap-1.5 mt-0.5">
									<span class="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatUpdatedAt(note.updatedAt)}</span>
									<span class="truncate text-xs text-slate-500 dark:text-slate-400">{getNotePreview(note.content) || 'No content yet'}</span>
								</div>
								{#if getNoteGoalLabel(note.id)}
									<p class="truncate text-xs text-slate-400 dark:text-slate-500 mt-0.5">{getNoteGoalLabel(note.id)}</p>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		{:else}
		<div class="overflow-hidden">
			<div
				class="flex w-[200%] transition-transform duration-300 ease-out"
				style={`transform: translateX(${mobileMenuOpen ? '0%' : '-50%'});`}
			>
				<div class="w-1/2 pr-4">
				<div class="h-[calc(100vh-8rem)] overflow-y-auto px-2 pt-2 pb-3">
					<h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">TASKS</h2>
					<TodoSidebarNav
						{goalMenuItems}
						allTasksCount={allTodos.length}
						pinnedCount={pinnedTaskCount}
						showAllTasksActive={activeMainFeed === 'todos'}
						onAllTasksClick={() => {
							activeMainFeed = 'todos';
							mobileMenuOpen = false;
						}}
						onGoalClick={() => (mobileMenuOpen = false)}
					/>
				</div>
				</div>

				<div class="w-1/2 pl-2">
					{#if activeMainFeed === 'todos'}
						<p class="page-subtitle mb-4">
							{allTodos.length} todo{allTodos.length !== 1 ? 's' : ''} across {todoGroups.filter((g) => g.id !== 'no-goal').length} goal{todoGroups.filter((g) => g.id !== 'no-goal').length !== 1 ? 's' : ''}
						</p>
						{#if todoListReady}
							<TodoList
								groups={todoGroups}
								isMainTodoFeed={true}
								{feedPinnedRows}
								{feedPinnedGroup}
								{allGoals}
								onUpdate={updateTodo}
								onDelete={deleteTodo}
								onToggleStatus={cycleTodoStatus}
								onCreateNext={createNextTodo}
								onDeletePrevious={deleteAndFocusPrevious}
								onMakeSubtask={makeSubtask}
								onOutdent={(todoId) => outdentTodo(todoId)}
								onTitleFocus={setHighlightedTaskId}
								getIndentLevel={(todoId, group) =>
								typeof group?.goalIndex === 'number'
									? getGoalViewIndentLevel(todoId, group.goalIndex, group.todos, taskGoalLinks)
									: getIndentLevel(todoId, group.todos)}
								canIndent={canIndentTodo}
								canOutdent={(todoId) => canOutdentTodo(todoId)}
								onCreateTodo={createTodoFromComposer}
								onMoveTodo={moveTodo}
								useGoalViewOrdering={true}
								{taskGoalLinks}
								{taskGoalKeySet}
								allowCrossListMove={true}
								enableGroupDrag={true}
								onMoveGroup={moveGoalGroup}
								searchText={viewSearchQuery}
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
						<div class="todo-panel p-4 text-sm text-slate-700 dark:text-slate-300">
							{dataLoaded ? 'Preparing task list...' : 'Loading tasks...'}
						</div>
						{/if}
					{:else}
						<p class="page-subtitle mb-4">
							{allNotes.length} note{allNotes.length !== 1 ? 's' : ''}, newest first
						</p>
						{#if allNotes.length === 0}
							<div class="todo-panel p-4 text-sm text-slate-700 dark:text-slate-300">No notes match this view.</div>
						{:else}
							<div class="space-y-0.5">
								{#each allNotes as note (note.id)}
									<button
										type="button"
										onclick={() => openNote(note.id)}
										class="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-500/10 dark:hover:bg-white/5"
									>
										<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{getNoteTitle(note.content)}</p>
										<div class="flex items-baseline gap-1.5 mt-0.5">
											<span class="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatUpdatedAt(note.updatedAt)}</span>
											<span class="truncate text-xs text-slate-500 dark:text-slate-400">{getNotePreview(note.content) || 'No content yet'}</span>
										</div>
										{#if getNoteGoalLabel(note.id)}
											<p class="truncate text-xs text-slate-400 dark:text-slate-500 mt-0.5">{getNoteGoalLabel(note.id)}</p>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>
		{/if}
	</div>
</div>
