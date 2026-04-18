<script>
  import { onMount } from 'svelte';
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
	import { cubicOut } from 'svelte/easing';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { NEW_LIST_OPTION_VALUE, parseListSelection } from '$lib/todoUtils.js';
	import { resumePathTodo, resumePathNotes } from '$lib/workspaceNavResume.js';
	import { store } from '$stores/store.svelte.js';
	import { navComposerHandlers } from '$stores/navComposerHandlers.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import { synthStore } from '$stores/synth.svelte.js';
	import { localGet, localSet } from '$lib/PersistentStorage.mjs';
	import GoalSelect from './GoalSelect.svelte';
	import SquareMap from './SquareMap.svelte';
	import UserSettingsModal from './UserSettingsModal.svelte';
	import AuthModal from './AuthModal.svelte';
	import HowItWorksModal from './HowItWorksModal.svelte';

	const showFixedMobileNavButton = $derived.by(() => {
		const path = page?.url?.pathname ?? '/';
		const normalized = path.replace(/\/+$/, '') || '/';
		return normalized === '/';
	});

	// Get save status for visual indicator
	const saveStatus = $derived(store.saveStatus);
	const borderColorClass = $derived.by(() => {
		if (saveStatus === 'dirty') return 'save-border-dirty';
		if (saveStatus === 'saving') return 'save-border-saving';
		return 'save-border-default';
	});

	let {
		allGoals = [],
		defaultGoalIndex = null,
		onCreateTodo = null,
		onCreateNote = null
	} = $props();

	const effectiveCreateTodo = $derived(navComposerHandlers.onCreateTodo ?? onCreateTodo);
	const effectiveCreateNote = $derived(navComposerHandlers.onCreateNote ?? onCreateNote);

	let composerTitle = $state('');
	let composerMarkdown = $state('');
	let composerGoalValue = $state('');
	let composerNewListName = $state('');
	let composerTitleInputElement = $state(null);
  let showSettingsModal = $state(false);
  let showAuthModal = $state(false);

const clearAll = () => {
	store.clearAll();
};

	let composerWasOpen = $state(false);

	function focusTaskTitleInput() {
		tick().then(() => {
			if (composerTitleInputElement) {
				composerTitleInputElement.focus();
				composerTitleInputElement.select();
			}
		});
	}

	$effect(() => {
		const open = store.composerPanelOpen;
		if (open && !composerWasOpen) {
			composerTitle = '';
			composerMarkdown = '';
			const activeGoalIndex =
				typeof store.currentGoalIndex === 'number'
					? store.currentGoalIndex
					: typeof defaultGoalIndex === 'number'
						? defaultGoalIndex
						: null;
			composerGoalValue =
				typeof activeGoalIndex === 'number' ? String(activeGoalIndex) : '';
			composerNewListName = '';
			if (store.composerPanelTab === 'task') {
				focusTaskTitleInput();
			}
		}
		composerWasOpen = open;
	});

	function closeComposer() {
		store.closeComposerPanel();
	}

	function submitComposer() {
		if (!effectiveCreateTodo) return;
		const listMeta = parseListSelection(composerGoalValue, composerNewListName);
		if (!listMeta) return;
		effectiveCreateTodo({
			title: composerTitle.trim(),
			markdown: composerMarkdown.trim(),
			...listMeta
		});
		closeComposer();
	}

	function submitNoteTab() {
		if (!effectiveCreateNote) return;
		effectiveCreateNote();
		closeComposer();
	}

	function sheet3d(_node, { duration = 240, distance = 24, angle = 4 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t, u) =>
				`transform: perspective(900px) translateY(${u * distance}px) rotateX(${u * angle}deg); opacity: ${t};`
		};
	}

	async function handleLogout() {
		const result = await authStore.signOut();
		if (result.success) {
			store.mobileNavMenuOpen = false;
		}
	}

	function openSettings() {
		store.mobileNavMenuOpen = false;
		showSettingsModal = true;
	}

	onMount(() => {
		if (!browser) return;

		if (!localGet('harada_onboarding_seen', false)) {
			store.showHowItWorksModal = true;
      localSet('harada_onboarding_seen', true);
		}

		const anyWindow = window;
		const api = anyWindow?.HaradatoElectron;
		if (!api?.onMenuCommand) return;

		const unsubscribe = api.onMenuCommand((command) => {
			if (command === 'settings') {
				if (authStore.user) {
					openSettings();
				} else {
					showAuthModal = true;
					store.mobileNavMenuOpen = false;
				}
			}
			if (command === 'auth') {
				if (authStore.user) {
					handleLogout();
				} else {
					showAuthModal = true;
					store.mobileNavMenuOpen = false;
				}
			}
		});

		return () => {
			if (typeof unsubscribe === 'function') {
				unsubscribe();
			}
		};
	});

	$effect(() => {
		if (!browser) return;
		const anyWindow = window;
		const api = anyWindow?.HaradatoElectron;
		if (!api?.setAuthMenuState) return;
		api.setAuthMenuState(!!authStore.user);
	});

	const isOnline = $derived(store.isOnline);

	// Resolve display name from live user, or fall back to cached last-known user when offline
	const userName = $derived.by(() => {
		const user = authStore.user ?? authStore.lastKnownUser;
		if (!user) return null;
		return user.user_metadata?.full_name ||
		       user.user_metadata?.name ||
		       user.email?.split('@')[0] ||
		       'User';
	});

	const userInitial = $derived.by(() => {
		const name = userName;
		if (!name) return 'U';
		return name.charAt(0).toUpperCase();
	});

	const todoResumeHref = $derived.by(() => {
		void page.url.pathname;
		return resumePathTodo();
	});

	const notesResumeHref = $derived.by(() => {
		void page.url.pathname;
		return resumePathNotes();
	});

	function normalizePathname(path) {
		const p = (path ?? '/').replace(/\/+$/, '') || '/';
		return p;
	}

	/** Mobile bottom nav: resume last To-Do URL; second tap on /todo opens goals sidebar */
	function handleMobileTodoNav(e) {
		const path = normalizePathname(page.url.pathname);
		const target = normalizePathname(resumePathTodo());
		if (path === target) {
			e.preventDefault();
			if (path === '/todo') {
				store.requestTodoSidebarOpen();
			}
			return;
		}
	}

	/** Mobile bottom nav: resume last Notes URL; from note detail → list uses saved route + drawer */
	function handleMobileNotesNav(e) {
		const currentPath = normalizePathname(page.url.pathname);
		if (store.notesMobileDetailOpen && currentPath.startsWith('/notes')) {
			e.preventDefault();
			store.clearLastOpenedNote();
			store.pendingSelectNoteId = null;
			store.notesRevealListDrawer = true;
			goto(resumePathNotes());
			return;
		}

		const path = normalizePathname(page.url.pathname);
		const target = normalizePathname(resumePathNotes());
		if (path === target) {
			e.preventDefault();
			return;
		}
	}

