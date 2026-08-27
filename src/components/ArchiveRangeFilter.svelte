<script>
	import { ARCHIVE_RANGES } from '$lib/todoUtils.js';

	let { value = 'week', onChange = null, label = 'Time range' } = $props();
</script>

<div class="settings-appearance-toggle" role="group" aria-label={label}>
	{#each ARCHIVE_RANGES as range (range.id)}
		<button
			type="button"
			onclick={() => onChange?.(range.id)}
			aria-pressed={value === range.id}
			class={`settings-theme-option ${
				value === range.id ? 'settings-theme-option-active' : 'settings-theme-option-inactive'
			}`}
		>
			{range.label}
		</button>
	{/each}
</div>
