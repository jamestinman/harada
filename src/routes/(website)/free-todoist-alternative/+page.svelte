<script>
	import AppleStoreBtn from '$components/AppleStoreBtn.svelte';
	import GooglePlayBtn from '$components/GooglePlayBtn.svelte';

	const canonicalUrl = 'https://haradato.com/free-todoist-alternative';
	const ogImage = 'https://haradato.com/onboarding/todo.webp';

	const faqItems = [
		{
			question: 'Is Haradato really free?',
			answer:
				'Yes. Haradato gives you unlimited tasks, to-do lists, Harada charts, and markdown notes at no cost. Optional add-ons for AI assistant and publishing are coming later - they are not required to use todos.'
		},
		{
			question: 'How is Haradato different from Todoist?',
			answer:
				'Haradato keeps day-to-day tasks simple with no caps on the free plan. Every task can link to a goal on your Harada Chart - a single-page view of your whole life. You also get markdown notes on tasks, offline support, and a cleaner interface without project labels and filter complexity.'
		},
		{
			question: 'Do I need to sign up?',
			answer:
				'No. You can start adding tasks immediately without an account. Sign up when you want cloud sync across your phone, tablet, and browser.'
		},
		{
			question: 'Does it work offline?',
			answer:
				'Yes. Haradato is local-first - changes save instantly on your device and sync to the cloud when you are logged in and online.'
		},
		{
			question: 'Can I use it just as a simple to-do list?',
			answer:
				'Absolutely. Use custom lists and the All Tasks view on their own. The Harada Chart is there when you want life-wide structure, not before.'
		},
		{
			question: 'Is there a desktop app?',
			answer:
				'A desktop app is coming soon. You can use Haradato on the web now, plus native iOS and Android apps.'
		}
	];

	const faqSchema = {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqItems.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: item.answer
			}
		}))
	};

	const todoFeatures = [
		'Unlimited tasks and to-do lists - no upgrade wall',
		'Quick-add and one All Tasks view for fast capture',
		'Custom lists for day-to-day errands, separate from goals',
		'Sub-tasks, drag to reorder, and pin what matters today',
		'Markdown notes attached to any task',
		'Offline mode with sync when you sign in'
	];

	const chartSteps = [
		{
			n: '1',
			img: '/onboarding/central-goal.png',
			title: 'One central goal',
			body: 'Put what matters most in the middle - your headline ambition or the life you are building toward.'
		},
		{
			n: '8',
			img: '/onboarding/sub-goals.png',
			title: 'Eight life areas',
			body: 'Health, career, money, relationships, growth, home, mind, fun - or whatever fits your life.'
		},
		{
			n: '64',
			img: '/onboarding/all-goals.png',
			title: 'Sixty-four cells',
			body: 'Each cell is a goal or category. Compartmentalise everything until it finally has a home.'
		}
	];

	const platforms = [
		{
			title: 'iOS & Android',
			body: 'Native apps for iPhone, iPad, and Android. Your lists sync when you sign in.',
			status: 'Available'
		},
		{
			title: 'Website',
			body: 'Open haradato.com in any browser - jump straight to your tasks or your chart.',
			status: 'Available'
		},
		{
			title: 'Desktop',
			body: 'A dedicated desktop app is on the way. Use the web app on Mac or Windows in the meantime.',
			status: 'Coming soon'
		}
	];
</script>

