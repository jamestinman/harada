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

	// Get cell color for the mini-map dots
	function getCellColor(index, cellType, isCurrentGoal) {

		const customColor = chartGrid?.[index]?.color;

    if (isCurrentGoal) {
      return 'bg-orange-400';
      if (customColor && customColor !== 'default') {
        const bgMatch = customColor.match(/bg-(\w+)-(\d+)/);
        if (bgMatch) {
          const [, colorName, shade] = bgMatch;
          return `bg-${colorName}-${shade}`;
        }
      }
      return customColor;
    }

		if (cellType === 'main') return 'bg-slate-400';
		if (cellType === 'sub') return 'bg-slate-600/80';
		if (cellType === 'outer') return 'bg-slate-600/60';
		return 'bg-slate-600/40';
	}
</script>

<button
	type="button"
	class="inline-flex flex-col gap-[1px] rounded p-1 border-2 transition-all hover:bg-slate-800/50 active:scale-95 cursor-pointer {store.isLoading ? 'border-purple-500' : store.saveStatus == 'dirty' ? 'border-amber-500' : store.saveStatus == 'saving' ? 'border-red-500' : 'border-transparent'}"
	onclick={() => goto('/')}
	title="View full Harada Chart"
>
	{#each Array(9) as _, row}
		<div class="flex gap-[1px]">
			{#each Array(9) as _, col}
				{@const index = row * 9 + col}
				{@const cellType = getCellType(index)}
				{@const canonicalIndex = canonicalGoalIndex(index)}
				{@const isCurrentGoal = currentGoalIndex !== null && (canonicalIndex === currentGoalIndex || index === currentGoalIndex || getLinkedGoalIndex(index) === currentGoalIndex)}
				{@const cellColor = getCellColor(index, cellType, isCurrentGoal)}
				<div class={`h-1.5 w-1.5 rounded-full transition-all ${cellColor}`}></div>
			{/each}
		</div>
	{/each}
</button>
