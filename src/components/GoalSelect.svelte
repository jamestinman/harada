<script>
	import { NEW_LIST_OPTION_VALUE } from '$lib/todoUtils.js';

	let {
		allGoals = [],
		value = $bindable(''),
		includeUnassigned = false,
		includeNewList = false,
		hideWhenNoGoals = false,
		stringValues = false,
		unassignedLabel = 'No goal assigned',
		newListLabel = '* New list',
		selectClass = 'flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50'
	} = $props();

	const goalsWithTitles = $derived.by(() => {
		return allGoals
			.filter((goal) => goal.label && goal.label !== goal.code)
			.slice()
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
	});

	function getGoalValue(goal) {
		return stringValues ? String(goal.index) : goal.index;
	}
</script>

{#if !hideWhenNoGoals || goalsWithTitles.length > 0}
	<select bind:value={value} class={selectClass}>
		{#if includeUnassigned}
			<option value="">{unassignedLabel}</option>
		{/if}
		{#if includeNewList}
			<option value={NEW_LIST_OPTION_VALUE}>{newListLabel}</option>
		{/if}
		{#each goalsWithTitles as goal}
			<option value={getGoalValue(goal)}>
				{goal.label}
			</option>
		{/each}
	</select>
{/if}
