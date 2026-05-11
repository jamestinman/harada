<script>
	import { store } from '$stores/store.svelte.js';
	import AppleStoreBtn from '$components/AppleStoreBtn.svelte';
	import GooglePlayBtn from '$components/GooglePlayBtn.svelte';
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
				Download (iOS + macOS + Android)
			</h2>

			<p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
				Haradato is currently available on iPhone, iPad, Mac, and Android.
			</p>
			<div class="mt-4 flex flex-row flex-wrap items-center gap-3">
				<AppleStoreBtn />
				<GooglePlayBtn />
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
			Don't just dream. Engineer your own achievement.
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

