<script>
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
		updateGoalTimestamp
	} from '$lib/todoUtils.js';
	import TodoList from '$components/TodoList.svelte';
	import Nav from '$components/Nav.svelte';

	let searchText = $state('');

  // Use store.harada_chart directly - it's reactive
	const grid = $derived(store.harada_chart.grid);
	const todos = $derived(store.harada_chart.todos.map((todo) => normalizeTodoListMeta(todo)));
	const dataLoaded = $derived(!store.isLoading);
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
		
		// Update goal timestamp if todo is associated with a goal
		if (typeof goalIndex === 'number') {
			updateGoalTimestamp(store.harada_chart.grid, goalIndex);
			// Force reactivity by reassigning
			store.harada_chart.grid = [...store.harada_chart.grid];
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
									prevInput.select();
									// Double-check focus is active
									if (document.activeElement !== prevInput) {
										setTimeout(() => {
											prevInput.focus();
											prevInput.select();
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
	<div class="mx-auto max-w-4xl">
		<!-- Header -->
		<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div>
        <div class="flex flex-row gap-5 justify-between w-full">
          <h1>Todo</h1>
          <input
            type="text"
            placeholder="Search"
            bind:value={searchText}
            class="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
          />
        </div>
        <p class="page-subtitle">
					{allTodos.length} todo{allTodos.length !== 1 ? 's' : ''} across {todoGroups.filter((g) => g.id !== 'no-goal').length} goal{todoGroups.filter((g) => g.id !== 'no-goal').length !== 1 ? 's' : ''}
				</p>
			</div>
		</div>

		<TodoList
			groups={todoGroups}
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
		/>
	</div>
	<Nav
		{allGoals}
		defaultGoalIndex={null}
		onCreateTodo={createTodoFromComposer}
	/>
</div>
