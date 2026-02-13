<script>
	import { browser } from '$app/environment';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import { indexToNomenclature, canonicalGoalIndex, defaultTodo } from '$lib/todoUtils.js';
	import TodoGroupedList from '$components/TodoGroupedList.svelte';
	import TodoQuickNav from '$components/TodoQuickNav.svelte';

  // Load data once on mount
	let grid = $state([]);
	let todos = $state([]);
	let dataLoaded = $state(false);
	let activeTodoId = $state(null);

	$effect(() => {
		if (!browser || dataLoaded) return;
		
		const data = store.loadData(
			() => ({ text: '', status: 'todo', readme: '', color: 'default' }),
			[]
		);
		grid = data.grid || [];
		todos = (data.todos || []).map((todo) => ({
			...todo,
			goalIndex: canonicalGoalIndex(todo.goalIndex)
		}));
		dataLoaded = true;
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
		const filtered = todos.filter((t) => t.goalIndex === goalIndex && t.status !== 'done');
		return organizeTodosWithHierarchy(filtered);
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
				isMainGoal: Math.floor(idx / 9) === 4 && idx % 9 === 4
			};
		}).sort((a, b) => {
			if (a.isMainGoal) return -1;
			if (b.isMainGoal) return 1;
			return a.index - b.index;
		});
	});

	// Build render groups (unassigned first, then goals with todos)
	const todoGroups = $derived.by(() => {
		const unassignedTodos = getVisibleGoalTodos(null);
		const goalGroups = goalIndices
			.map((goalIndex) => ({
				id: `goal-${goalIndex}`,
				goalIndex,
				label: getGoalLabelFromIndex(goalIndex),
				href: `/todo/${indexToNomenclature(goalIndex)}`,
				addTitle: 'Add todo to this goal',
				todos: getVisibleGoalTodos(goalIndex)
			}))
			.filter((group) => group.todos.length > 0);

		const groups = [...goalGroups];
		if (unassignedTodos.length > 0) {
			groups.unshift({
				id: 'no-goal',
				goalIndex: null,
				label: 'No goal assigned',
				href: null,
				addTitle: 'Add todo without goal',
				todos: unassignedTodos
			});
		}
		return groups;
	});

	const allTodos = $derived(
		[...todos]
			.filter((t) => t.status !== 'done')
			.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
	);

	// Todo management
	function updateTodo(id, patch) {
		const nextPatch =
			typeof patch?.goalIndex === 'number'
				? { ...patch, goalIndex: canonicalGoalIndex(patch.goalIndex) }
				: patch;
		todos = todos.map((t) => (t.id === id ? { ...t, ...nextPatch } : t));
		todos = [...todos]; // Force reactivity
		saveTodos();
	}

	function deleteTodo(id) {
		todos = todos.filter((t) => t.id !== id);
		saveTodos();
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
		
		todos = todos.map((t) => {
			if (t.id !== id) return t;
			return { ...t, status: next };
		});
		todos = [...todos]; // Force reactivity
		saveTodos();
	}

	function saveTodos() {
		store.saveData(grid, todos);
		if (authStore.user) {
			store.syncWithSupabase(grid, todos);
		}
	}

	function addTodoForGoal(goalIndex, title = '') {
		const activeTodo = todos.find((t) => t.id === activeTodoId);
		const todo = {
			...defaultTodo(),
			goalIndex,
			parentId: activeTodo?.goalIndex === goalIndex ? activeTodo.parentId ?? null : null,
			title
		};
		todos = [...todos, todo];
		saveTodos();
		return todo;
	}

	function createTodoFromComposer({ title, markdown, goalIndex }) {
		const normalizedGoalIndex =
			typeof goalIndex === 'number' ? canonicalGoalIndex(goalIndex) : null;
		const todo = {
			...defaultTodo(),
			title: title || '',
			markdown: markdown || '',
			goalIndex: normalizedGoalIndex,
			parentId: null
		};
		todos = [...todos, todo];
		saveTodos();
	}

	function createNextTodo(currentTodoId, goalIndex) {
		const goalTodosList = getVisibleGoalTodos(goalIndex);
		const currentIndex = goalTodosList.findIndex((t) => t.id === currentTodoId);
		const currentTodo = todos.find((t) => t.id === currentTodoId);
		
		// Create new todo
		const newTodo = {
			...defaultTodo(),
			goalIndex,
			parentId: currentTodo?.parentId ?? null
		};
		
		if (currentIndex >= 0 && currentIndex < goalTodosList.length - 1) {
			const nextTodo = goalTodosList[currentIndex + 1];
			const nextIndex = todos.findIndex((t) => t.id === nextTodo.id);
			if (nextIndex >= 0) {
				todos = [...todos.slice(0, nextIndex), newTodo, ...todos.slice(nextIndex)];
			} else {
				todos = [...todos, newTodo];
			}
		} else {
			todos = [...todos, newTodo];
		}
		
		saveTodos();
		return newTodo;
	}

	function makeSubtask(currentTodoId, goalIndex) {
		const goalTodosList = getVisibleGoalTodos(goalIndex);
		const currentIndex = goalTodosList.findIndex((t) => t.id === currentTodoId);
		if (currentIndex <= 0) return;
		const currentTodo = todos.find((t) => t.id === currentTodoId);
		const previousTodo = goalTodosList[currentIndex - 1];
		if (!currentTodo || !previousTodo) return;
		if (currentTodo.parentId === previousTodo.id) return;
		updateTodo(currentTodoId, { parentId: previousTodo.id });
	}

	function outdentTodo(currentTodoId) {
		const currentTodo = todos.find((t) => t.id === currentTodoId);
		if (!currentTodo || !currentTodo.parentId) return;
		const parentTodo = todos.find((t) => t.id === currentTodo.parentId);
		if (!parentTodo) return;
		updateTodo(currentTodoId, { parentId: parentTodo.parentId || null });
	}

	function canIndentTodo(todoId, goalIndex) {
		const goalTodosList = getVisibleGoalTodos(goalIndex);
		const currentIndex = goalTodosList.findIndex((t) => t.id === todoId);
		if (currentIndex <= 0) return false;
		const currentTodo = todos.find((t) => t.id === todoId);
		const previousTodo = goalTodosList[currentIndex - 1];
		if (!currentTodo || !previousTodo) return false;
		return currentTodo.parentId !== previousTodo.id;
	}

	function canOutdentTodo(todoId) {
		const currentTodo = todos.find((t) => t.id === todoId);
		return Boolean(currentTodo?.parentId);
	}

	function deleteAndFocusPrevious(currentTodoId, goalIndex) {
		const goalTodosList = getVisibleGoalTodos(goalIndex);
		
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

			<TodoGroupedList
				groups={todoGroups}
				{allGoals}
				onUpdate={updateTodo}
				onDelete={deleteTodo}
				onToggleStatus={cycleTodoStatus}
				onCreateNext={(todoId, group) => createNextTodo(todoId, group.goalIndex)}
				onDeletePrevious={(todoId, group) => deleteAndFocusPrevious(todoId, group.goalIndex)}
				onMakeSubtask={(todoId, group) => makeSubtask(todoId, group.goalIndex)}
				onOutdent={(todoId) => outdentTodo(todoId)}
				onTitleFocus={(id) => (activeTodoId = id)}
				getIndentLevel={(todoId, group) => getIndentLevel(todoId, group.todos)}
				canIndent={(todoId, group) => canIndentTodo(todoId, group.goalIndex)}
				canOutdent={(todoId) => canOutdentTodo(todoId)}
			/>
		{/if}
	</div>
	<TodoQuickNav
		{allGoals}
		defaultGoalIndex={null}
		onCreateTodo={createTodoFromComposer}
	/>
</div>
