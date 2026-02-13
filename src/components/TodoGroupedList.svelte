<script>
	import TodoItem from '$components/TodoItem.svelte';
	import { CirclePlus } from 'lucide-svelte';

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
		canOutdent = null
	} = $props();

</script>

<div class="space-y-6">
	{#each groups as group (group.id)}
		<div>
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h2 class="text-lg font-semibold text-slate-100">
						{#if group.href}
							<a href={group.href} class="hover:text-violet-400 transition-colors">{group.label}</a>
						{:else}
							{group.label}
						{/if}
					</h2>
				</div>
				{#if onAddToGroup}
					<button
						type="button"
						onclick={() => onAddToGroup(group)}
						class="rounded p-1 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 transition-colors"
						title={group.addTitle || 'Add todo'}
					>
						<CirclePlus class="h-4 w-4" />
					</button>
				{/if}
			</div>

			{#if group.todos.length === 0}
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
						/>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>
