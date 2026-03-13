<script>
	import { store } from '$stores/store.svelte.js';
</script>

<div class="flex flex-col items-center gap-6 max-w-2xl mx-auto mt-10 p-4 text-center">
	<img
		src="/icon.png"
		alt="Haradato app icon"
		class="w-40 h-40 sm:w-52 sm:h-52 mb-2 drop-shadow-xl"
	/>

	<h1 class="text-3xl font-semibold">About Haradato</h1>

	<p>
		Haradato is a simple, free goal-setting app that combines a 9x9 Harada chart with focused to-do lists
		so everything you work on stays connected to your bigger life goals.
	</p>

  <p><a href="https://www.haradato.com">haradato.com</a></p>

	<p class="mt-2 text-sm text-slate-400">Version: {store.version}</p>
</div>