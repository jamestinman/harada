<script>
	import AppleStoreBtn from '$components/AppleStoreBtn.svelte';
	import GooglePlayBtn from '$components/GooglePlayBtn.svelte';

	const luckHabits = [
		'Pick up litter on the field',
		'Bow to umpires and opponents',
		'Greet everyone with energy',
		'Be someone others want to support',
		'Keep the locker room spotless',
		'Thank the bus driver',
		'Read a book every two weeks',
		'Write thank-you letters'
	];
</script>

<svelte:head>
	<title>The Harada Chart — History &amp; Deep Dive | Haradato</title>
	<meta
		name="description"
		content="The full story of the Harada Method and OW64 chart - from an Osaka classroom to Shohei Ohtani's rise to MLB superstardom."
	/>
</svelte:head>

<article class="content-page space-y-24 pb-12">
	<!-- ───────────────────────── HERO ───────────────────────── -->
	<header class="relative -mt-4">
		<div class="dot-grid pointer-events-none absolute inset-x-0 -top-12 -z-10 h-[380px]"></div>
		<div class="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[400px] bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(16,185,129,0.14),transparent)]"></div>

		<div class="mx-auto max-w-3xl text-center">
			<p class="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
				<span class="inline-block h-px w-8 bg-emerald-500/60"></span>
				The Method · A true story
				<span class="inline-block h-px w-8 bg-emerald-500/60"></span>
			</p>
			<h1 class="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
				The Harada Chart
			</h1>
			<p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
				A 64-square sheet of paper that turned the worst sports team in Osaka into national champions — and later guided a teenager named Shohei Ohtani to the top of world baseball.
			</p>
		</div>

		<figure class="mx-auto mt-10 max-w-2xl">
			<div class="rotate-[-1deg] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/10 transition-transform duration-300 hover:rotate-0 dark:border-slate-700 dark:bg-slate-800">
				<img src="/onboarding/ohtani-chart.webp" alt="Shohei Ohtani's original 64-square Harada chart, written at age 15" class="h-auto w-full rounded-lg" />
			</div>
			<figcaption class="mt-4 text-center text-sm italic text-slate-500 dark:text-slate-400">
				Shohei Ohtani's actual chart, written at 15. It now sits in the Baseball Hall of Fame.
			</figcaption>
		</figure>

		<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
			<a href="/harada" class="cta-primary">Make your own — free</a>
			<a href="#how-it-works" class="cta-ghost">How the chart works</a>
		</div>
	</header>

	<!-- ───────────────────── STAT STRIP ───────────────────── -->
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		{#each [
			{ stat: '#1', label: 'from the worst of 380 city schools' },
			{ stat: '13', label: 'national gold medals won' },
			{ stat: '90k+', label: 'people trained in the method' },
			{ stat: '280+', label: 'companies, incl. Toyota & Panasonic' }
		] as item}
			<div class="rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
				<p class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 sm:text-4xl">{item.stat}</p>
				<p class="mt-2 text-xs leading-snug text-slate-500 dark:text-slate-400">{item.label}</p>
			</div>
		{/each}
	</div>

	<!-- ─────────────────────── ARTICLE BODY ─────────────────────── -->
	<div class="mx-auto max-w-3xl space-y-20">
		<!-- 01 Origin -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">01 — Origin</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">Osaka, 1990s</h2>
			<div class="mt-5 space-y-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				<p>
					In the early 1990s, <strong>Takashi Harada</strong> took on one of Japan's most thankless coaching jobs: the track and field programme at a junior high school in Osaka's most deprived neighbourhood — the worst-performing school out of 380 across the city. His students had little confidence, poor discipline, and almost no belief they could amount to anything.
				</p>
				<p>
					Rather than drilling harder technique, Harada focused on something nobody else was measuring: the students' inner world. He asked each athlete to define a single "highest goal," map their strengths and weaknesses honestly, design daily routines tied to that goal, and keep a journal. Then he added a fourth dimension that proved decisive — <strong>actively helping others every single day</strong>. Physical skill, self-belief, good habits, and service to others together formed his framework.
				</p>
				<p>
					Within three years the team won the regional championship and held it for six years running. Twelve of his athletes won <strong>thirteen national gold medals</strong>, making their school the best in Japan for its age group. Nearly all of his once-struggling students earned university scholarships.
				</p>
			</div>
		</section>

		<!-- 02 OW64 -->
		<section id="how-it-works" class="scroll-mt-24">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">02 — The tool</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">The Open Window 64</h2>
			<p class="mt-5 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				To make the system teachable and visual, Harada devised a tool he called the <strong>Open Window 64</strong> — a 9×9 grid. A central life goal sits in the middle, surrounded by eight pillars of development. Each pillar anchors its own 3×3 block of eight concrete sub-goals, giving <strong>64 total action items</strong>.
			</p>

			<!-- 1 → 8 → 64 visual -->
			<div class="mt-8 grid gap-4 sm:grid-cols-3">
				{#each [
					{ n: '1', img: '/onboarding/central-goal.png', title: 'One central goal', body: 'Concrete, measurable, and meaningful enough to sustain years of effort.' },
					{ n: '8', img: '/onboarding/sub-goals.png', title: 'Eight pillars', body: 'The domains you must develop — physique, technique, mentality, character.' },
					{ n: '64', img: '/onboarding/all-goals.png', title: 'Sixty-four actions', body: 'Eight repeatable daily behaviours per pillar that build each one over time.' }
				] as step}
					<div class="relative flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
						<span class="absolute -top-3 left-5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow">{step.n}</span>
						<img src={step.img} alt={step.title} class="mb-4 mt-1 h-28 w-auto object-contain" loading="lazy" />
						<h3 class="font-semibold text-slate-900 dark:text-white">{step.title}</h3>
						<p class="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{step.body}</p>
					</div>
				{/each}
			</div>

			<p class="mt-8 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				The chart's power is its <em>visibility</em>. Everything you need to do — across every dimension of growth — fits on a single page. Nothing is hidden in a buried notes file or a forgotten app. You can see at a glance where you are thriving and where you are falling short.
			</p>
		</section>

		<!-- 03 Business -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">03 — Scale</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">From the classroom to the boardroom</h2>
			<div class="mt-5 space-y-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				<p>
					After his success in education, Harada left teaching in 2002 to take the method into the corporate world. The same principles — self-reliance, structured goals, daily discipline, and service to others — that transformed struggling teenagers, he reasoned, would work for adults in organisations.
				</p>
				<p>
					He was right. The method was adopted by <strong>Toyota, Panasonic, and Suntory</strong>, and has since been taught to over <strong>90,000 people at more than 280 companies</strong>. The Japan Management Association called it "the world's best system for developing people to their fullest capabilities."
				</p>
				<p>
					It reached the West through <strong>Norman Bodek</strong> — the publisher known as the "Godfather of Lean." Having long felt Lean manufacturing was missing a human dimension, he called the Harada Method "the human side of Lean" and spent his final years bringing it to North America and Europe.
				</p>
			</div>
		</section>

		<!-- 04 Ohtani -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">04 — The legend</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">Shohei Ohtani's chart</h2>
			<div class="mt-5 space-y-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				<p>
					In 2010, a fifteen-year-old from Iwate Prefecture enrolled at Hanamaki Higashi High School, whose baseball coach, <strong>Hiroshi Sasaki</strong>, required every player to complete an OW64 chart. That student was <strong>Shohei Ohtani</strong>. At the centre of his grid he wrote a goal that seemed audacious even for the most talented prospect in Japan:
				</p>
			</div>

			<blockquote class="my-8 border-l-4 border-emerald-500 bg-emerald-50 py-4 pl-6 pr-4 text-xl font-medium italic text-slate-700 dark:bg-emerald-950/30 dark:text-slate-200">
				"Be selected No. 1 in the draft by all eight NPB teams."
			</blockquote>

			<div class="space-y-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				<p>
					Around it he arranged eight pillars: Physique, Control, Sharpness, Speed, Pitch repertoire, Character, Mental toughness — and, famously, <strong>Luck</strong>. The luck column became the most discussed part of the chart. Ohtani's eight "luck habits" were entirely mundane acts of character:
				</p>
			</div>

			<ul class="mt-6 grid gap-3 sm:grid-cols-2">
				{#each luckHabits as habit}
					<li class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
						<svg class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.29a1 1 0 011.408 0z" clip-rule="evenodd"/></svg>
						{habit}
					</li>
				{/each}
			</ul>

			<div class="mt-6 space-y-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				<p>
					His reasoning, repeated in interviews: <em>"If you become the kind of person people want to see succeed, the universe finds a way to help you."</em>
				</p>
				<p>
					In 2012, every single NPB team did try to draft Ohtani first overall. By 2018 he was in Anaheim rewriting what a baseball player could be, and in 2024 he became the first player in history to hit 50 home runs and steal 50 bases in a season while pitching triple-digit heat.
				</p>
			</div>
		</section>

		<!-- 05 The insight -->
		<section>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">05 — The insight</p>
			<h2 class="mt-2 text-3xl font-bold tracking-tight">Why it works</h2>
			<div class="mt-5 space-y-4 text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				<p>
					The Harada Method refuses to separate skill from character. Ohtani's chart is explicit: cleaning the dugout and reading books sit alongside pitching mechanics and strength targets as equal contributors to success.
				</p>
			</div>

			<blockquote class="my-8 border-l-4 border-emerald-500 bg-emerald-50 py-4 pl-6 pr-4 text-xl font-medium italic text-slate-700 dark:bg-emerald-950/30 dark:text-slate-200">
				"People fail to reach their goals not because they lack ability, but because they set and pursue those goals the wrong way."
				<cite class="mt-2 block text-sm font-normal not-italic text-slate-500 dark:text-slate-400">— Takashi Harada</cite>
			</blockquote>

			<p class="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
				World-class success, the method argues, is the accumulated residue of world-class daily habits. The fastest way to install those habits is to make them visible, countable, and tied to a purpose bigger than ego.
			</p>
		</section>
	</div>

	<!-- ───────────────── CLOSING CTA: living system ───────────────── -->
	<div class="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-8 shadow-sm sm:p-12 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-slate-900">
		<div class="mx-auto max-w-2xl text-center">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">The chart, as a living system</p>
			<h2 class="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">Bring your Harada chart to life</h2>
			<p class="mx-auto mt-4 max-w-xl text-slate-600 dark:text-slate-300">
				Haradato puts the OW64 chart on your phone and the web — and adds what paper can't: a real to-do list and notes behind every one of your 64 squares.
			</p>
		</div>

		<ul class="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
			{#each [
				'One central goal, visible every time you open the app',
				'8 pillars and 64 sub-goals on one interactive grid',
				'Tasks and markdown notes attached to every cell',
				'Progress at a glance — and synced across all devices'
			] as feature}
				<li class="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
					<svg class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.29a1 1 0 011.408 0z" clip-rule="evenodd"/></svg>
					{feature}
				</li>
			{/each}
		</ul>

		<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
			<a href="/harada" class="cta-primary">Start your chart — free</a>
		</div>
		<div class="mt-5 flex flex-wrap items-center justify-center gap-3">
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
