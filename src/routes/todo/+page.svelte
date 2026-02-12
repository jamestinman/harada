<script>
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import { indexToNomenclature, canonicalGoalIndex } from '$lib/todoUtils.js';
	import TodoItem from '$components/TodoItem.svelte';

	// Load data once on mount
	let grid = $state([]);
	let todos = $state([]);
	let dataLoaded = $state(false);

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

	// Get all todos grouped by goal
	const todosByGoal = $derived(
		goalIndices.map((goalIndex) => ({
			goalIndex,
			goalLabel: getGoalLabelFromIndex(goalIndex),
			goalCode: indexToNomenclature(goalIndex),
			todos: todos
				.filter((t) => t.goalIndex === goalIndex)
				.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
		})).filter((group) => group.todos.length > 0)
	);

	const allTodos = $derived(
		todos.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
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
		todos = [...todos]; // Force reactivity
		saveTodos();
	}

	function saveTodos() {
		store.saveData(grid, todos);
		if (authStore.user) {
			store.syncWithSupabase(grid, todos);
		}
	}
</script>

<svelte:head>
	<title>All Todos - Haradato</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-4 md:p-8">
	<div class="mx-auto max-w-4xl">
		{#if !dataLoaded}
			<div class="flex items-center justify-center py-12">
				<div class="text-slate-400">Loading...</div>
			</div>
		{:else}
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<div>
					<button
						onclick={() => goto('/')}
						class="mb-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
					>
						← Back to Chart
					</button>
					<h1 class="text-2xl font-bold text-slate-100">All Todos</h1>
					<p class="mt-1 text-sm text-slate-400">
						{allTodos.length} todo{allTodos.length !== 1 ? 's' : ''} across {todosByGoal.length} goal{todosByGoal.length !== 1 ? 's' : ''}
					</p>
				</div>
			</div>

			{#if allTodos.length === 0}
				<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-8 text-center">
					<p class="text-slate-400 mb-4">No todos yet. Click a square on the chart to add todos for that goal!</p>
					<button
						onclick={() => goto('/')}
						class="rounded-md border border-violet-600/70 bg-violet-600/90 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-violet-500"
					>
						Go to Chart
					</button>
				</div>
			{:else}
				<!-- Grouped by goal -->
				<div class="space-y-6">
					{#each todosByGoal as group (group.goalIndex)}
						<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-4">
							<div class="mb-4 flex items-center justify-between">
								<div>
									<h2 class="text-lg font-semibold text-slate-100">
										<a
											href="/todo/{group.goalCode}"
											class="hover:text-violet-400 transition-colors"
										>
											{group.goalLabel}
										</a>
									</h2>
									<p class="text-xs text-slate-400 mt-1">
										{group.goalCode} • {group.todos.length} todo{group.todos.length !== 1 ? 's' : ''}
									</p>
								</div>
								<button
									onclick={() => goto(`/todo/${group.goalCode}`)}
									class="text-xs text-violet-400 hover:text-violet-300 transition-colors"
								>
									View all →
								</button>
							</div>

							<div class="space-y-2">
								{#each group.todos as todo (todo.id)}
									<TodoItem
										{todo}
										onUpdate={(patch) => updateTodo(todo.id, patch)}
										onDelete={() => deleteTodo(todo.id)}
										onToggleStatus={() => cycleTodoStatus(todo.id)}
										{allGoals}
									/>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
