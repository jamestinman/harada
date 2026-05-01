<script>
	import { goto } from '$app/navigation';
	import {
		indexToNomenclature,
		canonicalGoalIndex,
		getLinkedGoalIndex,
		updateGoalTimestamp
	} from '$lib/todoUtils.js';
	import { store } from '$stores/store.svelte.js';

	let { grid, onUpdateGrid = null } = $props();
	

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

		// If custom color is set, use it but still respect cell type for border width and shadows
		if (customColor && customColor !== 'default') {
			// Check if border width class already exists (border or border-2, but not border-color)
			const hasBorderWidth = /\b(border|border-\d+)\b/.test(customColor);
			
			// Main goal: always use border-2 and shadow-lg
			if (isMainGoal(row, col)) {
				// Remove any existing border width class and add border-2
				const colorWithoutBorderWidth = customColor.replace(/\b(border|border-\d+)\b/g, '').trim();
				classes += `${colorWithoutBorderWidth} border-2 font-bold shadow-lg z-10`;
			} else if (isSubGoal(row, col)) {
				// Sub-goals: ensure border class exists and add shadow-lg
				classes += `${customColor}${hasBorderWidth ? '' : ' border'} font-semibold shadow-lg`;
			} else if (isBlockCenter(row, col)) {
				// Linked sub-goals: ensure border class exists and add shadow-lg
				classes += `${customColor}${hasBorderWidth ? '' : ' border'} font-semibold shadow-lg`;
			} else {
				// Action / task squares: ensure border class exists (no shadow-lg)
				classes += `${customColor}${hasBorderWidth ? '' : ' border'}`;
			}
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
				// Sub-goals: strong green when done, otherwise same grey as their twinned outer block centers
				if (status === 'done') {
					classes +=
						'bg-gradient-to-br from-emerald-600 to-green-600 border border-emerald-400 text-white font-semibold shadow-lg shadow-emerald-500/40';
				} else if (status === 'underway') {
					classes +=
						'bg-gradient-to-br from-yellow-600 to-amber-600 border border-yellow-400 text-white font-semibold shadow-lg shadow-yellow-500/40';
				} else {
					classes += 'harada-chart-center-default';
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
					classes += 'harada-chart-center-default';
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
					classes += getBlockColor(row, col) + ' harada-chart-task-default';
				}
			}
		}

		return classes;
	}


	// Check if a goal has a custom title (not just the default nomenclature)
	function hasCustomTitle(index) {
		const canonicalIndex = canonicalGoalIndex(index);
		const cell = grid[canonicalIndex];
		const text = (cell?.text ?? '').trim();
		return text && text !== indexToNomenclature(canonicalIndex);
	}


	// Inline edit for blank goal titles
	let editingGoalIndex = $state(null);
	let editingDraft = $state('');
	let editInputEl = $state(null);

	$effect(() => {
		if (editingGoalIndex !== null && editInputEl) {
			editInputEl.focus();
		}
	});

	function isGoalCell(row, col) {
		return isMainGoal(row, col) || isSubGoal(row, col) || isBlockCenter(row, col);
	}

	function isCellBlank(i) {
		return !(grid[i]?.text ?? '').trim();
	}

	function startEditingGoal(i) {
		const canonical = canonicalGoalIndex(i);
		editingGoalIndex = i;
		editingDraft = (grid[canonical]?.text ?? '').trim();
	}

	function saveGoalTitle() {
		if (editingGoalIndex == null || !onUpdateGrid) return;
		const canonical = canonicalGoalIndex(editingGoalIndex);
		const linkedIndex = getLinkedGoalIndex(canonical);
		const newGrid = [...grid];
		const cell = newGrid[canonical] ? { ...newGrid[canonical] } : {};
		cell.text = editingDraft.trim();
		newGrid[canonical] = cell;
		if (linkedIndex !== null) {
			newGrid[linkedIndex] = { ...cell };
		}
		updateGoalTimestamp(newGrid, canonical);
		onUpdateGrid(newGrid);
		editingGoalIndex = null;
		editingDraft = '';
	}

	function cancelGoalEdit() {
		editingGoalIndex = null;
		editingDraft = '';
	}

	const GOAL_DRAG_START_PX = 6;
	const GOAL_LONG_PRESS_MS = 260;
	let goalPressTimer = null;
	let pendingGoalDrag = null;
	let goalDrag = $state({
		active: false,
		pointerId: null,
		sourceIndex: null,
		targetIndex: null,
		dragType: null
	});

	function isMainGoalIndex(index) {
		return index === 40;
	}

	// True for outer block centers and center-block sub-goals (the 8 draggable goal positions)
	function isGoalDragCell(index) {
		if (isMainGoalIndex(index)) return false;
		const row = Math.floor(index / 9);
		const col = index % 9;
		return isBlockCenter(row, col) || isSubGoal(row, col);
	}

	// True for the 64 task cells - non-goal, non-center-block cells in outer blocks
	function isTaskCell(index) {
		const row = Math.floor(index / 9);
		const col = index % 9;
		if (row >= 3 && row <= 5 && col >= 3 && col <= 5) return false; // center block
		if (isBlockCenter(row, col)) return false; // outer block centers
		return true;
	}

	function isDraggableSource(index) {
		return isGoalDragCell(index) || isTaskCell(index);
	}

	function isDraggableTarget(index) {
		if (!goalDrag.active) return false;
		if (goalDrag.dragType === 'task') return isTaskCell(index);
		return isGoalDragCell(index);
	}

	// Returns all 9 cell indices of the 3×3 outer block whose center is blockCenterIndex
	function getBlockCellIndices(blockCenterIndex) {
		const row = Math.floor(blockCenterIndex / 9);
		const col = blockCenterIndex % 9;
		const startRow = Math.floor(row / 3) * 3;
		const startCol = Math.floor(col / 3) * 3;
		const cells = [];
		for (let r = startRow; r < startRow + 3; r++) {
			for (let c = startCol; c < startCol + 3; c++) {
				cells.push(r * 9 + c);
			}
		}
		return cells;
	}

	function clearGoalPressTimer() {
		if (goalPressTimer) {
			clearTimeout(goalPressTimer);
			goalPressTimer = null;
		}
	}

	function clearPendingGoalDrag() {
		clearGoalPressTimer();
		pendingGoalDrag = null;
	}

	function resetGoalDrag() {
		goalDrag = {
			active: false,
			pointerId: null,
			sourceIndex: null,
			targetIndex: null,
			dragType: null
		};
	}

	function handleCellPointerDown(event, index) {
		if (!isDraggableSource(index)) return;
		if (!event.isPrimary) return;
		if (event.button !== 0) return;

		clearPendingGoalDrag();

		pendingGoalDrag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			index,
			pointerType: event.pointerType || 'mouse'
		};

		window.addEventListener('pointermove', handleGlobalGoalPointerMove, { passive: false });
		window.addEventListener('pointerup', handleGlobalGoalPointerUp, { passive: false });
		window.addEventListener('pointercancel', handleGlobalGoalPointerUp, { passive: false });

		if (pendingGoalDrag.pointerType === 'touch') {
			const cx = event.clientX;
			const cy = event.clientY;
			const startIndex = index;
			goalPressTimer = setTimeout(() => {
				startGoalDrag(event.pointerId, startIndex, cx, cy);
				pendingGoalDrag = null;
			}, GOAL_LONG_PRESS_MS);
		}
	}

	function handleCellPointerEnter(_event, index) {
		if (!goalDrag.active) return;
		if (!isDraggableTarget(index)) return;
		if (goalDrag.targetIndex === index) return;
		goalDrag = { ...goalDrag, targetIndex: index };
	}

	function startGoalDrag(pointerId, index, _clientX, _clientY) {
		if (!isDraggableSource(index)) return;
		goalDrag = {
			active: true,
			pointerId,
			sourceIndex: index,
			targetIndex: index,
			dragType: isGoalDragCell(index) ? 'goal' : 'task'
		};
	}

	function handleGlobalGoalPointerMove(event) {
		if (pendingGoalDrag && pendingGoalDrag.pointerId === event.pointerId) {
			const distance = Math.hypot(
				event.clientX - pendingGoalDrag.startX,
				event.clientY - pendingGoalDrag.startY
			);

			if (pendingGoalDrag.pointerType === 'touch') {
				if (distance > GOAL_DRAG_START_PX) {
					clearPendingGoalDrag();
				}
			} else if (distance >= GOAL_DRAG_START_PX) {
				startGoalDrag(event.pointerId, pendingGoalDrag.index, event.clientX, event.clientY);
				pendingGoalDrag = null;
			}
		}

		if (goalDrag.active && goalDrag.pointerId === event.pointerId) {
			event.preventDefault();
			// Update target index based on current pointer position
			const targetElement = document.elementFromPoint(event.clientX, event.clientY);
			const cellElement = targetElement?.closest?.('[data-harada-cell-index]');
			if (!cellElement) return;
			const indexAttr = cellElement.getAttribute('data-harada-cell-index');
			if (indexAttr == null) return;
			const index = Number(indexAttr);
			if (!Number.isInteger(index)) return;
			if (!isDraggableTarget(index)) return;
			if (goalDrag.targetIndex === index) return;
			goalDrag = { ...goalDrag, targetIndex: index };
		}
	}

	function clearGlobalGoalPointerListeners() {
		window.removeEventListener('pointermove', handleGlobalGoalPointerMove);
		window.removeEventListener('pointerup', handleGlobalGoalPointerUp);
		window.removeEventListener('pointercancel', handleGlobalGoalPointerUp);
	}

	function swapGoalData(sourceIndex, targetIndex, dragType) {
		if (!onUpdateGrid) return;
		if (sourceIndex === targetIndex) return;

		const newGrid = [...grid];

		if (dragType === 'task') {
			// Swap the two grid cells
			const s = newGrid[sourceIndex] ? { ...newGrid[sourceIndex] } : undefined;
			const t = newGrid[targetIndex] ? { ...newGrid[targetIndex] } : undefined;
			newGrid[sourceIndex] = t;
			newGrid[targetIndex] = s;

			// Swap todos keyed to these specific cell indices (each task cell is its own
			// canonical goal, so todos created on its page travel with it)
			const currentTodos = store.harada_chart.todos || [];
			const nextTodos = currentTodos.map((todo) => {
				if (todo?.listType && todo.listType !== 'goal') return todo;
				const gIdx = typeof todo?.goalIndex === 'number' ? todo.goalIndex : null;
				if (gIdx === sourceIndex) {
					return { ...todo, goalIndex: targetIndex, listType: 'goal', listId: `goal:${targetIndex}` };
				}
				if (gIdx === targetIndex) {
					return { ...todo, goalIndex: sourceIndex, listType: 'goal', listId: `goal:${sourceIndex}` };
				}
				return todo;
			});
			store.harada_chart.todos = nextTodos;

			onUpdateGrid(newGrid);
			return;
		}

		// Goal drag: swap entire outer blocks + linked center cells + todos
		const sourceCanonical = canonicalGoalIndex(sourceIndex);
		const targetCanonical = canonicalGoalIndex(targetIndex);

		if (sourceCanonical === 40 || targetCanonical === 40) return;
		if (sourceCanonical === targetCanonical) return;

		// Swap all 9 cells of each outer block pairwise (preserves relative task positions)
		const sourceCells = getBlockCellIndices(sourceCanonical);
		const targetCells = getBlockCellIndices(targetCanonical);
		for (let i = 0; i < sourceCells.length; i++) {
			const s = newGrid[sourceCells[i]] ? { ...newGrid[sourceCells[i]] } : undefined;
			const t = newGrid[targetCells[i]] ? { ...newGrid[targetCells[i]] } : undefined;
			newGrid[sourceCells[i]] = t;
			newGrid[targetCells[i]] = s;
		}

		// Swap the linked center-block cells (the "shadow" sub-goal in the center 3×3)
		const sourceLinked = getLinkedGoalIndex(sourceCanonical);
		const targetLinked = getLinkedGoalIndex(targetCanonical);
		if (sourceLinked !== null && targetLinked !== null) {
			const sL = newGrid[sourceLinked] ? { ...newGrid[sourceLinked] } : undefined;
			const tL = newGrid[targetLinked] ? { ...newGrid[targetLinked] } : undefined;
			newGrid[sourceLinked] = tL;
			newGrid[targetLinked] = sL;
		}

		updateGoalTimestamp(newGrid, sourceCanonical);
		updateGoalTimestamp(newGrid, targetCanonical);

		// Swap todos that belong to these goals
		const currentTodos = store.harada_chart.todos || [];
		const nextTodos = currentTodos.map((todo) => {
			if (todo?.listType && todo.listType !== 'goal') return todo;
			const goalIndex = typeof todo?.goalIndex === 'number' ? todo.goalIndex : null;
			if (goalIndex === sourceCanonical) {
				return { ...todo, goalIndex: targetCanonical, listType: 'goal', listId: `goal:${targetCanonical}` };
			}
			if (goalIndex === targetCanonical) {
				return { ...todo, goalIndex: sourceCanonical, listType: 'goal', listId: `goal:${sourceCanonical}` };
			}
			return todo;
		});

		store.harada_chart.todos = nextTodos;
		onUpdateGrid(newGrid);
	}

	// Returns the outer block center index for any cell in that block, or null for center-block cells
	function getOuterBlockCenter(index) {
		const row = Math.floor(index / 9);
		const col = index % 9;
		if (row >= 3 && row <= 5 && col >= 3 && col <= 5) return null;
		return (Math.floor(row / 3) * 3 + 1) * 9 + (Math.floor(col / 3) * 3 + 1);
	}

	function handleGlobalGoalPointerUp(event) {
		if (pendingGoalDrag && pendingGoalDrag.pointerId === event.pointerId) {
			clearPendingGoalDrag();
			clearGlobalGoalPointerListeners();
			return;
		}

		if (goalDrag.active && goalDrag.pointerId === event.pointerId) {
			event.preventDefault();
			if (
				goalDrag.sourceIndex != null &&
				goalDrag.targetIndex != null &&
				goalDrag.sourceIndex !== goalDrag.targetIndex
			) {
				swapGoalData(goalDrag.sourceIndex, goalDrag.targetIndex, goalDrag.dragType);
			}
			resetGoalDrag();
			clearGlobalGoalPointerListeners();
		}
	}

	function goalDragClass(index) {
		if (!goalDrag.active) return '';

		if (goalDrag.dragType === 'task') {
			// Highlight only the two individual cells being swapped
			if (index === goalDrag.sourceIndex) return 'harada-goal-ring-source';
			if (index === goalDrag.targetIndex) return 'harada-goal-ring-target';
			return '';
		}

		// Goal drag: highlight the whole block + linked center-block cell
		const sourceCanon = canonicalGoalIndex(goalDrag.sourceIndex);
		const targetCanon = canonicalGoalIndex(goalDrag.targetIndex);
		const row = Math.floor(index / 9);
		const col = index % 9;
		const inCenterBlock = row >= 3 && row <= 5 && col >= 3 && col <= 5;

		if (inCenterBlock) {
			if (index === getLinkedGoalIndex(sourceCanon)) return 'harada-goal-ring-source';
			if (index === getLinkedGoalIndex(targetCanon)) return 'harada-goal-ring-target';
		} else {
			const blockCenter = (Math.floor(row / 3) * 3 + 1) * 9 + (Math.floor(col / 3) * 3 + 1);
			if (blockCenter === sourceCanon) return 'harada-goal-ring-source';
			if (blockCenter === targetCanon) return 'harada-goal-ring-target';
		}
		return '';
	}
