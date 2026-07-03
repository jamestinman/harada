<script>
	let {
		active = false,
		disabled = false,
		boxed = false,
		compact = false,
		ariaLabel = 'Read aloud',
		title = ariaLabel,
		onclick = null,
		class: className = ''
	} = $props();

	const inactiveClass = $derived(
		boxed
			? 'text-slate-400 hover:bg-violet-500/10 hover:text-violet-400 dark:hover:text-violet-300'
			: 'text-slate-400 hover:bg-slate-500/10 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-300'
	);
	const activeClass =
		'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-400 dark:text-emerald-400';
	const sizeClass = $derived(compact ? 'h-5 w-5' : boxed ? 'h-7 w-7' : 'h-8 w-8');
	const iconClass = $derived(compact ? 'h-3.5 w-3.5' : 'h-4 w-4');
</script>

<button
	type="button"
	class="inline-flex shrink-0 items-center justify-center rounded-md transition {active
		? activeClass
		: inactiveClass} {sizeClass} {disabled ? 'pointer-events-none opacity-40' : ''} {className}"
	{title}
	aria-label={ariaLabel}
	aria-pressed={active}
	{disabled}
	onclick={(e) => {
		e.stopPropagation();
		onclick?.(e);
	}}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={iconClass}
		aria-hidden="true"
	>
		<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
		<path d="M16 9a5 5 0 0 1 0 6" />
		<path d="M19.364 4.636a9 9 0 0 1 0 12.728" />
	</svg>
</button>
