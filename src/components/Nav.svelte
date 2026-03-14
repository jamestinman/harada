<script>
import { onMount } from 'svelte';
import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { NEW_LIST_OPTION_VALUE, parseListSelection } from '$lib/todoUtils.js';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import { synthStore } from '$stores/synth.svelte.js';
	import { localGet, localSet } from '$lib/PersistentStorage.mjs';
	import GoalSelect from './GoalSelect.svelte';
	import SquareMap from './SquareMap.svelte';
	import UserSettingsModal from './UserSettingsModal.svelte';
	import AuthModal from './AuthModal.svelte';
	import HowItWorksModal from './HowItWorksModal.svelte';
	
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
		onCreateTodo = null
	} = $props();

  let showComposer = $state(false);
	let composerTitle = $state('');
	let composerMarkdown = $state('');
	let composerGoalValue = $state('');
	let composerNewListName = $state('');
	let composerTitleInputElement = $state(null);
	let showMobileMenu = $state(false);
  let showSettingsModal = $state(false);
  let showAuthModal = $state(false);
  let showHowItWorksModal = $state(false);

const clearAll = () => {
	store.clearAll();
};

	async function openComposer() {
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
		showComposer = true;
		await tick();
		if (composerTitleInputElement) {
			composerTitleInputElement.focus();
			composerTitleInputElement.select();
		}
	}

	function closeComposer() {
		showComposer = false;
	}

	function submitComposer() {
		if (!onCreateTodo) return;
		const listMeta = parseListSelection(composerGoalValue, composerNewListName);
		if (!listMeta) return;
		onCreateTodo({
			title: composerTitle.trim(),
			markdown: composerMarkdown.trim(),
			...listMeta
		});
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
			showMobileMenu = false;
		}
	}

	function openSettings() {
		showMobileMenu = false;
		showSettingsModal = true;
	}

	onMount(() => {
		if (!browser) return;

		if (!localGet('harada_onboarding_seen', false)) {
			showHowItWorksModal = true;
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
					showMobileMenu = false;
				}
			}
			if (command === 'auth') {
				if (authStore.user) {
					handleLogout();
				} else {
					showAuthModal = true;
					showMobileMenu = false;
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

	// Get user display name
	const userName = $derived.by(() => {
		const user = authStore.user;
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

</script>

<!-- Mobile top-right hamburger menu (HaradaChart page only) -->
{#if !(page?.url?.pathname?.startsWith('/todo'))}
<div
	class="fixed z-40 lg:hidden"
	style="
		top: calc(env(safe-area-inset-top, 0px) + 1rem);
		right: calc(env(safe-area-inset-right, 0px) + 1rem);
	"
>
	<button
		type="button"
		onclick={() => (showMobileMenu = !showMobileMenu)}
		class="nav-hamburger-button"
		aria-label="Open menu"
	>
		<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
		</svg>
	</button>
	{#if showMobileMenu}
		<div class="mobile-menu-panel">
			<div class="py-2">
				{#if authStore.user}
					<div class="mobile-menu-header">
						<div class="mobile-menu-header-name">{userName}</div>
						{#if authStore.user?.email}
							<div class="mobile-menu-header-email">{authStore.user.email}</div>
						{/if}
					</div>
					<button
						type="button"
						onclick={openSettings}
						class="mobile-menu-item"
					>
						Settings
					</button>
				{:else}
					<button
						type="button"
						onclick={() => { showMobileMenu = false; showAuthModal = true; }}
						class="mobile-menu-item"
					>
						Sign In
					</button>
				{/if}
				<button
					type="button"
					onclick={() => { showMobileMenu = false; showHowItWorksModal = true; }}
					class="mobile-menu-item"
				>
					How it works
				</button>
				<a
					href="/about"
					onclick={() => (showMobileMenu = false)}
					class="mobile-menu-item"
				>
					About
				</a>
				{#if authStore.user}
					<button
						type="button"
						onclick={handleLogout}
						class="mobile-menu-item-logout"
					>
						Logout
					</button>
				{/if}
				<div class="mobile-menu-footer">
					<div class="mobile-menu-footer-text">Version {store.version}</div>
				</div>
			</div>
		</div>
		<button
			onclick={() => (showMobileMenu = false)}
			class="fixed inset-0 z-30"
			aria-hidden="true"
		></button>
	{/if}
</div>
{/if}

<!-- Mobile bottom nav -->
<div
	class="mobile-bottom-nav"
	style="padding-bottom: env(safe-area-inset-bottom, 0px);"
>
	<div class="mobile-bottom-nav-inner {borderColorClass}">
		<div class="mobile-bottom-nav-links">
			<a href="/" class="mobile-bottom-nav-link">Harada</a>
			<a href="/todo" class="mobile-bottom-nav-link">Todo</a>
		</div>
		<button
			type="button"
			onclick={openComposer}
			class="mobile-bottom-nav-fab"
			aria-label="Add todo"
		>
			+
		</button>
	</div>
</div>

<!-- Desktop top-right nav -->
<nav class="fixed right-4 top-4 z-40 hidden lg:flex flex-col lg:items-center lg:gap-2" aria-label="Main navigation">
  <SquareMap />
	{#if authStore.user}
		<button
			type="button"
			onclick={() => (showSettingsModal = true)}
			class="nav-desktop-link"
			title="Settings"
		>
			{userName}
		</button>
	{:else}
		<button
			type="button"
			onclick={() => (showAuthModal = true)}
			class="nav-desktop-link"
			title="Sign In"
		>
			Sign In
		</button>
	{/if}
	<a
		href="/"
		class="nav-desktop-link"
	>
		Harada
	</a>
	<a
		href="/todo"
		class="nav-desktop-link"
	>
		Todo
	</a>
	<button
		type="button"
		onclick={() => (showHowItWorksModal = true)}
		class="nav-desktop-link"
	>
		How it works
	</button>
  <!--
  <button onclick={clearAll}>Clear</button>
  -->
</nav>

{#if showComposer}
	<div
		class="composer-backdrop"
		onclick={(e) => e.target === e.currentTarget && closeComposer()}
		onkeydown={(e) => e.key === 'Escape' && closeComposer()}
		role="button"
		tabindex="-1"
		aria-label="Close add todo panel"
	>
		<div
			transition:sheet3d
			class="composer-panel"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="composer-title">New task</h3>
				<button
					type="button"
					onclick={closeComposer}
					class="composer-close-button"
					aria-label="Close panel"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

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
				<textarea
					bind:value={composerMarkdown}
					placeholder="Add notes, checklists, etc..."
					class="composer-textarea"
				></textarea>
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
		</div>
	</div>
{/if}

{#if authStore.user}
	<UserSettingsModal bind:isOpen={showSettingsModal} />
{:else}
	<AuthModal bind:isOpen={showAuthModal} />
{/if}

<HowItWorksModal bind:isOpen={showHowItWorksModal} />
