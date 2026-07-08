<script>
	let {
		goalMenuItems = [],
		allTasksCount = 0,
		pinnedCount = 0,
		activeGoalIndex = null,
		showAllTasksActive = false,
		onAllTasksClick = null,
		onGoalClick = null
	} = $props();

	const pinnedHref = '/todo/Z1';
	const isPinnedActive = $derived(activeGoalIndex === -1);

	function isMainGoalIndex(goalIndex) {
		if (typeof goalIndex !== 'number' || goalIndex < 0 || goalIndex > 80) return false;
		const row = Math.floor(goalIndex / 9);
		const col = goalIndex % 9;
		return row % 3 === 1 && col % 3 === 1;
	}
</script>

<div class="relative ml-2 border-l border-slate-200/50 pl-2 dark:border-slate-700/40 space-y-0.5">
	{#if onAllTasksClick}
		<button
			type="button"
			onclick={onAllTasksClick}
			class={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold transition ${
				showAllTasksActive
					? 'bg-violet-500/20 text-violet-800 dark:bg-violet-500/25 dark:text-violet-200'
					: 'text-slate-700 hover:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-white/5'
			}`}
			aria-pressed={showAllTasksActive}
		>
			<span>All Tasks</span>
			<span class="text-xs opacity-50">{allTasksCount}</span>
		</button>
	{:else}
		<a
			href="/todo"
			class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-500/10 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200"
		>
			<span>All Tasks</span>
			<span class="text-xs opacity-50">{allTasksCount}</span>
		</a>
	{/if}

	<a
		href={pinnedHref}
		onclick={() => onGoalClick?.()}
		class={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm font-bold transition ${
			isPinnedActive
				? 'bg-pink-500/15 text-pink-400 dark:bg-pink-500/20 dark:text-pink-300'
				: 'text-pink-400 hover:bg-pink-500/10 dark:text-pink-300 dark:hover:bg-pink-500/10'
		}`}
		aria-current={isPinnedActive ? 'page' : undefined}
	>
		<span>Pinned</span>
		<span class="text-xs opacity-70">{pinnedCount}</span>
	</a>

	{#each goalMenuItems as item (item.id)}
		<a
			href={item.href}
			onclick={() => onGoalClick?.()}
			class={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition ${
				item.goalIndex === activeGoalIndex
					? 'bg-violet-500/20 text-violet-800 dark:bg-violet-500/25 dark:text-violet-200'
					: 'text-slate-700 hover:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-white/5'
			}`}
			aria-current={item.goalIndex === activeGoalIndex ? 'page' : undefined}
		>
			<span class={`truncate pr-3 ${isMainGoalIndex(item.goalIndex) ? 'font-bold' : ''}`}>{item.label}</span>
			<span class="text-xs opacity-50">{item.count}</span>
		</a>
	{/each}
</div>
