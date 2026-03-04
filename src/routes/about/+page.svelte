<script>
	import { store } from '$stores/store.svelte.js';
</script>

<div class="flex flex-col gap-5 max-w-2xl mx-auto mt-8 p-4"> 
	<h1>About Haradato</h1>
	<p>A simple, free to-do list app with Harada chart view to help ensure everything you do is aligned with bigger life goals.</p>
	<p>Version: {store.version}</p>
</div>