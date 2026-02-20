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
	import DesktopNav from '$components/DesktopNav.svelte';

  // Use store.harada_chart directly - it's reactive
	const grid = $derived(store.harada_chart.grid);
	const todos = $derived(store.harada_chart.todos.map((todo) => normalizeTodoListMeta(todo)));
	const dataLoaded = $derived(true); // Always loaded since store handles initialization
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

	function organizeTodosWithHierarchy(todosList) {
		const sorted = [...todosList].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
		const result = [];
		const processed = new Set();

		function addTodoAndChildren(todo) {
			if (processed.has(todo.id)) return;
			processed.add(todo.id);
			result.push(todo);
			sorted.forEach((child) => {
				if (child.parentId === todo.id && !processed.has(child.id)) {
					addTodoAndChildren(child);
				}
			});
		}

		sorted.forEach((todo) => {
			if (!todo.parentId && !processed.has(todo.id)) {
				addTodoAndChildren(todo);
			}
		});

		return result;
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
		const goalGroups = goalIndices
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
					updated_at: cell?.updated_at || null
				};
			})
			.filter((group) => group.todos.length > 0)
			.sort((a, b) => {
				// Sort by updated_at descending (most recently updated first)
				const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
				const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
				if (aTime !== bTime) {
					return bTime - aTime; // Descending order
				}
				// Fallback to index order if timestamps are equal or both null
				return a.goalIndex - b.goalIndex;
			});

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
			.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
	);

	// Todo management
	function updateTodo(id, patch) {
		const oldTodo = todos.find((t) => t.id === id);
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
		// Update store.harada_chart.todos
		store.harada_chart.todos = store.harada_chart.todos.map((t) => (t.id === id ? { ...t, ...nextPatch } : t));
		
		// Update goal timestamp if todo is associated with a goal
		const newTodo = store.harada_chart.todos.find((t) => t.id === id);
		const goalIndexToUpdate = newTodo?.goalIndex ?? oldTodo?.goalIndex;
		if (typeof goalIndexToUpdate === 'number') {
			updateGoalTimestamp(store.harada_chart.grid, goalIndexToUpdate);
			// Force reactivity by reassigning
			store.harada_chart.grid = [...store.harada_chart.grid];
		}
	}

	function deleteTodo(id) {
		const todo = store.harada_chart.todos.find((t) => t.id === id);
		store.harada_chart.todos = store.harada_chart.todos.filter((t) => t.id !== id);
		
		// Update goal timestamp if todo was associated with a goal
		if (todo && typeof todo.goalIndex === 'number') {
			updateGoalTimestamp(store.harada_chart.grid, todo.goalIndex);
			// Force reactivity by reassigning
			store.harada_chart.grid = [...store.harada_chart.grid];
		}
	}

	function cycleTodoStatus(id) {
		const statuses = ['todo', 'done'];
		const todo = todos.find((t) => t.id === id);
		if (!todo) return;
		
		const currentIndex = statuses.indexOf(todo.status ?? 'todo');
		const next = statuses[(currentIndex + 1) % statuses.length];
		
		// If marking as done and title is empty, delete it
		if (next === 'done' && (!todo.title || todo.title.trim() === '')) {
			deleteTodo(id);
			return;
		}
		
		// Update store.harada_chart.todos
		store.harada_chart.todos = store.harada_chart.todos.map((t) => {
			if (t.id !== id) return t;
			return { ...t, status: next };
		});
		
		// Update goal timestamp if todo is associated with a goal
		if (typeof todo.goalIndex === 'number') {
			updateGoalTimestamp(store.harada_chart.grid, todo.goalIndex);
			// Force reactivity by reassigning
			store.harada_chart.grid = [...store.harada_chart.grid];
		}
	}

	function addTodoForGoal(goalIndex, title = '') {
		const activeTodo = store.harada_chart.todos.find((t) => t.id === activeTodoId);
		const todo = {
			...defaultTodo(),
			...buildGoalListMeta(goalIndex),
			parentId: activeTodo?.goalIndex === goalIndex ? activeTodo.parentId ?? null : null,
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
		return todo;
	}

	function addTodoToCustomList(listId, listName, title = '', markdown = '') {
		const activeTodo = store.harada_chart.todos.find((t) => t.id === activeTodoId);
		const sameListParent =
			activeTodo?.listType === 'custom' && activeTodo.listId === listId
				? activeTodo.parentId ?? null
				: null;
		const customListMeta = buildCustomListMeta(listName);
		const todo = {
			...defaultTodo(),
			title,
			markdown,
			...customListMeta,
			listId,
			parentId: sameListParent
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];
		activeTodoId = todo.id;
		return todo;
	}

	function createTodoFromComposer({ title, markdown, goalIndex, listType, listName }) {
		if (listType === 'custom' || (listName && listName.trim())) {
			const customMeta = buildCustomListMeta(listName);
			addTodoToCustomList(customMeta.listId, customMeta.listName, title || '', markdown || '');
			return;
		}
		const normalizedGoalIndex =
			typeof goalIndex === 'number' ? canonicalGoalIndex(goalIndex) : null;
		if (normalizedGoalIndex !== null) {
			addTodoForGoal(normalizedGoalIndex, title || '');
		}
		const created = store.harada_chart.todos[store.harada_chart.todos.length - 1];
		if (created && markdown?.trim()) {
			updateTodo(created.id, { markdown: markdown.trim() });
		}
	}

	function createNextTodo(currentTodoId, group) {
		const groupTodosList = getVisibleGroupTodos(group);
		const currentIndex = groupTodosList.findIndex((t) => t.id === currentTodoId);
		const currentTodo = store.harada_chart.todos.find((t) => t.id === currentTodoId);
		
		// Create new todo
		const newTodo = {
			...defaultTodo(),
			goalIndex: currentTodo?.listType === 'goal' ? currentTodo.goalIndex : null,
			listType: currentTodo?.listType === 'custom' ? 'custom' : 'goal',
			listId:
				currentTodo?.listType === 'custom'
					? currentTodo.listId
					: currentTodo?.goalIndex === null
						? 'goal:none'
						: `goal:${currentTodo?.goalIndex}`,
			listName: currentTodo?.listType === 'custom' ? currentTodo.listName || 'New list' : null,
			parentId: currentTodo?.parentId ?? null
		};
		
		if (currentIndex >= 0 && currentIndex < groupTodosList.length - 1) {
			const nextTodo = groupTodosList[currentIndex + 1];
			const nextIndex = store.harada_chart.todos.findIndex((t) => t.id === nextTodo.id);
			if (nextIndex >= 0) {
				store.harada_chart.todos = [...store.harada_chart.todos.slice(0, nextIndex), newTodo, ...store.harada_chart.todos.slice(nextIndex)];
			} else {
				store.harada_chart.todos = [...store.harada_chart.todos, newTodo];
			}
		} else {
			store.harada_chart.todos = [...store.harada_chart.todos, newTodo];
		}
		
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

<div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-4 pb-24 md:p-8 md:pb-8 lg:pr-28">
	<div class="mx-auto max-w-4xl">
		{#if !dataLoaded}
			<div class="flex items-center justify-center py-12">
				<div class="text-slate-400">Loading...</div>
			</div>
		{:else}
			<!-- Header -->
			<div class="mb-6">
				<h1 class="text-2xl font-bold text-slate-100">Todo</h1>
				<p class="mt-1 text-sm text-slate-400">
					{allTodos.length} todo{allTodos.length !== 1 ? 's' : ''} across {todoGroups.filter((g) => g.id !== 'no-goal').length} goal{todoGroups.filter((g) => g.id !== 'no-goal').length !== 1 ? 's' : ''}
				</p>
			</div>

			{#if allTodos.length === 0}
				<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-8 text-center">
					<p class="text-slate-400 mb-4">No todos yet. Click a square on the chart to add todos for that goal!</p>
					<a
						href="/"
						class="inline-block rounded-md border border-violet-600/70 bg-violet-600/90 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-violet-500"
					>
						Go to Chart
					</a>
				</div>
			{/if}

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
			/>
		{/if}
	</div>
	<DesktopNav
		{allGoals}
		defaultGoalIndex={null}
		onCreateTodo={createTodoFromComposer}
	/>
</div>
