<script>
	import { page } from '$app/state';
	import {
		resumePathTodo,
		websiteNavActiveSection,
		workspaceNavActiveSection
	} from '$lib/workspaceNavResume.js';
	import { authStore } from '$stores/auth.svelte.js';
	import { store } from '$stores/store.svelte.js';
	import SquareMap from '$components/SquareMap.svelte';

	/** @type { 'website' | 'app' } */
	let { variant = 'website', onSignIn = () => {}, onOpenSettings = () => {} } = $props();

	const isApp = $derived(variant === 'app');
	const isLight = $derived(store.theme === 'light');
	const isOnline = $derived(store.isOnline);

	const todoResumeHref = $derived.by(() => {
		void page.url.pathname;
		return resumePathTodo();
	});

	const activeWorkspace = $derived(workspaceNavActiveSection(page.url.pathname));
	const activeWebsite = $derived(websiteNavActiveSection(page.url.pathname));

	const userName = $derived.by(() => {
		const user = authStore.user ?? authStore.lastKnownUser;
		if (!user) return null;
		return (
			user.user_metadata?.full_name ||
			user.user_metadata?.name ||
			user.email?.split('@')[0] ||
			'User'
		);
	});

	const headerBg = $derived(
		isApp
			? isLight
				? 'bg-white border-slate-200'
				: 'bg-slate-900 border-white/10'
			: 'bg-white border-slate-200 dark:bg-slate-950 dark:border-slate-800'
	);

	const linkBase = $derived(
		isLight
			? 'text-slate-700 hover:text-emerald-600 transition-colors'
			: 'text-slate-300 hover:text-white transition-colors'
	);

	const navLinkBase = $derived(
		isLight
			? 'rounded px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors'
			: 'rounded px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors'
	);

	const brandClass = $derived(
		isLight
			? 'text-slate-900 hover:text-emerald-600 transition-colors'
			: 'text-white hover:text-emerald-400 transition-colors'
	);

	const signInClass = $derived(
		isLight
			? 'border-slate-300 text-slate-700 hover:bg-slate-100'
			: 'border-white/20 text-slate-200 hover:bg-white/10 hover:text-white'
	);

	const appNavActive = $derived(
		isLight
			? 'rounded px-3 py-1.5 text-sm font-semibold text-orange-600 bg-orange-50'
			: 'rounded px-3 py-1.5 text-sm font-semibold text-orange-400 bg-orange-500/15'
	);

	const websiteLinkActive = $derived(
		isLight ? 'text-orange-600 font-semibold' : 'text-orange-400 font-semibold'
	);
</script>

<header
	class="z-40 border-b {headerBg} {isApp ? 'fixed left-0 right-0 top-0 hidden lg:block' : ''}"
>
	<div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">

		<!-- Brand -->
		<div class="flex min-w-0 items-center gap-2">
			<SquareMap href="/harada" interactive={false} className="shrink-0" />
			<a href="/" class="truncate text-lg font-semibold tracking-tight {brandClass}">
				Haradato
			</a>
		</div>

		<!-- Centre nav -->
		{#if isApp}
			<nav class="hidden shrink-0 items-center gap-1 md:flex" aria-label="Workspace">
				<a
					href="/harada"
					class={activeWorkspace === 'goals' ? appNavActive : navLinkBase}
					aria-current={activeWorkspace === 'goals' ? 'page' : undefined}
				>
					Harada
				</a>
				<a
					href={todoResumeHref}
					class={activeWorkspace === 'tasks' ? appNavActive : navLinkBase}
					aria-current={activeWorkspace === 'tasks' ? 'page' : undefined}
				>
					To-do
				</a>
				<a
					href="/notes"
					class={activeWorkspace === 'notes' ? appNavActive : navLinkBase}
					aria-current={activeWorkspace === 'notes' ? 'page' : undefined}
				>
					Notes
				</a>
			</nav>
		{:else}
			<nav class="hidden shrink-0 items-center gap-6 text-sm md:flex" aria-label="Product">
				<a
					href="/harada"
					class={activeWebsite === 'harada' ? websiteLinkActive : linkBase}
					aria-current={activeWebsite === 'harada' ? 'page' : undefined}
				>
					Harada
				</a>
				<a
					href="/todo"
					class={activeWebsite === 'todo' ? websiteLinkActive : linkBase}
					aria-current={activeWebsite === 'todo' ? 'page' : undefined}
				>
					To-do
				</a>
			<a
				href="/notes"
				class={activeWebsite === 'notes' ? websiteLinkActive : linkBase}
				aria-current={activeWebsite === 'notes' ? 'page' : undefined}
			>
				Notes
			</a>
      <span>|</span>
			<a
				href="/pricing"
				class={activeWebsite === 'pricing' ? websiteLinkActive : linkBase}
				aria-current={activeWebsite === 'pricing' ? 'page' : undefined}
			>
				Pricing
			</a>
			<a
				href="/for-agents"
					class={activeWebsite === 'agents' ? websiteLinkActive : linkBase}
					aria-current={activeWebsite === 'agents' ? 'page' : undefined}
				>
					Get your AI Agent involved
				</a>
			</nav>
		{/if}

		<!-- Right side -->
		<div class="flex shrink-0 items-center gap-2">
			{#if authStore.user}
				<button
					type="button"
					onclick={() => onOpenSettings()}
					class="{navLinkBase} max-w-[12rem] truncate"
					title="Settings"
				>
					{userName}
				</button>
			{:else if !isOnline}
				<div
					class="flex flex-col items-end gap-0 text-right"
					title={userName ? `Offline - signed in as ${userName}` : 'Offline'}
				>
					<span class="text-xs font-bold tracking-wide text-amber-500">OFFLINE</span>
					{#if userName}
						<span class="max-w-[8rem] truncate text-xs {isLight ? 'text-slate-500' : 'text-slate-400'}"
							>{userName}</span
						>
					{/if}
				</div>
			{:else}
				<a
					href="/harada"
					class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
				>
					Get Started
				</a>
				<button
					type="button"
					onclick={() => onSignIn()}
					class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {signInClass}"
				>
					Sign In
				</button>
			{/if}
		</div>
	</div>
</header>
