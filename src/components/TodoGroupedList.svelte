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
		onCreateTodo = null
	} = $props();

</script>

<div class="space-y-6">
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
					{/each}
				</div>
			{/if}
		</div>
	{/each}
	
	{#if onCreateTodo}
		<div class="mt-6 hidden lg:block">
			<button
				type="button"
				onclick={onCreateTodo}
				class="w-full rounded-lg border-2 border-dashed border-slate-700 bg-slate-950/40 px-4 py-3 text-sm font-medium text-slate-400 transition hover:border-violet-500 hover:bg-slate-900/60 hover:text-violet-400"
			>
				+ New task
			</button>
		</div>
	{/if}
</div>
