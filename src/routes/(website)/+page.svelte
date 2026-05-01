<script>
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { Capacitor } from '@capacitor/core';
	import AppleStoreBtn from '$components/AppleStoreBtn.svelte';

	$effect(() => {
		if (!browser) return;
		if (Capacitor.isNativePlatform()) {
			goto('/home', { replaceState: true });
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
	<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
		<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
			Your free, all-in-one AI-accessible brain extension
		</h1>
		<div class="mt-4 grid gap-4 text-base text-slate-600 dark:text-slate-300 md:grid-cols-[1fr_16rem]">
			<div>
				<p>Plan your life with:</p>
				<ul class="mt-2 space-y-1">
					<li>High-level goals using a <a href="/harada-chart" class="text-emerald-600 hover:underline dark:text-emerald-400">Harada chart</a> structure</li>
					<li>Multiple <a href="/todo" class="text-emerald-600 hover:underline dark:text-emerald-400">free to-do lists</a> linked to goals</li>
					<li>Markdown notes for personal and AI-assisted thinking</li>
					<li>One workspace for strategy and execution</li>
				</ul>
        <div class="mt-3">
        <a href="/home" class="mt-3 salesBtn">Get started on the web</a>
        <span class="ml-2">it's free, no sign up required.</span>
        </div>
			</div>

			<img src="/img/screenshot.webp" alt="Haradato screenshot" class="h-auto w-full rounded-lg" />
		</div>
	</div>

	<div class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
		<h2 class="text-xl font-semibold">Download apps</h2>
    <p>Use on the web, iOS or OSX (Android and Windows coming soon)</p>
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<AppleStoreBtn />
		</div>
	</div>

	<div id="features" class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
		<h2 class="text-2xl font-semibold">Everything in one system</h2>
		<ul class="mt-3 space-y-2 text-slate-700 dark:text-slate-300">
			<li>To-do lists tied directly to long-term goals</li>
			<li>Markdown notes for planning, prompts, and journaling</li>
			<li>Life-goal mapping you can revisit daily</li>
		</ul>
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
