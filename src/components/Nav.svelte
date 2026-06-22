<script>
  import { onMount } from 'svelte';
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
	import { cubicOut } from 'svelte/easing';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { NEW_LIST_OPTION_VALUE, parseListSelection } from '$lib/todoUtils.js';
	import { resumePathTodo, workspaceNavActiveSection } from '$lib/workspaceNavResume.js';
	import { store } from '$stores/store.svelte.js';
	import { navComposerHandlers } from '$stores/navComposerHandlers.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import { synthStore } from '$stores/synth.svelte.js';
	import { localGet, localSet } from '$lib/PersistentStorage.mjs';
	import GoalSelect from './GoalSelect.svelte';
	import DesktopTopNav from './DesktopTopNav.svelte';
	import UserSettingsModal from './UserSettingsModal.svelte';
	import AuthModal from './AuthModal.svelte';
	import HowItWorksModal from './HowItWorksModal.svelte';
	import OnboardingWizard from './OnboardingWizard.svelte';
	import NoteHybridMarkdownEditor from './NoteHybridMarkdownEditor.svelte';

	const showFixedMobileNavButton = $derived.by(() => {
		const path = page?.url?.pathname ?? '/';
		const normalized = path.replace(/\/+$/, '') || '/';
		return normalized === '/harada';
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
	let composerNoteContent = $state('');
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
		composerNoteContent = '';
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
		effectiveCreateNote(composerNoteContent.trim());
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
			// Wipe local data so the next user starts fresh (and the setup wizard
			// runs again when they open the chart with empty goals).
			// empty chart is only persisted locally, never synced to the cloud.
			store.clearAll();
		}
	}

	function openSettings() {
		store.mobileNavMenuOpen = false;
		showSettingsModal = true;
	}

	onMount(() => {
		if (!browser) return;

		authStore.openSignInModal = () => {
			showAuthModal = true;
		};

		// First-run onboarding is handled by the Harada chart page (the guided
		// setup wizard), so nothing auto-opens here.

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
			authStore.openSignInModal = () => {};
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
	const needsSignIn = $derived(
		isOnline && !authStore.loading && !authStore.user && !!authStore.lastKnownUser
	);

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

	const activeWorkspace = $derived(workspaceNavActiveSection(page.url.pathname));

	const mobileNavLinkClass = (section) => {
		const active = activeWorkspace === section;
		return active
			? 'mobile-bottom-nav-link font-semibold text-orange-500 dark:text-orange-400'
			: 'mobile-bottom-nav-link';
	};

	const mobileMenuItemClass = (section) => {
		const active = activeWorkspace === section;
		return active
			? 'mobile-menu-item font-semibold text-orange-600 dark:text-orange-400'
			: 'mobile-menu-item';
	};


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

</script>

<!-- Mobile top-right hamburger (Harada home only; todo/notes use workspace chrome) -->
{#if showFixedMobileNavButton}
	<div
		class="fixed z-40 lg:hidden"
		style="
			top: calc(env(safe-area-inset-top, 0px) + {needsSignIn ? '2.75rem' : '1rem'});
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
			{:else if !isOnline || needsSignIn}
				<div class="mobile-menu-header">
					{#if needsSignIn}
						<div class="mobile-menu-header-name text-red-500 dark:text-red-400">NOT SIGNED IN</div>
					{:else}
						<div class="mobile-menu-header-name text-amber-500 dark:text-amber-400">OFFLINE</div>
					{/if}
					{#if userName}
						<div class="mobile-menu-header-email">{userName}</div>
					{/if}
				</div>
				{#if needsSignIn}
					<button
						type="button"
						onclick={() => {
							store.mobileNavMenuOpen = false;
							showAuthModal = true;
						}}
						class="mobile-menu-item !font-bold !text-red-600 dark:!text-red-400"
					>
						Sign In
					</button>
				{/if}
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
					store.showOnboardingWizard = true;
				}}
				class="mobile-menu-item"
			>
				Set up my chart
			</button>
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

			<button
				onclick={() => {
					goto('/harada');
					store.mobileNavMenuOpen = false;
				}}
				class={mobileMenuItemClass('goals')}
			>
				Harada
			</button>
			<button
				onclick={() => {
					goto(resumePathTodo());
					store.mobileNavMenuOpen = false;
				}}
				class={mobileMenuItemClass('tasks')}
			>
				To-do
			</button>
			<button
				onclick={() => {
					goto('/notes');
					store.mobileNavMenuOpen = false;
				}}
				class={mobileMenuItemClass('notes')}
			>
				Notes
			</button>

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
		<div class="mobile-bottom-nav-actions">
			<button
				type="button"
				onclick={() => store.openComposerPanel('task')}
				class="mobile-bottom-nav-fab mobile-bottom-nav-fab-task"
				aria-label="Quick add task or note"
			>
				<span class="mobile-bottom-nav-fab-plus" aria-hidden="true">+</span>
			</button>
		</div>
		<div class="mobile-bottom-nav-links">
			<a
				href="/harada"
				class={mobileNavLinkClass('goals')}
				aria-current={activeWorkspace === 'goals' ? 'page' : undefined}
			>
				Harada
			</a>
			<a
				href={todoResumeHref}
				class={mobileNavLinkClass('tasks')}
				onclick={handleMobileTodoNav}
				aria-current={activeWorkspace === 'tasks' ? 'page' : undefined}
			>
				To-do
			</a>
			<a
				href="/notes"
				class={mobileNavLinkClass('notes')}
				aria-current={activeWorkspace === 'notes' ? 'page' : undefined}
			>
				Notes
			</a>
		</div>
	</div>
</div>

<DesktopTopNav
	variant="app"
	onSignIn={() => (showAuthModal = true)}
	onOpenSettings={() => (showSettingsModal = true)}
/>

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
			<!-- Tab bar -->
			<div class="mb-4 flex items-center gap-4 border-b border-slate-200 dark:border-slate-700/60">
				<button
					type="button"
					onclick={() => { store.composerPanelTab = 'task'; focusTaskTitleInput(); }}
					class="goal-tab {store.composerPanelTab === 'task' ? 'goal-tab-active' : ''}"
				>
					Task
				</button>
				<button
					type="button"
					onclick={() => (store.composerPanelTab = 'note')}
					class="goal-tab {store.composerPanelTab === 'note' ? 'goal-tab-active' : ''}"
				>
					Note
				</button>
				<button
					type="button"
					onclick={closeComposer}
					class="composer-close-button ml-auto mb-2 shrink-0"
					aria-label="Close panel"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			{#if store.composerPanelTab === 'task'}
				<input
					bind:this={composerTitleInputElement}
					type="text"
					bind:value={composerTitle}
					placeholder="Task title"
					class="composer-title-input"
				/>

				<NoteHybridMarkdownEditor
					bind:value={composerMarkdown}
					placeholder="Add a note…"
					minHeight="8rem"
					class="composer-hybrid-editor"
				/>

				<div class="mb-4 flex items-center gap-2">
					<span class="composer-meta-label shrink-0">Goal:</span>
					<GoalSelect
						allGoals={allGoals}
						bind:value={composerGoalValue}
						includeUnassigned={true}
						includeNewList={false}
						stringValues={true}
					/>
				</div>

				{#if composerGoalValue === NEW_LIST_OPTION_VALUE}
					<input
						type="text"
						bind:value={composerNewListName}
						placeholder="List name"
						class="composer-title-input mb-4"
					/>
				{/if}

				<div class="flex justify-end">
					<button
						type="button"
						onclick={submitComposer}
						disabled={composerGoalValue === NEW_LIST_OPTION_VALUE && !composerNewListName.trim()}
						class="task-edit-save-button disabled:opacity-40"
					>
						Save
					</button>
				</div>
			{:else}
				<NoteHybridMarkdownEditor
					bind:value={composerNoteContent}
					treatFirstLineAsTitle={true}
					placeholder="Write your note…"
					minHeight="12rem"
					class="composer-hybrid-editor"
				/>
				<div class="flex justify-end">
					<button
						type="button"
						onclick={submitNoteTab}
						class="task-edit-save-button"
					>
						Save note
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if authStore.user}
	<UserSettingsModal bind:isOpen={showSettingsModal} />
{:else}
	<AuthModal bind:isOpen={showAuthModal} redirectOnSignIn="/harada" />
{/if}

<HowItWorksModal bind:isOpen={store.showHowItWorksModal} />
<OnboardingWizard bind:isOpen={store.showOnboardingWizard} />
