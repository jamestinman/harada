<script>
	import { store } from '$stores/store.svelte.js';
</script>

<div class="flex flex-col items-center max-w-2xl mx-auto mt-8 sm:mt-12 px-4 pb-12">
	<img
		src="/icon.png"
		alt="Haradato app icon"
		class="w-32 h-32 sm:w-40 sm:h-40 mb-4 drop-shadow-xl rounded-2xl"
	/>

	<h1 class="text-2xl sm:text-3xl font-semibold text-slate-800 dark:text-slate-100 mb-2 text-center">
		Haradato: Harada Chart + Todo
	</h1>

	<p class="text-slate-600 dark:text-slate-400 text-center text-sm sm:text-base mb-8">
		Plan your goals with the 64-square Harada Chart, then turn each sub-goal into practical todo lists you can act on every day.
	</p>

	<p class="text-slate-600 dark:text-slate-400 text-center text-sm sm:text-base -mt-6 mb-8">
		Want a quick walkthrough first?
		<button
			onclick={() => (store.showHowItWorksModal = true)}
			class="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
		>
			See how it works
		</button>
	</p>

	<section class="w-full text-left space-y-6">
		<div>
			<h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
				Download (iOS + macOS)
			</h2>

			<p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
				Haradato is currently available on iPhone, iPad and Mac via the App Store. If you don’t see it on your device,
				check again later, or reach out if you’re looking for other platforms.
			</p>

			<div class="mt-4 mx-auto w-full flex items-center justify-center">
				<a
					href="https://apps.apple.com/gb/app/haradato-harada-chart-todo/id6760551353"
					target="_blank"
					rel="noreferrer"
					class="inline-flex items-center gap-3 rounded-2xl bg-black hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black px-5 py-3 transition shadow-md w-fit"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" class="w-6 h-6 shrink-0 fill-current" aria-hidden="true">
						<path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49 192.5-49 30.9 0 133.3 2.6 198.4 99zM549.1 105.6c23.3-28.4 39.5-67.8 39.5-107.3 0-5.8-.6-11.7-1.9-16.2-37.5 1.3-81.7 25.2-108.4 57.1-21.4 25.1-41.5 64.6-41.5 104.7 0 6.4 1.3 12.9 1.9 15.5 2.6.6 6.5 1.3 10.4 1.3 33.8 0 76.3-22.5 100-55.1z"/>
					</svg>
					<div class="flex flex-col leading-tight text-left">
						<span class="text-xs opacity-80">Download on the</span>
						<span class="text-base font-semibold">App Store</span>
					</div>
				</a>

			</div>
		</div>

		<div>
			<h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
				What you get
			</h2>
			<ul class="space-y-2 text-slate-600 dark:text-slate-400 text-sm">
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Harada Chart:</strong> a visual roadmap built around your central dream</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Deep todo lists:</strong> each sub-goal opens actionable tasks</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Progress tracking:</strong> keep momentum by seeing what’s done and what’s next</span>
				</li>
			</ul>
		</div>

		<p class="text-slate-700 dark:text-slate-300 font-medium text-center pt-2">
			Don't just dream. Engineer your achievement.
		</p>
	</section>

	<footer class="mt-10 pt-6 border-t border-slate-200 dark:border-slate-700 w-full text-center">
		<p class="mb-2">
			<a
				href="https://www.haradato.com"
				class="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
			>
				haradato.com
			</a>
		</p>
		<p class="text-xs text-slate-400 dark:text-slate-500 mb-1">
			Version {store.version}
		</p>
		<p class="text-xs text-slate-400 dark:text-slate-500">
			<a
				href="/privacy"
				class="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
			>
				Privacy Policy
			</a>
		</p>
	</footer>
</div>

