<script>
	import { cubicOut } from 'svelte/easing';
	import { fade } from 'svelte/transition';
	import { store } from '$stores/store.svelte.js';

	let { isOpen = $bindable(false) } = $props();

	let page = $state(0);

	const pages = [
		{
			step: '1',
			title: 'Set your central dream',
			body: "This can be as big as your life's ambition, or whatever the key thing you want this Harada Chart to achieve. It sits at the heart of everything.",
			image: '/onboarding/central-goal.png',
			imageAlt: 'Central goal in the Harada Chart'
		},
		{
			step: '2',
			title: 'Build the goals around it',
			body: "Surround your dream with 8 goals that will make it happen. You don't have to fill everything in, it's just to start you thinking.",
			image: '/onboarding/all-goals.png',
			imageAlt: 'Goals surrounding the central dream'
		},
		{
			step: '3',
			title: 'Add your todo lists',
			body: "A goal can have 8 sub-goals, giving you 64 concrete steps, each with a todo list of practical tasks behind it.",
			image: '/onboarding/sub-goals.png',
			imageAlt: 'Goals surrounding the central dream'
		}
	];

	const current = $derived(pages[page]);

	function close() {
		isOpen = false;
		page = 0;
	}

	function next() {
		if (page < pages.length - 1) page++;
	}

	function prev() {
		if (page > 0) page--;
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') close();
		if (e.key === 'ArrowRight') next();
		if (e.key === 'ArrowLeft') prev();
	}
</script>

{#if isOpen}
	<!-- Backdrop -->
	<div
		transition:fade={{ duration: 180 }}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
		onclick={(e) => e.target === e.currentTarget && close()}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="How it works"
		tabindex="-1"
	>
		<!-- Panel -->
		<div class="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col">

			<!-- Close button -->
			<button
				type="button"
				onclick={close}
				class="absolute top-3 right-3 z-10 rounded-full p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
				aria-label="Close"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Image -->
			<div class="bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-6 pb-4">
				<img
					src={current.image}
					alt={current.imageAlt}
					class="w-52 h-52 object-contain rounded-xl shadow-md"
				/>
			</div>

			<!-- Content -->
			<div class="px-6 pt-4 pb-2 flex flex-col gap-1 flex-1">
				<!-- Step indicator -->
				<div class="flex items-center gap-2 mb-1">
					<span class="text-xs font-semibold uppercase tracking-widest text-violet-500">
						Step {current.step} of {pages.length}
					</span>
				</div>

				<h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug">
					{current.title}
				</h2>
				<p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
					{current.body}
				</p>

			</div>

			<!-- Navigation -->
			<div class="px-6 py-4 flex items-center justify-between gap-3">
				<!-- Dot indicators -->
				<div class="flex gap-1.5">
					{#each pages as _, i}
						<button
							type="button"
							onclick={() => (page = i)}
							class="w-2 h-2 rounded-full transition-all {i === page ? 'bg-violet-500 w-4' : 'bg-slate-300 dark:bg-slate-600'}"
							aria-label="Go to step {i + 1}"
						></button>
					{/each}
				</div>

				<div class="flex gap-2">
					{#if page > 0}
						<button
							type="button"
							onclick={prev}
							class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
						>
							Goals
						</button>
					{/if}
					{#if page < pages.length - 1}
						<button
							type="button"
							onclick={next}
							class="rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2 text-sm font-semibold text-white transition"
						>
							Next
						</button>
					{:else}
						<button
							type="button"
							onclick={close}
							class="rounded-lg bg-violet-600 hover:bg-violet-500 px-5 py-2 text-sm font-semibold text-white transition"
						>
							Got it
						</button>
					{/if}
				</div>
			</div>
      <div class="px-6 py-4 flex flex-row justify-between">
        <a
        href="/about"
        onclick={close}
        class="text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 hover:underline self-start"
      >
        About the Harada Method →
      </a>
      {#if !store.isNative()}
      <a
      href="/app"
      onclick={close}
      class="text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 hover:underline self-start"
    >
    Get the app →
    </a>
    {/if}

    </div>
    </div>
	</div>
{/if}
