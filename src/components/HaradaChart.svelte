<script>
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import {
		indexToNomenclature,
		canonicalGoalIndex,
		getLinkedGoalIndex,
		getBlockCellIndices,
		buildGoalBlockSwapMap,
		buildPairSwapMap,
		getGoalLabelFromIndex,
		defaultMergedGoalTitle,
		resolveGoalDropTargetIndex,
		updateGoalTimestamp
	} from '$lib/todoUtils.js';
	import { persistTodoMobileSidebar } from '$lib/workspaceNavResume.js';
	import { store } from '$stores/store.svelte.js';
	import GoalMergeModal from '$components/GoalMergeModal.svelte';

	let { grid, onUpdateGrid = null } = $props();

	function goToGoalTasksFromChart(goalCellIndex) {
		// Chart taps should always open the goal's task view on mobile, not the
		// previously persisted goal-list (menu) sidebar state.
		store.todoMobileShowsGoalList = false;
		persistTodoMobileSidebar(false);
		goto(`/todo/${indexToNomenclature(goalCellIndex)}`);
	}

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
		const isDark = store.activeTheme === 'dark';
		const darkColors = [
			'bg-rose-900/60 border-rose-600/50',
			'bg-amber-900/60 border-amber-600/50',
			'bg-lime-900/60 border-lime-600/50',
			'bg-cyan-900/60 border-cyan-600/50',
			'bg-violet-900/70 border-violet-600/60',
			'bg-sky-900/60 border-sky-600/50',
			'bg-fuchsia-900/60 border-fuchsia-600/50',
			'bg-teal-900/60 border-teal-600/50',
			'bg-orange-900/60 border-orange-600/50'
		];
		const lightColors = [
			'bg-rose-100/80 border-rose-300/70',
			'bg-amber-100/80 border-amber-300/70',
			'bg-lime-100/80 border-lime-300/70',
			'bg-cyan-100/80 border-cyan-300/70',
			'bg-violet-100/80 border-violet-300/70',
			'bg-sky-100/80 border-sky-300/70',
			'bg-fuchsia-100/80 border-fuchsia-300/70',
			'bg-teal-100/80 border-teal-300/70',
			'bg-orange-100/80 border-orange-300/70'
		];
		return isDark ? darkColors[blockIndex] : lightColors[blockIndex];
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
			if (isMainGoal(row, col)) {
				classes +=
					'bg-violet-600 border-2 border-violet-400 text-white font-bold shadow-lg shadow-violet-500/30 z-10';
			} else if (isSubGoal(row, col)) {
				classes += 'harada-chart-center-default';
			} else if (isBlockCenter(row, col)) {
				classes += 'harada-chart-center-default';
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

	// Mobile UX: the inline cell input is too small to type comfortably.
	// On mobile, float a larger input over the tapped cell.
	const isMobile = $derived.by(() => {
		if (!browser) return false;
		return window.matchMedia('(max-width: 640px)').matches;
	});
	let floatingEditPos = $state({ top: 0, left: 0, width: 260 });

	function isGoalCell(row, col) {
		return isMainGoal(row, col) || isSubGoal(row, col) || isBlockCenter(row, col);
	}

	function isCellBlank(i) {
		return !(grid[i]?.text ?? '').trim();
	}

	function startEditingGoal(i, anchorEl = null) {
		const canonical = canonicalGoalIndex(i);
		const mobile = browser && window.matchMedia('(max-width: 640px)').matches;

		// Compute floating placement before showing overlay to avoid a brief
		// "top-left" default render (floatingEditPos starts at 0,0).
		if (mobile && anchorEl) {
			const rect = anchorEl.getBoundingClientRect();
			const viewportW = window.innerWidth;
			const viewportH = window.innerHeight;

			let width = Math.min(viewportW - 16, Math.max(220, rect.width * 3));
			width = Math.min(width, viewportW * 0.92);

			const centerLeft = rect.left + rect.width / 2;
			const centerTop = rect.top + rect.height / 2;

			// We use `transform: translate(-50%, -50%)`, so clamp the CENTER point.
			const marginX = 16;
			const marginY = 64;
			const clampedLeft = Math.max(
				marginX + width / 2,
				Math.min(centerLeft, viewportW - marginX - width / 2)
			);
			const clampedTop = Math.max(marginY, Math.min(centerTop, viewportH - marginY));

			floatingEditPos = { top: clampedTop, left: clampedLeft, width };
		}

		editingDraft = (grid[canonical]?.text ?? '').trim();
		editingGoalIndex = i;

		// Focus after the DOM updates (no `autofocus` for a11y).
		requestAnimationFrame(() => {
			const selector =
				mobile
					? 'input[data-harada-goal-title-input="floating"]'
					: 'input[data-harada-goal-title-input="inline"]';
			const el = document.querySelector(selector);
			if (el instanceof HTMLInputElement) el.focus();
		});
	}

	function saveGoalTitle(andNavigate = false) {
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
		const savedIndex = editingGoalIndex;
		editingGoalIndex = null;
		editingDraft = '';
		if (andNavigate) goToGoalTasksFromChart(savedIndex);
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

	let mergeModalOpen = $state(false);
	let mergeSourceIndex = $state(null);
	let mergeTargetIndex = $state(null);
	let mergeSourceLabel = $state('');
	let mergeTargetLabel = $state('');
	let mergeTitleDraft = $state('');
	let blockCellClickUntil = 0;
	/** @type {Element | null} */
	let goalPointerCaptureEl = null;

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

		const captureEl = event.currentTarget;
		if (captureEl instanceof Element && captureEl.setPointerCapture) {
			captureEl.setPointerCapture(event.pointerId);
			goalPointerCaptureEl = captureEl;
		}

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

	function resolveDragTargetIndex(rawIndex) {
		if (!Number.isInteger(rawIndex)) return null;
		if (goalDrag.dragType === 'goal') return resolveGoalDropTargetIndex(rawIndex);
		// Non-central goal drags can land on any cell (move/merge/absorb).
		return rawIndex;
	}

	function findRawCellIndexAtPoint(clientX, clientY) {
		const hit = document
			.elementFromPoint(clientX, clientY)
			?.closest?.('[data-harada-cell-index]');
		if (hit) return Number(hit.getAttribute('data-harada-cell-index'));

		// Grid gaps are not inside any cell button — use bounding boxes as a fallback.
		for (const cell of document.querySelectorAll('[data-harada-cell-index]')) {
			const rect = cell.getBoundingClientRect();
			if (
				clientX >= rect.left &&
				clientX <= rect.right &&
				clientY >= rect.top &&
				clientY <= rect.bottom
			) {
				return Number(cell.getAttribute('data-harada-cell-index'));
			}
		}
		return null;
	}

	function updateGoalDragTargetFromRawIndex(rawIndex) {
		const nextIndex = resolveDragTargetIndex(rawIndex);
		if (nextIndex == null || goalDrag.targetIndex === nextIndex) return;
		goalDrag = { ...goalDrag, targetIndex: nextIndex };
	}

	function updateGoalDragTargetFromEvent(event) {
		if (!goalDrag.active || goalDrag.pointerId !== event.pointerId) return;
		const rawIndex = findRawCellIndexAtPoint(event.clientX, event.clientY);
		if (rawIndex == null) return;
		updateGoalDragTargetFromRawIndex(rawIndex);
	}

	function handleCellPointerEnter(_event, index) {
		if (!goalDrag.active) return;
		updateGoalDragTargetFromRawIndex(index);
	}

	function startGoalDrag(pointerId, index, _clientX, _clientY) {
		if (!isDraggableSource(index)) return;
		const dragType = isGoalDragCell(index) ? 'goal' : 'task';
		goalDrag = {
			active: true,
			pointerId,
			sourceIndex: index,
			targetIndex: index,
			dragType
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
			updateGoalDragTargetFromEvent(event);
		}
	}

	function releaseGoalPointerCapture(pointerId) {
		if (!goalPointerCaptureEl?.releasePointerCapture) {
			goalPointerCaptureEl = null;
			return;
		}
		try {
			goalPointerCaptureEl.releasePointerCapture(pointerId);
		} catch {
			// Already released or capture lost.
		}
		goalPointerCaptureEl = null;
	}

	function clearGlobalGoalPointerListeners(pointerId = null) {
		window.removeEventListener('pointermove', handleGlobalGoalPointerMove);
		window.removeEventListener('pointerup', handleGlobalGoalPointerUp);
		window.removeEventListener('pointercancel', handleGlobalGoalPointerUp);
		if (pointerId != null) releaseGoalPointerCapture(pointerId);
	}

	function shouldBlockCellClick() {
		return Date.now() < blockCellClickUntil;
	}

	// Cell-level occupancy: a goal cell is "occupied" if it has a title, readme,
	// or any linked task/note.
	function isGoalCellOccupied(index) {
		if (typeof index !== 'number') return false;
		const cell = grid[index];
		if ((cell?.text ?? '').trim()) return true;
		if ((cell?.readme ?? '').trim()) return true;
		if ((store.harada_chart.todos || []).some((t) => t?.goalIndex === index)) return true;
		if ((store.taskGoalLinks || []).some((l) => l.goalIndex === index)) return true;
		if ((store.noteGoalLinks || []).some((l) => l.goalIndex === index)) return true;
		return false;
	}

	function openGoalMergePrompt(sourceIndex, targetIndex) {
		const sourceLabel = getGoalLabelFromIndex(sourceIndex, grid);
		const targetLabel = getGoalLabelFromIndex(targetIndex, grid);
		mergeSourceIndex = sourceIndex;
		mergeTargetIndex = targetIndex;
		mergeSourceLabel = sourceLabel;
		mergeTargetLabel = targetLabel;
		mergeTitleDraft = defaultMergedGoalTitle(sourceLabel, targetLabel);
		mergeModalOpen = true;
	}

	function cancelGoalMerge() {
		mergeModalOpen = false;
		mergeSourceIndex = null;
		mergeTargetIndex = null;
		mergeSourceLabel = '';
		mergeTargetLabel = '';
		mergeTitleDraft = '';
	}

	async function confirmGoalMerge(mergedTitle) {
		if (mergeSourceIndex == null || mergeTargetIndex == null) return;
		await store.mergeGoalCells(mergeSourceIndex, mergeTargetIndex, { mergedTitle });
		cancelGoalMerge();
	}

	async function swapGoalMerge() {
		if (mergeSourceIndex == null || mergeTargetIndex == null) return;
		await swapGoalData(mergeSourceIndex, mergeTargetIndex, 'task');
		cancelGoalMerge();
	}

	async function swapGoalData(sourceIndex, targetIndex, dragType) {
		if (!onUpdateGrid) return;
		if (sourceIndex === targetIndex) return;

		const newGrid = [...grid];

		if (dragType === 'task') {
			// Swap the two grid cells
			const s = newGrid[sourceIndex] ? { ...newGrid[sourceIndex] } : undefined;
			const t = newGrid[targetIndex] ? { ...newGrid[targetIndex] } : undefined;
			newGrid[sourceIndex] = t;
			newGrid[targetIndex] = s;

			await store.applyGoalIndexSwapMap(buildPairSwapMap(sourceIndex, targetIndex));

			onUpdateGrid(newGrid);
			return;
		}

		// Goal drag: swap entire outer blocks + linked center cells + todos
		const sourceCanonical = canonicalGoalIndex(sourceIndex);
		const targetCanonical = canonicalGoalIndex(targetIndex);

		if (sourceCanonical === 40 || targetCanonical === 40) return;
		if (sourceCanonical === targetCanonical) return;

		// Every cell we move must be re-stamped, not just the two canonical ones.
		// A moved cell keeps the timestamp it had in its old square, so without this
		// a stale remote copy can out-date it and drag the old contents back.
		const swappedAt = new Date().toISOString();
		const moved = (cell) => (cell ? { ...cell, updated_at: swappedAt } : cell);

		// Swap all 9 cells of each outer block pairwise (preserves relative task positions)
		const sourceCells = getBlockCellIndices(sourceCanonical);
		const targetCells = getBlockCellIndices(targetCanonical);
		for (let i = 0; i < sourceCells.length; i++) {
			const s = newGrid[sourceCells[i]] ? { ...newGrid[sourceCells[i]] } : undefined;
			const t = newGrid[targetCells[i]] ? { ...newGrid[targetCells[i]] } : undefined;
			newGrid[sourceCells[i]] = moved(t);
			newGrid[targetCells[i]] = moved(s);
		}

		// Swap the linked center-block cells (the "shadow" sub-goal in the center 3×3)
		const sourceLinked = getLinkedGoalIndex(sourceCanonical);
		const targetLinked = getLinkedGoalIndex(targetCanonical);
		if (sourceLinked !== null && targetLinked !== null) {
			const sL = newGrid[sourceLinked] ? { ...newGrid[sourceLinked] } : undefined;
			const tL = newGrid[targetLinked] ? { ...newGrid[targetLinked] } : undefined;
			newGrid[sourceLinked] = moved(tL);
			newGrid[targetLinked] = moved(sL);
		}

		updateGoalTimestamp(newGrid, sourceCanonical);
		updateGoalTimestamp(newGrid, targetCanonical);

		await store.applyGoalIndexSwapMap(buildGoalBlockSwapMap(sourceCanonical, targetCanonical));

		onUpdateGrid(newGrid);
	}

	function normalizeReleaseIntent(dragState, releaseRawIndex, clientX, clientY) {
		const dragType = dragState.dragType;
		const sourceIndex = dragState.sourceIndex;
		const releaseIndex = Number.isInteger(releaseRawIndex)
			? releaseRawIndex
			: findRawCellIndexAtPoint(clientX, clientY);

		// Theme (central) drags resolve to a goal/theme cell; non-central goal drags
		// resolve to the exact cell the pointer is released over.
		const targetIndex =
			dragType === 'goal'
				? resolveGoalDropTargetIndex(releaseIndex)
				: Number.isInteger(releaseIndex)
					? releaseIndex
					: null;

		return {
			effectiveSourceIndex: sourceIndex,
			effectiveTargetIndex: targetIndex,
			effectiveDragType: dragType
		};
	}

	async function handleGlobalGoalPointerUp(event) {
		if (pendingGoalDrag && pendingGoalDrag.pointerId === event.pointerId) {
			clearPendingGoalDrag();
			clearGlobalGoalPointerListeners(event.pointerId);
			return;
		}

		if (goalDrag.active && goalDrag.pointerId === event.pointerId) {
			event.preventDefault();
			// Suppress click-to-navigate after any completed drag gesture.
			blockCellClickUntil = Date.now() + 500;
			const releaseRawIndex = findRawCellIndexAtPoint(event.clientX, event.clientY);
			const {
				effectiveSourceIndex: sourceIndex,
				effectiveTargetIndex: targetIndex,
				effectiveDragType: dragType
			} = normalizeReleaseIntent(goalDrag, releaseRawIndex, event.clientX, event.clientY);

			if (sourceIndex != null && targetIndex != null && sourceIndex !== targetIndex) {
				if (dragType === 'goal') {
					// Central squares can ONLY be swapped with other central squares
					// (whole block + sub-goals move together). Never merge, never main.
					const sourceCanonical = canonicalGoalIndex(sourceIndex);
					const targetCanonical = canonicalGoalIndex(targetIndex);
					const targetIsTheme = isGoalDragCell(targetIndex);
					if (
						targetIsTheme &&
						sourceCanonical !== targetCanonical &&
						sourceCanonical !== 40 &&
						targetCanonical !== 40
					) {
						await swapGoalData(sourceIndex, targetIndex, 'goal');
					}
				} else if (isTaskCell(targetIndex)) {
					// Non-central goal onto another non-central square.
					if (isGoalCellOccupied(targetIndex)) {
						// Occupied → merge / swap / cancel prompt.
						openGoalMergePrompt(sourceIndex, targetIndex);
					} else {
						// Empty → simply move it (with its tasks/notes).
						await swapGoalData(sourceIndex, targetIndex, 'task');
					}
				} else if (isGoalDragCell(targetIndex) || isMainGoalIndex(targetIndex)) {
					// Non-central goal onto a central goal → destroy the source goal,
					// moving all of its tasks/notes onto the central goal.
					const targetCanonical = canonicalGoalIndex(targetIndex);
					await store.mergeGoalCells(sourceIndex, targetCanonical, { mergedTitle: null });
				}
			}
			resetGoalDrag();
			clearGlobalGoalPointerListeners(event.pointerId);
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
	{#each { length: 9 } as _, blockIndex (blockIndex)}
		{@const blockRow = Math.floor(blockIndex / 3)}
		{@const blockCol = blockIndex % 3}
		<div
			class="grid gap-0.5 sm:gap-1"
			style="grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); aspect-ratio: 1;"
		>
			{#each { length: 9 } as _, innerIndex (innerIndex)}
				{@const r = Math.floor(innerIndex / 3)}
				{@const c = innerIndex % 3}
				{@const row = blockRow * 3 + r}
				{@const col = blockCol * 3 + c}
				{@const i = row * 9 + col}
				{@const cellClasses = getCellClasses(row, col, i)}
				{@const hasTitle = hasCustomTitle(i)}

				{#if editingGoalIndex === i}
					<div
						class={`group aspect-square min-h-0 min-w-0 ${cellClasses} rounded-md touch-none ${goalDragClass(i)} ring-2 ring-amber-300 shadow-md`}
						data-harada-cell-index={i}
					>
						<div class="relative flex h-full w-full flex-col items-center justify-center p-0.5 sm:p-1">
							{#if isMobile}
								<!-- Keep the cell stable, but typing happens in the floating input. -->
								<div class="w-full text-center text-[8px] leading-tight sm:text-[10px] md:text-xs">
									{editingDraft || ''}
								</div>
							{:else}
								<input
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
									data-harada-goal-title-input="inline"
									class="w-full min-w-0 rounded bg-white/20 px-0.5 py-0 text-center text-[8px] leading-tight text-white placeholder:text-white/70 sm:text-[10px] md:text-xs focus:outline-none focus:ring-1 focus:ring-white/50"
								/>
							{/if}
						</div>
					</div>
				{:else}
					<button
						type="button"
						onpointerdown={(event) => handleCellPointerDown(event, i)}
						onpointerenter={(event) => handleCellPointerEnter(event, i)}
						onclick={(e) => {
							if (shouldBlockCellClick()) {
								e.preventDefault();
								e.stopPropagation();
								return;
							}
							if (isCellBlank(i)) {
								startEditingGoal(i, e.currentTarget);
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
							{:else}
								<span class={`text-[8px] sm:text-[10px] ${store.activeTheme === 'dark' ? 'text-white/40' : 'text-slate-400/70'}`}>{i == 40 ? 'Central Goal' : store.getDefaultCell(i).text}</span>
							{/if}
						</div>
					</button>
				{/if}
			{/each}
		</div>
	{/each}
</div>

{#if isMobile && editingGoalIndex !== null}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-40 bg-black/50"
		role="presentation"
		onclick={(e) => { e.stopPropagation(); saveGoalTitle(); }}
	></div>
	<!-- Input card -->
	<div class="fixed inset-x-4 z-50" style={`top: ${floatingEditPos.top}px; transform: translateY(-50%);`}>
		<div
			data-harada-goal-edit-card
			class={`rounded-2xl p-4 shadow-2xl ${
				store.activeTheme === 'dark' ? 'bg-slate-900' : 'bg-white'
			}`}
		>
			<input
				bind:value={editingDraft}
				aria-label="Edit goal title"
				data-harada-goal-title-input="floating"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						saveGoalTitle(true);
					} else if (e.key === 'Escape') {
						e.preventDefault();
						cancelGoalEdit();
					}
				}}
				onblur={(e) => {
					// Only save on blur if focus is leaving the whole card (not to our own buttons).
					const related = e.relatedTarget;
					if (!(related instanceof Element) || !related.closest('[data-harada-goal-edit-card]')) {
						saveGoalTitle();
					}
				}}
				placeholder="Goal title…"
				class={`w-full rounded-lg border px-3 py-3 text-center text-base leading-tight outline-none focus:ring-2 focus:ring-amber-400 ${
					store.activeTheme === 'dark'
						? 'border-slate-700 bg-slate-800 text-white placeholder:text-slate-500'
						: 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400'
				}`}
			/>
			<div class="mt-3 flex gap-2">
				<button
					type="button"
					onclick={() => cancelGoalEdit()}
					class={`flex-1 rounded-lg py-2 text-sm font-medium ${
						store.activeTheme === 'dark'
							? 'bg-slate-700 text-slate-200 active:bg-slate-600'
							: 'bg-slate-100 text-slate-700 active:bg-slate-200'
					}`}
				>Cancel</button>
				<button
					type="button"
					onclick={() => saveGoalTitle(true)}
					class="flex-1 rounded-lg bg-amber-400 py-2 text-sm font-semibold text-slate-900 active:bg-amber-500"
				>Save</button>
			</div>
		</div>
	</div>
{/if}

<GoalMergeModal
	bind:isOpen={mergeModalOpen}
	sourceLabel={mergeSourceLabel}
	targetLabel={mergeTargetLabel}
	bind:mergedTitle={mergeTitleDraft}
	onConfirm={confirmGoalMerge}
	onSwap={swapGoalMerge}
	onCancel={cancelGoalMerge}
/>