</script>

<!-- Full-screen chart grid: 3×3 blocks so block gaps don't change cell size -->
<div
	class="mx-auto grid grid-cols-3 gap-1 sm:gap-1.5"
	style="max-width: min(95vw, 95vh, 100dvw - 32px, 100dvh - 200px); touch-action: none;"
>
	{#each { length: 9 } as _, blockIndex}
		{@const blockRow = Math.floor(blockIndex / 3)}
		{@const blockCol = blockIndex % 3}
		<div
			class="grid gap-0.5 sm:gap-1"
			style="grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); aspect-ratio: 1;"
		>
			{#each { length: 9 } as _, innerIndex}
				{@const r = Math.floor(innerIndex / 3)}
				{@const c = innerIndex % 3}
				{@const row = blockRow * 3 + r}
				{@const col = blockCol * 3 + c}
				{@const i = row * 9 + col}
				{@const cellClasses = getCellClasses(row, col, i)}
				{@const hasTitle = hasCustomTitle(i)}

				{#if editingGoalIndex === i}
					<div
						class={`group aspect-square min-h-0 min-w-0 ${cellClasses} rounded-md touch-none ${goalDragClass(i)}`}
						data-harada-cell-index={i}
					>
						<div class="relative flex h-full w-full flex-col items-center justify-center p-0.5 sm:p-1">
							<input
								bind:this={editInputEl}
								bind:value={editingDraft}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										saveGoalTitle();
									} else if (e.key === 'Escape') {
										e.preventDefault();
										cancelGoalEdit();
									}
								}}
								onblur={() => saveGoalTitle()}
								placeholder="Add title…"
								class="w-full min-w-0 rounded bg-white/20 px-0.5 py-0 text-center text-[8px] leading-tight text-white placeholder:text-white/70 sm:text-[10px] md:text-xs focus:outline-none focus:ring-1 focus:ring-white/50"
							/>
						</div>
					</div>
				{:else}
					<button
						type="button"
						onpointerdown={(event) => handleCellPointerDown(event, i)}
						onpointerenter={(event) => handleCellPointerEnter(event, i)}
						onclick={() => {
							if (isCellBlank(i)) {
								startEditingGoal(i);
							} else {
								goto(`/todo/${indexToNomenclature(i)}`);
							}
						}}
						class={`group aspect-square min-h-0 min-w-0 transition-all duration-200 hover:scale-105 hover:z-20 ${cellClasses} rounded-md cursor-pointer touch-none ${goalDragClass(i)}`}
						data-harada-cell-index={i}
						aria-label={hasTitle ? grid[i]?.text : ''}
					>
						<div class="relative flex h-full w-full flex-col items-center justify-center p-0.5 sm:p-1">
							{#if hasTitle}
								<div class="w-full text-center text-[8px] leading-tight sm:text-[10px] md:text-xs overflow-hidden line-clamp-3">
									{grid[i]?.text || ''}
								</div>
								{#if grid[i]?.status === 'underway'}
									<div class="absolute bottom-0.5 left-0.5 text-[8px] sm:text-[10px]" title="Underway">⏳</div>
								{:else if grid[i]?.status === 'done'}
									<div class="absolute bottom-0.5 left-0.5 text-[8px] sm:text-[10px]" title="Done">✓</div>
								{/if}
							{:else}
								<span class="text-[8px] text-white/30 sm:text-[10px]">{i == 40 ? 'Central Goal' : store.getDefaultCell(i).text}</span>
							{/if}
						</div>
					</button>
				{/if}
			{/each}
		</div>
	{/each}
</div>
