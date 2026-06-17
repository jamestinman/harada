<script>
	import { browser, dev } from '$app/environment';
	import { onDestroy, onMount, tick } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';
	import TodoItem from '$components/TodoItem.svelte';
	import { getGoalViewSiblings, getEffectiveTodoParentId, filterFeedPinnedRowsBySearch, isNoGoalPseudoIndex, NO_GOAL_PSEUDO_INDEX } from '$lib/todoUtils.js';
	import { store } from '$stores/store.svelte.js';

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
		useGoalViewOrdering = false,
		taskGoalLinks = [],
		taskGoalKeySet = new Set(),
		allowCrossListMove = false,
		enableGroupDrag = false,
		onMoveGroup = null,
		searchText = '',
		targetTodoId = null,
		/** Immediately-updated focused task id (beats async `goto` updating `?task=`) */
		activeTodoId = null,
		/** One-shot: open title editor on this row without scrolling or URL side effects */
		focusTodoId = null,
		onFocusTitleHandled = null,
		/** When true, pinned tasks show pink inline chrome on the All Tasks feed */
		isMainTodoFeed = false,
		/** When true (e.g. /todo/Z1), all task rows use pinned pink chrome */
		pinnedGoalView = false,
		feedPinnedRows = null,
		feedPinnedGroup = null,
		getPrimaryNoteForTodo = null,
		getLinkedNotesForTodo = null,
	onUpsertPrimaryNote = null,
	getLinkedGoalIndicesForTodo = null,
	onClearHighlight = null
} = $props();

	const LONG_PRESS_MS = 260;
	const DRAG_START_PX = 6;
	const CHILD_ZONE_TOP = 0.25;
	const CHILD_ZONE_BOTTOM = 0.75;
	const SCROLL_ZONE_PX = 80;
	const MAX_SCROLL_SPEED = 14;
	const INITIAL_RENDERED_TODOS = 25;
	const RENDER_CHUNK_SIZE = 25;
	let pressTimer = null;
	let pendingDrag = null;
	let autoScrollRAF = null;
	let progressiveRenderRAF = null;
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
	let collapsedGroups = $state(new Set());
	let renderedTodoLimit = $state(INITIAL_RENDERED_TODOS);
	let lastSearchForRender = '';

	const highlightTaskId = $derived(activeTodoId ?? targetTodoId);
	const renderThroughTodoId = $derived(focusTodoId ?? targetTodoId);

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

	function cancelProgressiveRender() {
		if (progressiveRenderRAF !== null) {
			cancelAnimationFrame(progressiveRenderRAF);
			progressiveRenderRAF = null;
		}
	}

	function scheduleProgressiveRender() {
		if (!browser) return;
		cancelProgressiveRender();
		const step = () => {
			progressiveRenderRAF = null;
			if (renderedTodoLimit >= visibleFlatTodos.length) return;
			renderedTodoLimit = Math.min(renderedTodoLimit + RENDER_CHUNK_SIZE, visibleFlatTodos.length);
			if (renderedTodoLimit < visibleFlatTodos.length) {
				progressiveRenderRAF = requestAnimationFrame(step);
			}
		};
		progressiveRenderRAF = requestAnimationFrame(step);
	}

	onMount(() => {
		const start = performance.now();
		tick().then(() => {
			scheduleProgressiveRender();
		});
	});

	onDestroy(() => {
		cancelProgressiveRender();
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
		return all;
	});

	const parentTodoIds = $derived.by(() => {
		const ids = new Set();
		for (const todo of flatTodos) {
			if (todo.parentId) ids.add(todo.parentId);
		}
		return ids;
	});

	function getVisibleTodosForGroup(group, todosList) {
		return (todosList || []).filter(
			(t) => !isHiddenByCollapse(t.id) && (groupMatchesSearch(group) || matchesSearch(t))
		);
	}

	const visibleFlatTodos = $derived.by(() => {
		const all = [];
		for (const group of groups) {
			if (group.subGroups) {
				for (const subGroup of group.subGroups) {
					all.push(...getVisibleTodosForGroup(group, subGroup.todos));
				}
			} else {
				all.push(...getVisibleTodosForGroup(group, group.todos));
			}
		}
		return all;
	});

	const effectiveRenderedTodoLimit = $derived.by(() => {
		if (!renderThroughTodoId) return renderedTodoLimit;
		const targetIndex = visibleFlatTodos.findIndex((todo) => todo.id === renderThroughTodoId);
		return targetIndex >= 0 ? Math.max(renderedTodoLimit, targetIndex + 1) : renderedTodoLimit;
	});

	const renderedTodoIdSet = $derived.by(() => {
		return new Set(visibleFlatTodos.slice(0, effectiveRenderedTodoLimit).map((todo) => todo.id));
	});

	// Only reset virtualized window on search - adding a task must not collapse the list.
	$effect(() => {
		const query = searchText ?? '';
		if (query === lastSearchForRender) return;
		lastSearchForRender = query;
		renderedTodoLimit = INITIAL_RENDERED_TODOS;
		scheduleProgressiveRender();
	});

	// Ensure a programmatically focused row is actually in the DOM.
	$effect(() => {
		if (!focusTodoId) return;
		const targetIndex = visibleFlatTodos.findIndex((todo) => todo.id === focusTodoId);
		if (targetIndex >= 0 && renderedTodoLimit < targetIndex + 1) {
			renderedTodoLimit = targetIndex + 1;
		}
	});

	function getRenderedTodosForGroup(group, todosList) {
		return getVisibleTodosForGroup(group, todosList).filter((todo) => renderedTodoIdSet.has(todo.id));
	}

	/**
	 * For a flat ordered list of todos with known indent levels, compute, per todo,
	 * which ancestor columns should keep their vertical tree-line going past that row.
	 *
	 * Returns: Map<todoId, boolean[]> where the array has length === indentLevel
	 * and `arr[c]` is true when the line at column c (the level-(c+1) ancestor's
	 * children-list) has a further sibling row after this one.
	 */
	function computeTreeContinuesForOrderedList(orderedTodos, indentLevelOf) {
		const result = new Map();
		if (!orderedTodos?.length) return result;
		const levels = orderedTodos.map((todo) => indentLevelOf(todo) || 0);

		for (let i = 0; i < orderedTodos.length; i++) {
			const level = levels[i];
			if (level <= 0) {
				result.set(orderedTodos[i].id, []);
				continue;
			}
			const continues = new Array(level).fill(false);
			for (let c = 0; c < level; c++) {
				for (let j = i + 1; j < orderedTodos.length; j++) {
					const lj = levels[j];
					if (lj <= c) break;
					if (lj === c + 1) {
						continues[c] = true;
						break;
					}
				}
			}
			result.set(orderedTodos[i].id, continues);
		}
		return result;
	}

	const treeContinuesById = $derived.by(() => {
		const map = new Map();
		for (const group of groups) {
			if (group.subGroups) {
				for (const subGroup of group.subGroups) {
					const ordered = getRenderedTodosForGroup(group, subGroup.todos);
					const partial = computeTreeContinuesForOrderedList(ordered, (todo) =>
						getIndentLevel ? getIndentLevel(todo.id, subGroup) : 0
					);
					for (const [id, c] of partial) map.set(id, c);
				}
			} else {
				const ordered = getRenderedTodosForGroup(group, group.todos);
				const partial = computeTreeContinuesForOrderedList(ordered, (todo) =>
					getIndentLevel ? getIndentLevel(todo.id, group) : 0
				);
				for (const [id, c] of partial) map.set(id, c);
			}
		}
		return map;
	});

	function hasRenderedTodosInGroup(group) {
		if (!group) return false;
		if (isGroupCollapsed(group.id)) return false;
		if (group.subGroups && group.subGroups.length > 0) {
			return group.subGroups.some((subGroup) => getRenderedTodosForGroup(group, subGroup.todos).length > 0);
		}
		return getRenderedTodosForGroup(group, group.todos).length > 0;
	}

	function isGroupCollapsible(group) {
		if (!group || group.groupType !== 'goal') return false;
		if (group.subGroups && group.subGroups.length > 0) {
			return group.subGroups.some((subGroup) => (subGroup.todos || []).length > 0);
		}
		return (group.todos || []).length > 0;
	}

	function isGroupCollapsed(groupId) {
		return collapsedGroups.has(groupId);
	}

	function toggleGroupCollapse(groupId) {
		const next = new Set(collapsedGroups);
		if (next.has(groupId)) {
			next.delete(groupId);
		} else {
			next.add(groupId);
		}
		collapsedGroups = next;
	}

	function quickAddToGroup(group, event) {
		event?.stopPropagation?.();
		if (!onCreateTodo || group?.groupType !== 'goal') return;
		onCreateTodo({ goalIndex: group.goalIndex, listType: 'goal', title: '', shouldNavigate: false });
	}

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

	function isDragGoalViewGroup(group) {
		if (!group || typeof group.goalIndex !== 'number') return false;
		return group.groupType === 'goal' || group.groupType === 'no-goal';
	}

	function findGoalGroupForTodo(todoId) {
		if (!todoId) return null;
		if (feedPinnedGroup?.todos?.some((todo) => todo.id === todoId)) {
			return feedPinnedGroup;
		}
		for (const group of groups) {
			if (!isDragGoalViewGroup(group)) continue;
			if (group.subGroups?.length) {
				for (const subGroup of group.subGroups) {
					if ((subGroup.todos || []).some((todo) => todo.id === todoId)) return group;
				}
			} else if ((group.todos || []).some((todo) => todo.id === todoId)) {
				return group;
			}
		}
		return null;
	}

	function getGoalViewContextForTodos(...todoIds) {
		if (!useGoalViewOrdering) return null;
		const matchedGroups = todoIds
			.map((todoId) => findGoalGroupForTodo(todoId))
			.filter(Boolean);
		if (matchedGroups.length === 0) return null;
		const goalIndex = matchedGroups[0].goalIndex;
		if (!matchedGroups.every((group) => group.goalIndex === goalIndex)) return null;
		return goalIndex;
	}

	function getGoalViewSiblingTodos(goalIndex, parentId, excludeId = null) {
		return getGoalViewSiblings(flatTodos, goalIndex, {
			parentId,
			excludeId,
			taskGoalKeySet,
			taskGoalLinks
		});
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

	function getMainFeedPinStyle(todo) {
		if (pinnedGoalView) return 'top';
		if (isMainTodoFeed && todo.pinned === true) return 'inline';
		return null;
	}

	function groupMatchesSearch(group) {
		const query = (searchText ?? '').trim().toLowerCase();
		if (!query) return false;
		const label = (group?.label ?? '').toLowerCase();
		return label.includes(query);
	}

	const visibleFeedPinned = $derived.by(() => {
		if (!isMainTodoFeed || !feedPinnedRows?.length) return [];
		const query = (searchText ?? '').trim().toLowerCase();
		if (!query) return feedPinnedRows;
		return filterFeedPinnedRowsBySearch(feedPinnedRows, matchesSearch);
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
			let listId = isNoGoalPseudoIndex(goalIndex) ? 'goal:none' : goalIndex === null ? 'goal:none' : `goal:${goalIndex}`;
			let listName = null;

			if (group.groupType === 'custom') {
				listType = 'custom';
				goalIndex = null;
				listId = group.listId;
				listName = group.label || 'New list';
			} else if (isNoGoalPseudoIndex(group.goalIndex)) {
				goalIndex = null;
				listId = 'goal:none';
			}

			const viewGoalIndex =
				useGoalViewOrdering && isDragGoalViewGroup(group) ? group.goalIndex : null;
			if (!allowCrossListMove && viewGoalIndex === null && dragged.listId !== listId) return null;
			return {
				listId,
				listType,
				goalIndex,
				listName,
				parentId: null,
				afterTodoId: null,
				viewGoalIndex
			};
		}

		const target = getTodoById(taskDrag.targetTodoId);
		if (!target || dragged.id === target.id) return null;

		const viewGoalIndex = getGoalViewContextForTodos(dragged.id, target.id);
		if (!allowCrossListMove && viewGoalIndex === null && dragged.listId !== target.listId) return null;

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
				pinned: target.pinned === true ? true : undefined,
				parentId: target.id,
				afterTodoId: null,
				adoptGoalsFromTaskId: target.id,
				viewGoalIndex
			};
		}

		const siblingParentId =
			viewGoalIndex !== null
				? getEffectiveTodoParentId(target, viewGoalIndex, taskGoalLinks)
				: (target.parentId ?? null);
		const siblings =
			viewGoalIndex !== null
				? getGoalViewSiblingTodos(viewGoalIndex, siblingParentId, dragged.id)
				: getSiblingTodos(targetListId, siblingParentId, dragged.id);
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
				afterTodoId: previousSibling ? previousSibling.id : null,
				adoptGoalsFromTaskId: target.id,
				viewGoalIndex
			};
		}
		return {
			listId: targetListId,
			listType: targetListType,
			goalIndex: targetGoalIndex,
			listName: targetListName,
			parentId: siblingParentId,
			afterTodoId: target.id,
			adoptGoalsFromTaskId: target.id,
			viewGoalIndex
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

<div
	class="space-y-6"
	role="presentation"
	onclick={(e) => {
		if (onClearHighlight && !e.target.closest('[data-dnd-item-id]')) {
			onClearHighlight();
		}
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape' && onClearHighlight) onClearHighlight();
	}}
>

	{#if isMainTodoFeed && visibleFeedPinned.length > 0 && feedPinnedGroup}
		<div class="mb-6 space-y-2">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-pink-300/90">
				<a href="/todo/Z1" class="hover:text-pink-200 transition-colors">Pinned</a>
			</h2>
			<div class="space-y-2">
				{#each visibleFeedPinned as row (row.todo.id)}
					{@const todo = row.todo}
					{@const pinGroup = feedPinnedGroup}
					<div
						data-dnd-item-id={todo.id}
						onpointerdown={(event) => handleTaskPointerDown(event, todo)}
						class={`relative rounded-lg transition ${itemDragClass(todo.id)}`}
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
							onCreateNext={() =>
								onCreateNext &&
								onCreateNext(todo.id, pinGroup, { renderedInstance: 'pinned-duplicate' })}
							onDeletePrevious={() => onDeletePrevious && onDeletePrevious(todo.id, pinGroup)}
							onMakeSubtask={() => onMakeSubtask && onMakeSubtask(todo.id, pinGroup)}
							onOutdent={() => onOutdent && onOutdent(todo.id, pinGroup)}
							onTitleFocus={(id) => onTitleFocus && onTitleFocus(id)}
							indentLevel={row.indentLevel}
							treeContinues={null}
							canIndent={canIndent ? canIndent(todo.id, pinGroup) : false}
							canOutdent={canOutdent ? canOutdent(todo.id, pinGroup) : false}
							{allGoals}
							allTodos={pinGroup.todos}
							pageTaskId={highlightTaskId}
							focusTitle={focusTodoId === todo.id}
							onFocusTitleHandled={focusTodoId === todo.id ? onFocusTitleHandled : null}
							{disableAutoFocus}
							hasChildren={parentTodoIds.has(todo.id)}
							isCollapsed={collapsedTodos.has(todo.id)}
							onToggleCollapse={() => toggleCollapse(todo.id)}
							isFeedPinnedDuplicate={true}
							mainFeedPinStyle="top"
							isHighlighted={highlightTaskId === todo.id}
							primaryNote={getPrimaryNoteForTodo ? getPrimaryNoteForTodo(todo.id) : null}
							linkedNotes={getLinkedNotesForTodo ? getLinkedNotesForTodo(todo.id) : []}
							linkedGoalIndices={getLinkedGoalIndicesForTodo ? getLinkedGoalIndicesForTodo(todo.id) : []}
							onUpsertPrimaryNote={(content) =>
								onUpsertPrimaryNote && onUpsertPrimaryNote(todo.id, content, pinGroup)}
						/>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#each groups as group}
		{#if hasRenderedTodosInGroup(group) || showHeaderTopPlaceholder(group.id) || isGroupCollapsed(group.id)}
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
						<div class="flex items-center gap-0.5 md:relative md:gap-0">
							{#if isGroupCollapsible(group)}
								<button
									type="button"
									onpointerdown={(e) => e.stopPropagation()}
									onclick={(e) => {
										e.stopPropagation();
										toggleGroupCollapse(group.id);
									}}
									class="shrink-0 rounded p-0.5 transition todo-collapse-toggle md:absolute md:-left-6 md:top-1/2 md:-translate-y-1/2"
									title={isGroupCollapsed(group.id) ? 'Expand goal tasks' : 'Collapse goal tasks'}
									aria-label={isGroupCollapsed(group.id) ? 'Expand goal tasks' : 'Collapse goal tasks'}
									aria-expanded={!isGroupCollapsed(group.id)}
								>
									<ChevronDown
										class={`h-5 w-5 transition-transform duration-150 ${isGroupCollapsed(group.id) ? '-rotate-90' : ''}`}
										strokeWidth={2.8}
									/>
								</button>
							{/if}
							<div class="flex min-w-0 items-center gap-2">
								<h2 class="todo-group-heading">
									{#if group.href}
										<a
											href={group.href}
											onclick={() => {
												store.todoWorkspaceQuery = '';
											}}
											class="hover:text-violet-400 transition-colors"
											ondragstart={(e) => e.preventDefault()}
										>
											{group.label}
										</a>
									{:else}
										{group.label}
									{/if}
								</h2>
								{#if group.groupType === 'goal'}
									<button
										type="button"
										title="Quick add task"
										aria-label={`Quick add task to ${group.label}`}
										onpointerdown={(e) => e.stopPropagation()}
										onclick={(e) => quickAddToGroup(group, e)}
										class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/70 text-slate-400 hover:text-black text-sm font-bold leading-none transition hover:border-violet-400/80 hover:bg-violet-500/25"
									>
										<span class="-translate-y-px">+</span>
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			{#if !isGroupCollapsed(group.id)}
			{#if group.subGroups}
				<!-- Render nested sub-groups -->
				<div class="todo-subgroup-container">
					{#each group.subGroups as subGroup}
						{#if getRenderedTodosForGroup(group, subGroup.todos).length > 0}
							<div>
								<div class="space-y-2">
									{#each getRenderedTodosForGroup(group, subGroup.todos) as todo (todo.id)}
										{#if showPlaceholderBefore(todo.id)}
											<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
										{/if}
										<div
											data-dnd-item-id={todo.id}
											onpointerdown={(event) => handleTaskPointerDown(event, todo)}
											class={`relative rounded-lg transition ${itemDragClass(todo.id)}`}
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
												onCreateNext={() =>
													onCreateNext &&
													onCreateNext(todo.id, subGroup, { renderedInstance: 'group' })}
												onDeletePrevious={() => onDeletePrevious && onDeletePrevious(todo.id, subGroup)}
												onMakeSubtask={() => onMakeSubtask && onMakeSubtask(todo.id, subGroup)}
												onOutdent={() => onOutdent && onOutdent(todo.id, subGroup)}
												onTitleFocus={(id) => onTitleFocus && onTitleFocus(id)}
												indentLevel={getIndentLevel ? getIndentLevel(todo.id, subGroup) : 0}
												treeContinues={treeContinuesById.get(todo.id) ?? null}
												canIndent={canIndent ? canIndent(todo.id, subGroup) : false}
												canOutdent={canOutdent ? canOutdent(todo.id, subGroup) : false}
												{allGoals}
												allTodos={subGroup.todos}
												pageTaskId={highlightTaskId}
												focusTitle={focusTodoId === todo.id}
												onFocusTitleHandled={focusTodoId === todo.id ? onFocusTitleHandled : null}
												{disableAutoFocus}
												hasChildren={parentTodoIds.has(todo.id)}
												isCollapsed={collapsedTodos.has(todo.id)}
												onToggleCollapse={() => toggleCollapse(todo.id)}
												mainFeedPinStyle={getMainFeedPinStyle(todo)}
												isHighlighted={highlightTaskId === todo.id}
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
					{#each getRenderedTodosForGroup(group, group.todos) as todo (todo.id)}
						{#if showPlaceholderBefore(todo.id)}
							<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
						{/if}
						<div
							data-dnd-item-id={todo.id}
							onpointerdown={(event) => handleTaskPointerDown(event, todo)}
							class={`relative rounded-lg transition ${itemDragClass(todo.id)}`}
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
								onCreateNext={() =>
									onCreateNext && onCreateNext(todo.id, group, { renderedInstance: 'group' })}
								onDeletePrevious={() => onDeletePrevious && onDeletePrevious(todo.id, group)}
								onMakeSubtask={() => onMakeSubtask && onMakeSubtask(todo.id, group)}
								onOutdent={() => onOutdent && onOutdent(todo.id, group)}
								onTitleFocus={(id) => onTitleFocus && onTitleFocus(id)}
								indentLevel={getIndentLevel ? getIndentLevel(todo.id, group) : 0}
								treeContinues={treeContinuesById.get(todo.id) ?? null}
								canIndent={canIndent ? canIndent(todo.id, group) : false}
								canOutdent={canOutdent ? canOutdent(todo.id, group) : false}
								{allGoals}
								allTodos={group.todos}
								pageTaskId={highlightTaskId}
								focusTitle={focusTodoId === todo.id}
								onFocusTitleHandled={focusTodoId === todo.id ? onFocusTitleHandled : null}
								{disableAutoFocus}
								hasChildren={parentTodoIds.has(todo.id)}
								isCollapsed={collapsedTodos.has(todo.id)}
								onToggleCollapse={() => toggleCollapse(todo.id)}
								mainFeedPinStyle={getMainFeedPinStyle(todo)}
								isHighlighted={highlightTaskId === todo.id}
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
			{/if}
			</div>
		{/if}
	{/each}
</div>