</script>

<!-- Mobile top-right hamburger (Harada home only; todo/notes use workspace chrome) -->
{#if showFixedMobileNavButton}
	<div
		class="fixed z-40 lg:hidden"
		style="
			top: calc(env(safe-area-inset-top, 0px) + 1rem);
			right: calc(env(safe-area-inset-right, 0px) + 1rem);
		"
	>
		<button
			type="button"
			onclick={() => store.toggleMobileNavMenu()}
			class="nav-hamburger-button"
			aria-label="Open menu"
		>
			<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
	</div>
{/if}

{#if store.mobileNavMenuOpen}
	<div
		class="mobile-menu-panel fixed right-4 z-50 lg:hidden"
		style="top: calc(env(safe-area-inset-top, 0px) + 3.25rem);"
	>
		<div class="py-2">
			{#if authStore.user}
				<div class="mobile-menu-header">
					<div class="mobile-menu-header-name">{userName}</div>
					{#if authStore.user?.email}
						<div class="mobile-menu-header-email">{authStore.user.email}</div>
					{/if}
				</div>
				<button type="button" onclick={openSettings} class="mobile-menu-item">Settings</button>
			{:else if !isOnline}
				<div class="mobile-menu-header">
					<div class="mobile-menu-header-name text-amber-500 dark:text-amber-400">OFFLINE</div>
					{#if userName}
						<div class="mobile-menu-header-email">{userName}</div>
					{/if}
				</div>
			{:else}
				<button
					type="button !text-red-600 !font-bold"
					onclick={() => {
						store.mobileNavMenuOpen = false;
						showAuthModal = true;
					}}
					class="mobile-menu-item"
				>
					Sign In
				</button>
			{/if}
			<button
				type="button"
				onclick={() => {
					store.mobileNavMenuOpen = false;
					store.showHowItWorksModal = true;
				}}
				class="mobile-menu-item"
			>
				How it works
			</button>

      <button onclick={() => { goto('/'); store.mobileNavMenuOpen = false;}} class="mobile-menu-item">Harada</button>
			<button onclick={() => { goto(resumePathTodo()); store.mobileNavMenuOpen = false;}} class="mobile-menu-item">To-Do</button>
			<button onclick={() => { goto(resumePathNotes()); store.mobileNavMenuOpen = false;}} class="mobile-menu-item">Notes</button>

			{#if authStore.user}
				<button type="button" onclick={handleLogout} class="mobile-menu-item-logout">Logout</button>
			{/if}
			<div class="mobile-menu-footer">
				<div class="mobile-menu-footer-text">Version {store.version}</div>
			</div>
		</div>
	</div>
	<button
		onclick={() => (store.mobileNavMenuOpen = false)}
		class="fixed inset-0 z-40 lg:hidden"
		aria-hidden="true"
	></button>
{/if}

<!-- Mobile bottom nav -->
<div
	class="mobile-bottom-nav"
	style="padding-bottom: env(safe-area-inset-bottom, 0px);"
>
	<div class="mobile-bottom-nav-inner {borderColorClass}">
		<div class="mobile-bottom-nav-links">
			<a href="/" class="mobile-bottom-nav-link">Harada</a>
			<a href={todoResumeHref} class="mobile-bottom-nav-link" onclick={handleMobileTodoNav}>To-Do</a>
			<a href={notesResumeHref} class="mobile-bottom-nav-link" onclick={handleMobileNotesNav}>Notes</a>
		</div>
	</div>
</div>

<!-- Desktop top-right nav -->
<nav class="fixed right-4 top-4 z-40 hidden lg:flex flex-col lg:items-center lg:gap-2" aria-label="Main navigation">
  <SquareMap />
	{#if authStore?.user}
		<button
			type="button"
			onclick={() => (showSettingsModal = true)}
			class="nav-desktop-link"
			title="Settings"
		>
			{userName}
		</button>
	{:else if !isOnline}
		<div class="nav-desktop-link flex flex-col items-center gap-0.5 cursor-default" title={userName ? `Offline — signed in as ${userName}` : 'Offline'}>
			<span class="text-amber-500 dark:text-amber-400 font-bold text-xs tracking-wide">OFFLINE</span>
			{#if userName}
				<span class="text-slate-500 dark:text-slate-400 text-xs">{userName}</span>
			{/if}
		</div>
	{:else}
		<button
			type="button"
			onclick={() => (showAuthModal = true)}
			class="nav-desktop-link !text-red-600 !font-bold"
			title="Sign In"
		>
			Sign In
		</button>
	{/if}
  <a href="/about" class="nav-desktop-link">About</a>

  <a
		href="/"
		class="nav-desktop-link"
	>
		Harada
	</a>
	<a href={todoResumeHref} class="nav-desktop-link">To-Do</a>
	<a href={notesResumeHref} class="nav-desktop-link">Notes</a>
  <!-- <button onclick={clearAll}>Clear</button> -->
</nav>

{#if store.composerPanelOpen}
	<div
		class="composer-backdrop"
		onclick={(e) => e.target === e.currentTarget && closeComposer()}
		onkeydown={(e) => e.key === 'Escape' && closeComposer()}
		role="button"
		tabindex="-1"
		aria-label="Close composer panel"
	>
		<div transition:sheet3d class="composer-panel">
			<div class="mb-4 flex items-center justify-between gap-2">
				<div class="flex min-w-0 flex-1 rounded-lg border border-slate-600/80 p-0.5">
					<button
						type="button"
						onclick={() => {
							store.composerPanelTab = 'task';
							focusTaskTitleInput();
						}}
						class="composer-tab flex-1 rounded-md px-3 py-2 text-sm font-semibold transition {store.composerPanelTab ===
						'task'
							? 'bg-violet-600 text-white'
							: 'text-slate-300 hover:bg-slate-800/80'}"
					>
						New Task
					</button>
					<button
						type="button"
						onclick={() => (store.composerPanelTab = 'note')}
						class="composer-tab flex-1 rounded-md px-3 py-2 text-sm font-semibold transition {store.composerPanelTab ===
						'note'
							? 'bg-violet-600 text-white'
							: 'text-slate-300 hover:bg-slate-800/80'}"
					>
						New Note
					</button>
				</div>
				<button
					type="button"
					onclick={closeComposer}
					class="composer-close-button shrink-0"
					aria-label="Close panel"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			{#if store.composerPanelTab === 'task'}
				<div class="mb-4">
					<input
						bind:this={composerTitleInputElement}
						type="text"
						bind:value={composerTitle}
						placeholder="Task"
						class="composer-input"
					/>
				</div>

				<div class="mb-4">
					<textarea bind:value={composerMarkdown} placeholder="" class="composer-textarea"></textarea>
				</div>

				<div class="mb-4 flex items-center gap-2">
					<span class="composer-meta-label">Part of:</span>
					<GoalSelect
						allGoals={allGoals}
						bind:value={composerGoalValue}
						includeUnassigned={true}
						includeNewList={false}
						stringValues={true}
					/>
				</div>

				{#if composerGoalValue === NEW_LIST_OPTION_VALUE}
					<div class="mb-4">
						<input
							type="text"
							bind:value={composerNewListName}
							placeholder="List name"
							class="composer-input"
						/>
					</div>
				{/if}

				<div class="flex gap-2">
					<button
						type="button"
						onclick={submitComposer}
						disabled={composerGoalValue === NEW_LIST_OPTION_VALUE && !composerNewListName.trim()}
						class="w-full rounded-md border border-violet-600/70 bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
					>
						Save
					</button>
				</div>
			{:else}
				<p class="mb-4 text-sm text-slate-400">
					Creates a new note using your current goal context when applicable, then opens it for editing.
				</p>
				<button
					type="button"
					onclick={submitNoteTab}
					class="w-full rounded-md border border-violet-600/70 bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
				>
					Create note
				</button>
			{/if}
		</div>
	</div>
{/if}

{#if authStore.user}
	<UserSettingsModal bind:isOpen={showSettingsModal} />
{:else}
	<AuthModal bind:isOpen={showAuthModal} />
{/if}

<HowItWorksModal bind:isOpen={store.showHowItWorksModal} />
