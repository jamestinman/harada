<script>
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { NEW_LIST_OPTION_VALUE, parseListSelection } from '$lib/todoUtils.js';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import GoalSelect from './GoalSelect.svelte';
	import SquareMap from './SquareMap.svelte';
	import UserSettingsModal from './UserSettingsModal.svelte';
	import AuthModal from './AuthModal.svelte';
	
	// Get save status for visual indicator
	const saveStatus = $derived(store.saveStatus);
	const borderColorClass = $derived.by(() => {
		if (saveStatus === 'queued') return 'border-amber-500';
		if (saveStatus === 'saving') return 'border-red-500';
		return 'border-slate-700';
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

	async function openComposer() {
		composerTitle = '';
		composerMarkdown = '';
		composerGoalValue =
			typeof defaultGoalIndex === 'number' ? String(defaultGoalIndex) : '';
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

<!-- Mobile top-right hamburger menu -->
<div class="fixed right-4 top-4 z-40 lg:hidden">
	<button
		type="button"
		onclick={() => (showMobileMenu = !showMobileMenu)}
		class="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 bg-slate-900/95 backdrop-blur text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
		aria-label="Open menu"
	>
		<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
		</svg>
	</button>

	{#if showMobileMenu}
		<div class="absolute right-0 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-xl z-50">
			<div class="py-2">
				{#if authStore.user}
					<div class="px-4 py-2 border-b border-slate-700">
						<div class="text-sm font-semibold text-slate-100">{userName}</div>
						{#if authStore.user?.email}
							<div class="text-xs text-slate-400">{authStore.user.email}</div>
						{/if}
					</div>
					<button
						type="button"
						onclick={openSettings}
						class="w-full text-left px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
					>
						Settings
					</button>
				{:else}
					<button
						type="button"
						onclick={() => { showMobileMenu = false; showAuthModal = true; }}
						class="w-full text-left px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
					>
						Sign In
					</button>
				{/if}
				<a
					href="/about"
					onclick={() => (showMobileMenu = false)}
					class="block w-full text-left px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
				>
					About
				</a>
				{#if authStore.user}
					<div class="border-t border-slate-700 my-1"></div>
					<button
						type="button"
						onclick={handleLogout}
						class="w-full text-left px-4 py-2 text-sm text-red-400 transition hover:bg-slate-800"
					>
						Logout
					</button>
				{/if}
				<div class="border-t border-slate-700 mt-1 pt-2 px-4 pb-2">
					<div class="text-xs text-slate-500 text-center">Version {store.version}</div>
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

<!-- Mobile bottom nav -->
<div class="fixed inset-x-0 bottom-0 z-40 lg:hidden">
	<div class="relative border-t {borderColorClass} bg-slate-900/95 backdrop-blur transition-colors">
		<div class="grid grid-cols-2 py-3 text-center text-sm font-semibold text-slate-300">
			<a href="/" class="transition hover:text-slate-100">Harada</a>
			<a href="/todo" class="transition hover:text-slate-100">Todo</a>
		</div>
		<button
			type="button"
			onclick={openComposer}
			class="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-violet-300 bg-violet-600 p-0 text-3xl font-bold text-slate-950 shadow-lg transition hover:bg-violet-500"
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
			class="rounded px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
			title="Settings"
		>
			{userName}
		</button>
	{:else}
		<button
			type="button"
			onclick={() => (showAuthModal = true)}
			class="rounded px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
			title="Sign In"
		>
			Sign In
		</button>
	{/if}
	<a
		href="/"
		class="rounded px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
	>
		Harada
	</a>
	<a
		href="/todo"
		class="rounded px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
	>
		Todo
	</a>
</nav>

{#if showComposer}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0"
		onclick={(e) => e.target === e.currentTarget && closeComposer()}
		onkeydown={(e) => e.key === 'Escape' && closeComposer()}
		role="button"
		tabindex="-1"
		aria-label="Close add todo panel"
	>
		<div
			transition:sheet3d
			class="w-full max-w-3xl mx-auto max-h-[85vh] overflow-y-auto rounded-t-2xl bg-slate-900 p-4 shadow-2xl will-change-transform"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-slate-100">New task</h3>
				<button
					type="button"
					onclick={closeComposer}
					class="text-slate-400 hover:text-slate-200"
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
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
				/>
			</div>

			<div class="mb-4">
				<textarea
					bind:value={composerMarkdown}
					placeholder="Add notes, checklists, etc..."
					class="min-h-[140px] w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
				></textarea>
			</div>

			<div class="mb-4 flex items-center gap-2">
				<span class="text-sm text-slate-400">Part of:</span>
				<GoalSelect
					allGoals={allGoals}
					bind:value={composerGoalValue}
					includeUnassigned={true}
					includeNewList={true}
					stringValues={true}
				/>
			</div>

			{#if composerGoalValue === NEW_LIST_OPTION_VALUE}
				<div class="mb-4">
					<input
						type="text"
						bind:value={composerNewListName}
						placeholder="List name"
						class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
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
					Save Changes
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
