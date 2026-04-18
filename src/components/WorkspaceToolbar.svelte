<script>
	import { ChevronLeft, Menu, SquarePen } from 'lucide-svelte';
	import { store } from '$stores/store.svelte.js';

	let {
		mode = 'desktop',
		searchText = $bindable(''),
		searchPlaceholder = 'Search',
		showSidebarToggle = false,
		onSidebarToggle = null,
		showHamburger = false,
		composeTabDefault = 'task',
		trailing = undefined
	} = $props();

	function openCompose() {
		store.openComposerPanel(composeTabDefault === 'note' ? 'note' : 'task');
	}

	function toggleNavMenu() {
		store.toggleMobileNavMenu();
	}

	const inputClass =
		'min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60';
	const iconBtnClass =
		'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-900/45 text-slate-100 transition hover:border-violet-500/60 hover:bg-violet-500/10';
</script>

{#if mode === 'desktop'}
	<div class="flex w-full min-w-0 items-center gap-3">
		<input type="text" placeholder={searchPlaceholder} bind:value={searchText} class={inputClass} />
		<button type="button" onclick={openCompose} class={iconBtnClass} aria-label="New task or note">
			<SquarePen class="h-5 w-5" strokeWidth={2} />
		</button>
		{@render trailing?.()}
	</div>
{:else}
	<div class="flex w-full min-w-0 items-center gap-2">
		{#if showSidebarToggle}
			<button
				type="button"
				onclick={() => onSidebarToggle?.()}
				class="{iconBtnClass}"
				aria-label="Open lists sidebar"
			>
				<ChevronLeft class="h-5 w-5" strokeWidth={2} />
			</button>
		{/if}
		<input type="text" placeholder={searchPlaceholder} bind:value={searchText} class={inputClass} />
		<button type="button" onclick={openCompose} class={iconBtnClass} aria-label="New task or note">
			<SquarePen class="h-5 w-5" strokeWidth={2} />
		</button>
		{@render trailing?.()}
		{#if showHamburger}
			<button type="button" onclick={toggleNavMenu} class={iconBtnClass} aria-label="Open menu">
				<Menu class="h-5 w-5" strokeWidth={2} />
			</button>
		{/if}
	</div>
{/if}
