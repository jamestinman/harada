<script>
	let { children } = $props();
</script>

<div class="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
	<header class="border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
			<a href="/" class="text-lg font-semibold tracking-tight">Haradato</a>
			<nav class="hidden items-center gap-5 text-sm md:flex">
				<a href="/to-do-lists" class="hover:text-emerald-600 dark:hover:text-emerald-400">To-do Lists</a>
				<a href="/harada-chart" class="hover:text-emerald-600 dark:hover:text-emerald-400">What is a Harada Chart?</a>
				<a href="/for-agents" class="hover:text-emerald-600 dark:hover:text-emerald-400">Agent Usage</a>
				<a href="/articles" class="hover:text-emerald-600 dark:hover:text-emerald-400">Articles</a>
			</nav>
			<div class="flex items-center gap-2">
				<a
					href="/home"
					class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
				>
					Get Started
				</a>
				<a
					href="/home"
					class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
				>
					Login
				</a>
			</div>
		</div>
	</header>

	<main class="content-page mx-auto max-w-6xl px-4 py-8">
		{@render children()}
	</main>

	<footer class="border-t border-slate-200 py-8 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
		<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
			<p>Haradato - your AI-accessible brain extension.</p>
			<div class="flex items-center gap-4">
				<a href="/privacy" class="hover:text-emerald-600 dark:hover:text-emerald-400">Privacy</a>
				<a href="/to-do-lists" class="hover:text-emerald-600 dark:hover:text-emerald-400">To-do Lists</a>
				<a href="/articles" class="hover:text-emerald-600 dark:hover:text-emerald-400">Articles</a>
				<a href="/for-agents" class="hover:text-emerald-600 dark:hover:text-emerald-400">For Agents</a>
			</div>
		</div>
	</footer>
</div>

<style>
	:global(.content-page ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}

	:global(.content-page ol) {
		list-style: decimal;
		padding-left: 1.25rem;
	}

	:global(.content-page .salesBtn) {
		border-radius: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		border: 1px solid rgb(5 150 105);
		background: rgb(5 150 105);
		color: white;
		transition: background-color 0.15s ease;
		display: inline-block;
	}

	:global(.content-page .salesBtn:hover) {
		background: rgb(16 185 129);
	}

	:global(.content-page .salesBtn.secondary) {
		background: transparent;
		border-color: rgb(203 213 225);
		color: inherit;
	}

	:global(.content-page .salesBtn.secondary:hover) {
		background: rgb(241 245 249);
	}

	:global(.dark .content-page .salesBtn.secondary) {
		border-color: rgb(51 65 85);
	}

	:global(.dark .content-page .salesBtn.secondary:hover) {
		background: rgb(30 41 59);
	}
</style>
