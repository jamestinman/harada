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
	<title>Haradato — The Harada Method as an app for life goals, tasks & notes</title>
	<meta
		name="description"
		content="The Japanese goal-setting method behind Shohei Ohtani, now a free app. One chart, eight pillars, 64 daily habits — linked to your to-do lists and notes."
	/>
</svelte:head>

<section class="content-page space-y-24 pb-12 sm:space-y-32">
	<!-- ───────────────────────── HERO ───────────────────────── -->
	<div class="relative -mt-4">
		<!-- dotted-grid + glow backdrop -->
		<div class="dot-grid pointer-events-none absolute inset-x-0 -top-12 -z-10 h-[420px]"></div>
		<div class="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[420px] bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(16,185,129,0.16),transparent)]"></div>

		<div class="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
			<div>
				<p class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
					<span class="inline-block h-px w-8 bg-emerald-500/60"></span>
					The Harada Method · since 1990s Osaka
				</p>
				<h1 class="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
					The goal system behind a <span class="text-emerald-600 dark:text-emerald-400">baseball legend</span> — now an app for your whole life.
				</h1>
				<p class="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
					Haradato brings the Harada Method — <strong class="font-semibold text-slate-800 dark:text-slate-100">one chart, eight pillars, 64 daily habits</strong> — into a free app that keeps the tasks you do today wired to the life you're trying to build.
				</p>
				<div class="mt-8 flex flex-wrap items-center gap-3">
					<a href="/harada" class="cta-primary">Start your chart — free</a>
					<a href="/harada-chart" class="cta-ghost">See how it works</a>
				</div>
				<p class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
					<span class="inline-flex items-center gap-1.5"><span class="text-emerald-500">✓</span> Free forever</span>
					<span class="inline-flex items-center gap-1.5"><span class="text-emerald-500">✓</span> No sign-up needed</span>
					<span class="inline-flex items-center gap-1.5"><span class="text-emerald-500">✓</span> Works offline</span>
				</p>
			</div>

			<!-- product shot -->
			<div class="relative mx-auto w-full max-w-md">
				<div class="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-400/20 via-violet-400/10 to-transparent blur-2xl"></div>
				<div class="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-2 shadow-2xl shadow-slate-900/10 ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
					<img
						src="/img/screenshot.webp"
						alt="A Haradato life-goal chart — one central goal surrounded by eight colour-coded pillars"
						class="h-auto w-full rounded-2xl"
						width="960"
						height="960"
					/>
				</div>
				<div class="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-slate-200 bg-white/90 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
					Your life, on one page
				</div>
			</div>
		</div>
	</div>

	<!-- ───────────────────── STORY / PROOF ───────────────────── -->
	<div class="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
		<figure class="order-2 lg:order-1">
			<div class="rotate-[-1.5deg] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl transition-transform duration-300 hover:rotate-0 dark:border-slate-700 dark:bg-slate-800">
				<img
					src="/onboarding/ohtani-chart.webp"
					alt="Shohei Ohtani's original 64-square Harada chart, written at age 15"
					class="h-auto w-full rounded-lg"
					loading="lazy"
				/>
			</div>
			<figcaption class="mt-4 text-center text-sm italic text-slate-500 dark:text-slate-400">
				Shohei Ohtani's actual chart, written at 15. Centre goal: drafted #1 by all eight teams.
			</figcaption>
		</figure>

		<div class="order-1 lg:order-2">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">A method with a track record</p>
			<h2 class="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">From the worst school in Osaka to the Hall of Fame</h2>
			<p class="mt-4 leading-relaxed text-slate-600 dark:text-slate-300">
				In the 1990s, coach Takashi Harada took the lowest-ranked school of 380 in Osaka and asked every student to map their life onto a single grid. Within three years they were national champions — and the method has been guiding people to the top ever since.
			</p>
			<dl class="mt-8 grid grid-cols-3 gap-4">
				<div class="rounded-2xl border border-slate-200 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
					<dt class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">13</dt>
					<dd class="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">national gold medals won</dd>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
					<dt class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">90k+</dt>
					<dd class="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">people trained at 280+ firms</dd>
				</div>
				<div class="rounded-2xl border border-slate-200 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
					<dt class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">1</dt>
					<dd class="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">page to see it all</dd>
				</div>
			</dl>
			<p class="mt-6 text-sm text-slate-500 dark:text-slate-400">
				Adopted by Toyota, Panasonic and Suntory.
				<a href="/harada-chart" class="font-semibold text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400">Read the full story →</a>
			</p>
		</div>
	</div>

	<!-- ─────────────────── HOW THE CHART WORKS ─────────────────── -->
	<div class="text-center">
		<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">The Open Window 64</p>
		<h2 class="mx-auto mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
			One big goal, broken into habits you can actually do
		</h2>
		<p class="mx-auto mt-4 max-w-xl text-slate-600 dark:text-slate-300">
			The chart turns a single ambition into 64 concrete daily actions — so nothing important stays vague, and nothing gets lost.
		</p>

		<div class="mt-12 grid gap-6 sm:grid-cols-3">
			{#each [
				{ n: '1', img: '/onboarding/central-goal.png', title: 'Name your goal', body: 'Put one meaningful, measurable goal at the very centre. Your north star.' },
				{ n: '8', img: '/onboarding/sub-goals.png', title: 'Choose 8 pillars', body: 'The areas you must develop to get there — health, craft, mindset, relationships.' },
				{ n: '64', img: '/onboarding/all-goals.png', title: 'Fill in 64 actions', body: 'Eight repeatable daily behaviours per pillar. The habits that compound into results.' }
			] as step, i}
				<div class="group relative flex flex-col items-center rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
					<span class="absolute -top-3 left-6 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow">{step.n}</span>
					<div class="mb-5 mt-2 overflow-hidden rounded-xl">
						<img src={step.img} alt={step.title} class="h-32 w-auto object-contain transition-transform duration-300 group-hover:scale-105" loading="lazy" />
					</div>
					<h3 class="font-semibold text-slate-900 dark:text-white">{step.title}</h3>
					<p class="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{step.body}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- ───────────── THE SYSTEM: chart → tasks → notes ───────────── -->
	<div class="space-y-16">
		<div class="text-center">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">One connected system</p>
			<h2 class="mx-auto mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
				Goals, tasks and notes — finally in the same place
			</h2>
			<p class="mx-auto mt-4 max-w-xl text-slate-600 dark:text-slate-300">
				Every cell on your chart opens into a real to-do list and markdown notes. Planning and doing stop living in separate apps.
			</p>
		</div>

		<!-- row 1: tasks linked to goals -->
		<div class="grid items-center gap-10 lg:grid-cols-2">
			<div>
				<div class="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="m18 9 3 3-3 3"/></svg>
				</div>
				<h3 class="text-2xl font-bold tracking-tight">Tasks that ladder up to a goal</h3>
				<p class="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
					Behind every square is a focused to-do list. Add a task and it's already tied to the goal it serves — so your day always points somewhere that matters. Drag to reorder, nest sub-tasks, mark progress.
				</p>
			</div>
			<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
				<img src="/onboarding/todo.webp" alt="A Haradato to-do list linked to a life goal" class="h-auto w-full" loading="lazy" />
			</div>
		</div>

		<!-- row 2: notes (text feature) -->
		<div class="grid items-center gap-10 lg:grid-cols-2">
			<div class="lg:order-2">
				<div class="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
				</div>
				<h3 class="text-2xl font-bold tracking-tight">Plain-markdown notes, attached to anything</h3>
				<p class="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
					Write specs, journals, prompts or plans in portable Markdown — pinned to the task or goal they belong to. Human-readable, always yours, and synced across every device.
				</p>
			</div>
			<div class="lg:order-1">
				<div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 font-mono text-sm leading-relaxed text-slate-300 shadow-lg">
					<p class="mb-3 flex gap-1.5"><span class="h-3 w-3 rounded-full bg-rose-400/80"></span><span class="h-3 w-3 rounded-full bg-amber-400/80"></span><span class="h-3 w-3 rounded-full bg-emerald-400/80"></span></p>
					<p class="text-emerald-400"># Launch checklist</p>
					<p class="mt-2">- [x] Finalise feature scope</p>
					<p>- [ ] Draft release copy</p>
					<p>- [ ] QA critical flows</p>
					<p class="mt-3 text-violet-300">## Notes</p>
					<p class="text-slate-400">Focus on onboarding & sign-up conversion.</p>
				</div>
			</div>
		</div>
	</div>

	<!-- ───────────────────── AI AGENTS ───────────────────── -->
	<div class="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 p-8 text-center text-white shadow-xl sm:p-12 dark:border-slate-800">
		<div class="dot-grid-dark pointer-events-none absolute inset-0 opacity-50"></div>
		<div class="relative">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">The world's first agent-native to-do list</p>
			<h2 class="mx-auto mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
				Let your AI agent run your list
			</h2>
			<p class="mx-auto mt-4 max-w-lg text-slate-300">
				"What's my next task?" · "Add this to my boat project." Hand your workspace to an agent and talk to your to-do list in plain language.
				<span class="block mt-1 text-sm text-slate-400">Works with Claude, OpenClaw, Hermes and most AI agents.</span>
			</p>

			<div class="mx-auto mt-8 flex max-w-2xl items-stretch overflow-hidden rounded-2xl bg-white/5 text-left ring-1 ring-white/10">
				<p class="min-w-0 flex-1 break-words px-4 py-3.5 font-mono text-sm leading-relaxed text-slate-200 sm:px-5 sm:text-[0.8125rem]">
					{haradaAgentPrompt}
				</p>
				<button
					type="button"
					class="flex shrink-0 items-center justify-center border-l border-white/10 bg-white/5 px-4 transition hover:bg-white/10"
					onclick={copyHaradaPrompt}
					aria-label={copiedPrompt ? 'Copied' : 'Copy prompt'}
				>
					{#if copiedPrompt}
						<span class="text-xs font-medium text-emerald-400">Copied</span>
					{:else}
						<svg class="h-5 w-5 text-slate-300" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
					{/if}
				</button>
			</div>
			<p class="mt-4 text-sm text-slate-400">
				Paste it into your agent, or
				<a href="https://haradato.com/skill.md" class="font-medium text-slate-200 underline decoration-slate-500 underline-offset-2 hover:text-emerald-400">read the Harada skill</a>.
			</p>
		</div>
	</div>

	<!-- ───────────────── FREE + DOWNLOAD CTA ───────────────── -->
	<div class="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-8 text-center shadow-sm sm:p-12 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-slate-900">
		<h2 class="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
			Everything you need, completely free
		</h2>
		<p class="mx-auto mt-3 max-w-md text-slate-600 dark:text-slate-300">
			Unlimited goals, tasks and notes. No limits, no card, no catch. On the web, iOS, macOS and Android.
		</p>
		<div class="mt-7 flex flex-wrap items-center justify-center gap-3">
			<a href="/harada" class="cta-primary">Get started on the web</a>
			<a href="/pricing" class="cta-ghost">See pricing</a>
		</div>
		<div class="mt-6 flex flex-wrap items-center justify-center gap-3">
			<AppleStoreBtn />
			<GooglePlayBtn />
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

	.dot-grid-dark {
		background-image: radial-gradient(circle, rgba(255, 255, 255, 0.12) 1px, transparent 1.4px);
		background-size: 26px 26px;
		-webkit-mask-image: radial-gradient(ellipse 80% 100% at 50% 0%, #000, transparent 75%);
		mask-image: radial-gradient(ellipse 80% 100% at 50% 0%, #000, transparent 75%);
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
		.cta-ghost,
		.rotate-\[-1\.5deg\] {
			transition: none;
		}
	}
</style>
