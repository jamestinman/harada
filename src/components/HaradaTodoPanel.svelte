<script>
	import { goto } from '$app/navigation';
	import { store } from '$stores/store.svelte.js';
	import { renderMarkdown } from '$lib/todoUtils.js';

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
		<div class="flex flex-wrap items-center gap-2 text-xs text-slate-200">
			<span class="font-semibold text-slate-100">Filter by goal</span>
			<select
				class="cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 shadow-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
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

		<div class="flex flex-wrap items-center gap-2 text-xs text-slate-200">
			<span class="font-semibold text-slate-100">Add to-do for</span>
			<select
				class="cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 shadow-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
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
				class="cursor-pointer rounded-md border border-violet-600/70 bg-violet-600/90 px-3 py-1 text-xs font-semibold text-slate-950 shadow-sm transition enabled:hover:bg-violet-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
			>
				Add to-do
			</button>
		</div>
	</div>

	{#if filteredTodos.length === 0}
		<p class="text-xs text-slate-400">
			No to-dos yet for this selection. Add one using the controls above.
		</p>
	{:else}
		<div class="space-y-3">
			{#each filteredTodos as todo (todo.id)}
				<div class="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3 shadow-sm">
					<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<div class="flex-1">
							<input
								class="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
								placeholder="Title for this to-do"
								value={todo.title}
								oninput={(e) => updateTodo(todo.id, { title: e.target.value })}
							/>
							<div class="mt-1 text-[10px] text-slate-400">
								{getGoalLabel(todo.goalIndex)}
							</div>
						</div>
						<div class="mt-1 flex items-center gap-2 md:mt-0 md:ml-3">
							<button
								type="button"
								class={`flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold shadow-sm ring-1 transition ${
									todo.status === 'underway'
										? 'bg-yellow-400/90 text-slate-900 ring-yellow-300'
										: todo.status === 'done'
											? 'bg-emerald-400/90 text-emerald-950 ring-emerald-300'
											: 'bg-slate-900/80 text-slate-200 ring-slate-600/60'
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

					<div class="mt-3 grid gap-3 md:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
								Markdown notes
							</label>
							<textarea
								class="min-h-[80px] w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] leading-snug text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
								placeholder="Write detailed notes, checklists or context for this to-do using Markdown…"
								value={todo.markdown}
								oninput={(e) => updateTodo(todo.id, { markdown: e.target.value })}
							></textarea>
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
								Preview
							</label>
							<div
								class="min-h-[80px] rounded-md border border-slate-800 bg-slate-950/80 p-2 text-[11px] leading-snug text-slate-100"
							>
								{@html renderMarkdown(todo.markdown)}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

