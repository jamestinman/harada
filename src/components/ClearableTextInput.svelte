<script>
	import { X } from 'lucide-svelte';

	let {
		value = $bindable(''),
		placeholder = '',
		type = 'text',
		class: inputClass = '',
		wrapperClass = 'relative min-w-0 flex-1',
		onkeydown = undefined,
		clearLabel = 'Clear'
	} = $props();

	const hasValue = $derived((value ?? '').length > 0);

	const clearBtnClass =
		'absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 transition hover:bg-slate-500/15 hover:text-slate-200 dark:hover:bg-white/10 dark:hover:text-slate-100';
</script>

<div class={wrapperClass}>
	<input
		{type}
		bind:value
		{placeholder}
		{onkeydown}
		class="{inputClass} {hasValue ? 'pr-8' : ''}"
	/>
	{#if hasValue}
		<button type="button" onclick={() => (value = '')} class={clearBtnClass} aria-label={clearLabel}>
			<X class="h-4 w-4" strokeWidth={2} />
		</button>
	{/if}
</div>
