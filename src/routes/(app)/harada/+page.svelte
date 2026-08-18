<script>
	import { browser } from '$app/environment';
	import { isChartUnset } from '$lib/haradaGridUtils.js';
	import { authStore } from '$stores/auth.svelte.js';
	import { store } from '$stores/store.svelte.js';
	import HaradaChart from '$components/HaradaChart.svelte';

	// Use store.harada_chart directly - it's reactive and handles all saving/syncing
	const grid = $derived(store.harada_chart.grid);
	const todos = $derived(store.harada_chart.todos);
	const chartUnset = $derived(isChartUnset(store.harada_chart?.grid));

	let wizardOfferedThisVisit = false;

	// A blank chart is intimidating — guide users through setup whenever goals
	// are still empty (including the auto-seeded placeholder state).
	$effect(() => {
		if (!browser || store.isBootstrapping || wizardOfferedThisVisit) return;
		if (!chartUnset) return;

		// Boot no longer waits for the session check (it can take ~30s offline),
		// so hold the wizard until auth settles. For fresh visitors with no stored
		// session this resolves near-instantly.
		if (authStore.loading) return;

		// Signed-out users keep local/offline behavior.
		if (!authStore.user) {
			store.showOnboardingWizard = true;
			wizardOfferedThisVisit = true;
			return;
		}

		// Signed-in users wait for cloud hydration and skip onboarding if account data exists.
		if (store.initialCloudHydrationStatus !== 'ready') return;
		if (store.remoteAccountHasData) return;

		store.showOnboardingWizard = true;
		wizardOfferedThisVisit = true;
	});

	// Clear currentGoalIndex when on the main chart page
	$effect(() => {
		if (browser) {
			store.currentGoalIndex = null;
		}
	});

	function handleUpdateGrid(newGrid) {
		store.harada_chart.grid = [...newGrid];
		store.registerGridMutation({ immediate: true });
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
