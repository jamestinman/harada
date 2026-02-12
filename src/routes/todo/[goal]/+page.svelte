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
		getLinkedGoalIndex
	} from '$lib/todoUtils.js';
	import TodoItem from '$components/TodoItem.svelte';
	import SquareMap from '$components/SquareMap.svelte';

	// Load data once on mount
	let grid = $state([]);
	let todos = $state([]);
	let dataLoaded = $state(false);

	// Load data once
	$effect(() => {
		if (!browser || dataLoaded) return;
		
		const data = store.loadData(
			() => ({ text: '', status: 'todo', readme: '' }),
			[]
		);
		grid = data.grid || [];
		todos = (data.todos || []).map((todo) => ({
			...todo,
			goalIndex: canonicalGoalIndex(todo.goalIndex)
		}));
		dataLoaded = true;
	});

	// Get goal param reactively
	const goalParam = $derived(page.params.goal);
	
	// Compute goal indices (only depends on grid structure, not grid content)
	const goalIndices = $derived.by(() => {
		return Array.from({ length: 81 }, (_, i) => i);
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

	// Filter todos for this goal
	const goalTodos = $derived(
		todos.filter((t) => t.goalIndex === goalIndex).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
	);

	// Todo management functions
	function addTodo() {
		if (goalIndex === null) return;
		const todo = {
			...defaultTodo(),
			goalIndex
		};
		todos = [...todos, todo];
		saveTodos();
		return todo;
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
		if (!confirm('Delete this to-do item?')) return;
		todos = todos.filter((t) => t.id !== id);
		saveTodos();
	}

	function cycleTodoStatus(id) {
		const statuses = ['todo', 'underway', 'done'];
		todos = todos.map((t) => {
			if (t.id !== id) return t;
			const currentIndex = statuses.indexOf(t.status ?? 'todo');
			const next = statuses[(currentIndex + 1) % statuses.length];
			return { ...t, status: next };
		});
		// Force reactivity by creating new array
		todos = [...todos];
		saveTodos();
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

	let newTodoTitle = $state('');
	let isEditingGoal = $state(false);
	let editedGoalContent = $state('');
	let goalTextareaElement = $state(null);

	// Initialize edited content when entering edit mode
	function startEditingGoal() {
		if (goalIndex === null) return;
		const cell = grid[goalIndex];
		const title = (cell?.text ?? '').trim();
		const notes = (cell?.readme ?? '').trim();
		editedGoalContent = title + (notes ? '\n' + notes : '');
		isEditingGoal = true;
		// Focus the textarea after it renders
		setTimeout(() => {
			if (goalTextareaElement) goalTextareaElement.focus();
		}, 0);
	}

	// Save edited goal content
	function saveGoalEdit() {
		if (goalIndex === null || !isEditingGoal) return;
		
		const lines = editedGoalContent.split('\n');
		const title = lines[0]?.trim() || '';
		const notes = lines.slice(1).join('\n').trim();
		
		// Update grid
		if (!grid[goalIndex]) {
			grid[goalIndex] = { text: '', status: 'todo', readme: '' };
		}
		grid[goalIndex].text = title;
		grid[goalIndex].readme = notes;

		const linkedGoalIndex = getLinkedGoalIndex(goalIndex);
		if (linkedGoalIndex !== null) {
			if (!grid[linkedGoalIndex]) {
				grid[linkedGoalIndex] = { text: '', status: 'todo', readme: '' };
			}
			grid[linkedGoalIndex].text = title;
			grid[linkedGoalIndex].readme = notes;
			grid[linkedGoalIndex].status = grid[goalIndex].status;
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
</script>

<svelte:head>
	<title>{goalLabel} - Todos - Haradato</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-4 md:p-8">
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
							onclick={() => goto('/')}
							class="mb-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
						>
							← Back to Chart
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
								<div class="flex items-center gap-2 text-xs text-slate-400">
									<span>Press Ctrl+Enter to save, Esc to cancel</span>
								</div>
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
					<div class="ml-4 flex items-center gap-2">
						<select
							value={indexToNomenclature(goalIndex)}
							onchange={(e) => {
								const code = e.target.value;
								if (code) goto(`/todo/${code}`);
							}}
							class="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
						>
							{#each allGoals as goal}
								<option value={goal.code}>{goal.label !== goal.code ? goal.label : goal.code}</option>
							{/each}
						</select>
						<SquareMap 
							goal={indexToNomenclature(goalIndex)} 
							onClick={(code) => goto(`/todo/${code}`)}
						/>
					</div>
				</div>
			</div>

			<!-- Add new todo -->
			<div class="mb-6 rounded-lg border border-slate-700/70 bg-slate-950/60 p-4">
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={newTodoTitle}
						placeholder="Add a new todo for this goal..."
						class="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
						onkeydown={(e) => {
							if (e.key === 'Enter' && newTodoTitle.trim()) {
								const newTodo = addTodo();
								if (newTodo) {
									updateTodo(newTodo.id, { title: newTodoTitle.trim() });
									newTodoTitle = '';
								}
							}
						}}
					/>
					<button
						type="button"
						onclick={() => {
							if (newTodoTitle.trim()) {
								const newTodo = addTodo();
								if (newTodo) {
									updateTodo(newTodo.id, { title: newTodoTitle.trim() });
									newTodoTitle = '';
								}
							}
						}}
						disabled={!newTodoTitle.trim()}
						class="rounded-md border border-violet-600/70 bg-violet-600/90 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition enabled:hover:bg-violet-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
					>
						Add
					</button>
				</div>
			</div>

			<!-- Todo list -->
			{#if goalTodos.length === 0}
				<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-8 text-center">
					<p class="text-slate-400">No todos yet for this goal. Add one above!</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each goalTodos as todo (todo.id)}
						<TodoItem
							{todo}
							onUpdate={(patch) => updateTodo(todo.id, patch)}
							onDelete={() => deleteTodo(todo.id)}
							onToggleStatus={() => cycleTodoStatus(todo.id)}
							{allGoals}
						/>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
