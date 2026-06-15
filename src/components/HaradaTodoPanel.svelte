<script>
	import { goto } from '$app/navigation';
	import { store } from '$stores/store.svelte.js';
	import NoteHybridMarkdownEditor from './NoteHybridMarkdownEditor.svelte';

	let {
		todos,
		goalOptions,
		addTodo,
		updateTodo,
		deleteTodo,
		cycleTodoStatus
	} = $props();

	function matchesFilter(todo) {
		if (store.selectedGoalFilter === 'all') return true;
		return String(todo.goalIndex) === store.selectedGoalFilter;
	}

	const filteredTodos = $derived(
		(todos ?? []).filter(matchesFilter).sort((a, b) => a.createdAt - b.createdAt)
	);

	function getGoalLabel(idx) {
		const goal = goalOptions?.find((g) => g.index === idx);
		return goal ? goal.label : `Goal (${idx})`;
	}

	function getGoalCodeFromIndex(idx) {
		const goal = goalOptions?.find((g) => g.index === idx);
		return goal ? goal.code : null;
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<div class="todo-panel-toolbar">
			<span class="todo-panel-toolbar-label">Filter by goal</span>
			<select
				class="text-xs"
				bind:value={store.selectedGoalFilter}
				onchange={(e) => {
					const value = e.target.value;
					if (value === 'all') {
						goto('/todo', { replaceState: false });
					} else {
						const idx = parseInt(value, 10);
						if (!Number.isNaN(idx)) {
							const code = getGoalCodeFromIndex(idx);
							if (code) goto(`/todo/${code}`, { replaceState: false });
						}
					}
				}}
			>
				<option value="all">All goals</option>
				{#each goalOptions as goal}
					<option value={goal.index}>
						{goal.label}
					</option>
				{/each}
			</select>
		</div>

		<div class="todo-panel-toolbar">
			<span class="todo-panel-toolbar-label">Add to-do for</span>
			<select
				class="text-xs"
				bind:value={store.selectedGoalForNew}
			>
				<option value="">Choose goal…</option>
				{#each goalOptions as goal}
					<option value={goal.index}>
						{goal.label}
					</option>
				{/each}
			</select>
			<button
				type="button"
				onclick={addTodo}
				disabled={!store.selectedGoalForNew}
				class="todo-panel-add-button"
			>
				Add to-do
			</button>
		</div>
	</div>

	{#if filteredTodos.length === 0}
		<p class="todo-panel-empty">
			No to-dos yet for this selection. Add one using the controls above.
		</p>
	{:else}
		<div class="space-y-3">
			{#each filteredTodos as todo (todo.id)}
				<div class="todo-panel-card">
					<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<div class="flex-1">
							<input
								class="text-xs"
								placeholder="Title for this to-do"
								value={todo.title}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										e.currentTarget.blur();
									}
								}}
								onblur={(e) => updateTodo(todo.id, { title: e.target.value })}
							/>
							<div class="todo-panel-goal-label">
								{getGoalLabel(todo.goalIndex)}
							</div>
						</div>
						<div class="mt-1 flex items-center gap-2 md:mt-0 md:ml-3">
							<button
								type="button"
								class={`todo-status-button ${
									todo.status === 'underway'
										? 'todo-status-underway'
										: todo.status === 'done'
											? 'todo-status-done'
											: 'todo-status-todo'
								}`}
								onclick={() => cycleTodoStatus(todo.id)}
							>
								{todo.status === 'todo'
									? 'To-do'
									: todo.status === 'underway'
										? 'Underway'
										: 'Done'}
							</button>
							<button
								type="button"
								class="cursor-pointer rounded-full px-2 py-1 text-[10px] font-semibold text-rose-300 ring-1 ring-rose-700/70 transition hover:bg-rose-900/60 hover:text-rose-100"
								onclick={() => deleteTodo(todo.id)}
							>
								Delete
							</button>
						</div>
					</div>

					<div class="mt-3">
						<span class="todo-panel-label">Markdown notes</span>
						<NoteHybridMarkdownEditor
							value={todo.markdown ?? ''}
							placeholder="Write detailed notes, checklists or context for this to-do using Markdown…"
							minHeight="5rem"
							class="todo-panel-hybrid-editor mt-1"
							onchange={(md) => updateTodo(todo.id, { markdown: md })}
						/>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

