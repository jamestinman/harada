<script>
	import { page } from '$app/state';
	import NotesWorkspace from '$components/NotesWorkspace.svelte';

	const goalParam = $derived(page.params.goal ?? null);
</script>

<svelte:head>
	<title>Goal Notes - Haradato</title>
</svelte:head>

<NotesWorkspace {goalParam} />
