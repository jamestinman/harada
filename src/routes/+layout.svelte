<script>
	import { browser } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import { indexToNomenclature, canonicalGoalIndex, defaultTodo, updateGoalTimestamp } from '$lib/todoUtils.js';
	import DesktopNav from '$components/DesktopNav.svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	let grid = $state([]);
	let dataLoaded = $state(false);

	$effect(() => {
		if (!browser || dataLoaded) return;
		const defaultCell = () => ({ text: '', status: 'todo', readme: '', color: 'default', updated_at: null });
		const data = store.loadData(defaultCell, []);
		grid = data.grid || [];
		dataLoaded = true;
	});

  // Watch for auth changes and (re)initialize Supabase sync when needed
$effect(() => {
	if (!browser) return;
	const user = authStore.user;
	// Delegate logic to the store instance
	store.handleAuthChange();
});

// Watch for changes to harada_chart and trigger debounced save
$effect(() => {
	if (!browser) return;

	// Access harada_chart properties to create reactive dependency
	const grid = store.harada_chart.grid;
	const todos = store.harada_chart.todos;

	// Skip until initial load is complete
	if (!store._isInitialized) return;

	// Clear existing timeout
	if (store._saveTimeout) {
		clearTimeout(store._saveTimeout);
	}

	// Set status to queued
	store.saveStatus = 'queued';

	// Schedule save in 5 seconds
	store._saveTimeout = setTimeout(() => {
		store._performSave();
	}, 5000);
});

	const goalIndices = Array.from({ length: 81 }, (_, i) => i);
	const allGoals = $derived.by(() => {
		const uniqueCanonical = [...new Set(goalIndices.map((idx) => canonicalGoalIndex(idx)))];
		return uniqueCanonical
			.map((idx) => {
				const cell = grid[idx];
				const text = (cell?.text ?? '').trim();
				return {
					index: idx,
					code: indexToNomenclature(idx),
					label: text || indexToNomenclature(idx),
					isMainGoal: Math.floor(idx / 9) === 4 && idx % 9 === 4,
					updated_at: cell?.updated_at || null
				};
			})
			.sort((a, b) => {
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

	function createTodoFromComposer({ title, markdown, goalIndex }) {
		const defaultCell = () => ({ text: '', status: 'todo', readme: '', color: 'default', updated_at: null });
		const data = store.loadData(defaultCell, []);
		const normalizedGoalIndex =
			typeof goalIndex === 'number' ? canonicalGoalIndex(goalIndex) : null;
		const todo = {
			...defaultTodo(),
			title: title || '',
			markdown: markdown || '',
			goalIndex: normalizedGoalIndex,
			parentId: null
		};
		const newTodos = [...(data.todos || []), todo];
		
		// Update goal timestamp if todo is associated with a goal
		if (typeof normalizedGoalIndex === 'number') {
			updateGoalTimestamp(data.grid, normalizedGoalIndex);
		}
		
		store.saveData(data.grid, newTodos);
		if (authStore.user) {
			store.syncWithSupabase(data.grid, newTodos);
		}
	}

	// Enable view transitions for all navigation
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen lg:pr-28 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950">
	{@render children()}

  <DesktopNav
    {allGoals}
    defaultGoalIndex={null}
    onCreateTodo={createTodoFromComposer}
  />

</div>

