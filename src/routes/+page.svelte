<script>
	import { browser } from '$app/environment';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import HaradaChart from '$components/HaradaChart.svelte';

	const defaultCell = () => ({ text: '', status: 'todo', readme: '', color: 'default' });

	// Load initial data
	const initialData = store.loadData(defaultCell, []);
	let grid = $state(initialData.grid);
	let todos = $state(initialData.todos);
	let isLoadingFromSupabase = $state(false);

	// Handle auth state changes - load from Supabase when user logs in
	$effect(() => {
		if (!browser) return;
		
		const user = authStore.user;
		
		if (user && !isLoadingFromSupabase) {
			loadFromSupabaseAndMigrate();
		} else if (!user) {
			store.unsubscribeFromRealtimeUpdates();
		}
	});

	async function loadFromSupabaseAndMigrate() {
		isLoadingFromSupabase = true;
		
		try {
			const supabaseData = await store.loadFromSupabase();
			
			if (supabaseData) {
				grid = supabaseData.grid;
				todos = supabaseData.todos;
				store.saveData(grid, todos);
			} else {
				const localData = store.loadData(defaultCell, []);
				const hasLocalData = localData.grid.some(c => c.text.trim()) || localData.todos.length > 0;
				
				if (hasLocalData) {
					await store.saveToSupabase(localData.grid, localData.todos);
					grid = localData.grid;
					todos = localData.todos;
				}
			}
			
			store.subscribeToRealtimeUpdates((update) => {
				const currentGridStr = JSON.stringify(grid);
				const updateGridStr = JSON.stringify(update.grid);
				
				if (currentGridStr !== updateGridStr || JSON.stringify(todos) !== JSON.stringify(update.todos)) {
					grid = update.grid;
					todos = update.todos;
					store.saveData(grid, todos);
				}
			});
		} catch (error) {
			console.error('Error loading from Supabase:', error);
		} finally {
			isLoadingFromSupabase = false;
		}
	}

	// Save to persistent storage whenever grid changes
	let saveTimeout;
	$effect(() => {
		if (!browser || isLoadingFromSupabase) return;
		
		const gridSnapshot = grid;
		const todosSnapshot = todos;
		
		store.saveData(gridSnapshot, todosSnapshot);
		
		if (authStore.user) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(() => {
				store.syncWithSupabase(gridSnapshot, todosSnapshot);
			}, 1000);
		}
	});
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
class="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-2 sm:p-4"
onclick={() => (store.showHaradaChart = false)}
onkeydown={(e) => e.key === 'Escape' && (store.showHaradaChart = false)}
role="button"
tabindex="-1"
aria-label="Close Harada Chart"
>
<div
  class="w-full h-full flex items-center justify-center"
  onclick={(e) => e.stopPropagation()}
  onkeydown={(e) => e.key === 'Escape' && (store.showHaradaChart = false)}
  role="dialog"
  tabindex="-1"
>
  <HaradaChart {grid} />
</div>
</div>
