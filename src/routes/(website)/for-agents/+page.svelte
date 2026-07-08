<script>
	import { browser } from '$app/environment';
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

	const agentPrompt = `Read https://www.haradato.com/skill.md and follow it to set up and manage my Haradato workspace - my Harada chart goals, tasks, and notes.`;

	let copied = $state(false);
	async function copyPrompt() {
		if (!browser) return;
		await navigator.clipboard.writeText(agentPrompt);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head>
	<title>Get your AI agent involved - Haradato</title>
	<meta
		name="description"
		content="Let an AI agent manage your Haradato workspace - goals, tasks and notes - in plain language. Add an agent to your existing chart, or have an agent build a brand-new Harada chart for you. You stay in approval control."
	/>
</svelte:head>

<section class="content-page space-y-24 pb-12">
	<!-- ───────────────────────── HERO ───────────────────────── -->
	<div class="relative -mt-4">
		<div class="dot-grid pointer-events-none absolute inset-x-0 -top-12 -z-10 h-[380px]"></div>

		<div class="mx-auto max-w-3xl text-center">
			<p class="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
				<span class="inline-block h-px w-8 bg-emerald-500/60"></span>
				For humans &amp; their agents
				<span class="inline-block h-px w-8 bg-emerald-500/60"></span>
			</p>
			<h1 class="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
				Get your AI agent involved
			</h1>
			<p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
				Haradato is the world's first agent-native goals workspace. Hand your chart, tasks and notes to an AI agent and manage your whole life in plain language - or let one build your first Harada chart from scratch, on your behalf.
			</p>
		</div>

		<!-- copy prompt -->
		<div class="mx-auto mt-9 max-w-2xl">
			<div class="flex items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/5">
				<p class="min-w-0 flex-1 break-words px-4 py-3.5 font-mono text-sm leading-relaxed text-slate-700 dark:text-slate-200 sm:px-5 sm:text-[0.8125rem]">
					{agentPrompt}
				</p>
				<button
					type="button"
					class="flex shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50 px-4 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
					onclick={copyPrompt}
					aria-label={copied ? 'Copied' : 'Copy prompt'}
				>
					{#if copied}
						<span class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Copied</span>
					{:else}
						<svg class="h-5 w-5 text-slate-500 dark:text-slate-300" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
					{/if}
				</button>
			</div>
			<p class="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
				Paste this into Claude, OpenClaw, Hermes or most AI agents - or
				<a href="https://www.haradato.com/skill.md" target="_blank" rel="noreferrer" class="font-medium text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400">read the skill yourself</a>.
			</p>
		</div>
	</div>

	<!-- ───────────────────── WHY IT'S USEFUL ───────────────────── -->
	<div>
		<div class="text-center">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Why bother</p>
			<h2 class="mx-auto mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
				A second pair of hands for your whole life
			</h2>
		</div>
		<div class="mt-10 grid gap-5 sm:grid-cols-3">
			{#each [
				{ title: 'Talk, don\'t type', body: 'Ask "what\'s next on my health goal?" or "add three tasks to my house move" and your agent updates the right cell for you.' },
				{ title: 'Stays organised for you', body: 'Agents file every task and note under the goal or category it belongs to - so your chart stays tidy without the busywork.' },
				{ title: 'Start from zero', body: 'No chart yet? An agent can interview you about your life and build your first 64-cell Harada chart from the conversation.' }
			] as card}
				<div class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
					<h3 class="font-semibold text-slate-900 dark:text-white">{card.title}</h3>
					<p class="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{card.body}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- ───────────────────── TWO PATHS ───────────────────── -->
	<div>
		<div class="text-center">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Two ways in</p>
			<h2 class="mx-auto mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
				Add an agent to your chart - or have one build it
			</h2>
		</div>

		<div class="mt-10 grid gap-6 lg:grid-cols-2">
			<!-- Path A -->
			<div class="flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
				<span class="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
					Already use Haradato
				</span>
				<h3 class="mt-4 text-xl font-bold tracking-tight">Add an agent to your existing chart</h3>
				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Give an agent permission to read and update the goals, tasks and notes you already have.</p>

				<ol class="mt-6 space-y-4">
					{#each [
						{ h: 'Point your agent at the skill', b: 'Paste the prompt above, or send it to https://www.haradato.com/skill.md.' },
						{ h: 'Your agent requests access', b: 'It registers its MLAuth identity and asks to connect to your account by email.' },
						{ h: 'You approve it', b: 'Open Settings → AI agent access and approve the agent\'s name. Nothing happens until you do.' },
						{ h: 'It gets to work', b: 'Your agent can now read and update your chart, tasks and notes - in plain language.' }
					] as step, i}
						<li class="flex gap-3">
							<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{i + 1}</span>
							<div>
								<p class="font-medium text-slate-900 dark:text-white">{step.h}</p>
								<p class="mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{step.b}</p>
							</div>
						</li>
					{/each}
				</ol>

				<div class="mt-7">
					<button type="button" class="cta-primary w-full text-center" onclick={openSettingsOrSignIn}>
						{authStore.user ? 'Open agent-access settings' : 'Sign in to manage access'}
					</button>
				</div>
			</div>

			<!-- Path B -->
			<div class="flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
				<span class="inline-flex w-fit items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
					For agents
				</span>
				<h3 class="mt-4 text-xl font-bold tracking-tight">Start a new chart on your human's behalf</h3>
				<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">No account yet? An agent can create one and build the first chart from scratch.</p>

				<ol class="mt-6 space-y-4">
					{#each [
						{ h: 'Get an MLAuth identity', b: 'Register at mlauth.ai first - Haradato verifies agents against MLAuth public keys.' },
						{ h: 'Create the account', b: 'Call POST /api/agent/sign-up with the human\'s email and a signed message.' },
						{ h: 'Human confirms', b: 'They open Haradato with that email and approve you in Settings → AI agent access.' },
						{ h: 'Build the chart', b: 'Talk through their life, then create goals, tasks and notes via /api/agent/*.' }
					] as step, i}
						<li class="flex gap-3">
							<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">{i + 1}</span>
							<div>
								<p class="font-medium text-slate-900 dark:text-white">{step.h}</p>
								<p class="mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{step.b}</p>
							</div>
						</li>
					{/each}
				</ol>

				<div class="mt-7">
					<a href="https://www.haradato.com/skill.md" target="_blank" rel="noreferrer" class="cta-ghost block w-full text-center">Read the agent skill</a>
				</div>
			</div>
		</div>
	</div>

	<!-- ───────────────── HUMANS STAY IN CONTROL ───────────────── -->
	<div class="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
		<div>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">You're in charge</p>
			<h2 class="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Humans stay in approval control</h2>
			<ul class="mt-6 space-y-3">
				{#each [
					'No agent can touch your data until you explicitly approve it.',
					'Approve agents one at a time, by name, in your settings.',
					'Revoke access whenever you like - the agent is locked out instantly.',
					'Built on MLAuth: agents sign every request, and private keys never leave them.'
				] as point}
					<li class="flex items-start gap-3 text-slate-700 dark:text-slate-300">
						<svg class="mt-1 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.29a1 1 0 011.408 0z" clip-rule="evenodd"/></svg>
						{point}
					</li>
				{/each}
			</ul>
		</div>

		<div class="rounded-3xl border border-slate-200 bg-slate-50 p-7 dark:border-slate-800 dark:bg-slate-900/60">
			<h3 class="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">For developers</h3>
			<dl class="mt-4 space-y-3 text-sm">
				<div class="flex justify-between gap-4 border-b border-slate-200 pb-2 dark:border-slate-800">
					<dt class="text-slate-500 dark:text-slate-400">Agent skill</dt>
					<dd><a href="https://www.haradato.com/skill.md" target="_blank" rel="noreferrer" class="font-mono text-emerald-600 hover:underline dark:text-emerald-400">haradato.com/skill.md</a></dd>
				</div>
				<div class="flex justify-between gap-4 border-b border-slate-200 pb-2 dark:border-slate-800">
					<dt class="text-slate-500 dark:text-slate-400">Identity</dt>
					<dd><a href="https://mlauth.ai/skill.md" target="_blank" rel="noreferrer" class="font-mono text-emerald-600 hover:underline dark:text-emerald-400">mlauth.ai/skill.md</a></dd>
				</div>
				<div class="flex justify-between gap-4 border-b border-slate-200 pb-2 dark:border-slate-800">
					<dt class="text-slate-500 dark:text-slate-400">API base</dt>
					<dd class="font-mono text-slate-700 dark:text-slate-300">/api/agent/*</dd>
				</div>
				<div class="flex justify-between gap-4">
					<dt class="text-slate-500 dark:text-slate-400">Surfaces</dt>
					<dd class="font-mono text-slate-700 dark:text-slate-300">goals · tasks · notes</dd>
				</div>
			</dl>
		</div>
	</div>

	<!-- ───────────────────── CTA ───────────────────── -->
	<div class="relative overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm sm:p-12 dark:border-emerald-900/50 dark:bg-emerald-950/40">
		<h2 class="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Ready to delegate?</h2>
		<p class="mx-auto mt-3 max-w-md text-slate-600 dark:text-slate-300">
			Create your free workspace, then hand the keys to your agent whenever you're ready.
		</p>
		<div class="mt-7 flex flex-wrap items-center justify-center gap-3">
			<a href="/harada" class="cta-primary">Get started - free</a>
			<a href="https://www.haradato.com/skill.md" target="_blank" rel="noreferrer" class="cta-ghost">Read the skill</a>
		</div>
	</div>
</section>

<style>
	.dot-grid {
		background-image: radial-gradient(circle, rgba(16, 185, 129, 0.28) 1px, transparent 1.4px);
		background-size: 24px 24px;
		-webkit-mask-image: radial-gradient(ellipse 70% 80% at 50% 0%, #000 10%, transparent 70%);
		mask-image: radial-gradient(ellipse 70% 80% at 50% 0%, #000 10%, transparent 70%);
	}

	.cta-primary {
		display: inline-block;
		border-radius: 0.75rem;
		background: rgb(5 150 105);
		padding: 0.7rem 1.4rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: white;
		box-shadow: 0 8px 20px -8px rgba(5, 150, 105, 0.6);
		transition: transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
	}
	.cta-primary:hover {
		background: rgb(16 185 129);
		transform: translateY(-1px);
		box-shadow: 0 12px 24px -8px rgba(5, 150, 105, 0.7);
	}

	.cta-ghost {
		display: inline-block;
		border-radius: 0.75rem;
		border: 1px solid rgb(203 213 225);
		padding: 0.7rem 1.4rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: inherit;
		transition: background-color 0.15s ease, border-color 0.15s ease;
	}
	.cta-ghost:hover {
		background: rgb(241 245 249);
	}
	:global(.dark) .cta-ghost {
		border-color: rgb(71 85 105);
	}
	:global(.dark) .cta-ghost:hover {
		background: rgb(30 41 59);
	}

	@media (prefers-reduced-motion: reduce) {
		.cta-primary,
		.cta-ghost {
			transition: none;
		}
	}
</style>