<svelte:head>
	<title>Free Todoist Alternative – Unlimited Tasks &amp; Life Goals | Haradato</title>
	<meta
		name="description"
		content="Haradato is a free, simple to-do app with unlimited tasks on iOS, Android and web. Organise your whole life with the Harada Chart - no credit card, no catch."
	/>
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Haradato" />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:title" content="Free Todoist Alternative – Unlimited Tasks & Life Goals | Haradato" />
	<meta
		property="og:description"
		content="Haradato is a free, simple to-do app with unlimited tasks on iOS, Android and web. Organise your whole life with the Harada Chart - no credit card, no catch."
	/>
	<meta property="og:image" content={ogImage} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Free Todoist Alternative – Unlimited Tasks & Life Goals | Haradato" />
	<meta
		name="twitter:description"
		content="Haradato is a free, simple to-do app with unlimited tasks on iOS, Android and web. Organise your whole life with the Harada Chart - no credit card, no catch."
	/>
	<meta name="twitter:image" content={ogImage} />
	{@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`}
</svelte:head>

<article class="content-page space-y-24 pb-12">
	<!-- HERO -->
	<header class="relative -mt-4">
		<div class="dot-grid pointer-events-none absolute inset-x-0 -top-12 -z-10 h-[380px]"></div>
		<div
			class="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[400px] bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(16,185,129,0.14),transparent)]"
		></div>

		<div class="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
			<div>
				<p
					class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400"
				>
					<span class="inline-block h-px w-8 bg-emerald-500/60"></span>
					Simple · Unlimited · Free
				</p>
				<h1 class="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
					A free Todoist alternative - unlimited tasks, built for simplicity
				</h1>
				<p class="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
					Haradato is a simple to-do app with <strong class="font-semibold text-slate-800 dark:text-slate-100">no task limits</strong>, no credit card, and optional sign-up. Every task can connect to a life goal on your Harada Chart - or stay in a plain list if that is all you need.
				</p>
				<div class="mt-8 flex flex-wrap items-center gap-3">
					<a href="/todo" class="cta-primary">Start free</a>
					<a href="/harada-chart" class="cta-ghost">See the Harada Chart</a>
				</div>
				<p class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
					<span class="inline-flex items-center gap-1.5"><span class="text-emerald-500">✓</span> Free forever</span>
					<span class="inline-flex items-center gap-1.5"><span class="text-emerald-500">✓</span> Unlimited tasks</span>
					<span class="inline-flex items-center gap-1.5"><span class="text-emerald-500">✓</span> Works offline</span>
					<span class="inline-flex items-center gap-1.5"><span class="text-emerald-500">✓</span> No sign-up required</span>
				</p>
			</div>

			<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
				<img
					src="/onboarding/todo.webp"
					alt="Haradato to-do list - a simple, unlimited free task manager linked to life goals"
					class="h-auto w-full"
					width="800"
					height="600"
					loading="eager"
				/>
			</div>
		</div>
	</header>

	<!-- STAT STRIP -->
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		{#each [
			{ stat: '$0', label: 'forever - unlimited tasks and lists' },
			{ stat: '∞', label: 'tasks, no caps on the free plan' },
			{ stat: '64', label: 'life areas on one Harada Chart' },
			{ stat: '3', label: 'ways to use it: web, iOS, Android' }
		] as item}
			<div class="rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
				<p class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 sm:text-4xl">{item.stat}</p>
				<p class="mt-2 text-xs leading-snug text-slate-500 dark:text-slate-400">{item.label}</p>
			</div>
		{/each}
	</div>

	<div class="mx-auto max-w-3xl space-y-20">
		<!-- WHY ALTERNATIVES -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
				Why look elsewhere
			</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">Why people look for a free Todoist alternative</h2>
			<div class="mt-5 space-y-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				<p>
					Popular to-do apps often gate the free plan behind task limits, project caps, or paid tiers for features you expected to be basic. Over time, a tool meant to reduce stress can start to feel like a second job - labels, filters, integrations, and settings screens before you tick a single box.
				</p>
				<p>
					Haradato takes the opposite path: <strong>tasks stay simple</strong>. Quick capture, one All Tasks feed, drag-and-drop reordering. When you want more structure, the Harada Chart adds a life-wide map - not clutter on every checkbox.
				</p>
				<p>
					Everything core is <a href="/pricing" class="font-semibold text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400">$0 forever</a> - unlimited tasks, lists, charts, and notes.
				</p>
			</div>
		</section>

		<!-- TODO FEATURES -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
				To-do lists
			</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">Unlimited to-do lists - no caps, no upgrade wall</h2>
			<p class="mt-5 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				Haradato is a simple to-do app first. Add tasks in seconds, nest sub-tasks, pin what matters today, and keep everything in one All Tasks view. No project limits. No paywall when your list grows.
			</p>

			<ul class="mt-8 space-y-3">
				{#each todoFeatures as feature}
					<li class="flex items-start gap-3 text-slate-700 dark:text-slate-300">
						<svg class="mt-1 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path
								fill-rule="evenodd"
								d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.29a1 1 0 011.408 0z"
								clip-rule="evenodd"
							/>
						</svg>
						{feature}
					</li>
				{/each}
			</ul>

			<p class="mt-8 text-slate-600 dark:text-slate-400">
				Want goal-linked lists? Attach any task to a cell on your chart. Prefer a plain list? Create custom lists and ignore the chart entirely.
			</p>
			<div class="mt-6">
				<a href="/todo" class="cta-primary">Open your to-do list</a>
			</div>
		</section>

		<!-- HARADA CHART -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
				The Harada Chart
			</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">Get on top of your life with the Harada Chart view</h2>
			<p class="mt-5 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				Most to-do apps are flat lists. Haradato adds a layer flat apps cannot: a <strong>9×9 Harada Chart</strong> that maps your whole life onto a single page - one central goal, eight areas, and sixty-four cells for the goals and categories that matter.
			</p>
			<p class="mt-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				See at a glance where you are thriving and where you are falling short. Tap any cell and you are in a real to-do list for that area. Planning and doing finally live in the same place.
			</p>

			<div class="mt-8 grid gap-4 sm:grid-cols-3">
				{#each chartSteps as step}
					<div
						class="relative flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900"
					>
						<span
							class="absolute -top-3 left-5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow"
							>{step.n}</span
						>
						<img src={step.img} alt={step.title} class="mb-4 mt-1 h-28 w-auto object-contain" loading="lazy" />
						<h3 class="font-semibold text-slate-900 dark:text-white">{step.title}</h3>
						<p class="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{step.body}</p>
					</div>
				{/each}
			</div>

			<p class="mt-8 text-slate-600 dark:text-slate-400">
				The chart is based on the Harada Method - used from Osaka classrooms to Japanese boardrooms.
				<a href="/harada-chart" class="font-semibold text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400">Read the full story →</a>
			</p>
			<div class="mt-6">
				<a href="/harada" class="cta-primary">Start your chart - free</a>
			</div>
		</section>

		<!-- WHO IT'S FOR -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Who it is for</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">A simple to-do app for people juggling more than errands</h2>
			<p class="mt-5 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				Haradato suits anyone who wants a free, uncluttered task manager - and especially people balancing health, work, relationships, and personal growth at the same time. Athletes mapping a season, entrepreneurs building a company, or anyone who wants their daily tasks pointed at a bigger picture.
			</p>
		</section>

		<!-- PLATFORMS -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Platforms</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">Your tasks on every device</h2>
			<p class="mt-5 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				Capture a task on your phone, check it off on the web, review your chart on a tablet. Haradato syncs across devices when you sign in.
			</p>

			<div class="mt-8 grid gap-4 sm:grid-cols-3">
				{#each platforms as platform}
					<div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
						<div class="flex items-center justify-between gap-2">
							<h3 class="font-semibold text-slate-900 dark:text-white">{platform.title}</h3>
							<span
								class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold {platform.status === 'Available'
									? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
									: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}"
							>
								{platform.status}
							</span>
						</div>
						<p class="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{platform.body}</p>
					</div>
				{/each}
			</div>

			<div class="mt-8 flex flex-wrap items-center gap-3">
				<AppleStoreBtn />
				<GooglePlayBtn />
				<a href="/todo" class="cta-ghost">Use on the web</a>
			</div>
		</section>

		<!-- FAQ -->
		<section id="faq" class="scroll-mt-24">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">FAQ</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">Common questions</h2>

			<div class="mt-8 space-y-3">
				{#each faqItems as item}
					<details
						class="group rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
					>
						<summary
							class="cursor-pointer list-none px-5 py-4 font-semibold text-slate-900 marker:content-none dark:text-white [&::-webkit-details-marker]:hidden"
						>
							<span class="flex items-center justify-between gap-4">
								{item.question}
								<svg
									class="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
									viewBox="0 0 20 20"
									fill="currentColor"
									aria-hidden="true"
								>
									<path
										fill-rule="evenodd"
										d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
										clip-rule="evenodd"
									/>
								</svg>
							</span>
						</summary>
						<p class="border-t border-slate-100 px-5 py-4 text-slate-600 dark:border-slate-800 dark:text-slate-300">
							{item.answer}
						</p>
					</details>
				{/each}
			</div>
		</section>
	</div>

	<!-- CLOSING CTA -->
	<div
		class="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-8 text-center shadow-sm sm:p-12 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-slate-900"
	>
		<h2 class="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
			Start free - unlimited tasks, no credit card
		</h2>
		<p class="mx-auto mt-3 max-w-md text-slate-600 dark:text-slate-300">
			A simple to-do app when you need it. A Harada Chart when you want your whole life in view.
		</p>
		<div class="mt-7 flex flex-wrap items-center justify-center gap-3">
			<a href="/todo" class="cta-primary">Get started free</a>
			<a href="/harada" class="cta-ghost">Open your chart</a>
		</div>
		<div class="mt-6 flex flex-wrap items-center justify-center gap-3">
			<AppleStoreBtn />
			<GooglePlayBtn />
		</div>
	</div>
</article>

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
		transition:
			transform 0.15s ease,
			background-color 0.15s ease,
			box-shadow 0.15s ease;
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
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease;
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
