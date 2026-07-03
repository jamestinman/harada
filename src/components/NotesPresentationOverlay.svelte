<script>
	import { onMount } from 'svelte';
	import { store } from '$stores/store.svelte.js';
	import { playback } from '$stores/playback.svelte.js';
	import { getNoteTitle, renderNoteBodyMarkdown } from '$lib/todoUtils.js';
	import { isNoteSpeechSupported, speechTextFromNoteContent } from '$lib/noteSpeech.js';
	import SpeechPlayButton from './SpeechPlayButton.svelte';
	import { X, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-svelte';

	let { note, notes = [], onclose } = $props();

	let presentationTheme = $state(store.theme);
	let speechSupported = $state(false);

	let currentNote = $state();
	const currentIndex = $derived(notes.findIndex((n) => n.id === currentNote?.id));

	$effect(() => {
		currentNote = note;
	});

	function prev() {
		if (currentIndex > 0) currentNote = notes[currentIndex - 1];
	}

	function next() {
		if (currentIndex < notes.length - 1) currentNote = notes[currentIndex + 1];
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') onclose();
		if (e.key === 'ArrowLeft') prev();
		if (e.key === 'ArrowRight') next();
	}

	function playCurrentNote() {
		if (!speechSupported || !currentNote) return;
		const text = speechTextFromNoteContent(currentNote?.content ?? '');
		if (!text) return;
		void playback.play({
			id: currentNote.id,
			type: 'note',
			title: getNoteTitle(currentNote?.content ?? '')
		});
	}

	onMount(() => {
		speechSupported = isNoteSpeechSupported();
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});

	const isDark = $derived(presentationTheme === 'dark');
	const hasPrev = $derived(currentIndex > 0);
	const hasNext = $derived(currentIndex < notes.length - 1);

	const btnBase = $derived(
		`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:text-slate-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:text-slate-300'}`
	);
</script>

<div
	class="{presentationTheme} fixed inset-0 z-[9999] flex flex-col overflow-hidden {isDark ? 'bg-slate-950' : 'bg-white'}"
	role="dialog"
	aria-modal="true"
	aria-label="Presentation mode"
>
	<!-- Top bar -->
	<div
		class="flex shrink-0 items-center justify-between px-6 py-3 {isDark
			? 'border-b border-slate-800/60'
			: 'border-b border-slate-200'}"
	>
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={prev}
				disabled={!hasPrev}
				class={btnBase}
				aria-label="Previous note"
			>
				<ChevronLeft class="h-4 w-4" />
			</button>
			<button
				type="button"
				onclick={next}
				disabled={!hasNext}
				class={btnBase}
				aria-label="Next note"
			>
				<ChevronRight class="h-4 w-4" />
			</button>
			{#if notes.length > 1}
				<span class="ml-1 text-xs tabular-nums {isDark ? 'text-slate-600' : 'text-slate-400'}">
					{currentIndex + 1} / {notes.length}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-1">
			{#if speechSupported}
				<SpeechPlayButton
					boxed
					active={playback.isActiveItem(currentNote?.id)}
					ariaLabel="Read note aloud"
					title="Read aloud"
					onclick={playCurrentNote}
				/>
			{/if}
			<button
				type="button"
				onclick={() => (presentationTheme = isDark ? 'light' : 'dark')}
				class={btnBase}
				aria-label="Toggle theme"
			>
				{#if isDark}
					<Sun class="h-4 w-4" />
				{:else}
					<Moon class="h-4 w-4" />
				{/if}
			</button>
			<button
				type="button"
				onclick={onclose}
				class={btnBase}
				aria-label="Exit presentation"
			>
				<X class="h-5 w-5" />
			</button>
		</div>
	</div>

	<!-- Scrollable content -->
	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl px-8 py-12 sm:px-12 md:py-16">
			<h1
				class="mb-8 text-4xl font-bold leading-tight tracking-tight sm:text-5xl {isDark
					? 'text-slate-50'
					: 'text-slate-900'}"
			>
				{getNoteTitle(currentNote?.content ?? '')}
			</h1>
			<div
				class="notes-markdown-display markdown !cursor-default !border-transparent !bg-transparent !shadow-none !outline-none text-[1.0625rem] leading-relaxed"
			>
				{@html renderNoteBodyMarkdown(currentNote?.content ?? '')}
			</div>
		</div>
	</div>
</div>
