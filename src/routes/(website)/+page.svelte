<script>
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { Capacitor } from '@capacitor/core';
	import AppleStoreBtn from '$components/AppleStoreBtn.svelte';

	const haradaAgentPrompt = `Read https://haradato.com/skill.md and follow it to work with my Harada workspace to create and manage my to-dos and notes.`;

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
	<div class="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
		<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
			Your free, all-in-one AI-accessible brain extension
		</h1>
		<div class="mt-4 grid gap-6 text-base text-slate-600 dark:text-slate-300 md:grid-cols-[1fr_16rem] md:items-start md:justify-items-center">
			<div class="flex w-full max-w-xl flex-col items-center">
				<div class="w-full text-left">
					<p>Plan your life with:</p>
					<ul class="mt-2 list-disc space-y-1 pl-5">
						<li>High-level goals using a <a href="/harada-chart" class="text-emerald-600 hover:underline dark:text-emerald-400">Harada chart</a> structure</li>
						<li>Multiple <a href="/to-do-lists" class="text-emerald-600 hover:underline dark:text-emerald-400">free to-do lists</a> linked to goals</li>
						<li>Markdown notes for personal and AI-assisted thinking</li>
						<li>One workspace for strategy and execution</li>
					</ul>
				</div>
				<div class="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
					<a href="/harada" class="salesBtn">Get started on the web</a>
					<span class="text-sm sm:text-base">it's free, no sign up required.</span>
				</div>
			</div>

			<img src="/img/screenshot.webp" alt="Haradato screenshot" class="h-auto w-full max-w-xs rounded-lg md:max-w-none" />
		</div>
	</div>

	<div class="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
		<h2 class="text-xl font-semibold">Download apps</h2>
		<p class="text-slate-600 dark:text-slate-300">Use on the web, iOS or OSX (Android and Windows coming soon)</p>
		<div class="mt-4 flex flex-wrap items-center justify-center gap-3">
			<AppleStoreBtn />
		</div>
	</div>

	<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900 sm:p-10">
		<h2 class="mx-auto max-w-2xl text-balance text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl md:text-4xl">
			Use Claude, OpenClaw or any local AI agent to manage your to-do list
		</h2>
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
		<div class="mt-3 flex justify-center">
			<ul class="w-fit space-y-2 text-left text-slate-700 dark:text-slate-300">
				<li>To-do lists tied directly to long-term goals</li>
				<li>Markdown notes for planning, prompts, and journaling</li>
				<li>Life-goal mapping you can revisit daily</li>
			</ul>
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
