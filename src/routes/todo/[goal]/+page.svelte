<script>
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import {
		nomenclatureToIndex,
		indexToNomenclature,
		renderMarkdown,
		defaultTodo,
		canonicalGoalIndex,
		getLinkedGoalIndex,
		getParentGoalIndex,
		getSubGoalIndices
	} from '$lib/todoUtils.js';
	import SquareMap from '$components/SquareMap.svelte';
	import TodoGroupedList from '$components/TodoGroupedList.svelte';
	import TodoQuickNav from '$components/TodoQuickNav.svelte';

	// Load data once on mount
	let grid = $state([]);
	let todos = $state([]);
	let dataLoaded = $state(false);
	let activeTodoId = $state(null);

	// Get goal param reactively
	const goalParam = $derived(page.params.goal);


	// Load data once
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

	// Handle invalid goal param
	$effect(() => {
		if (!browser || !dataLoaded) return;
		if (goalIndex === null && goalParam) {
			goto('/todo', { replaceState: true });
		}
	});

	// Compute goal label
	const goalLabel = $derived.by(() => {
		if (goalIndex === null) return '';
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

	// Get goal markdown/readme
	const goalMarkdown = $derived.by(() => {
		if (goalIndex === null) return '';
		const cell = grid[goalIndex];
		return (cell?.readme ?? '').trim();
	});

	// Update selectedColor when goal changes
	$effect(() => {
		const currentGoalIndex = goalIndex;
		const currentGrid = grid;
		if (currentGoalIndex !== null && currentGrid[currentGoalIndex]) {
			selectedColor = currentGrid[currentGoalIndex].color || 'default';
		}
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
				isMainGoal: Math.floor(idx / 9) === 4 && idx % 9 === 4
			};
		}).sort((a, b) => {
			// Main goal first, then by index
			if (a.isMainGoal) return -1;
			if (b.isMainGoal) return 1;
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
		// Sort by creation time first
		const sorted = [...todosList].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
		
		// Build a map of todos by ID
		const todoMap = new Map(sorted.map(t => [t.id, t]));
		
		// Organize: root todos first, then their children
		const result = [];
		const processed = new Set();
		
		function addTodoAndChildren(todo) {
			if (processed.has(todo.id)) return;
			processed.add(todo.id);
			result.push(todo);
			
			// Add all children of this todo
			sorted.forEach(child => {
				if (child.parentId === todo.id && !processed.has(child.id)) {
					addTodoAndChildren(child);
				}
			});
		}
		
		// Add root todos (no parent) first
		sorted.forEach(todo => {
			if (!todo.parentId && !processed.has(todo.id)) {
				addTodoAndChildren(todo);
			}
		});
		
		return result;
	}

	function getVisibleGoalTodos(targetGoalIndex) {
		const filtered = todos.filter((t) => {
			const matchesGoal = t.goalIndex === targetGoalIndex;
			const isCompleted = t.status === 'done';
			return matchesGoal && (showCompleted || !isCompleted);
		});
		return organizeTodosWithHierarchy(filtered);
	}

	function getGoalScopeIndices() {
		if (goalIndex === null) return [];
		const subGoalIndices = getSubGoalIndices(goalIndex).map((idx) => canonicalGoalIndex(idx));
		return [goalIndex, ...subGoalIndices];
	}

	const goalGroups = $derived.by(() => {
		const indices = getGoalScopeIndices();
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

	// Todo management functions
	function addTodo(targetGoalIndex = goalIndex) {
		if (targetGoalIndex === null) return;
		const activeTodo = todos.find((t) => t.id === activeTodoId);
		const todo = {
			...defaultTodo(),
			goalIndex: targetGoalIndex,
			parentId: activeTodo?.goalIndex === targetGoalIndex ? activeTodo.parentId ?? null : null
		};
		todos = [...todos, todo];
		saveTodos();
		return todo;
	}

	function createTodoFromComposer({ title, markdown, goalIndex: selectedGoalIndex }) {
		const targetGoalIndex =
			typeof selectedGoalIndex === 'number' ? canonicalGoalIndex(selectedGoalIndex) : goalIndex;
		if (targetGoalIndex === null) return;
		const todo = {
			...defaultTodo(),
			title: title || '',
			markdown: markdown || '',
			goalIndex: targetGoalIndex,
			parentId: null
		};
		todos = [...todos, todo];
		saveTodos();
	}

	function updateTodo(id, patch) {
		const nextPatch =
			typeof patch?.goalIndex === 'number'
				? { ...patch, goalIndex: canonicalGoalIndex(patch.goalIndex) }
				: patch;
		todos = todos.map((t) => (t.id === id ? { ...t, ...nextPatch } : t));
		// Force reactivity by creating new array
		todos = [...todos];
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
		// Force reactivity by creating new array
		todos = [...todos];
		saveTodos();
	}

	function createNextTodo(currentTodoId, targetGoalIndex = goalIndex) {
		if (targetGoalIndex === null) return null;
		const goalTodosList = getVisibleGoalTodos(targetGoalIndex);
		const currentIndex = goalTodosList.findIndex((t) => t.id === currentTodoId);
		const currentTodo = todos.find((t) => t.id === currentTodoId);
		
		// Create new todo
		const newTodo = {
			...defaultTodo(),
			goalIndex: targetGoalIndex,
			parentId: currentTodo?.parentId ?? null
		};
		
		// Insert after current todo in the full todos array
		if (currentIndex >= 0 && currentIndex < goalTodosList.length - 1) {
			// Insert after the current todo
			const nextTodo = goalTodosList[currentIndex + 1];
			const nextIndex = todos.findIndex((t) => t.id === nextTodo.id);
			if (nextIndex >= 0) {
				todos = [...todos.slice(0, nextIndex), newTodo, ...todos.slice(nextIndex)];
			} else {
				todos = [...todos, newTodo];
			}
		} else {
			// Add to end
			todos = [...todos, newTodo];
		}
		
		saveTodos();
		return newTodo;
	}

	function makeSubtask(currentTodoId, targetGoalIndex = goalIndex) {
		const goalTodosList = getVisibleGoalTodos(targetGoalIndex);
		// Find current todo's index in the organized list
		const currentIndex = goalTodosList.findIndex((t) => t.id === currentTodoId);
		if (currentIndex <= 0) return; // Can't make first todo a subtask
		
		const currentTodo = todos.find((t) => t.id === currentTodoId);
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
		const currentTodo = todos.find((t) => t.id === currentTodoId);
		if (!currentTodo || !currentTodo.parentId) return; // Can't outdent if no parent
		
		// Find the parent todo
		const parentTodo = todos.find(t => t.id === currentTodo.parentId);
		if (!parentTodo) return;
		
		// Make the current todo a sibling of its parent (child of parent's parent)
		updateTodo(currentTodoId, { parentId: parentTodo.parentId || null });
	}

	function canIndentTodo(todoId, targetGoalIndex = goalIndex) {
		const goalTodosList = getVisibleGoalTodos(targetGoalIndex);
		const currentIndex = goalTodosList.findIndex((t) => t.id === todoId);
		if (currentIndex <= 0) return false; // Can't indent first todo
		
		const currentTodo = todos.find((t) => t.id === todoId);
		if (!currentTodo) return false;
		
		const previousTodo = goalTodosList[currentIndex - 1];
		if (!previousTodo) return false;
		
		// Can indent if not already a child of the previous todo
		return currentTodo.parentId !== previousTodo.id;
	}

	function canOutdentTodo(todoId) {
		const currentTodo = todos.find((t) => t.id === todoId);
		if (!currentTodo) return false;
		
		// Can outdent if has a parent
		return currentTodo.parentId !== null;
	}

	function deleteAndFocusPrevious(currentTodoId, targetGoalIndex = goalIndex) {
		// Find the current todo's index in the goalTodos array
		const goalTodosList = getVisibleGoalTodos(targetGoalIndex);
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

	function saveTodos() {
		if (!browser || !dataLoaded) return;
		// Save to store - ensure we're saving the current state
		store.saveData(grid, todos);
		// Also sync to Supabase if logged in
		if (authStore.user) {
			store.syncWithSupabase(grid, todos);
		}
	}

	let isEditingGoal = $state(false);
	let editedGoalContent = $state('');
	let goalTextareaElement = $state(null);
	let selectedColor = $state('default');
	let showCompleted = $state(false);

	// Available colors for goals
	const goalColors = [
		{ value: 'default', label: 'Default', classes: '' },
		{ value: 'bg-rose-600 border-rose-400 text-white', label: 'Rose', preview: 'bg-rose-600' },
		{ value: 'bg-amber-600 border-amber-400 text-white', label: 'Amber', preview: 'bg-amber-600' },
		{ value: 'bg-lime-600 border-lime-400 text-white', label: 'Lime', preview: 'bg-lime-600' },
	];

	// Initialize edited content when entering edit mode
	function startEditingGoal() {
		if (goalIndex === null) return;
		const cell = grid[goalIndex];
		const title = (cell?.text ?? '').trim();
		const notes = (cell?.readme ?? '').trim();
		editedGoalContent = title + (notes ? '\n' + notes : '');
		selectedColor = cell?.color || 'default';
		isEditingGoal = true;
		// Focus the textarea after it renders
		setTimeout(() => {
			if (goalTextareaElement) goalTextareaElement.focus();
		}, 0);
	}

	// Update color for the goal
	function updateGoalColor(color) {
		if (goalIndex === null) return;
		
		if (!grid[goalIndex]) {
			grid[goalIndex] = { text: '', status: 'todo', readme: '', color: 'default' };
		}
		grid[goalIndex].color = color;
		selectedColor = color;

		const linkedGoalIndex = getLinkedGoalIndex(goalIndex);
		if (linkedGoalIndex !== null) {
			if (!grid[linkedGoalIndex]) {
				grid[linkedGoalIndex] = { text: '', status: 'todo', readme: '', color: 'default' };
			}
			grid[linkedGoalIndex].color = color;
		}
		
		// Force reactivity
		grid = [...grid];
		
		// Save
		saveTodos();
	}

	// Save edited goal content
	function saveGoalEdit() {
		if (goalIndex === null || !isEditingGoal) return;
		
		const lines = editedGoalContent.split('\n');
		const title = lines[0]?.trim() || '';
		const notes = lines.slice(1).join('\n').trim();
		
		// Update grid
		if (!grid[goalIndex]) {
			grid[goalIndex] = { text: '', status: 'todo', readme: '', color: 'default' };
		}
		grid[goalIndex].text = title;
		grid[goalIndex].readme = notes;
		grid[goalIndex].color = selectedColor;

		const linkedGoalIndex = getLinkedGoalIndex(goalIndex);
		if (linkedGoalIndex !== null) {
			if (!grid[linkedGoalIndex]) {
				grid[linkedGoalIndex] = { text: '', status: 'todo', readme: '', color: 'default' };
			}
			grid[linkedGoalIndex].text = title;
			grid[linkedGoalIndex].readme = notes;
			grid[linkedGoalIndex].status = grid[goalIndex].status;
			grid[linkedGoalIndex].color = selectedColor;
		}
		
		// Force reactivity
		grid = [...grid];
		
		// Save
		saveTodos();
		
		isEditingGoal = false;
	}

	// Cancel editing
	function cancelGoalEdit() {
		isEditingGoal = false;
		editedGoalContent = '';
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

<div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-4 pb-24 md:p-8 md:pb-8 lg:pr-28">
	<div class="mx-auto max-w-4xl">
		{#if !dataLoaded}
			<div class="flex items-center justify-center py-12">
				<div class="text-slate-400">Loading...</div>
			</div>
		{:else if goalIndex === null}
			<div class="flex items-center justify-center py-12">
				<div class="text-slate-400">Invalid goal. Redirecting...</div>
			</div>
		{:else}
			<!-- Header -->
			<div class="mb-6">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex-1">
						<button
							onclick={moveUpALevel}
							class="mb-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
						>
							← {parentGoalLabel ? `Back to ${parentGoalLabel}` : 'Back to all'}
						</button>
						{#if isEditingGoal}
							<div class="space-y-2">
								<textarea
									bind:this={goalTextareaElement}
									bind:value={editedGoalContent}
									class="w-full min-h-[3rem] rounded-md border border-violet-500 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
									placeholder="Goal title&#10;Notes go here..."
									onkeydown={(e) => {
										if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
											e.preventDefault();
											saveGoalEdit();
										} else if (e.key === 'Escape') {
											e.preventDefault();
											cancelGoalEdit();
										}
									}}
									onblur={saveGoalEdit}
								></textarea>
							</div>
						{:else}
							<button
								type="button"
								onclick={startEditingGoal}
								class="text-left w-full cursor-pointer group"
							>
								<h1 class="text-2xl font-bold text-slate-100 group-hover:text-violet-300 transition-colors">
									{goalLabel || indexToNomenclature(goalIndex)}
								</h1>
							</button>
							{#if goalMarkdown}
								<div class="mt-2 text-sm leading-relaxed text-slate-300">
									{@html renderMarkdown(goalMarkdown)}
								</div>
							{/if}
						{/if}
					</div>
					<div class="ml-4">
						<SquareMap goal={indexToNomenclature(goalIndex)} {grid} />
					</div>
				</div>

				<!-- Color picker -->
				<div class="mb-4 flex items-center justify-between gap-2">
					<div class="flex gap-1">
						{#each goalColors as color}
							<button
								type="button"
								class="h-6 w-6 rounded border-2 transition-all {selectedColor === color.value
									? 'border-violet-400 ring-2 ring-violet-300'
									: 'border-slate-600'} {color.preview || 'bg-slate-700'}"
								title={color.label}
								onclick={() => updateGoalColor(color.value)}
							></button>
						{/each}
					</div>
					{#if isEditingGoal}
						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={saveGoalEdit}
								class="rounded-md border border-violet-600/70 bg-violet-600/90 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-violet-500"
							>
								Save
							</button>
							<button
								type="button"
								onclick={cancelGoalEdit}
								class="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 shadow-sm transition hover:bg-slate-700"
							>
								Cancel
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Show completed toggle -->
			<div class="mb-4 flex items-center justify-between">
				<label class="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={showCompleted}
						class="h-4 w-4 rounded border-slate-600 bg-slate-900 text-violet-600 focus:ring-2 focus:ring-violet-500/50"
					/>
					<span class="text-sm text-slate-300">Show completed tasks</span>
				</label>
			</div>

			<!-- Todo list -->
			{#if goalGroups.length === 0}
				<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-8 text-center">
					<p class="text-slate-400">No todos yet for this goal or its sub-goals. Add one above!</p>
				</div>
			{/if}

			<TodoGroupedList
				groups={goalGroups}
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
		defaultGoalIndex={goalIndex}
		onCreateTodo={createTodoFromComposer}
	/>
</div>
