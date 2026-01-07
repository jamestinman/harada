<script>
  import { browser } from '$app/environment';
  import HaradaHeader from '$components/HaradaHeader.svelte';
  import HaradaFooter from '$components/HaradaFooter.svelte';

  const STORAGE_KEY = 'harada-chart-data';

	const defaultCell = () => ({ text: '', status: 'todo' });

	// Initialize grid with empty cells or load from localStorage
	function loadGrid() {
		if (browser) {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				try {
					const parsed = JSON.parse(saved);

					// Migrate from legacy string[] format to object[]
					if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
						return parsed.map((text) => ({ text, status: 'todo' }));
					}

					// Ensure shape is correct
					if (Array.isArray(parsed)) {
						return parsed.map((cell) => {
							if (cell && typeof cell === 'object') {
								return {
									text: typeof cell.text === 'string' ? cell.text : '',
									status:
										cell.status === 'underway' || cell.status === 'done'
											? cell.status
											: 'todo'
								};
							}
							return defaultCell();
						});
					}
				} catch (e) {
					console.error('Failed to parse saved data:', e);
				}
			}
		}
		return Array.from({ length: 81 }, () => defaultCell());
	}

	let grid = $state(loadGrid());

	// Save to localStorage whenever grid changes
	$effect(() => {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
		}
	});

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

	// Get the linked cell index for sub-goals
	// Sub-goals in center block link to centers of outer blocks
	function getLinkedCellIndex(row, col) {
		if (!isCenterBlock(row, col) || isMainGoal(row, col)) return null;

		// Map position in center block to outer block center
		const localRow = row - 3; // 0, 1, or 2
		const localCol = col - 3; // 0, 1, or 2

		// The outer block's row/col
		const blockRow = localRow;
		const blockCol = localCol;

		// Skip center block (1, 1)
		if (blockRow === 1 && blockCol === 1) return null;

		// Center of that outer block
		const targetRow = blockRow * 3 + 1;
		const targetCol = blockCol * 3 + 1;

		return targetRow * 9 + targetCol;
	}

	// Get the linked cell for outer block centers
	function getCenterBlockLinkedIndex(row, col) {
		if (isCenterBlock(row, col)) return null;
		if (!isBlockCenter(row, col)) return null;

		const blockRow = Math.floor(row / 3);
		const blockCol = Math.floor(col / 3);

		// Map to center block position
		const centerRow = 3 + blockRow;
		const centerCol = 3 + blockCol;

		return centerRow * 9 + centerCol;
	}

	// Update cell text and sync linked cells
	function updateCell(index, value) {
		const row = Math.floor(index / 9);
		const col = index % 9;

		grid[index].text = value;

		// If this is a sub-goal in center block, sync to outer block center
		const linkedOuter = getLinkedCellIndex(row, col);
		if (linkedOuter !== null) {
			grid[linkedOuter].text = value;
		}

		// If this is an outer block center, sync to center block
		const linkedCenter = getCenterBlockLinkedIndex(row, col);
		if (linkedCenter !== null) {
			grid[linkedCenter].text = value;
		}
	}

	function cycleStatus(index) {
		const current = grid[index].status;
		const next = current === 'todo' ? 'underway' : current === 'underway' ? 'done' : 'todo';
		grid[index].status = next;
	}

	function clearAll() {
		if (confirm('Clear all cells? This cannot be undone.')) {
			grid = Array.from({ length: 81 }, () => defaultCell());
		}
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

		return classes;
	}

</script>

<div
	class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-4 md:p-8"
	style="font-family: 'Outfit', sans-serif;"
>
	<div class="mx-auto max-w-6xl">

    <!--
    <HaradaHeader />
  -->

		<!-- Grid -->
		<div class="overflow-x-auto rounded-2xl border border-slate-700/50 bg-slate-900/50 p-2 md:p-4">
      <h1 class="mb-2 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-xl font-bold tracking-tight text-transparent md:text-2xl">
      Harada Chart
    </h1>
        <div
				class="mx-auto grid min-w-[600px] gap-0.5 md:gap-1"
				style="grid-template-columns: repeat(9, minmax(0, 1fr));"
			>
				{#each { length: 81 } as _, i}
					{@const row = Math.floor(i / 9)}
					{@const col = i % 9}
					{@const cellClasses = getCellClasses(row, col, i)}

					<div
						class="group aspect-square transition-all duration-200 hover:scale-[1.02] hover:z-20 {cellClasses} rounded-lg"
						class:mt-1={row === 3 || row === 6}
						class:ml-1={col === 3 || col === 6}
					>
						<div class="relative flex h-full w-full items-stretch justify-stretch">
							<textarea
								class="h-full w-full resize-none bg-transparent p-1 text-center text-[10px] leading-tight placeholder-slate-500/50 outline-none transition-colors focus:ring-2 focus:ring-violet-500/50 md:p-2 md:text-xs"
								placeholder={isMainGoal(row, col)
									? 'MAIN GOAL'
									: isSubGoal(row, col) || isBlockCenter(row, col)
										? 'Sub-goal'
										: ''}
								bind:value={grid[i].text}
								oninput={(e) => updateCell(i, e.target.value)}
							></textarea>

							<button
								type="button"
								class={`absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900/80 text-[9px] text-slate-300 shadow-sm ring-1 ring-slate-600/60 transition hover:scale-110 md:h-5 md:w-5 ${
									grid[i].status === 'underway'
										? 'bg-yellow-400/90 text-slate-900'
										: grid[i].status === 'done'
											? 'bg-emerald-400/90 text-emerald-950'
											: ''
								}` }
								onclick={() => cycleStatus(i)}
							>
								{grid[i].status === 'todo' ? '' : grid[i].status === 'underway' ? '⏳' : '✓'}
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Actions -->
     <!--
		<div class="mt-6 flex justify-center gap-4">
			<button
				onclick={clearAll}
				class="cursor-pointer rounded-lg border border-rose-800/50 bg-rose-950/50 px-6 py-2 text-rose-300 transition-all hover:border-rose-700 hover:bg-rose-900/50 hover:text-rose-200"
			>
				Clear All
			</button>
		</div>
    -->

		<!-- Footer -->
    <HaradaFooter />

  </div>
</div>