<script>
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	// Enable view transitions for all navigation
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
