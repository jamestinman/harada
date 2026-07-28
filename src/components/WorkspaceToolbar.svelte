<script>
	import { ChevronLeft, Menu, Plus, SquarePen } from 'lucide-svelte';
	import { store } from '$stores/store.svelte.js';
	import ClearableTextInput from './ClearableTextInput.svelte';

	let {
		mode = 'desktop',
		inputMode = 'search',
		searchText = $bindable(''),
		quickAddText = $bindable(''),
		searchPlaceholder = 'Search',
		quickAddPlaceholder = 'New task or search...',
		showSidebarToggle = false,
		onSidebarToggle = null,
		showHamburger = false,
		showPrimaryAction = true,
		composeTabDefault = 'task',
		onQuickAdd = null,
		onNew = null,
		trailing = undefined
	} = $props();

	const hasQuickAddText = $derived((quickAddText ?? '').trim().length > 0);

	function openCompose() {
		const tab =
			composeTabDefault === 'note' ? 'note' : composeTabDefault === 'url' ? 'url' : 'task';
		store.openComposerPanel(tab);
	}

	function toggleNavMenu() {
		store.toggleMobileNavMenu();
	}

	function handlePrimaryAction() {
		if (inputMode === 'quickAdd' && hasQuickAddText) {
			onQuickAdd?.();
			return;
		}
		if (onNew) {
			onNew();
			return;
		}
		openCompose();
	}

	function handleQuickAddKeydown(event) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		if (hasQuickAddText) onQuickAdd?.();
	}

	const inputClass =
		'w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60';
	const iconBtnClass =
		'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-900/45 text-slate-100 transition hover:border-violet-500/60 hover:bg-violet-500/10';
	const submitBtnClass =
		'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-violet-500/60 bg-violet-500/20 text-slate-900 transition hover:border-violet-400 hover:bg-violet-500/30';
</script>

{#if mode === 'desktop'}
	<div class="flex w-full min-w-0 items-center gap-3 pt-2">
		{#if inputMode === 'quickAdd'}
			<ClearableTextInput
				bind:value={quickAddText}
				placeholder={quickAddPlaceholder}
				onkeydown={handleQuickAddKeydown}
				class={inputClass}
				clearLabel="Clear search"
			/>
		{:else if inputMode === 'search'}
			<ClearableTextInput
				bind:value={searchText}
				placeholder={searchPlaceholder}
				class={inputClass}
				clearLabel="Clear search"
			/>
		{:else}
			<div class="flex-1"></div>
		{/if}
		<div class="flex shrink-0 items-center gap-3">
			{#if showPrimaryAction}
				<button
					type="button"
					onclick={handlePrimaryAction}
					class={inputMode === 'quickAdd' && hasQuickAddText ? submitBtnClass : iconBtnClass}
					aria-label={inputMode === 'quickAdd' && hasQuickAddText ? 'Add task' : onNew ? 'New note' : 'New task or note'}
				>
					{#if inputMode === 'quickAdd' && hasQuickAddText}
						<Plus class="h-5 w-5" strokeWidth={2} />
					{:else}
						<SquarePen class="h-5 w-5" strokeWidth={2} />
					{/if}
				</button>
			{/if}
			{@render trailing?.()}
		</div>
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
		{#if inputMode === 'quickAdd'}
			<div class="min-w-0 flex-1">
				<ClearableTextInput
					bind:value={quickAddText}
					placeholder={quickAddPlaceholder}
					onkeydown={handleQuickAddKeydown}
					class="{inputClass} w-full"
					clearLabel="Clear search"
				/>
			</div>
		{:else if inputMode === 'search'}
			<div class="min-w-0 flex-1">
				<ClearableTextInput
					bind:value={searchText}
					placeholder={searchPlaceholder}
					class="{inputClass} w-full"
					clearLabel="Clear search"
				/>
			</div>
		{:else}
			<div class="flex-1"></div>
		{/if}
		<div class="flex shrink-0 items-center gap-2">
			{#if showPrimaryAction}
				<button
					type="button"
					onclick={handlePrimaryAction}
					class={inputMode === 'quickAdd' && hasQuickAddText ? submitBtnClass : iconBtnClass}
					aria-label={inputMode === 'quickAdd' && hasQuickAddText ? 'Add task' : onNew ? 'New note' : 'New task or note'}
				>
					{#if inputMode === 'quickAdd' && hasQuickAddText}
						<Plus class="h-5 w-5" strokeWidth={2} />
					{:else}
						<SquarePen class="h-5 w-5" strokeWidth={2} />
					{/if}
				</button>
			{/if}
			{@render trailing?.()}
			{#if showHamburger}
				<button type="button" onclick={toggleNavMenu} class={iconBtnClass} aria-label="Open menu">
					<Menu class="h-5 w-5" strokeWidth={2} />
				</button>
			{/if}
		</div>
	</div>
{/if}
