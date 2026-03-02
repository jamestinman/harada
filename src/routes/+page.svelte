<script>
	import { browser } from '$app/environment';
	import { store } from '$stores/store.svelte.js';
	import HaradaChart from '$components/HaradaChart.svelte';

	// Use store.harada_chart directly - it's reactive and handles all saving/syncing
	const grid = $derived(store.harada_chart.grid);
	const todos = $derived(store.harada_chart.todos);

	// Clear currentGoalIndex when on the main chart page
	$effect(() => {
		if (browser) {
			store.currentGoalIndex = null;
		}
	});

	function handleUpdateGrid(newGrid) {
		// Update grid and persist immediately.
		store.harada_chart.grid = [...newGrid];
		store.saveNow();
	}
</script>

<svelte:head>
	<title>Haradato - Harada Chart + To-Do List</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div
	class="min-h-screen flex items-center justify-center pt-10 pb-28 lg:pt-0 lg:pb-0"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => e.key === 'Escape' && (store.showHaradaChart = false)}
	role="dialog"
	tabindex="-1"
>
	<HaradaChart {grid} onUpdateGrid={handleUpdateGrid} />
</div>
