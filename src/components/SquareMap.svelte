<script>
	import { goto } from '$app/navigation';
	import { nomenclatureToIndex, canonicalGoalIndex, getLinkedGoalIndex } from '$lib/todoUtils.js';
	import { store } from '$stores/store.svelte.js';

	let { goal, grid = null, interactive = true, className = '', href = null } = $props();

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

	const controlClass = $derived(
		`squaremap-button ${store.isLoading ? 'border-purple-500' : store.saveStatus == 'dirty' ? 'border-amber-500' : store.saveStatus == 'saving' ? 'border-red-500' : 'border-transparent'} ${interactive && !href ? '' : 'cursor-default active:scale-100'} ${className}`
	);

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

	// Base sizing shared by every dot - color is overlaid separately
	const DOT_BASE = 'h-1.5 w-1.5 rounded-full transition-all';

	function getCellClass(cellType, isCurrentGoal) {
		if (isCurrentGoal) return `${DOT_BASE} bg-orange-400`;
		if (cellType === 'main') return 'squaremap-main-dot';
		if (cellType === 'sub') return 'squaremap-sub-dot';
		if (cellType === 'outer') return 'squaremap-outer-dot';
		return 'squaremap-inner-dot';
	}
</script>

{#snippet matrix()}
	{#each Array(9) as _, row}
		<div class="flex gap-[1px]">
			{#each Array(9) as _, col}
				{@const index = row * 9 + col}
				{@const cellType = getCellType(index)}
				{@const canonicalIndex = canonicalGoalIndex(index)}
				{@const isCurrentGoal =
					currentGoalIndex !== null &&
					(canonicalIndex === currentGoalIndex ||
						index === currentGoalIndex ||
						getLinkedGoalIndex(index) === currentGoalIndex)}
				{@const cellClass = getCellClass(cellType, isCurrentGoal)}
				<div class={cellClass}></div>
			{/each}
		</div>
	{/each}
{/snippet}

{#if href}
	<a
		{href}
		class={controlClass}
		title="View full Harada Chart"
		aria-label="View full Harada Chart"
	>
		{@render matrix()}
	</a>
{:else}
	<button
		type="button"
		class={controlClass}
		onclick={() => {
			if (interactive) goto('/harada');
		}}
		title="View full Harada Chart"
		aria-label="View full Harada Chart"
	>
		{@render matrix()}
	</button>
{/if}
