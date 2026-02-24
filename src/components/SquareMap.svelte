<script>
	import { goto } from '$app/navigation';
	import { nomenclatureToIndex, indexToNomenclature, canonicalGoalIndex, getLinkedGoalIndex } from '$lib/todoUtils.js';
	import { store } from '$stores/store.svelte.js';

	let { goal, grid = null } = $props();
	
	// Use store.harada_chart.grid if grid prop is not provided
	const chartGrid = $derived(grid ?? store.harada_chart.grid);

	// All squares are valid todo targets.
	const goalIndices = $derived.by(() => {
		return Array.from({ length: 81 }, (_, i) => i);
	});

	// Convert goal code to index, or use store's currentGoalIndex if no goal prop provided
	const currentGoalIndex = $derived.by(() => {
		if (goal) {
			return nomenclatureToIndex(goal, goalIndices);
		}
		// Use store's currentGoalIndex if no explicit goal prop
		return store.currentGoalIndex;
	});

	// Determine cell type for styling
	function getCellType(index) {
		const row = Math.floor(index / 9);
		const col = index % 9;
		
		if (row === 4 && col === 4) {
			return 'main'; // Main goal
		} else if (row >= 3 && row <= 5 && col >= 3 && col <= 5) {
			return 'sub'; // Sub-goal
		} else if (row % 3 === 1 && col % 3 === 1) {
			return 'outer'; // Outer block center
		}
		return 'empty'; // Not a goal position
	}

	// Get cell color - if custom color is set, show a hint of it
	function getCellColor(index, cellType, isCurrentGoal) {
		const customColor = chartGrid?.[index]?.color;
		
		// If custom color is set and not default, show it
		if (customColor && customColor !== 'default') {
			// Extract just the bg color part for the mini map
			const bgMatch = customColor.match(/bg-(\w+)-(\d+)/);
			if (bgMatch) {
				const [, colorName, shade] = bgMatch;
				return `bg-${colorName}-${shade}`;
			}
		}
		
		// Default colors based on cell type
		if (isCurrentGoal) {
			return 'bg-violet-500 border-violet-400 ring-1 ring-violet-300';
		} else if (cellType === 'main') {
			return 'bg-slate-600 border-slate-500';
		} else if (cellType === 'sub') {
			return 'bg-slate-700 border-slate-600';
		} else if (cellType === 'outer') {
			return 'bg-sky-400/30 border-sky-300/30 shadow-[0_0_4px_rgba(56,189,248,0.45)]';
		} else {
			return 'bg-slate-700/50 border-slate-600/50';
		}
	}
</script>

<button
	type="button"
class="inline-flex flex-col gap-0.5 rounded-lg p-1 border-2 transition-all hover:bg-slate-800/50 active:scale-95 cursor-pointer {store.saveStatus == 'dirty' ? 'border-amber-500' : store.saveStatus == 'saving' ? 'border-red-500' : 'border-transparent'} "
	onclick={() => {
    goto("/");
	}}
	title="View full Harada Chart"
>
			{#each Array(9) as _, row}
		<div class="flex gap-0.5">
			{#each Array(9) as _, col}
				{@const index = row * 9 + col}
				{@const cellType = getCellType(index)}
				{@const canonicalIndex = canonicalGoalIndex(index)}
				{@const isCurrentGoal = currentGoalIndex !== null && (canonicalIndex === currentGoalIndex || index === currentGoalIndex || getLinkedGoalIndex(index) === currentGoalIndex)}
				{@const cellColor = getCellColor(index, cellType, isCurrentGoal)}
				<div
					class={`h-2 w-2 rounded-sm border transition-all ${cellColor}`}
				></div>
			{/each}
		</div>
	{/each}
</button>
