<script>
	import { browser, dev } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import TodoItem from '$components/TodoItem.svelte';

	let {
		groups = [],
		allGoals = [],
		onAddToGroup = null,
		onUpdate = null,
		onDelete = null,
		onToggleStatus = null,
		onCreateNext = null,
		onDeletePrevious = null,
		onMakeSubtask = null,
		onOutdent = null,
		onTitleFocus = null,
		getIndentLevel = null,
		canIndent = null,
		canOutdent = null,
		disableAutoFocus = false,
		onCreateTodo = null,
		onMoveTodo = null,
		allowCrossListMove = false,
		enableGroupDrag = false,
		onMoveGroup = null,
		searchText = '',
		targetTodoId = null,
		/** Immediately-updated focused task id (beats async `goto` updating `?task=`) */
		activeTodoId = null,
		/** When true, pinned tasks show pink chrome; top duplicate strip uses feedPinnedTodos + resolveGroupForTodo */
		isMainTodoFeed = false,
		feedPinnedTodos = null,
		resolveGroupForTodo = null,
		getPrimaryNoteForTodo = null,
		getLinkedNotesForTodo = null,
		onUpsertPrimaryNote = null,
		getLinkedGoalIndicesForTodo = null
	} = $props();

	const LONG_PRESS_MS = 260;
	const DRAG_START_PX = 6;
	const CHILD_ZONE_TOP = 0.25;
	const CHILD_ZONE_BOTTOM = 0.75;
	const SCROLL_ZONE_PX = 80;
	const MAX_SCROLL_SPEED = 14;
	let pressTimer = null;
	let pendingDrag = null;
	let autoScrollRAF = null;
	let currentDragY = 0;
	let taskDrag = $state({
		active: false,
		pointerId: null,
		draggedTodoId: null,
		targetTodoId: null,
		targetGroupId: null,
		dropMode: 'after'
	});
	let groupDrag = $state({
		active: false,
		pointerId: null,
		draggedGroupId: null,
		targetGroupId: null,
		dropMode: 'after'
	});
	let dragGhost = $state({
		show: false,
		x: 0,
		y: 0,
		width: 300,
		offsetX: 20,
		offsetY: 20,
		label: '',
		isGroup: false
	});
	let justDidGroupDrag = false;
	let collapsedTodos = $state(new Set());

	const highlightTaskId = $derived(activeTodoId ?? targetTodoId);

	function shouldLogPerf() {
		return browser && (dev || localStorage.getItem('harada_perf') === '1');
	}

	function countGroupTodos(listGroups) {
		let count = 0;
		for (const group of listGroups || []) {
			if (group.subGroups) {
				for (const subGroup of group.subGroups) count += subGroup.todos?.length ?? 0;
			} else {
				count += group.todos?.length ?? 0;
			}
		}
		return count;
	}

	onMount(() => {
		if (!shouldLogPerf()) return;
		const start = performance.now();
		console.log('[Harada perf] TodoList mounted', {
			groups: groups.length,
			rows: countGroupTodos(groups),
			pinned: feedPinnedTodos?.length ?? 0,
			search: searchText
		});
		tick().then(() => {
			console.log(`[Harada perf] TodoList first DOM flush: ${(performance.now() - start).toFixed(1)}ms`, {
				groups: groups.length,
				rows: countGroupTodos(groups)
			});
		});
	});

	$effect(() => {
		if (!targetTodoId) return;
		const target = getTodoById(targetTodoId);
		if (!target?.parentId) return;
		const nextCollapsed = new Set(collapsedTodos);
		let current = target;
		const seen = new Set();
		let changed = false;
		while (current?.parentId) {
			if (seen.has(current.id)) break;
			seen.add(current.id);
			if (nextCollapsed.delete(current.parentId)) changed = true;
			current = getTodoById(current.parentId);
		}
		if (changed) collapsedTodos = nextCollapsed;
	});

	$effect(() => {
		if (taskDrag.active || groupDrag.active) {
			document.body.style.cursor = 'grabbing';
			document.body.style.userSelect = 'none';
		} else {
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		}
	});

	const flatTodos = $derived.by(() => {
		const start = browser ? performance.now() : 0;
		const all = [];
		for (const group of groups) {
			if (group.subGroups) {
				for (const subGroup of group.subGroups) {
					for (const todo of subGroup.todos || []) {
						all.push(todo);
					}
				}
			} else {
				for (const todo of group.todos || []) {
					all.push(todo);
				}
			}
		}
		if (shouldLogPerf()) {
			console.log(`[Harada perf] TodoList flatTodos derive: ${(performance.now() - start).toFixed(1)}ms`, {
				groups: groups.length,
				rows: all.length
			});
		}
		return all;
	});

	const parentTodoIds = $derived.by(() => {
		const ids = new Set();
		for (const todo of flatTodos) {
			if (todo.parentId) ids.add(todo.parentId);
		}
		return ids;
	});

	function getTodoById(todoId) {
		return flatTodos.find((todo) => todo.id === todoId) || null;
	}

	function getTodoOrdering(todo) {
		if (typeof todo?.ordering === 'number' && Number.isFinite(todo.ordering)) return todo.ordering;
		if (typeof todo?.createdAt === 'number' && Number.isFinite(todo.createdAt)) return todo.createdAt;
		return 0;
	}

	function getSiblingTodos(listId, parentId, excludeId = null) {
		return flatTodos
			.filter(
				(todo) =>
					todo.listId === listId &&
					(todo.parentId ?? null) === (parentId ?? null) &&
					todo.id !== excludeId
			)
			.sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b));
	}

	function isDescendant(candidateId, ancestorId) {
		let current = getTodoById(candidateId);
		const seen = new Set();
		while (current?.parentId) {
			if (seen.has(current.id)) break;
			seen.add(current.id);
			if (current.parentId === ancestorId) return true;
			current = getTodoById(current.parentId);
		}
		return false;
	}

	function isHiddenByCollapse(todoId) {
		let todo = getTodoById(todoId);
		const seen = new Set();
		while (todo?.parentId) {
			if (seen.has(todo.id)) break;
			seen.add(todo.id);
			if (collapsedTodos.has(todo.parentId)) return true;
			todo = getTodoById(todo.parentId);
		}
		return false;
	}

	function matchesSearch(todo) {
		const query = (searchText ?? '').trim().toLowerCase();
		if (!query) return true;
		const title = (todo?.title ?? '').toLowerCase();
		const md = (todo?.markdown ?? '').toLowerCase();
		return title.includes(query) || md.includes(query);
	}

	function groupMatchesSearch(group) {
		const query = (searchText ?? '').trim().toLowerCase();
		if (!query) return false;
		const label = (group?.label ?? '').toLowerCase();
		return label.includes(query);
	}

	const visibleFeedPinned = $derived.by(() => {
		if (!isMainTodoFeed || !feedPinnedTodos?.length) return [];
		const query = (searchText ?? '').trim().toLowerCase();
		if (!query) return feedPinnedTodos;
		return feedPinnedTodos.filter((t) => matchesSearch(t));
	});

	function hasVisibleTodosInGroup(group) {
		if (!group) return false;
		const query = (searchText ?? '').trim().toLowerCase();

		// No active search: visible if it has any todos at all
		if (!query) {
			if (group.subGroups && group.subGroups.length > 0) {
				return group.subGroups.some((subGroup) => (subGroup.todos || []).length > 0);
			}
			return (group.todos || []).length > 0;
		}

		// If the goal label matches the search, show the group as long as it has any todos
		if (groupMatchesSearch(group)) {
			if (group.subGroups && group.subGroups.length > 0) {
				return group.subGroups.some((subGroup) => (subGroup.todos || []).length > 0);
			}
			return (group.todos || []).length > 0;
		}

		// Otherwise, visible only if any todo title matches
		if (group.subGroups && group.subGroups.length > 0) {
			return group.subGroups.some((subGroup) =>
				(subGroup.todos || []).some((t) => !isHiddenByCollapse(t.id) && matchesSearch(t))
			);
		}
		return (group.todos || []).some((t) => !isHiddenByCollapse(t.id) && matchesSearch(t));
	}

	function toggleCollapse(todoId) {
		const next = new Set(collapsedTodos);
		if (next.has(todoId)) {
			next.delete(todoId);
		} else {
			next.add(todoId);
		}
		collapsedTodos = next;
	}

	function clearPendingDrag() {
		if (pressTimer) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
		pendingDrag = null;
	}

	// Prevent the browser from classifying the active drag as a scroll gesture,
	// which would fire pointercancel and kill the drag mid-flight on mobile.
	function preventTouchScroll(e) {
		e.preventDefault();
	}

	function startAutoScroll() {
		stopAutoScroll();
		function loop() {
			if (!taskDrag.active && !groupDrag.active) {
				autoScrollRAF = null;
				return;
			}
			const vh = window.innerHeight;
			const y = currentDragY;
			if (y > 0 && y < SCROLL_ZONE_PX) {
				const t = 1 - y / SCROLL_ZONE_PX;
				window.scrollBy(0, -Math.round(MAX_SCROLL_SPEED * t));
			} else if (y > vh - SCROLL_ZONE_PX && y < vh) {
				const t = (y - (vh - SCROLL_ZONE_PX)) / SCROLL_ZONE_PX;
				window.scrollBy(0, Math.round(MAX_SCROLL_SPEED * t));
			}
			autoScrollRAF = requestAnimationFrame(loop);
		}
		autoScrollRAF = requestAnimationFrame(loop);
	}

	function stopAutoScroll() {
		if (autoScrollRAF !== null) {
			cancelAnimationFrame(autoScrollRAF);
			autoScrollRAF = null;
		}
	}

	function startTaskDrag(pointerId, todoId, clientX, clientY) {
		const el = document.querySelector(`[data-dnd-item-id="${todoId}"]`);
		const rect = el?.getBoundingClientRect();
		dragGhost = {
			show: true,
			x: clientX,
			y: clientY,
			width: rect?.width ?? 300,
			offsetX: rect ? Math.min(Math.max(clientX - rect.left, 0), rect.width) : 20,
			offsetY: rect ? Math.min(Math.max(clientY - rect.top, 0), rect.height) : 20,
			label: getTodoById(todoId)?.title || '',
			isGroup: false
		};
		taskDrag = {
			active: true,
			pointerId,
			draggedTodoId: todoId,
			targetTodoId: todoId,
			targetGroupId: null,
			dropMode: 'after'
		};
		currentDragY = clientY;
		document.addEventListener('touchmove', preventTouchScroll, { passive: false });
		startAutoScroll();
	}

	function startGroupDrag(pointerId, groupId, clientX, clientY) {
		const el = document.querySelector(`[data-dnd-group-id="${groupId}"]`);
		const rect = el?.getBoundingClientRect();
		const label = groups.find((g) => g.id === groupId)?.label || '';
		dragGhost = {
			show: true,
			x: clientX,
			y: clientY,
			width: rect?.width ?? 300,
			offsetX: rect ? Math.min(Math.max(clientX - rect.left, 0), rect.width) : 20,
			offsetY: rect ? Math.min(Math.max(clientY - rect.top, 0), rect.height) : 12,
			label,
			isGroup: true
		};
		groupDrag = {
			active: true,
			pointerId,
			draggedGroupId: groupId,
			targetGroupId: groupId,
			dropMode: 'after'
		};
		currentDragY = clientY;
		document.addEventListener('touchmove', preventTouchScroll, { passive: false });
		startAutoScroll();
	}

	function handleTaskPointerDown(event, todo) {
		if (!onMoveTodo) return;
		if (!event.isPrimary) return;
		if (event.button !== 0) return;
		if (event.target?.closest('input, textarea, select, [contenteditable="true"]')) return;

		clearPendingDrag();
		pendingDrag = {
			kind: 'task',
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			id: todo.id,
			pointerType: event.pointerType || 'mouse'
		};
		window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false });
		window.addEventListener('pointerup', handleGlobalPointerUp, { passive: false });
		window.addEventListener('pointercancel', handleGlobalPointerCancel, { passive: false });

		if (pendingDrag.pointerType === 'touch') {
			const cx = event.clientX;
			const cy = event.clientY;
			pressTimer = setTimeout(() => {
				startTaskDrag(event.pointerId, todo.id, cx, cy);
				pendingDrag = null;
			}, LONG_PRESS_MS);
		}
	}

	function handleGroupPointerDown(event, groupId) {
		if (!onMoveGroup || !enableGroupDrag) return;
		if (!event.isPrimary) return;
		if (event.button !== 0) return;

		clearPendingDrag();
		pendingDrag = {
			kind: 'group',
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			id: groupId,
			pointerType: event.pointerType || 'mouse'
		};
		window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false });
		window.addEventListener('pointerup', handleGlobalPointerUp, { passive: false });
		window.addEventListener('pointercancel', handleGlobalPointerCancel, { passive: false });

		if (pendingDrag.pointerType === 'touch') {
			const cx = event.clientX;
			const cy = event.clientY;
			pressTimer = setTimeout(() => {
				startGroupDrag(event.pointerId, groupId, cx, cy);
				pendingDrag = null;
			}, LONG_PRESS_MS);
		}
	}

	function resolveTaskDropTarget(clientX, clientY) {
		const targetElement = document.elementFromPoint(clientX, clientY);
		const itemElement = targetElement?.closest?.('[data-dnd-item-id]');
		if (itemElement) {
			const targetTodoId = itemElement.getAttribute('data-dnd-item-id');
			if (!targetTodoId) return null;

			const rect = itemElement.getBoundingClientRect();
			const ratio = (clientY - rect.top) / Math.max(rect.height, 1);

			let dropMode;
			if (ratio < CHILD_ZONE_TOP) {
				dropMode = 'before';
			} else if (ratio > CHILD_ZONE_BOTTOM) {
				dropMode = 'after';
			} else {
				dropMode = 'child';
			}

			return { targetTodoId, targetGroupId: null, dropMode };
		}

		// Dropping over a group header means "insert as first task in this group".
		const headerElement = targetElement?.closest?.('[data-dnd-group-drop-id]');
		if (!headerElement) return null;
		const targetGroupId = headerElement.getAttribute('data-dnd-group-drop-id');
		if (!targetGroupId) return null;
		return { targetTodoId: null, targetGroupId, dropMode: 'group-top' };
	}

	function resolveGroupDropTarget(clientX, clientY) {
		const targetElement = document.elementFromPoint(clientX, clientY);
		const groupElement = targetElement?.closest?.('[data-dnd-group-id]');
		if (!groupElement) return null;
		const targetGroupId = groupElement.getAttribute('data-dnd-group-id');
		if (!targetGroupId) return null;
		const rect = groupElement.getBoundingClientRect();
		const yRatio = (clientY - rect.top) / Math.max(rect.height, 1);
		return { targetGroupId, dropMode: yRatio < 0.5 ? 'before' : 'after' };
	}

	function handleGlobalPointerMove(event) {
		if (pendingDrag && pendingDrag.pointerId === event.pointerId) {
			const distance = Math.hypot(
				event.clientX - pendingDrag.startX,
				event.clientY - pendingDrag.startY
			);
			if (pendingDrag.pointerType === 'touch') {
				if (distance > DRAG_START_PX) {
					clearPendingDrag();
				}
			} else if (distance >= DRAG_START_PX) {
				if (pendingDrag.kind === 'task') {
					startTaskDrag(event.pointerId, pendingDrag.id, event.clientX, event.clientY);
				} else {
					startGroupDrag(event.pointerId, pendingDrag.id, event.clientX, event.clientY);
				}
				pendingDrag = null;
			}
		}

		if (taskDrag.active && taskDrag.pointerId === event.pointerId) {
			event.preventDefault();
			currentDragY = event.clientY;
			dragGhost = { ...dragGhost, x: event.clientX, y: event.clientY };
			const target = resolveTaskDropTarget(event.clientX, event.clientY);
			if (!target) return;
			if (target.targetTodoId === taskDrag.draggedTodoId) {
				taskDrag = { ...taskDrag, targetTodoId: target.targetTodoId, dropMode: 'after' };
				return;
			}
			if (
				target.dropMode === 'child' &&
				target.targetTodoId &&
				isDescendant(target.targetTodoId, taskDrag.draggedTodoId)
			) {
				target.dropMode = 'after';
			}
			taskDrag = {
				...taskDrag,
				targetTodoId: target.targetTodoId,
				targetGroupId: target.targetGroupId,
				dropMode: target.dropMode
			};
			return;
		}

		if (!groupDrag.active || groupDrag.pointerId !== event.pointerId) return;
		event.preventDefault();
		currentDragY = event.clientY;
		dragGhost = { ...dragGhost, x: event.clientX, y: event.clientY };
		const target = resolveGroupDropTarget(event.clientX, event.clientY);
		if (!target) return;
		if (target.targetGroupId === groupDrag.draggedGroupId) {
			groupDrag = { ...groupDrag, targetGroupId: target.targetGroupId, dropMode: 'after' };
			return;
		}
		groupDrag = { ...groupDrag, targetGroupId: target.targetGroupId, dropMode: target.dropMode };
	}

	function buildTaskMovePayload() {
		const dragged = getTodoById(taskDrag.draggedTodoId);
		if (!dragged) return null;

		if (taskDrag.dropMode === 'group-top' && taskDrag.targetGroupId) {
			const group = groups.find((g) => g.id === taskDrag.targetGroupId);
			if (!group) return null;

			let listType = 'goal';
			let goalIndex = group.goalIndex ?? null;
			let listId = goalIndex === null ? 'goal:none' : `goal:${goalIndex}`;
			let listName = null;

			if (group.groupType === 'custom') {
				listType = 'custom';
				goalIndex = null;
				listId = group.listId;
				listName = group.label || 'New list';
			}

			if (!allowCrossListMove && dragged.listId !== listId) return null;
			return {
				listId,
				listType,
				goalIndex,
				listName,
				parentId: null,
				afterTodoId: null
			};
		}

		const target = getTodoById(taskDrag.targetTodoId);
		if (!target || dragged.id === target.id) return null;
		if (!allowCrossListMove && dragged.listId !== target.listId) return null;

		const targetListId = target.listId;
		const targetListType = target.listType || 'goal';
		const targetGoalIndex = target.goalIndex ?? null;
		const targetListName = target.listName || null;

		if (taskDrag.dropMode === 'child') {
			return {
				listId: targetListId,
				listType: targetListType,
				goalIndex: targetGoalIndex,
				listName: targetListName,
				parentId: target.id,
				afterTodoId: null
			};
		}

		const siblingParentId = target.parentId ?? null;
		const siblings = getSiblingTodos(targetListId, siblingParentId, dragged.id);
		const targetIndex = siblings.findIndex((todo) => todo.id === target.id);
		if (targetIndex === -1) return null;
		if (taskDrag.dropMode === 'before') {
			const previousSibling = siblings[targetIndex - 1] || null;
			return {
				listId: targetListId,
				listType: targetListType,
				goalIndex: targetGoalIndex,
				listName: targetListName,
				parentId: siblingParentId,
				afterTodoId: previousSibling ? previousSibling.id : null
			};
		}
		return {
			listId: targetListId,
			listType: targetListType,
			goalIndex: targetGoalIndex,
			listName: targetListName,
			parentId: siblingParentId,
			afterTodoId: target.id
		};
	}

	function stopTaskDrag() {
		document.removeEventListener('touchmove', preventTouchScroll);
		stopAutoScroll();
		dragGhost = { ...dragGhost, show: false };
		taskDrag = {
			active: false,
			pointerId: null,
			draggedTodoId: null,
			targetTodoId: null,
			targetGroupId: null,
			dropMode: 'after'
		};
	}

	function stopGroupDrag() {
		document.removeEventListener('touchmove', preventTouchScroll);
		stopAutoScroll();
		dragGhost = { ...dragGhost, show: false };
		groupDrag = {
			active: false,
			pointerId: null,
			draggedGroupId: null,
			targetGroupId: null,
			dropMode: 'after'
		};
	}

	function clearGlobalPointerListeners() {
		window.removeEventListener('pointermove', handleGlobalPointerMove);
		window.removeEventListener('pointerup', handleGlobalPointerUp);
		window.removeEventListener('pointercancel', handleGlobalPointerCancel);
	}

	function handleGlobalPointerUp(event) {
		if (pendingDrag && pendingDrag.pointerId === event.pointerId) {
			clearPendingDrag();
			clearGlobalPointerListeners();
			return;
		}

		if (taskDrag.active && taskDrag.pointerId === event.pointerId) {
			event.preventDefault();
			const payload = buildTaskMovePayload();
			if (payload && onMoveTodo) {
				onMoveTodo(taskDrag.draggedTodoId, payload);
			}
			stopTaskDrag();
			clearGlobalPointerListeners();
			return;
		}

		if (groupDrag.active && groupDrag.pointerId === event.pointerId) {
			event.preventDefault();
			if (
				onMoveGroup &&
				groupDrag.targetGroupId &&
				groupDrag.draggedGroupId &&
				groupDrag.targetGroupId !== groupDrag.draggedGroupId
			) {
				onMoveGroup(groupDrag.draggedGroupId, groupDrag.targetGroupId, groupDrag.dropMode);
				justDidGroupDrag = true;
				document.addEventListener('click', preventClickAfterGroupDrag, true);
			}
			stopGroupDrag();
			clearGlobalPointerListeners();
		}
	}

	// pointercancel means the browser reclaimed the touch (e.g. system gesture).
	// Stop the drag cleanly without applying any move.
	function handleGlobalPointerCancel(event) {
		if (pendingDrag && pendingDrag.pointerId === event.pointerId) {
			clearPendingDrag();
			clearGlobalPointerListeners();
			return;
		}
		if (taskDrag.active && taskDrag.pointerId === event.pointerId) {
			stopTaskDrag();
			clearGlobalPointerListeners();
			return;
		}
		if (groupDrag.active && groupDrag.pointerId === event.pointerId) {
			stopGroupDrag();
			clearGlobalPointerListeners();
		}
	}

	function preventClickAfterGroupDrag(e) {
		document.removeEventListener('click', preventClickAfterGroupDrag, true);
		if (!justDidGroupDrag) return;
		justDidGroupDrag = false;
		if (e.target?.closest?.('[data-dnd-group-drop-id] a')) {
			e.preventDefault();
			e.stopPropagation();
		}
	}

	function itemDragClass(todoId) {
		if (!taskDrag.active) return '';
		if (taskDrag.draggedTodoId === todoId) return 'opacity-0 pointer-events-none';
		if (taskDrag.targetTodoId !== todoId) return '';
		if (taskDrag.dropMode === 'child') return 'todo-drag-child-target';
		return '';
	}

	function targetTodoClass(todoId) {
		return highlightTaskId === todoId
			? 'ring-2 ring-violet-400/80 ring-offset-2 ring-offset-transparent'
			: '';
	}

	function showChildIndicator(todoId) {
		return taskDrag.active && taskDrag.targetTodoId === todoId && taskDrag.dropMode === 'child';
	}

	function showPlaceholderBefore(todoId) {
		return taskDrag.active && taskDrag.targetTodoId === todoId && taskDrag.dropMode === 'before';
	}

	function showPlaceholderAfter(todoId) {
		return taskDrag.active && taskDrag.targetTodoId === todoId && taskDrag.dropMode === 'after';
	}

	function showHeaderTopPlaceholder(groupId) {
		return taskDrag.active && taskDrag.targetGroupId === groupId && taskDrag.dropMode === 'group-top';
	}

	function groupDragClass(groupId) {
		if (!groupDrag.active) return '';
		if (groupDrag.draggedGroupId === groupId) return 'opacity-0 pointer-events-none';
		if (groupDrag.targetGroupId !== groupId) return '';
		if (groupDrag.dropMode === 'before') return 'border-t-2 border-violet-400';
		return 'border-b-2 border-violet-400';
	}
