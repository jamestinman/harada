<script>
	import { NEW_LIST_OPTION_VALUE, PINNED_GOAL_INDEX } from '$lib/todoUtils.js';

	let {
		allGoals = [],
		value = $bindable(''),
		includeUnassigned = false,
		includeNewList = false,
		includePinned = false,
		hideWhenNoGoals = false,
		stringValues = false,
		unassignedLabel = 'No goal assigned',
		newListLabel = '* New list',
		selectClass = ''
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
		{#if includePinned}
			<option value={stringValues ? String(PINNED_GOAL_INDEX) : PINNED_GOAL_INDEX}>Pinned</option>
		{/if}
		{#each goalsWithTitles as goal}
			<option value={getGoalValue(goal)}>
				{goal.label}
			</option>
		{/each}
	</select>
{/if}
