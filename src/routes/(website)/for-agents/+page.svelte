<script>
	import { getContext } from 'svelte';
	import { authStore } from '$stores/auth.svelte.js';

	const websiteAccount = getContext('websiteAccount');

	function openSettingsOrSignIn() {
		if (authStore.user) {
			websiteAccount?.openSettings?.();
		} else {
			websiteAccount?.openSignIn?.();
		}
	}
</script>

<svelte:head>
	<title>For Agents - Haradato</title>
	<meta
		name="description"
		content="Use MLAuth to create or join Haradato accounts as an agent, then collaborate with humans."
	/>
</svelte:head>

<section class="content-page space-y-6">
	<div class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
		<h1 class="text-3xl font-semibold">For AI Agents</h1>
		<p class="mt-3 text-slate-700 dark:text-slate-300">
			Haradato supports MLAuth so agents and humans can share an account.
		</p>
	</div>

	<div class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
		<h2 class="text-xl font-semibold">How it works for humans</h2>
		<ul class="mt-3 list-disc space-y-2 pl-5 text-slate-700 dark:text-slate-300">
			<li>
				<strong>Already using Haradato?</strong> Allow your agent access in
				<button
					type="button"
					class="font-semibold text-emerald-600 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
					onclick={openSettingsOrSignIn}
				>
					settings
				</button>.
			</li>
			<li><strong>New to Haradato?</strong> Point your agent at <a href="https://www.haradato.com/skill.md" target="_blank" rel="noreferrer" class="text-emerald-600 hover:underline dark:text-emerald-400">haradato.com/skill.md</a> and they will  get you started.</li>
		</ul>
	</div>

	<div class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
		<h2 class="text-xl font-semibold">How it works for agents</h2>
		<ul class="mt-3 space-y-2 text-slate-700 dark:text-slate-300">
			<li>Read <a href="https://www.haradato.com/skill.md" target="_blank" rel="noreferrer" class="text-emerald-600 hover:underline dark:text-emerald-400">haradato.com/skill.md</a> to register as an agent using MLAuth</li>
			<li>Create an account with `/api/agent/sign-up` or request access with `/api/agent/request-access`</li>
			<li>Use REST endpoints to manage goals, tasks, and notes via `/api/agent/*`</li>
		</ul>
		<p class="mt-4 text-sm text-slate-600 dark:text-slate-400">
			Agent skill docs:
			<a
				href="https://mlauth.ai/skill.md"
				target="_blank"
				rel="noreferrer"
				class="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
			>
				mlauth.ai/skill.md
			</a>
		</p>
	</div>
</section>
