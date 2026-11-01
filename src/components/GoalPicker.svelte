<script>
	import { onMount, tick } from 'svelte';

	let {
		goals = [],
		currentGoalIndex = null,
		allowClear = false,
		/** DOMRect of the control that opened the picker */
		anchorRect = null,
		onSelect,
		onClose
	} = $props();

	const PANEL_WIDTH = 256;
	const PANEL_MAX_HEIGHT = 320;
	const GAP = 4;
	const EDGE = 8;

	let query = $state('');
	let activeIndex = $state(0);
	let inputElement = $state(null);
	let panelElement = $state(null);
	// Only ever mounted after a click, so `window` exists.
	let viewport = $state({ width: window.innerWidth, height: window.innerHeight });
	const isNarrow = $derived(viewport.width < 768);

	const options = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const matches = goals
			.filter((goal) => !q || goal.label.toLowerCase().includes(q))
			.map((goal) => ({ value: goal.index, label: goal.label }));
		if (allowClear && !q) matches.unshift({ value: null, label: 'No goal' });
		return matches;
	});

	$effect(() => {
		query;
		activeIndex = 0;
	});

	const panelStyle = $derived.by(() => {
		if (isNarrow || !anchorRect) return '';
		const left = Math.max(
			EDGE,
			Math.min(anchorRect.right - PANEL_WIDTH, viewport.width - PANEL_WIDTH - EDGE)
		);
		const fitsBelow = anchorRect.bottom + GAP + PANEL_MAX_HEIGHT <= viewport.height - EDGE;
		const vertical = fitsBelow
			? `top: ${anchorRect.bottom + GAP}px;`
			: `bottom: ${viewport.height - anchorRect.top + GAP}px;`;
		return `left: ${left}px; width: ${PANEL_WIDTH}px; ${vertical}`;
	});

	onMount(() => {
		const sync = () => {
			viewport = { width: window.innerWidth, height: window.innerHeight };
		};
		// The desktop panel is pinned to its anchor, so it closes when the page moves under it.
		const closeOnScroll = (event) => {
			if (isNarrow || panelElement?.contains(event.target)) return;
			onClose?.();
		};
		window.addEventListener('resize', sync);
		window.addEventListener('scroll', closeOnScroll, true);
		// Avoid opening the on-screen keyboard over the sheet on phones.
		if (!isNarrow) void tick().then(() => inputElement?.focus());
		return () => {
			window.removeEventListener('resize', sync);
			window.removeEventListener('scroll', closeOnScroll, true);
		};
	});

	function portal(node) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	function choose(option) {
		if (!option) return;
		onSelect?.(option.value);
		onClose?.();
	}

	function scrollActiveIntoView() {
		void tick().then(() => {
			panelElement?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
		});
	}

	function handleKeydown(event) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose?.();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = Math.min(activeIndex + 1, options.length - 1);
			scrollActiveIntoView();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
			scrollActiveIntoView();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			choose(options[activeIndex]);
		}
	}
</script>

<div use:portal class="fixed inset-0 z-[70]" role="presentation" onkeydown={handleKeydown}>
	<button
		type="button"
		class="absolute inset-0 h-full w-full cursor-default {isNarrow ? 'bg-black/30' : ''}"
		aria-label="Close goal picker"
		tabindex="-1"
		onclick={() => onClose?.()}
	></button>
	<div
		bind:this={panelElement}
		role="dialog"
		aria-label="Choose a goal"
		class={`absolute flex flex-col overflow-hidden border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 ${
			isNarrow
				? 'inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]'
				: 'max-h-80 rounded-lg'
		}`}
		style={panelStyle}
	>
		<div class="border-b border-slate-200 p-2 dark:border-slate-700">
			<input
				bind:this={inputElement}
				bind:value={query}
				type="text"
				placeholder="Find a goal"
				aria-label="Find a goal"
				class="w-full rounded-md border border-slate-200 bg-transparent px-2 py-1.5 text-base text-slate-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 md:text-sm dark:border-slate-700 dark:text-slate-100"
			/>
		</div>
		<ul class="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label="Goals">
			{#each options as option, i (option.value ?? 'none')}
				<li role="option" aria-selected={option.value === currentGoalIndex}>
					<button
						type="button"
						data-active={i === activeIndex}
						onclick={() => choose(option)}
						onpointermove={() => (activeIndex = i)}
						class={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm md:py-1.5 ${
							i === activeIndex ? 'bg-violet-500/10' : ''
						} ${
							option.value === null
								? 'italic text-slate-500 dark:text-slate-400'
								: 'text-slate-800 dark:text-slate-200'
						}`}
					>
						<span class="truncate">{option.label}</span>
						{#if option.value === currentGoalIndex && option.value !== null}
							<span class="text-violet-500" aria-hidden="true">✓</span>
						{/if}
					</button>
				</li>
			{:else}
				<li class="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No matching goals</li>
			{/each}
		</ul>
	</div>
</div>
