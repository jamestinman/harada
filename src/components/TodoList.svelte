<script>
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
		onMoveGroup = null
	} = $props();

	const LONG_PRESS_MS = 260;
	const DRAG_START_PX = 6;
	const INDENT_THRESHOLD_PX = 56;
	const TASK_EDGE_HITBOX_PX = 5;
	const TASK_CHILD_CENTER_HITBOX_PX = 5;
	let pressTimer = null;
	let pendingDrag = null;
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

	function clearPendingDrag() {
		if (pressTimer) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
		pendingDrag = null;
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
		window.addEventListener('pointercancel', handleGlobalPointerUp, { passive: false });

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
		window.addEventListener('pointercancel', handleGlobalPointerUp, { passive: false });

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
			const y = clientY - rect.top;
			const height = Math.max(rect.height, 1);
			const distanceFromTop = y;
			const distanceFromBottom = height - y;
			const distanceFromCenter = Math.abs(y - height / 2);

			let dropMode;
			if (distanceFromTop <= TASK_EDGE_HITBOX_PX) {
				dropMode = 'before';
			} else if (distanceFromBottom <= TASK_EDGE_HITBOX_PX) {
				dropMode = 'after';
			} else if (
				clientX - rect.left > INDENT_THRESHOLD_PX &&
				distanceFromCenter <= TASK_CHILD_CENTER_HITBOX_PX
			) {
				// Very slim center strip for "drop as child"
				dropMode = 'child';
			} else {
				// Default to insertion behavior so the list keeps making space
				dropMode = y < height / 2 ? 'before' : 'after';
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
		window.removeEventListener('pointercancel', handleGlobalPointerUp);
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
			}
			stopGroupDrag();
			clearGlobalPointerListeners();
		}
	}

	function itemDragClass(todoId) {
		if (!taskDrag.active) return '';
		if (taskDrag.draggedTodoId === todoId) return 'opacity-0 pointer-events-none';
		if (taskDrag.targetTodoId !== todoId) return '';
		return 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950';
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
		class="fixed z-[9999] pointer-events-none rounded-lg border border-violet-400/70 bg-slate-800/95 px-3 py-2.5 shadow-2xl shadow-black/70 backdrop-blur-sm"
		style="left: {dragGhost.x - dragGhost.offsetX}px; top: {dragGhost.y - dragGhost.offsetY}px; width: {dragGhost.width}px; transform: rotate(1.5deg) scale(1.03); will-change: left, top;"
	>
		{#if dragGhost.isGroup}
			<div class="flex items-center gap-2">
				<div class="h-1 w-4 flex-shrink-0 rounded-full bg-violet-400/60"></div>
				<span class="text-sm font-semibold text-slate-100 truncate">{dragGhost.label || 'Group'}</span>
			</div>
		{:else}
			<div class="flex items-center gap-2">
				<div class="h-4 w-4 flex-shrink-0 rounded-full border-2 border-slate-400/60"></div>
				<span class="text-sm text-slate-100 truncate">{dragGhost.label || '—'}</span>
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
				class="w-full rounded-lg border-2 border-dashed border-slate-700 bg-slate-950/40 px-4 py-3 text-sm font-medium text-slate-400 transition hover:border-violet-500 hover:bg-slate-900/60 hover:text-violet-400"
			>
				+ New task
			</button>
		</div>
	{/if}
	
	{#each groups as group}
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
					<h2 class="text-lg font-semibold text-slate-100">
						{#if group.href}
							<a href={group.href} class="hover:text-violet-400 transition-colors">{group.label}</a>
						{:else}
							{group.label}
						{/if}
					</h2>
				</div>
			{/if}

			{#if group.subGroups}
				<!-- Render nested sub-groups -->
				<div class="space-y-4 ml-4 border-l border-slate-700 pl-4">
					{#each group.subGroups as subGroup}
						<div>
							<div class="mb-2">
								<h3 class="text-base font-medium text-slate-200">
									{#if subGroup.href}
										<a href={subGroup.href} class="hover:text-violet-400 transition-colors">{subGroup.label}</a>
									{:else}
										{subGroup.label}
									{/if}
								</h3>
							</div>
							{#if subGroup.todos.length === 0}
								<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-4">
									<p class="text-sm text-slate-500">No todos in this section.</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each subGroup.todos as todo (todo.id)}
										{#if showPlaceholderBefore(todo.id)}
											<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
										{/if}
										<div
											data-dnd-item-id={todo.id}
											onpointerdown={(event) => handleTaskPointerDown(event, todo)}
											class={`rounded-lg transition ${itemDragClass(todo.id)}`}
										>
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
												{disableAutoFocus}
											/>
										</div>
										{#if showPlaceholderAfter(todo.id)}
											<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
										{/if}
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else if group.todos.length === 0}
				{#if showHeaderTopPlaceholder(group.id)}
					<div class="mb-2 h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
				{/if}
				<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-4">
					<p class="text-sm text-slate-500">No todos in this section.</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#if showHeaderTopPlaceholder(group.id)}
						<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
					{/if}
					{#each group.todos as todo (todo.id)}
						{#if showPlaceholderBefore(todo.id)}
							<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
						{/if}
						<div
							data-dnd-item-id={todo.id}
							onpointerdown={(event) => handleTaskPointerDown(event, todo)}
							class={`rounded-lg transition ${itemDragClass(todo.id)}`}
						>
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
								{disableAutoFocus}
							/>
						</div>
						{#if showPlaceholderAfter(todo.id)}
							<div class="h-12 rounded-lg border-2 border-dashed border-violet-400/80 bg-violet-500/10"></div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>
