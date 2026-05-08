<script>
	import { onMount } from 'svelte';
	import { store } from '$stores/store.svelte.js';
	import { getNoteTitle, renderNoteBodyMarkdown } from '$lib/todoUtils.js';
	import { fetchNoteSpeechBlob, speechTextFromNoteContent } from '$lib/noteSpeech.js';
	import { X, Sun, Moon, ChevronLeft, ChevronRight, Volume2, Square } from 'lucide-svelte';

	let { note, notes = [], onclose } = $props();

	let presentationTheme = $state(store.theme);
	let speechSupported = $state(false);
	let isSpeaking = $state(false);

	let activeAudio = null;
	let activeAudioUrl = null;
	let activeSpeechController = null;
	let speechRunId = 0;
	let lastSpokenWatchNoteId = null;

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

	function clearActiveAudio() {
		if (activeAudio) {
			activeAudio.pause();
			activeAudio.src = '';
			activeAudio = null;
		}
		if (activeAudioUrl) {
			URL.revokeObjectURL(activeAudioUrl);
			activeAudioUrl = null;
		}
	}

	function stopSpeaking() {
		console.log('[Notes TTS][Presentation] stopSpeaking called');
		speechRunId += 1;
		activeSpeechController?.abort();
		activeSpeechController = null;
		clearActiveAudio();
		isSpeaking = false;
	}

	async function speakCurrentNote() {
		if (!speechSupported) {
			console.warn('[Notes TTS][Presentation] audio playback not supported');
			return;
		}
		const text = speechTextFromNoteContent(currentNote?.content ?? '');
		console.log('[Notes TTS][Presentation] extracted text length:', text.length);
		if (!text) {
			console.warn('[Notes TTS][Presentation] note text is empty after cleanup');
			return;
		}

		console.log('[Notes TTS][Presentation] speaking note:', currentNote?.id ?? 'unknown');
		stopSpeaking();

		const runId = ++speechRunId;
		const controller = new AbortController();
		activeSpeechController = controller;
		isSpeaking = true;

		try {
			const blob = await fetchNoteSpeechBlob(text, { signal: controller.signal });
			if (runId !== speechRunId || controller.signal.aborted) return;
			if (activeSpeechController === controller) activeSpeechController = null;

			activeAudioUrl = URL.createObjectURL(blob);
			activeAudio = new Audio(activeAudioUrl);
			activeAudio.onended = () => {
				console.log('[Notes TTS][Presentation] audio ended');
				if (runId === speechRunId) {
					clearActiveAudio();
					isSpeaking = false;
				}
			};
			activeAudio.onerror = (event) => {
				console.error('[Notes TTS][Presentation] audio error:', event);
				if (runId === speechRunId) {
					clearActiveAudio();
					isSpeaking = false;
				}
			};

			await activeAudio.play();
		} catch (error) {
			if (controller.signal.aborted) return;
			console.error('[Notes TTS][Presentation] Gemini TTS error:', error);
			if (runId === speechRunId) {
				clearActiveAudio();
				activeSpeechController = null;
				isSpeaking = false;
			}
		}
	}

	function toggleSpeech() {
		console.log('[Notes TTS][Presentation] toggleSpeech, currently speaking:', isSpeaking);
		if (isSpeaking) {
			stopSpeaking();
			return;
		}
		speakCurrentNote();
	}

	onMount(() => {
		speechSupported =
			typeof window !== 'undefined' &&
			typeof Audio !== 'undefined' &&
			typeof URL !== 'undefined' &&
			typeof URL.createObjectURL === 'function';
		console.log('[Notes TTS][Presentation] speechSupported:', speechSupported);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('keydown', handleKeydown);
			stopSpeaking();
		};
	});

	$effect(() => {
		const currentNoteId = currentNote?.id ?? null;
		if (lastSpokenWatchNoteId !== null && currentNoteId !== lastSpokenWatchNoteId && isSpeaking) {
			console.log(
				'[Notes TTS][Presentation] note changed while speaking, stopping:',
				lastSpokenWatchNoteId,
				'->',
				currentNoteId
			);
			stopSpeaking();
		}
		lastSpokenWatchNoteId = currentNoteId;
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
				<button
					type="button"
					onclick={toggleSpeech}
					class={btnBase}
					aria-label={isSpeaking ? 'Stop reading note aloud' : 'Read note aloud'}
					title={isSpeaking ? 'Stop reading' : 'Read aloud'}
				>
					{#if isSpeaking}
						<Square class="h-4 w-4" />
					{:else}
						<Volume2 class="h-4 w-4" />
					{/if}
				</button>
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