</script>

{#if dragGhost.show}
	<div
		class="todo-drag-ghost"
		style="left: {dragGhost.x - dragGhost.offsetX}px; top: {dragGhost.y - dragGhost.offsetY}px; width: {dragGhost.width}px; transform: rotate(1.5deg) scale(1.03); will-change: left, top;"
	>
		{#if dragGhost.isGroup}
			<div class="flex items-center gap-2">
				<div class="h-1 w-4 flex-shrink-0 rounded-full bg-violet-400/60"></div>
				<span class="todo-drag-ghost-title">{dragGhost.label || 'Group'}</span>
			</div>
		{:else}
			<div class="flex items-center gap-2">
				<div class="todo-drag-ghost-dot"></div>
				<span class="todo-drag-ghost-title">{dragGhost.label || '-'}</span>
			</div>
		{/if}
	</div>
{/if}

<div class="space-y-6">
	{#if onCreateTodo}
		<div class="mb-6 hidden lg:block">
			<button
				type="button"
				onclick={onCreateTodo}
				class="rounded-btn"
			>
				+ New task
			</button>
		</div>
	{/if}

	{#if isMainTodoFeed && visibleFeedPinned.length > 0 && resolveGroupForTodo}
		<div class="mb-6 space-y-2">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-pink-300/90">Pinned</h2>
			<div class="space-y-2">
				{#each visibleFeedPinned as todo (todo.id)}
					{@const pinGroup = resolveGroupForTodo(todo)}
					{#if pinGroup}
						<div
							data-dnd-item-id={todo.id}
							onpointerdown={(event) => handleTaskPointerDown(event, todo)}
							class={`relative rounded-lg transition ${itemDragClass(todo.id)} ${targetTodoClass(todo.id)}`}
						>
							{#if showChildIndicator(todo.id)}
								<div class="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2">
									<span class="rounded bg-violet-800/90 px-1.5 py-0.5 text-xs text-violet-200">nest inside</span>
								</div>
							{/if}
							<TodoItem
								{todo}
								onUpdate={(patch) => onUpdate && onUpdate(todo.id, patch)}
								onDelete={() => onDelete && onDelete(todo.id)}
								onToggleStatus={() => onToggleStatus && onToggleStatus(todo.id)}
								onCreateNext={() => onCreateNext && onCreateNext(todo.id, pinGroup)}
								onDeletePrevious={() => onDeletePrevious && onDeletePrevious(todo.id, pinGroup)}
								onMakeSubtask={() => onMakeSubtask && onMakeSubtask(todo.id, pinGroup)}
								onOutdent={() => onOutdent && onOutdent(todo.id, pinGroup)}
								onTitleFocus={(id) => onTitleFocus && onTitleFocus(id)}
								indentLevel={getIndentLevel ? getIndentLevel(todo.id, pinGroup) : 0}
								canIndent={canIndent ? canIndent(todo.id, pinGroup) : false}
								canOutdent={canOutdent ? canOutdent(todo.id, pinGroup) : false}
								{allGoals}
								allTodos={pinGroup.todos}
								pageTaskId={highlightTaskId}
								{disableAutoFocus}
								hasChildren={parentTodoIds.has(todo.id)}
								isCollapsed={collapsedTodos.has(todo.id)}
								onToggleCollapse={() => toggleCollapse(todo.id)}
								isFeedPinnedDuplicate={true}
								mainFeedPinStyle="top"
								primaryNote={getPrimaryNoteForTodo ? getPrimaryNoteForTodo(todo.id) : null}
								linkedNotes={getLinkedNotesForTodo ? getLinkedNotesForTodo(todo.id) : []}
								linkedGoalIndices={getLinkedGoalIndicesForTodo ? getLinkedGoalIndicesForTodo(todo.id) : []}
								onUpsertPrimaryNote={(content) =>
									onUpsertPrimaryNote && onUpsertPrimaryNote(todo.id, content, pinGroup)}
							/>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
	
	{#each groups as group}
		{#if !searchText || hasVisibleTodosInGroup(group)}
			<div
				data-dnd-group-id={group.groupType === 'goal' ? group.id : null}
				class={`${group.groupType === 'goal' ? `rounded-lg transition ${groupDragClass(group.id)}` : ''}`}
			>
				{#if groups.length > 1 || group.subGroups}
					<div
						data-dnd-group-drop-id={group.id}
						class="mb-4 {enableGroupDrag && group.groupType === 'goal' ? 'cursor-grab active:cursor-grabbing' : ''}"
						onpointerdown={(event) => handleGroupPointerDown(event, group.id)}
					>
						<h2 class="todo-group-heading">
							{#if group.href}
								<a
									href={group.href}
									class="hover:text-violet-400 transition-colors"
									ondragstart={(e) => e.preventDefault()}
								>
									{group.label}
								</a>
							{:else}
								{group.label}
							{/if}
						</h2>
					</div>
				{/if}
			{#if group.subGroups}
				<!-- Render nested sub-groups -->
				<div class="todo-subgroup-container">
					{#each group.subGroups as subGroup}
						{#if groupMatchesSearch(group) || subGroup.todos.some((t) => !isHiddenByCollapse(t.id) && matchesSearch(t))}
							<div>
								<div class="space-y-2">
									{#each subGroup.todos.filter(t => !isHiddenByCollapse(t.id) && (groupMatchesSearch(group) || matchesSearch(t))) as todo (todo.id)}
										{#if showPlaceholderBefore(todo.id)}
											<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
										{/if}
										<div
											data-dnd-item-id={todo.id}
											onpointerdown={(event) => handleTaskPointerDown(event, todo)}
											class={`relative rounded-lg transition ${itemDragClass(todo.id)} ${targetTodoClass(todo.id)}`}
										>
											{#if showChildIndicator(todo.id)}
												<div class="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2">
													<span class="rounded bg-violet-800/90 px-1.5 py-0.5 text-xs text-violet-200">nest inside</span>
												</div>
											{/if}
											<TodoItem
												{todo}
												onUpdate={(patch) => onUpdate && onUpdate(todo.id, patch)}
												onDelete={() => onDelete && onDelete(todo.id)}
												onToggleStatus={() => onToggleStatus && onToggleStatus(todo.id)}
												onCreateNext={() => onCreateNext && onCreateNext(todo.id, subGroup)}
												onDeletePrevious={() => onDeletePrevious && onDeletePrevious(todo.id, subGroup)}
												onMakeSubtask={() => onMakeSubtask && onMakeSubtask(todo.id, subGroup)}
												onOutdent={() => onOutdent && onOutdent(todo.id, subGroup)}
												onTitleFocus={(id) => onTitleFocus && onTitleFocus(id)}
												indentLevel={getIndentLevel ? getIndentLevel(todo.id, subGroup) : 0}
												canIndent={canIndent ? canIndent(todo.id, subGroup) : false}
												canOutdent={canOutdent ? canOutdent(todo.id, subGroup) : false}
												{allGoals}
												allTodos={subGroup.todos}
												pageTaskId={highlightTaskId}
												{disableAutoFocus}
												hasChildren={parentTodoIds.has(todo.id)}
												isCollapsed={collapsedTodos.has(todo.id)}
												onToggleCollapse={() => toggleCollapse(todo.id)}
												mainFeedPinStyle={isMainTodoFeed && todo.pinned ? 'inline' : null}
												primaryNote={getPrimaryNoteForTodo ? getPrimaryNoteForTodo(todo.id) : null}
												linkedNotes={getLinkedNotesForTodo ? getLinkedNotesForTodo(todo.id) : []}
												linkedGoalIndices={getLinkedGoalIndicesForTodo ? getLinkedGoalIndicesForTodo(todo.id) : []}
												onUpsertPrimaryNote={(content) =>
													onUpsertPrimaryNote && onUpsertPrimaryNote(todo.id, content, subGroup)}
											/>
										</div>
										{#if showPlaceholderAfter(todo.id)}
											<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
										{/if}
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{:else if group.todos.length === 0}
				{#if showHeaderTopPlaceholder(group.id)}
					<div class="mb-2 h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
				{/if}
			{:else}
				<div class="space-y-2">
					{#if showHeaderTopPlaceholder(group.id)}
						<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
					{/if}
					{#each group.todos.filter(t => !isHiddenByCollapse(t.id) && (groupMatchesSearch(group) || matchesSearch(t))) as todo (todo.id)}
						{#if showPlaceholderBefore(todo.id)}
							<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
						{/if}
						<div
							data-dnd-item-id={todo.id}
							onpointerdown={(event) => handleTaskPointerDown(event, todo)}
							class={`relative rounded-lg transition ${itemDragClass(todo.id)} ${targetTodoClass(todo.id)}`}
						>
							{#if showChildIndicator(todo.id)}
								<div class="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2">
									<span class="rounded bg-violet-800/90 px-1.5 py-0.5 text-xs text-violet-200">nest inside</span>
								</div>
							{/if}
							<TodoItem
								{todo}
								onUpdate={(patch) => onUpdate && onUpdate(todo.id, patch)}
								onDelete={() => onDelete && onDelete(todo.id)}
								onToggleStatus={() => onToggleStatus && onToggleStatus(todo.id)}
								onCreateNext={() => onCreateNext && onCreateNext(todo.id, group)}
								onDeletePrevious={() => onDeletePrevious && onDeletePrevious(todo.id, group)}
								onMakeSubtask={() => onMakeSubtask && onMakeSubtask(todo.id, group)}
								onOutdent={() => onOutdent && onOutdent(todo.id, group)}
								onTitleFocus={(id) => onTitleFocus && onTitleFocus(id)}
								indentLevel={getIndentLevel ? getIndentLevel(todo.id, group) : 0}
								canIndent={canIndent ? canIndent(todo.id, group) : false}
								canOutdent={canOutdent ? canOutdent(todo.id, group) : false}
								{allGoals}
								allTodos={group.todos}
								pageTaskId={highlightTaskId}
								{disableAutoFocus}
								hasChildren={parentTodoIds.has(todo.id)}
								isCollapsed={collapsedTodos.has(todo.id)}
								onToggleCollapse={() => toggleCollapse(todo.id)}
								mainFeedPinStyle={isMainTodoFeed && todo.pinned ? 'inline' : null}
								primaryNote={getPrimaryNoteForTodo ? getPrimaryNoteForTodo(todo.id) : null}
								linkedNotes={getLinkedNotesForTodo ? getLinkedNotesForTodo(todo.id) : []}
								linkedGoalIndices={getLinkedGoalIndicesForTodo ? getLinkedGoalIndicesForTodo(todo.id) : []}
								onUpsertPrimaryNote={(content) =>
									onUpsertPrimaryNote && onUpsertPrimaryNote(todo.id, content, group)}
							/>
						</div>
						{#if showPlaceholderAfter(todo.id)}
							<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
						{/if}
					{/each}
				</div>
			{/if}
			</div>
		{/if}
	{/each}
</div>
