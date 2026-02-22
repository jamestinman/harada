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
		onMoveTodo = null
	} = $props();

	const LONG_PRESS_MS = 220;
	const INDENT_THRESHOLD_PX = 56;
	let pressTimer = null;
	let pendingPointer = null;
	let dragState = $state({
		active: false,
		pointerId: null,
		draggedTodoId: null,
		targetTodoId: null,
		dropMode: 'after'
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

	function clearPendingPointer() {
		if (pressTimer) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
		pendingPointer = null;
	}

	function handlePointerDown(event, todo) {
		if (!onMoveTodo) return;
		if (!event.isPrimary) return;
		if (event.button !== 0) return;
		if (event.target?.closest('input, textarea, select, [contenteditable="true"]')) return;

		clearPendingPointer();
		pendingPointer = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			todoId: todo.id
		};

		pressTimer = setTimeout(() => {
			try {
				event.currentTarget?.setPointerCapture?.(event.pointerId);
			} catch (_) {
				// No-op: pointer capture can fail on some elements/browsers.
			}
			dragState = {
				active: true,
				pointerId: event.pointerId,
				draggedTodoId: todo.id,
				targetTodoId: todo.id,
				dropMode: 'after'
			};
			pendingPointer = null;
		}, LONG_PRESS_MS);
	}

	function resolveDropTarget(clientX, clientY) {
		const targetElement = document.elementFromPoint(clientX, clientY);
		const itemElement = targetElement?.closest?.('[data-dnd-item-id]');
		if (!itemElement) return null;
		const targetTodoId = itemElement.getAttribute('data-dnd-item-id');
		if (!targetTodoId) return null;

		const rect = itemElement.getBoundingClientRect();
		const yRatio = (clientY - rect.top) / Math.max(rect.height, 1);
		let dropMode = yRatio < 0.5 ? 'before' : 'after';
		if (clientX - rect.left > INDENT_THRESHOLD_PX) {
			dropMode = 'child';
		}

		return { targetTodoId, dropMode };
	}

	function handlePointerMove(event) {
		if (pendingPointer && pendingPointer.pointerId === event.pointerId) {
			const distance = Math.hypot(
				event.clientX - pendingPointer.startX,
				event.clientY - pendingPointer.startY
			);
			if (distance > 8) {
				clearPendingPointer();
			}
		}

		if (!dragState.active || dragState.pointerId !== event.pointerId) return;
		event.preventDefault();
		const target = resolveDropTarget(event.clientX, event.clientY);
		if (!target) return;
		if (target.targetTodoId === dragState.draggedTodoId) {
			dragState = { ...dragState, targetTodoId: target.targetTodoId, dropMode: 'after' };
			return;
		}
		if (target.dropMode === 'child' && isDescendant(target.targetTodoId, dragState.draggedTodoId)) {
			target.dropMode = 'after';
		}
		dragState = { ...dragState, targetTodoId: target.targetTodoId, dropMode: target.dropMode };
	}

	function buildMovePayload() {
		const dragged = getTodoById(dragState.draggedTodoId);
		const target = getTodoById(dragState.targetTodoId);
		if (!dragged || !target || dragged.id === target.id) return null;

		const targetListId = target.listId;
		const targetListType = target.listType || 'goal';
		const targetGoalIndex = target.goalIndex ?? null;
		const targetListName = target.listName || null;

		if (dragState.dropMode === 'child') {
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
		if (dragState.dropMode === 'before') {
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

	function stopDragging() {
		dragState = {
			active: false,
			pointerId: null,
			draggedTodoId: null,
			targetTodoId: null,
			dropMode: 'after'
		};
	}

	function handlePointerUp(event) {
		try {
			event.currentTarget?.releasePointerCapture?.(event.pointerId);
		} catch (_) {
			// No-op
		}
		if (pendingPointer && pendingPointer.pointerId === event.pointerId) {
			clearPendingPointer();
		}
		if (!dragState.active || dragState.pointerId !== event.pointerId) return;
		event.preventDefault();
		const payload = buildMovePayload();
		if (payload && onMoveTodo) {
			onMoveTodo(dragState.draggedTodoId, payload);
		}
		stopDragging();
	}

	function itemDragClass(todoId) {
		if (!dragState.active) return '';
		if (dragState.draggedTodoId === todoId) return 'opacity-40';
		if (dragState.targetTodoId !== todoId) return '';
		if (dragState.dropMode === 'before') return 'ring-2 ring-violet-400 ring-offset-2 ring-offset-slate-950';
		if (dragState.dropMode === 'after') return 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950';
		return 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950';
	}
</script>

<div
	class="space-y-6"
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
>
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
		<div>
			{#if groups.length > 1 || group.subGroups}
				<div class="mb-4">
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
										<div
											data-dnd-item-id={todo.id}
											onpointerdown={(event) => handlePointerDown(event, todo)}
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
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else if group.todos.length === 0}
				<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-4">
					<p class="text-sm text-slate-500">No todos in this section.</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each group.todos as todo (todo.id)}
						<div
							data-dnd-item-id={todo.id}
							onpointerdown={(event) => handlePointerDown(event, todo)}
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
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>
