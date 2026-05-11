<script>
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { Capacitor } from '@capacitor/core';
	import AppleStoreBtn from '$components/AppleStoreBtn.svelte';
	import GooglePlayBtn from '$components/GooglePlayBtn.svelte';

	const haradaAgentPrompt = `Read https://haradato.com/skill.md and follow it to work with my Harada workspace to create and manage my to-do list.`;

	let copiedPrompt = $state(false);

	async function copyHaradaPrompt() {
		if (!browser) return;
		await navigator.clipboard.writeText(haradaAgentPrompt);
		copiedPrompt = true;
		setTimeout(() => {
			copiedPrompt = false;
		}, 2000);
	}

	$effect(() => {
		if (!browser) return;
		if (Capacitor.isNativePlatform()) {
			goto('/harada', { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>Haradato - AI Todo, Notes and Life Goals</title>
	<meta
		name="description"
		content="Your free, all-in-one AI-accessible brain extension: to-do lists, markdown notes and life goals."
	/>
</svelte:head>

<section class="content-page space-y-10">
	<!-- Hero -->
	<div class="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/60 p-6 text-center shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30">
		<div class="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(16,185,129,0.08),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(16,185,129,0.12),transparent)]"></div>
		<h1 class="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
			To-do lists and markdown notes for life goals
		</h1>
		<p class="mx-auto mt-2 max-w-lg text-base text-slate-500 dark:text-slate-400">A simple, focused brain-extension that keeps your daily tasks connected to what actually matters.</p>
		<div class="mt-6 grid gap-6 text-base text-slate-600 dark:text-slate-300 md:grid-cols-[1fr_16rem] md:items-start md:justify-items-center">
			<div class="flex w-full max-w-xl flex-col items-center">
				<div class="w-full text-left">
					<p class="font-medium text-slate-700 dark:text-slate-200">Plan your life with:</p>
					<ul class="mt-2 space-y-1.5 pl-1">
						<li class="flex items-center gap-2">
							<span class="text-emerald-500">✦</span>
							<a href="/harada-chart" class="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Harada chart</a>
							<span class="text-slate-500 dark:text-slate-400">for life goals</span>
						</li>
						<li class="flex items-center gap-2">
							<span class="text-emerald-500">✦</span>
							<a href="/to-do-lists" class="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">To-do lists</a>
							<span class="text-slate-500 dark:text-slate-400">linked to goals</span>
						</li>
						<li class="flex items-center gap-2">
							<span class="text-emerald-500">✦</span>
							<a href="/notes" class="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Markdown notes</a>
							<span class="text-slate-500 dark:text-slate-400">for personal thoughts</span>
						</li>
					</ul>
				</div>
				<div class="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
					<a href="/harada" class="salesBtn">Get started on the web</a>
				</div>
			</div>

			<img src="/img/screenshot.webp" alt="Haradato screenshot" class="h-auto w-full max-w-xs rounded-xl shadow-md md:max-w-none" />
		</div>
	</div>

	<!-- Feature boxes -->
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
			<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/50">
				<svg class="h-5 w-5 text-violet-600 dark:text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
					<polyline points="14 2 14 8 20 8"/>
					<line x1="8" y1="13" x2="16" y2="13"/>
					<line x1="8" y1="17" x2="13" y2="17"/>
					<line x1="8" y1="9" x2="10" y2="9"/>
				</svg>
			</div>
			<h3 class="font-semibold text-slate-900 dark:text-white">Obsidian-style notes</h3>
			<p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Write in plain Markdown with full formatting support. Your notes stay portable and human-readable, always.</p>
		</div>

		<div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
			<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/50">
				<svg class="h-5 w-5 text-sky-600 dark:text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 22V12"/>
					<path d="m17 17-5 5-5-5"/>
					<path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
				</svg>
			</div>
			<h3 class="font-semibold text-slate-900 dark:text-white">Cross-device sync</h3>
			<p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Pick up exactly where you left off on any device. Your goals, tasks, and notes stay in sync automatically.</p>
		</div>

		<div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
			<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/50">
				<svg class="h-5 w-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M1 6l5 5"/>
					<path d="M1 1l22 22"/>
					<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
					<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
					<path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
					<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
					<path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
					<circle cx="12" cy="20" r="1"/>
				</svg>
			</div>
			<h3 class="font-semibold text-slate-900 dark:text-white">Offline support</h3>
			<p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">No connection? No problem. Everything works offline and syncs back up the moment you're online again.</p>
		</div>
	</div>

	<!-- Download -->
	<div class="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
		<h2 class="text-xl font-semibold">Download apps</h2>
		<p class="text-slate-600 dark:text-slate-300">Use on the web, iOS, OSX, and Android (Windows coming soon)</p>
		<div class="mt-4 flex flex-wrap items-center justify-center gap-3">
			<AppleStoreBtn />
			<GooglePlayBtn />
		</div>
	</div>

	<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900 sm:p-10">
		<h2 class="mx-auto max-w-2xl text-balance text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl md:text-4xl">
			Use an AI agent to manage your to-do list
		</h2>
    <p class="text-sm">(works with Claude, OpenClaw, Hermes, and most AI agents)</p>
		<div class="mx-auto mt-8 flex max-w-3xl items-stretch gap-0 overflow-hidden rounded-2xl bg-slate-100 text-left dark:bg-slate-800/80">
			<p class="min-w-0 flex-1 break-words px-4 py-3 font-mono text-sm leading-relaxed text-slate-800 dark:text-slate-100 sm:px-5 sm:text-[0.8125rem]">
				{haradaAgentPrompt}
			</p>
			<button
				type="button"
				class="flex shrink-0 items-center justify-center border-l border-slate-200/80 bg-slate-100 px-4 transition hover:bg-slate-200/80 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
				onclick={copyHaradaPrompt}
				aria-label={copiedPrompt ? 'Copied' : 'Copy prompt'}
			>
				{#if copiedPrompt}
					<span class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Copied</span>
				{:else}
					<svg class="h-5 w-5 text-slate-600 dark:text-slate-300" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							stroke="currentColor"
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
				{/if}
			</button>
		</div>
		<p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
			Paste this into your AI agent chat, or
			<a href="https://haradato.com/skill.md" class="font-medium text-slate-700 underline decoration-slate-400 underline-offset-2 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400">
				read the Harada skill
			</a>
		</p>
	</div>

	<div id="features" class="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
		<h2 class="text-2xl font-semibold">Everything in one system</h2>
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">No scattered apps. One place for your goals, tasks, and notes.</p>
		<div class="mt-5 grid gap-3 sm:grid-cols-3 text-left">
			<div class="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
				<p class="font-medium text-slate-800 dark:text-slate-100">Goals → Tasks</p>
				<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">To-do lists tied directly to long-term goals so nothing drifts.</p>
			</div>
			<div class="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
				<p class="font-medium text-slate-800 dark:text-slate-100">Rich notes</p>
				<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Markdown for planning, journaling, AI prompts — whatever you need.</p>
			</div>
			<div class="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
				<p class="font-medium text-slate-800 dark:text-slate-100">Daily review</p>
				<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Life-goal mapping you can return to every morning to stay on track.</p>
			</div>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
			<h2 class="mb-3 text-xl font-semibold">Harada Charts</h2>
			<p class="text-slate-700 dark:text-slate-300">
				The Harada chart turns one long-term direction into 64 concrete steps so your daily work stays connected to your bigger plan.
			</p>
			<a href="/harada-chart" class="mt-4 inline-block text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
				Read the deep-dive
			</a>
		</div>

		<div class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
			<h2 class="mb-3 text-xl font-semibold">For Agents</h2>
			<p class="text-slate-700 dark:text-slate-300">
				Agents can use MLAuth to create accounts, request human access, or join existing workspaces while keeping humans in approval control.
			</p>
			<a href="/for-agents" class="mt-4 inline-block text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
				View MLAuth details
			</a>
		</div>
	</div>
</section>
