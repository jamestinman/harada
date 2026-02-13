<script>
	let {
		allGoals = [],
		defaultGoalIndex = null,
		onCreateTodo = null
	} = $props();

	let showComposer = $state(false);
	let composerTitle = $state('');
	let composerMarkdown = $state('');
	let composerGoalValue = $state('');

	function openComposer() {
		composerTitle = '';
		composerMarkdown = '';
		composerGoalValue =
			typeof defaultGoalIndex === 'number' ? String(defaultGoalIndex) : '';
		showComposer = true;
	}

	function closeComposer() {
		showComposer = false;
	}

	function submitComposer() {
		if (!onCreateTodo) return;
		onCreateTodo({
			title: composerTitle.trim(),
			markdown: composerMarkdown.trim(),
			goalIndex: composerGoalValue === '' ? null : Number(composerGoalValue)
		});
		closeComposer();
	}
</script>

<!-- Mobile bottom nav -->
<div class="fixed inset-x-0 bottom-0 z-40 lg:hidden">
	<div class="relative border-t border-slate-700 bg-slate-900/95 backdrop-blur">
		<div class="grid grid-cols-2 py-3 text-center text-sm font-semibold text-slate-300">
			<a href="/" class="transition hover:text-slate-100">Harada</a>
			<a href="/todo" class="transition hover:text-slate-100">Todo</a>
		</div>
		<button
			type="button"
			onclick={openComposer}
			class="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-violet-300 bg-violet-600 text-2xl font-bold text-slate-950 shadow-lg transition hover:bg-violet-500"
			aria-label="Add todo"
		>
			+
		</button>
	</div>
</div>

<!-- Desktop right rail -->
<div class="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 lg:flex lg:flex-col lg:items-center lg:gap-3">
	<a
		href="/"
		class="rounded-md border border-slate-700 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
	>
		Harada
	</a>
	<button
		type="button"
		onclick={openComposer}
		class="h-14 w-14 rounded-full border-2 border-violet-300 bg-violet-600 text-2xl font-bold text-slate-950 shadow-lg transition hover:bg-violet-500"
		aria-label="Add todo"
	>
		+
	</button>
	<a
		href="/todo"
		class="rounded-md border border-slate-700 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
	>
		Todo
	</a>
</div>

{#if showComposer}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0"
		onclick={(e) => e.target === e.currentTarget && closeComposer()}
		onkeydown={(e) => e.key === 'Escape' && closeComposer()}
		role="button"
		tabindex="-1"
		aria-label="Close add todo panel"
	>
		<div class="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-slate-900 p-4 shadow-2xl">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-slate-100">Edit Todo</h3>
				<button
					type="button"
					onclick={closeComposer}
					class="text-slate-400 hover:text-slate-200"
					aria-label="Close panel"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="mb-4">
				<input
					type="text"
					bind:value={composerTitle}
					placeholder="Todo title"
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
				/>
			</div>

			<div class="mb-4">
				<textarea
					bind:value={composerMarkdown}
					placeholder="Add notes, checklists, etc..."
					class="min-h-[140px] w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
				></textarea>
			</div>

			<div class="mb-4 flex items-center gap-2">
				<span class="text-sm text-slate-400">Part of goal:</span>
				<select
					bind:value={composerGoalValue}
					class="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
				>
					<option value="">No goal assigned</option>
					{#each allGoals as goal}
						<option value={String(goal.index)}>
							{goal.code} {goal.label !== goal.code ? `- ${goal.label}` : ''}
						</option>
					{/each}
				</select>
			</div>

			<div class="flex gap-2">
				<button
					type="button"
					onclick={submitComposer}
					class="w-full rounded-md border border-violet-600/70 bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
				>
					Save Changes
				</button>
			</div>
		</div>
	</div>
{/if}
