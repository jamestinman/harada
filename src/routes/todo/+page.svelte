<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
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
		getNoteTitle
	} from '$lib/todoUtils.js';
	import TodoList from '$components/TodoList.svelte';
	import WorkspaceToolbar from '$components/WorkspaceToolbar.svelte';
	import { navComposerHandlers } from '$stores/navComposerHandlers.svelte.js';
	import {
		persistTodoMobileSidebar,
		readTodoMobileSidebarOpen,
		isWorkspaceNarrowLayout
	} from '$lib/workspaceNavResume.js';

	let searchText = $state('');
	let activeMainFeed = $state('todos');

  // Use store.harada_chart directly - it's reactive
	const grid = $derived(store.harada_chart.grid);
	const todos = $derived(store.harada_chart.todos.map((todo) => normalizeTodoListMeta(todo)));
	const dataLoaded = $derived(!store.isBootstrapping);
	let activeTodoId = $state(null);

	// Clear currentGoalIndex when on the all todos page
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
	}

	function getVisibleGoalGroupsByOrdering() {
		return goalIndices
			.map((goalIndex) => {
				const cell = grid[goalIndex];
				return {
					id: `goal-${goalIndex}`,
					groupType: 'goal',
					goalIndex,
					label: getGoalLabelFromIndex(goalIndex),
					href: `/todo/${indexToNomenclature(goalIndex)}`,
					addTitle: 'Add todo to this goal',
					todos: getVisibleGoalTodos(goalIndex),
					goalOrdering: getGoalGroupOrdering(goalIndex),
					updated_at: cell?.updated_at || null
				};
			})
			.filter((group) => group.todos.length > 0)
			.sort((a, b) => {
				if (a.goalOrdering !== b.goalOrdering) {
					return a.goalOrdering - b.goalOrdering;
				}
				return a.goalIndex - b.goalIndex;
			});
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
		store.saveNow();
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

	function organizeTodosWithHierarchy(todosList) {
		const byParent = new Map();
		for (const todo of todosList) {
			const parentKey = todo.parentId ?? '__root__';
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

	function getVisibleGoalTodos(goalIndex) {
		const filtered = todos.filter(
			(t) =>
				(t.listType === 'goal' || !t.listType) &&
				t.goalIndex === goalIndex &&
				t.status !== 'done'
		);
		return organizeTodosWithHierarchy(filtered);
	}

	function getVisibleCustomListTodos(listId) {
		const filtered = todos.filter(
			(t) => t.listType === 'custom' && t.listId === listId && t.status !== 'done'
		);
		return organizeTodosWithHierarchy(filtered);
	}

	function getVisibleGroupTodos(group) {
		if (group?.groupType === 'custom') return getVisibleCustomListTodos(group.listId);
		if (group?.groupType === 'no-goal') return getVisibleGoalTodos(null);
		return getVisibleGoalTodos(group?.goalIndex ?? null);
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

	// Build render groups (unassigned first, then goals with todos)
	const todoGroups = $derived.by(() => {
		const unassignedTodos = getVisibleGoalTodos(null);
		const customListMap = new Map();
		todos.forEach((todo) => {
			if (todo.listType !== 'custom' || todo.status === 'done') return;
			if (!customListMap.has(todo.listId)) {
				customListMap.set(todo.listId, todo.listName || 'New list');
			}
		});
		const customGroups = Array.from(customListMap.entries()).map(([listId, listName]) => ({
			id: listId,
			groupType: 'custom',
			goalIndex: null,
			listId,
			label: listName,
			href: null,
			addTitle: `Add todo to ${listName}`,
			todos: getVisibleCustomListTodos(listId)
		}));
		const goalGroups = getVisibleGoalGroupsByOrdering();

		const groups = [...goalGroups];
		if (unassignedTodos.length > 0) {
			groups.unshift({
				id: 'no-goal',
				groupType: 'no-goal',
				goalIndex: null,
				label: '',
				href: null,
				addTitle: 'Add todo without goal',
				todos: unassignedTodos
			});
		}
		return [...groups, ...customGroups];
	});

	const allTodos = $derived(
		[...todos]
			.filter((t) => t.status !== 'done')
			.sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b))
	);

	const allNotes = $derived.by(() => {
		const query = searchText.trim().toLowerCase();
		const sorted = [...store.notes].sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
		if (!query) return sorted;
		return sorted.filter((note) => {
			const content = (note?.content ?? '').toLowerCase();
			const title = getNoteTitle(note?.content ?? '').toLowerCase();
			return title.includes(query) || content.includes(query);
		});
	});

	const feedPinnedTodos = $derived.by(() =>
		todos
			.filter((t) => t.pinned === true && t.status !== 'done')
			.sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b))
	);

	let mobileMenuOpen = $state(false);
	let mobileSidebarHydrated = $state(false);

	onMount(() => {
		const requestedView = page.url.searchParams.get('view');
		if (requestedView === 'notes') activeMainFeed = 'notes';

		if (isWorkspaceNarrowLayout() && readTodoMobileSidebarOpen()) {
			mobileMenuOpen = true;
		}
		mobileSidebarHydrated = true;
	});

	$effect(() => {
		if (!browser || !mobileSidebarHydrated) return;
		if (!page.url.pathname.startsWith('/todo')) return;
		if (!isWorkspaceNarrowLayout()) return;
		persistTodoMobileSidebar(mobileMenuOpen);
	});

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

	const goalMenuItems = $derived.by(() =>
		getVisibleGoalGroupsByOrdering().map((group) => ({
			id: group.id,
			label: group.label,
			href: group.href,
			count: group.todos.length
		}))
	);

	function resolveGroupForTodo(todo) {
		const t = normalizeTodoListMeta(todo);
		for (const g of todoGroups) {
			if (g.groupType === 'custom' && t.listType === 'custom' && g.listId === t.listId) {
				return g;
			}
			if (
				g.groupType === 'no-goal' &&
				(t.listType === 'goal' || !t.listType) &&
				t.goalIndex == null
			) {
				return g;
			}
			if (
				g.groupType === 'goal' &&
				(t.listType === 'goal' || !t.listType) &&
				typeof t.goalIndex === 'number' &&
				g.goalIndex === t.goalIndex
			) {
				return g;
			}
		}
		return null;
	}

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
			ordering: getTopOrdering(listMeta.listId, null),
			title
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];

		if (typeof goalIndex === 'number') {
			store.bumpGoalAfterTodoActivity(goalIndex);
		}

		// Set active todo ID so it gets focused
		activeTodoId = todo.id;
		store.saveNow();
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
			ordering: getTopOrdering(listId, null)
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];
		activeTodoId = todo.id;
		store.saveNow();
		return todo;
	}

	function createTodoFromComposer({ title, markdown, goalIndex, listType, listName } = {}) {
		// Handle case when called without parameters (from "+ New Task" button)
		// Add to no-goal list when not on a specific goal page
		if (!title && !markdown && goalIndex === undefined && !listType && !listName) {
			addTodoForGoal(null, '');
			return;
		}
		
		if (listType === 'custom' || (listName && listName.trim())) {
			const customMeta = buildCustomListMeta(listName);
			addTodoToCustomList(customMeta.listId, customMeta.listName, title || '', markdown || '');
			return;
		}
		const normalizedGoalIndex =
			typeof goalIndex === 'number' ? canonicalGoalIndex(goalIndex) : null;
		// Allow null goalIndex for no-goal todos
		addTodoForGoal(normalizedGoalIndex, title || '');
		const created = store.harada_chart.todos[store.harada_chart.todos.length - 1];
		if (created && markdown?.trim()) {
			updateTodo(created.id, { markdown: markdown.trim() });
		}
	}

	function createNoteFromComposer(content = '') {
		store.createNote({ content });
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
		if (!timestamp) return 'just now';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(timestamp);
	}

	function getLinkedNotesForTodo(todoId) {
		return store.getNotesForTask(todoId);
	}

	function upsertLinkedNote(noteId, content) {
		store.updateNote(noteId, { content });
	}

	function createLinkedNoteForTodo(todoId, content, group) {
		const maybeGoalIndex = group?.groupType === 'goal' ? group.goalIndex : null;
		store.createLinkedTaskNote(todoId, { content, goalIndex: maybeGoalIndex });
	}

	function removeLinkedNoteFromTodo(todoId, noteId) {
		store.unlinkNoteFromTask(noteId, todoId);
	}

	$effect(() => {
		navComposerHandlers.onCreateTodo = createTodoFromComposer;
		navComposerHandlers.onCreateNote = createNoteFromComposer;
		return () => navComposerHandlers.clear();
	});

	function createNextTodo(currentTodoId, group) {
		const currentTodo = store.harada_chart.todos.find((t) => t.id === currentTodoId);
		if (!currentTodo) return null;
		const normalizedCurrentTodo = normalizeTodoListMeta(currentTodo);
		const targetListId = normalizedCurrentTodo.listId;
		const targetParentId = normalizedCurrentTodo.parentId ?? null;
		const newOrdering = getOrderingAfter(targetListId, targetParentId, currentTodoId);
		
		// Create new todo
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

		if (typeof normalizedCurrentTodo.goalIndex === 'number') {
			store.bumpGoalAfterTodoActivity(normalizedCurrentTodo.goalIndex);
		}

		store.saveNow();

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
		
		// Focus the previous todo if it exists and start editing
		if (currentIndex > 0) {
			const previousTodo = goalTodosList[currentIndex - 1];
			if (previousTodo) {
				setTimeout(() => {
					// Find the button for the previous todo and click it to start editing
					const prevTodoElement = document.querySelector(`[data-todo-item-id="${previousTodo.id}"]`);
					if (prevTodoElement) {
						// Find the title button (the one with flex-1 class)
						const editButton = prevTodoElement.querySelector('button.flex-1');
						if (editButton) {
							editButton.click();
							// Wait for Svelte to render the input, then focus it
							// Use multiple attempts to ensure the input is ready
							const tryFocus = (attempts = 0) => {
								const prevInput = document.querySelector(`[data-todo-id="${previousTodo.id}"]`);
								if (prevInput) {
									prevInput.focus();
									// Double-check focus is active
									if (document.activeElement !== prevInput) {
										setTimeout(() => {
											prevInput.focus();
										}, 10);
									}
								} else if (attempts < 10) {
									// Retry if input not found yet
									setTimeout(() => tryFocus(attempts + 1), 20);
								}
							};
							requestAnimationFrame(() => {
								setTimeout(() => tryFocus(), 50);
							});
						}
					}
				}, 50);
			}
		}
	}
