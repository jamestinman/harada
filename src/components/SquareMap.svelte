<script>
	import { nomenclatureToIndex, indexToNomenclature } from '$lib/todoUtils.js';

	let { goal, onClick } = $props();

	// All squares are valid todo targets.
	const goalIndices = $derived.by(() => {
		return Array.from({ length: 81 }, (_, i) => i);
	});

	// Convert goal code to index
	const currentGoalIndex = $derived.by(() => {
		if (!goal) return null;
		return nomenclatureToIndex(goal, goalIndices);
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
</script>

<div class="inline-flex flex-col gap-0.5">
	{#each Array(9) as _, row}
		<div class="flex gap-0.5">
			{#each Array(9) as _, col}
				{@const index = row * 9 + col}
				{@const cellType = getCellType(index)}
				{@const isCurrentGoal = index === currentGoalIndex}
				<button
					type="button"
					class={`h-2 w-2 rounded-sm border transition-all hover:scale-125 hover:z-10 cursor-pointer ${
						isCurrentGoal
							? 'bg-violet-500 border-violet-400 ring-1 ring-violet-300'
							: cellType === 'main'
								? 'bg-slate-600 border-slate-500 hover:bg-slate-500'
								: cellType === 'sub'
									? 'bg-slate-700 border-slate-600 hover:bg-slate-600'
									: cellType === 'outer'
										? 'bg-sky-400/30 border-sky-300/30 shadow-[0_0_4px_rgba(56,189,248,0.45)] hover:bg-sky-300/90'
										: 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-600/70'
					}`}
					title={isCurrentGoal ? `Current: ${goal}` : `Select ${indexToNomenclature(index)}`}
					onclick={() => {
						if (onClick) {
							const code = indexToNomenclature(index);
							onClick(code);
						}
					}}
				></button>
			{/each}
		</div>
	{/each}
</div>
