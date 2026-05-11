<script>
	import { store } from '$stores/store.svelte.js';
	import AppleStoreBtn from '$components/AppleStoreBtn.svelte';
	import GooglePlayBtn from '$components/GooglePlayBtn.svelte';
</script>

<div class="content flex flex-col items-center max-w-2xl mx-auto mt-8 sm:mt-12 px-4 pb-12">
	<img
		src="/icon.png"
		alt="Haradato app icon"
		class="w-32 h-32 sm:w-40 sm:h-40 mb-4 drop-shadow-xl rounded-2xl"
	/>

	<h1 class="text-2xl sm:text-3xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
		About Haradato
	</h1>
	<p class="text-slate-600 dark:text-slate-400 text-center text-sm sm:text-base mb-8">
    <strong>Haradato</strong> is a productivity app (currently iPhone, with web) built around the Harada Method - a <strong>Japanese goal-achievement system</strong> famously used by Shohei Ohtani. You define one central life goal, break it into 8 pillars, each pillar into 8 sub-goals, giving you 64 concrete steps. Behind each of those 64 cells sits a full todo list. It's essentially a <strong>life blueprint</strong> that doubles as a <strong>daily task manager</strong>.
  </p>
  <button onclick={() => store.showHowItWorksModal = true} class="rounded-xl border py-2 px-4 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 font-medium">See how it works</button>.

	<div class="mt-4 flex flex-row flex-wrap items-center justify-center gap-3">
		<AppleStoreBtn />
		<GooglePlayBtn />
	</div>

  <section class="w-full text-left space-y-6 mt-10">
		<div>
			<h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
				Engineered success with the Harada Method
			</h2>
			<p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
				How did Shohei Ohtani realise his dreams of becoming a major league baseball player for the Los Angeles Dodgers? He had a <strong>system</strong>.
			</p>
			<p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mt-2">
				Haradato brings the world-renowned Harada Method (using the 64-Cell Harada Chart template) to your iPhone. But it's more than that - it gives you concrete tasks behind each sub-goal as actionable todo lists. Think of it like a Todo list app that's also a blueprint for your life.
			</p>
		</div>

		<div>
			<h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
				What is the Harada Method?
			</h2>
			<p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
				Developed by Takashi Harada, this system is designed to build "self-reliance." You start with one central goal, surround it with 8 key pillars of success, and then break each pillar into 8 actionable sub-goals. The result? <strong>64 concrete steps</strong> that make your success inevitable.
			</p>
		</div>

		<div>
			<h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
				Why Haradato?
			</h2>
			<p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-3">
				It's a daily-use brain extension that keeps what you do focused on your bigger goals.
			</p>
			<ul class="space-y-2 text-slate-600 dark:text-slate-400 text-sm">
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">64-Square Grid:</strong> A bird's-eye view of your entire roadmap</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Deep Todo Integration:</strong> Every square is a portal - tap any square to reveal a dedicated Todo List</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Micro-Actions:</strong> Break down "Mental Toughness" or "Skill Mastery" into tiny, daily tasks that move the needle</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Visual Clarity:</strong> See where you're achieving and where you need more work at a single glance</span>
				</li>
			</ul>
		</div>

		<div>
			<h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
				Perfect for
			</h2>
			<ul class="space-y-2 text-slate-600 dark:text-slate-400 text-sm">
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Entrepreneurs:</strong> Break down "Launch a Startup" into marketing, product, and networking pillars</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Film producers:</strong> Map out steps from your first Indie movie to the Oscars</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Athletes:</strong> Track conditioning, skill, and mindset like Ohtani</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span><strong class="text-slate-700 dark:text-slate-300">Students:</strong> Master complex subjects by deconstructing them into 64 study habits</span>
				</li>
			</ul>
		</div>

		<div>
			<h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
				Key features
			</h2>
			<ul class="space-y-2 text-slate-600 dark:text-slate-400 text-sm">
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span>Create your own "Open Window 64" (OW64) chart</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span>Powerful todo list management behind every grid cell</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span>Clean, minimalist interface inspired by Japanese design</span>
				</li>
				<li class="flex gap-2">
					<span class="text-emerald-500 shrink-0">•</span>
					<span>Progress tracking to keep your momentum high</span>
				</li>
			</ul>
		</div>

		<p class="text-slate-700 dark:text-slate-300 font-medium text-center pt-4">
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