</script>

<svelte:head>
	<title>All Todos - Haradato</title>
</svelte:head>

<div class="p-4 pb-24 md:p-8 md:pb-8">
	<div class="mx-auto max-w-7xl">
		<div class="mb-3 md:hidden">
			<WorkspaceToolbar
				mode="mobile"
				bind:searchText
				showSidebarToggle={!mobileMenuOpen}
				onSidebarToggle={() => (mobileMenuOpen = true)}
				showHamburger={false}
				composeTabDefault="task"
			/>
		</div>

		<div class="hidden gap-8 md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
			<aside class="todo-panel h-[calc(100vh-5.5rem)] overflow-y-auto p-3">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">TASKS</h2>
				<div class="space-y-1.5">
					<button
						type="button"
						onclick={() => (activeMainFeed = 'todos')}
						class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-semibold shadow-sm transition ${
							activeMainFeed === 'todos'
								? 'border-slate-400/60 bg-slate-500/10 text-slate-900 dark:border-slate-500/70 dark:bg-slate-200/10 dark:text-slate-100'
								: 'border-slate-400/40 text-slate-700 hover:bg-slate-500/10 dark:border-slate-600/70 dark:text-slate-200 dark:hover:bg-slate-200/10'
						}`}
						aria-pressed={activeMainFeed === 'todos'}
					>
						<span>All Todos</span>
						<span class="text-xs text-slate-500 dark:text-slate-300">{allTodos.length}</span>
					</button>
					<button
						type="button"
						onclick={() => (activeMainFeed = 'notes')}
						class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-semibold shadow-sm transition ${
							activeMainFeed === 'notes'
								? 'border-slate-400/60 bg-slate-500/10 text-slate-900 dark:border-slate-500/70 dark:bg-slate-200/10 dark:text-slate-100'
								: 'border-slate-400/40 text-slate-700 hover:bg-slate-500/10 dark:border-slate-600/70 dark:text-slate-200 dark:hover:bg-slate-200/10'
						}`}
						aria-pressed={activeMainFeed === 'notes'}
					>
						<span>All Notes</span>
						<span class="text-xs text-slate-500 dark:text-slate-300">{store.notes.length}</span>
					</button>
					{#each goalMenuItems as item (item.id)}
						<a
							href={item.href}
							class="flex items-center justify-between rounded-md border border-slate-700/70 px-3 py-2 text-sm transition hover:border-violet-500/50 hover:bg-violet-500/10"
						>
							<span class="truncate pr-3">{item.label}</span>
							<span class="text-xs text-slate-400">{item.count}</span>
						</a>
					{/each}
				</div>
			</aside>

			<div class="min-w-0">
				<div class="mb-6 hidden md:block">
					<WorkspaceToolbar mode="desktop" bind:searchText composeTabDefault="task" />
				</div>
				{#if activeMainFeed === 'todos'}
					<p class="page-subtitle mb-6">
						{allTodos.length} todo{allTodos.length !== 1 ? 's' : ''} across {todoGroups.filter((g) => g.id !== 'no-goal').length} goal{todoGroups.filter((g) => g.id !== 'no-goal').length !== 1 ? 's' : ''}
					</p>
					<TodoList
						groups={todoGroups}
						isMainTodoFeed={true}
						feedPinnedTodos={feedPinnedTodos}
						{resolveGroupForTodo}
						{allGoals}
						onUpdate={updateTodo}
						onDelete={deleteTodo}
						onToggleStatus={cycleTodoStatus}
						onCreateNext={createNextTodo}
						onDeletePrevious={deleteAndFocusPrevious}
						onMakeSubtask={makeSubtask}
						onOutdent={(todoId) => outdentTodo(todoId)}
						onTitleFocus={(id) => (activeTodoId = id)}
						getIndentLevel={(todoId, group) => getIndentLevel(todoId, group.todos)}
						canIndent={canIndentTodo}
						canOutdent={(todoId) => canOutdentTodo(todoId)}
						onCreateTodo={createTodoFromComposer}
						onMoveTodo={moveTodo}
						allowCrossListMove={true}
						enableGroupDrag={true}
						onMoveGroup={moveGoalGroup}
						searchText={searchText}
						{getLinkedNotesForTodo}
						onUpsertLinkedNote={upsertLinkedNote}
						onCreateLinkedNote={createLinkedNoteForTodo}
						onRemoveNoteLink={removeLinkedNoteFromTodo}
					/>
				{:else}
					<p class="page-subtitle mb-6">
						{allNotes.length} note{allNotes.length !== 1 ? 's' : ''}, newest first
					</p>
					{#if allNotes.length === 0}
						<div class="todo-panel p-6 text-sm text-slate-700 dark:text-slate-300">No notes match this view.</div>
					{:else}
						<div class="space-y-2">
							{#each allNotes as note (note.id)}
								<button
									type="button"
									onclick={() => openNote(note.id)}
									class="todo-panel block w-full rounded-lg p-3 text-left transition hover:border-slate-500/40 hover:bg-slate-500/10 dark:hover:border-slate-300/30 dark:hover:bg-slate-200/10"
								>
									<div class="mb-1 flex items-center justify-between gap-3">
										<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{getNoteTitle(note.content)}</p>
										<p class="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatUpdatedAt(note.updatedAt)}</p>
									</div>
									<p class="line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
										{getNotePreview(note.content) || 'No content yet'}
									</p>
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<div class="md:hidden overflow-hidden">
			<div
				class="flex w-[200%] transition-transform duration-300 ease-out"
				style={`transform: translateX(${mobileMenuOpen ? '0%' : '-50%'});`}
			>
				<div class="w-1/2 pr-4">
					<div class="todo-panel h-[calc(100vh-8rem)] overflow-y-auto p-3">
						<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">TASKS</h2>
						<div class="space-y-1.5">
							<button
								type="button"
								onclick={() => {
									activeMainFeed = 'todos';
									mobileMenuOpen = false;
								}}
								class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-semibold shadow-sm transition ${
									activeMainFeed === 'todos'
										? 'border-slate-400/60 bg-slate-500/10 text-slate-900 dark:border-slate-500/70 dark:bg-slate-200/10 dark:text-slate-100'
										: 'border-slate-400/40 text-slate-700 dark:border-slate-600/70 dark:text-slate-200'
								}`}
							>
								<span>All Todos</span>
								<span class="text-xs text-slate-500 dark:text-slate-300">{allTodos.length}</span>
							</button>
							<button
								type="button"
								onclick={() => {
									activeMainFeed = 'notes';
									mobileMenuOpen = false;
								}}
								class={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-semibold shadow-sm transition ${
									activeMainFeed === 'notes'
										? 'border-slate-400/60 bg-slate-500/10 text-slate-900 dark:border-slate-500/70 dark:bg-slate-200/10 dark:text-slate-100'
										: 'border-slate-400/40 text-slate-700 dark:border-slate-600/70 dark:text-slate-200'
								}`}
							>
								<span>All Notes</span>
								<span class="text-xs text-slate-500 dark:text-slate-300">{store.notes.length}</span>
							</button>
							{#each goalMenuItems as item (item.id)}
								<a
									href={item.href}
									onclick={() => (mobileMenuOpen = false)}
									class="flex items-center justify-between rounded-md border border-slate-700/70 px-3 py-2 text-sm transition hover:border-violet-500/50 hover:bg-violet-500/10"
								>
									<span class="truncate pr-3">{item.label}</span>
									<span class="text-xs text-slate-400">{item.count}</span>
								</a>
							{/each}
						</div>
					</div>
				</div>

				<div class="w-1/2 pl-2">
					{#if activeMainFeed === 'todos'}
						<p class="page-subtitle mb-4">
							{allTodos.length} todo{allTodos.length !== 1 ? 's' : ''} across {todoGroups.filter((g) => g.id !== 'no-goal').length} goal{todoGroups.filter((g) => g.id !== 'no-goal').length !== 1 ? 's' : ''}
						</p>
						<TodoList
							groups={todoGroups}
							isMainTodoFeed={true}
							feedPinnedTodos={feedPinnedTodos}
							{resolveGroupForTodo}
							{allGoals}
							onUpdate={updateTodo}
							onDelete={deleteTodo}
							onToggleStatus={cycleTodoStatus}
							onCreateNext={createNextTodo}
							onDeletePrevious={deleteAndFocusPrevious}
							onMakeSubtask={makeSubtask}
							onOutdent={(todoId) => outdentTodo(todoId)}
							onTitleFocus={(id) => (activeTodoId = id)}
							getIndentLevel={(todoId, group) => getIndentLevel(todoId, group.todos)}
							canIndent={canIndentTodo}
							canOutdent={(todoId) => canOutdentTodo(todoId)}
							onCreateTodo={createTodoFromComposer}
							onMoveTodo={moveTodo}
							allowCrossListMove={true}
							enableGroupDrag={true}
							onMoveGroup={moveGoalGroup}
							searchText={searchText}
							{getLinkedNotesForTodo}
							onUpsertLinkedNote={upsertLinkedNote}
							onCreateLinkedNote={createLinkedNoteForTodo}
							onRemoveNoteLink={removeLinkedNoteFromTodo}
						/>
					{:else}
						<p class="page-subtitle mb-4">
							{allNotes.length} note{allNotes.length !== 1 ? 's' : ''}, newest first
						</p>
						{#if allNotes.length === 0}
							<div class="todo-panel p-4 text-sm text-slate-700 dark:text-slate-300">No notes match this view.</div>
						{:else}
							<div class="space-y-2">
								{#each allNotes as note (note.id)}
									<button
										type="button"
										onclick={() => openNote(note.id)}
										class="todo-panel block w-full rounded-lg p-3 text-left transition hover:border-slate-500/40 hover:bg-slate-500/10 dark:hover:border-slate-300/30 dark:hover:bg-slate-200/10"
									>
										<div class="mb-1 flex items-center justify-between gap-3">
											<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{getNoteTitle(note.content)}</p>
											<p class="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatUpdatedAt(note.updatedAt)}</p>
										</div>
										<p class="line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
											{getNotePreview(note.content) || 'No content yet'}
										</p>
									</button>
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
