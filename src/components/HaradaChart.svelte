<script>
	import { goto } from '$app/navigation';
	import { indexToNomenclature } from '$lib/todoUtils.js';

	let { grid } = $props();

	// Get the block index (0-8) for a given cell
	function getBlockIndex(row, col) {
		const blockRow = Math.floor(row / 3);
		const blockCol = Math.floor(col / 3);
		return blockRow * 3 + blockCol;
	}

	// Check if cell is the center of its 3x3 block
	function isBlockCenter(row, col) {
		return row % 3 === 1 && col % 3 === 1;
	}

	// Check if cell is in the center 3x3 block
	function isCenterBlock(row, col) {
		return row >= 3 && row <= 5 && col >= 3 && col <= 5;
	}

	// The main goal cell (very center)
	function isMainGoal(row, col) {
		return row === 4 && col === 4;
	}

	// Sub-goal cells (center block, not main goal)
	function isSubGoal(row, col) {
		return isCenterBlock(row, col) && !isMainGoal(row, col);
	}

	// Get color class based on block
	function getBlockColor(row, col) {
		const blockIndex = getBlockIndex(row, col);
		const colors = [
			'bg-rose-950/40 border-rose-800/30',
			'bg-amber-950/40 border-amber-800/30',
			'bg-lime-950/40 border-lime-800/30',
			'bg-cyan-950/40 border-cyan-800/30',
			'bg-violet-950/60 border-violet-700/50',
			'bg-sky-950/40 border-sky-800/30',
			'bg-fuchsia-950/40 border-fuchsia-800/30',
			'bg-teal-950/40 border-teal-800/30',
			'bg-orange-950/40 border-orange-800/30'
		];
		return colors[blockIndex];
	}

	function getCellClasses(row, col, index) {
		let classes = 'relative ';
		const status = grid[index]?.status ?? 'todo';
		const customColor = grid[index]?.color;

		// If custom color is set, use it
		if (customColor && customColor !== 'default') {
			classes += `${customColor} border `;
		} else {
			// Main goal: strong green when done, otherwise original styling
			if (isMainGoal(row, col)) {
				if (status === 'done') {
					classes +=
						'bg-gradient-to-br from-emerald-500 to-green-500 border-2 border-emerald-300 text-white font-bold shadow-lg shadow-emerald-400/50 z-10';
				} else if (status === 'underway') {
					classes +=
						'bg-gradient-to-br from-yellow-500 to-amber-500 border-2 border-yellow-300 text-white font-bold shadow-lg shadow-yellow-400/50 z-10';
				} else {
					classes +=
						'bg-gradient-to-br from-violet-600 to-fuchsia-600 border-2 border-violet-400 text-white font-bold shadow-lg shadow-violet-500/30 z-10';
				}
			} else if (isSubGoal(row, col)) {
				// Sub-goals: strong green when done, otherwise original styling
				if (status === 'done') {
					classes +=
						'bg-gradient-to-br from-emerald-600 to-green-600 border border-emerald-400 text-white font-semibold shadow-lg shadow-emerald-500/40';
				} else if (status === 'underway') {
					classes +=
						'bg-gradient-to-br from-yellow-600 to-amber-600 border border-yellow-400 text-white font-semibold shadow-lg shadow-yellow-500/40';
				} else {
					classes +=
						'bg-gradient-to-br from-violet-800/80 to-fuchsia-800/80 border border-violet-500/50 text-violet-100 font-semibold';
				}
			} else if (isBlockCenter(row, col)) {
				// Linked sub-goals: strong green when done, otherwise original styling
				if (status === 'done') {
					classes +=
						'bg-gradient-to-br from-emerald-600 to-green-600 border border-emerald-400 text-white font-semibold shadow-lg shadow-emerald-500/40';
				} else if (status === 'underway') {
					classes +=
						'bg-gradient-to-br from-yellow-600 to-amber-600 border border-yellow-400 text-white font-semibold shadow-lg shadow-yellow-500/40';
				} else {
					classes +=
						'bg-gradient-to-br from-slate-700/80 to-slate-800/80 border border-slate-500/50 text-slate-100 font-semibold';
				}
			} else {
				// Action / task squares: color driven by status
				if (status === 'underway') {
					classes +=
						'bg-yellow-900/80 border-yellow-500/70 text-yellow-50 shadow-inner shadow-yellow-500/20';
				} else if (status === 'done') {
					classes +=
						'bg-emerald-900/80 border-emerald-500/80 text-emerald-50 shadow-inner shadow-emerald-500/25';
				} else {
					classes += getBlockColor(row, col) + ' border border-slate-700/50 text-slate-200';
				}
			}
		}

		return classes;
	}


	function handleCellClick(index) {
		const row = Math.floor(index / 9);
		const col = index % 9;
	}
</script>

<!-- Full-screen chart grid -->
<div
	class="mx-auto grid gap-0.5 sm:gap-1"
	style="grid-template-columns: repeat(9, minmax(0, 1fr)); max-width: min(95vw, 95vh);"
>
	{#each { length: 81 } as _, i}
		{@const row = Math.floor(i / 9)}
		{@const col = i % 9}
		{@const cellClasses = getCellClasses(row, col, i)}

		<a
			type="button"
			style="view-transition-name: harada-cell-{i};"
			class="group aspect-square transition-all duration-200 hover:scale-105 hover:z-20 {cellClasses} rounded-md cursor-pointer"
			class:mt-1={row === 3 || row === 6}
			class:ml-1={col === 3 || col === 6}
		  href={`/todo/${indexToNomenclature(i)}`}
		>
			<div class="relative flex h-full w-full flex-col items-center justify-center p-0.5 sm:p-1">
				<div
					class="w-full text-center text-[8px] leading-tight sm:text-[10px] md:text-xs overflow-hidden line-clamp-3"
				>
					{grid[i]?.text || ''}
				</div>

				{#if grid[i]?.status === 'underway'}
					<div class="absolute bottom-0.5 left-0.5 text-[8px] sm:text-[10px]" title="Underway">
						⏳
					</div>
				{:else if grid[i]?.status === 'done'}
					<div class="absolute bottom-0.5 left-0.5 text-[8px] sm:text-[10px]" title="Done">
						✓
					</div>
				{/if}

			</div>
		</a>
	{/each}
</div>
