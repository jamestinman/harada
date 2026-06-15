<script>
	import { onMount, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { store } from '$stores/store.svelte.js';
	import {
		canonicalGoalIndex,
		indexToNomenclature,
		nomenclatureToIndex,
		getNoteTitle,
		renderNoteBodyMarkdown
	} from '$lib/todoUtils.js';
	import {
		cancelNoteSpeech,
		isNoteSpeechSupported,
		speakNoteText,
		speechTextFromNoteContent
	} from '$lib/noteSpeech.js';
	import GoalSelect from './GoalSelect.svelte';
	import WorkspaceToolbar from './WorkspaceToolbar.svelte';
	import ClearableTextInput from './ClearableTextInput.svelte';
	import NotesPresentationOverlay from './NotesPresentationOverlay.svelte';
	import NoteHybridMarkdownEditor from './NoteHybridMarkdownEditor.svelte';
	import { ChevronLeft, Trash2, Maximize2, Volume2, Square, SquarePen } from 'lucide-svelte';
	import {
		persistNotesMobileSidebar,
		readNotesMobileSidebarOpen,
		isWorkspaceNarrowLayout
	} from '$lib/workspaceNavResume.js';

	let { goalParam = null } = $props();

	const grid = $derived(store.harada_chart.grid);
	const notes = $derived(store.notes);
	const noteGoalLinks = $derived(store.noteGoalLinks);
	const dataLoaded = $derived(!store.isBootstrapping);
	let mobileMenuOpen = $state(false);
	let mobileSidebarHydrated = $state(false);
	let searchText = $state('');

	onMount(() => {
		speechSupported = isNoteSpeechSupported();
		console.log('[Notes TTS][Workspace] speechSupported:', speechSupported);
		if (isWorkspaceNarrowLayout() && readNotesMobileSidebarOpen()) {
			mobileMenuOpen = true;
		}
		mobileSidebarHydrated = true;
		return () => {
			stopSpeaking();
		};
	});

	$effect(() => {
		if (!browser || !mobileSidebarHydrated) return;
		if (!page.url.pathname.startsWith('/notes')) return;
		if (!isWorkspaceNarrowLayout()) return;
		persistNotesMobileSidebar(mobileMenuOpen);
	});

	function noteMatchesQuery(note, q) {
		if (!q) return true;
		const t = getNoteTitle(note.content).toLowerCase();
		const body = (note.content ?? '').toLowerCase();
		return t.includes(q) || body.includes(q);
	}

	const goalIndices = Array.from({ length: 81 }, (_, i) => i);
	function getGoalLabelFromIndex(index) {
		if (index === null || index < 0 || index > 80) return 'Unknown goal';
		const cell = grid[index];
		const text = (cell?.text ?? '').trim();
		return text || indexToNomenclature(index);
	}

	function parseGoalIndexFromParam(param) {
		if (!param) return null;
		const parsed = nomenclatureToIndex(param, goalIndices);
		return parsed === null ? null : canonicalGoalIndex(parsed);
	}

	const scopedGoalIndex = $derived.by(() => parseGoalIndexFromParam(goalParam));
	const hasInvalidGoal = $derived(!!goalParam && scopedGoalIndex === null);

	const allGoals = $derived.by(() => {
		const uniqueCanonical = [...new Set(goalIndices.map((idx) => canonicalGoalIndex(idx)))];
		return uniqueCanonical
			.map((idx) => {
				const cell = grid[idx];
				const text = (cell?.text ?? '').trim();
				return {
					index: idx,
					code: indexToNomenclature(idx),
					label: text || indexToNomenclature(idx)
				};
			})
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
	});

	const filteredNotes = $derived.by(() => {
		const freeNotes = notes.filter((note) => !store.isPrimaryTaskNote(note.id));
		const base =
			typeof scopedGoalIndex !== 'number'
				? [...freeNotes].sort((a, b) => b.updatedAt - a.updatedAt)
				: freeNotes
						.filter((note) => noteMatchesScopedGoal(note.id, scopedGoalIndex))
						.sort((a, b) => b.updatedAt - a.updatedAt);
		const q = searchText.trim().toLowerCase();
		if (!q) return base;
		return base.filter((note) => noteMatchesQuery(note, q));
	});

	function noteMatchesScopedGoal(noteId, goalIdx) {
		const canonical = canonicalGoalIndex(goalIdx);
		return noteGoalLinks.some((link) => link.noteId === noteId && link.goalIndex === canonical);
	}

	function getLinkedGoalIndices(noteId) {
		return noteGoalLinks.filter((link) => link.noteId === noteId).map((link) => link.goalIndex);
	}

	let selectedNoteId = $state(null);
	// Skip MRU resume when navigation already requested a specific note (e.g. new note from composer).
	let resumeNoteId = $state(store.pendingSelectNoteId ? null : store.lastOpenedNoteId);
	let isEditing = $state(false);
	let editContent = $state('');
	let linkPanelOpen = $state(false);
	let linkGoalValue = $state('');
	let hasPendingNoteLinkSave = $state(false);
	let editEditorDesktop = $state(null);
	let editEditorMobile = $state(null);
	let shouldAutoEdit = $state(false);
	let lastSavedContent = $state('');
  let previousSelectedNoteId = $state(null);

	var selectedNote = $derived.by(() => {
		if (selectedNoteId) {
			const fromFiltered = filteredNotes.find((note) => note.id === selectedNoteId);
			if (fromFiltered) return fromFiltered;
			// Primary task notes are omitted from the sidebar list but can still be selected
			// (e.g. pendingSelectNoteId after saving a task note). Resolve from the full store.
			const fromStore = notes.find((note) => note.id === selectedNoteId);
			if (fromStore) return fromStore;
		}
		return filteredNotes[0] || null;
	});
	$effect(() => {
		store.currentGoalIndex = typeof scopedGoalIndex === 'number' ? scopedGoalIndex : null;
	});

	$effect(() => {
		if (!browser) return;
		const path = page.url.pathname;
		if (!path.startsWith('/notes')) {
			store.notesMobileDetailOpen = false;
			return;
		}
		// Align with Tailwind lg:hidden (bottom nav / mobile layout): max-width 1023px
		const narrow =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
		store.notesMobileDetailOpen = narrow && !!selectedNote && !mobileMenuOpen;
	});

	$effect(() => {
		if (!browser) return;
		if (!page.url.pathname.startsWith('/notes')) return;
		if (store.notesRevealListDrawer) {
			mobileMenuOpen = true;
			store.notesRevealListDrawer = false;
		}
	});

	$effect(() => {
		const pending = store.pendingSelectNoteId;
		if (!pending) return;
		if (!dataLoaded) return;
		const note = notes.find((n) => n.id === pending);
		if (!note) {
			store.pendingSelectNoteId = null;
			return;
		}
		store.pendingSelectNoteId = null;
		flushNoteEditsIfNeeded();
		selectedNoteId = pending;
		resumeNoteId = null;
		store.recordLastOpenedNote(pending);
		mobileMenuOpen = false;
	});

	// Restore the last-viewed note when navigating back to the notes section.
	$effect(() => {
		if (!resumeNoteId) return;
		if (store.pendingSelectNoteId) return;
		if (!dataLoaded) return;
		const target = resumeNoteId;
		resumeNoteId = null;
		const note = filteredNotes.find((n) => n.id === target);
		if (note) {
			flushNoteEditsIfNeeded();
			selectedNoteId = note.id;
			mobileMenuOpen = false;
		}
	});

	$effect(() => {
		if (!selectedNote) {
			if (isSpeaking) stopSpeaking();
			selectedNoteId = null;
			editContent = '';
			lastSavedContent = '';
			isEditing = false;
			previousSelectedNoteId = null;
			return;
		}
		selectedNoteId = selectedNote.id;
		const selectedNoteChanged = selectedNote.id !== previousSelectedNoteId;
		previousSelectedNoteId = selectedNote.id;
		if (selectedNoteChanged) {
			linkPanelOpen = false;
			linkGoalValue = '';
		}

		const content = selectedNote.content || '';

		editContent = content;
		lastSavedContent = content;

		const noteIsEmpty = content.trim().length === 0;
		if (selectedNoteChanged) {
			// Default empty notes to editing so users can immediately type.
			isEditing = shouldAutoEdit || noteIsEmpty;
		} else if (shouldAutoEdit) {
			isEditing = true;
		}
		shouldAutoEdit = false;

		if (shouldAutoEdit === false && isEditing === true) {
			// no-op: kept for clarity
		}
	});

	function formatUpdatedAt(ms) {
		if (!ms) return '';
		const date = new Date(ms);
		const now = new Date();
		const msPerDay = 86400000;
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const noteDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const daysDiff = Math.round((today.getTime() - noteDay.getTime()) / msPerDay);
		if (daysDiff === 0) {
			return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		} else if (daysDiff < 7) {
			return date.toLocaleDateString(undefined, { weekday: 'long' });
		} else if (date.getFullYear() === now.getFullYear()) {
			return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		} else {
			return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
		}
	}

	function getNotePreview(content = '') {
		const lines = content.split('\n');
		const bodyLines = lines.slice(1).filter((l) => l.trim().length > 0);
		return bodyLines.join(' ').replace(/#+\s*/g, '').trim();
	}

	function getNoteGoalLabel(noteId) {
		const link = noteGoalLinks.find((l) => l.noteId === noteId);
		if (!link) return null;
		return getGoalLabelFromIndex(link.goalIndex);
	}

function isNoteEmpty(note) {
	return ((note?.content || '').trim().length ?? 0) === 0;
}

	function openLinkPanel() {
		linkGoalValue = '';
		linkPanelOpen = true;
	}

	function addSelectedLink() {
		if (!selectedNote) return;
		const parsedGoal = linkGoalValue === '' ? null : canonicalGoalIndex(Number(linkGoalValue));
		if (typeof parsedGoal === 'number' && !Number.isNaN(parsedGoal)) {
			store.linkNoteToGoal(selectedNote.id, parsedGoal, { persist: false });
			hasPendingNoteLinkSave = true;
		}
		linkPanelOpen = false;
		linkGoalValue = '';
	}

$effect(() => {
	if (!linkPanelOpen) return;
	const parsedGoal = linkGoalValue === '' ? null : canonicalGoalIndex(Number(linkGoalValue));
	if (typeof parsedGoal === 'number' && !Number.isNaN(parsedGoal)) {
		addSelectedLink();
	}
});

	function noteHasUnsavedChanges() {
		if (!selectedNote) return false;
		return editContent !== lastSavedContent;
	}

	function flushPendingNoteLinkSave() {
		if (!hasPendingNoteLinkSave) return;
		store.saveNow();
		hasPendingNoteLinkSave = false;
	}

	function persistCurrentNoteEdits() {
		if (!selectedNote) return;
		const normalizedContent = editContent;
		store.updateNote(selectedNote.id, {
			content: normalizedContent
		});
		lastSavedContent = normalizedContent;
	}

	function saveNote() {
		if (!selectedNote) return;
		persistCurrentNoteEdits();
		flushPendingNoteLinkSave();
		const noteIsEmpty = editContent.trim().length === 0;
		isEditing = noteIsEmpty;
	}

	function flushNoteEditsIfNeeded() {
		if (noteHasUnsavedChanges()) {
			persistCurrentNoteEdits();
		}
		flushPendingNoteLinkSave();
		const noteIsEmpty = editContent.trim().length === 0;
		isEditing = noteIsEmpty;
	}

	beforeNavigate(() => {
		flushNoteEditsIfNeeded();
	});

	function deleteNote() {
		if (!selectedNote) return;
		const deletingId = selectedNote.id;
		if (deletingId === store.lastOpenedNoteId) {
			store.clearLastOpenedNote();
		}
		store.deleteNote(deletingId);
		const remaining = filteredNotes.filter((note) => note.id !== deletingId);
		selectedNoteId = remaining[0]?.id || null;
		isEditing = false;
	}

	function selectNote(noteId) {
		flushNoteEditsIfNeeded();
		selectedNoteId = noteId;
		store.recordLastOpenedNote(noteId);
		shouldAutoEdit = false;
		mobileMenuOpen = false;
	}

	function createNewNote() {
		flushNoteEditsIfNeeded();
		const note = store.createNote({ content: '' });
		if (typeof scopedGoalIndex === 'number') {
			store.linkNoteToGoal(note.id, scopedGoalIndex);
		}
		selectedNoteId = note.id;
		store.recordLastOpenedNote(note.id);
		shouldAutoEdit = true;
		mobileMenuOpen = false;
		setTimeout(() => {
			void tick().then(() => {
				activeNoteEditorEl()?.focus();
			});
		}, 0);
	}

	function activeNoteEditorEl() {
		if (!browser) return null;
		return window.matchMedia('(min-width: 768px)').matches ? editEditorDesktop : editEditorMobile;
	}

	$effect(() => {
		const currentNoteId = selectedNote?.id ?? null;
		if (lastSpokenWatchNoteId !== null && currentNoteId !== lastSpokenWatchNoteId && isSpeaking) {
			console.log(
				'[Notes TTS][Workspace] note changed while speaking, stopping:',
				lastSpokenWatchNoteId,
				'->',
				currentNoteId
			);
			stopSpeaking();
		}
		lastSpokenWatchNoteId = currentNoteId;
	});

	function enterEditMode() {
		if (!selectedNote) return;
		if (isEditing) return;
		isEditing = true;
		setTimeout(() => {
			void tick().then(() => {
				const el = activeNoteEditorEl();
				el?.focus();
				el?.selectAll();
			});
		}, 0);
	}

	const notesDeleteToolbarButtonClass =
		'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-600/80 bg-rose-600 text-white transition hover:bg-rose-500';
	const notesNewToolbarButtonClass =
		'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-900/45 text-slate-100 transition hover:border-violet-500/60 hover:bg-violet-500/10';

	let presentationOpen = $state(false);
	let speechSupported = $state(false);
	let isSpeaking = $state(false);
	let activeSpeechController = null;
	let speechRunId = 0;
	let lastSpokenWatchNoteId = null;

	function stopSpeaking() {
		console.log('[Notes TTS][Workspace] stopSpeaking called');
		speechRunId += 1;
		activeSpeechController?.abort();
		activeSpeechController = null;
		cancelNoteSpeech();
		isSpeaking = false;
	}

	function selectNextNoteInCurrentList(currentNoteId) {
		const currentIndex = filteredNotes.findIndex((note) => note.id === currentNoteId);
		if (currentIndex === -1) return null;
		const nextNote = filteredNotes[currentIndex + 1];
		if (!nextNote) return null;
		selectedNoteId = nextNote.id;
		store.recordLastOpenedNote(nextNote.id);
		mobileMenuOpen = false;
		shouldAutoEdit = false;
		return nextNote.id;
	}

	async function speakSelectedNote() {
		if (!speechSupported) {
			console.warn('[Notes TTS][Workspace] audio playback not supported');
			return;
		}
		if (!selectedNote) {
			console.warn('[Notes TTS][Workspace] no selected note to read');
			return;
		}
		const text = speechTextFromNoteContent(selectedNote.content ?? '');
		console.log('[Notes TTS][Workspace] extracted text length:', text.length);
		if (!text) {
			console.warn('[Notes TTS][Workspace] note text is empty after cleanup');
			return;
		}

		const noteIdAtStart = selectedNote.id;
		console.log('[Notes TTS][Workspace] speaking note:', noteIdAtStart);
		stopSpeaking();

		const runId = ++speechRunId;
		const controller = new AbortController();
		activeSpeechController = controller;
		isSpeaking = true;

		try {
			const provider = await speakNoteText(text, {
				signal: controller.signal,
				onended: () => {
					console.log('[Notes TTS][Workspace] speech ended');
					if (runId !== speechRunId) return;
					isSpeaking = false;
					const advancedToNoteId = selectNextNoteInCurrentList(noteIdAtStart);
					if (advancedToNoteId) {
						console.log('[Notes TTS][Workspace] auto-advancing to next note:', advancedToNoteId);
						void tick().then(() => speakSelectedNote());
					}
				}
			});
			if (runId !== speechRunId || controller.signal.aborted) return;
			if (activeSpeechController === controller) activeSpeechController = null;
			console.log('[Notes TTS][Workspace] spoke with provider:', provider);
		} catch (error) {
			if (controller.signal.aborted) return;
			console.error('[Notes TTS][Workspace] speech error:', error);
			if (runId === speechRunId) {
				activeSpeechController = null;
				isSpeaking = false;
			}
		}
	}

	function toggleSpeech() {
		console.log('[Notes TTS][Workspace] toggleSpeech, currently speaking:', isSpeaking);
		if (isSpeaking) {
			stopSpeaking();
			return;
		}
		speakSelectedNote();
	}
</script>

{#snippet notesDeleteToolbarTrailing()}
	{#if selectedNote}
		<button
			type="button"
			onclick={deleteNote}
			class={notesDeleteToolbarButtonClass}
			aria-label="Delete note"
		>
			<Trash2 class="h-5 w-5" strokeWidth={2} />
		</button>
	{/if}
{/snippet}

{#snippet notesDesktopHeaderActions()}
	<button
		type="button"
		onclick={createNewNote}
		class={notesNewToolbarButtonClass}
		aria-label="New note"
	>
		<SquarePen class="h-5 w-5" strokeWidth={2} />
	</button>
	{#if selectedNote}
		<button
			type="button"
			onclick={deleteNote}
			class={notesDeleteToolbarButtonClass}
			aria-label="Delete note"
		>
			<Trash2 class="h-5 w-5" strokeWidth={2} />
		</button>
	{/if}
{/snippet}

{#snippet noteLinkControls()}
	{#if selectedNote}
		<div class="flex flex-wrap items-center gap-2">
			{#each getLinkedGoalIndices(selectedNote.id) as linkedGoal}
				<span class="inline-flex items-center gap-1 rounded-md border border-slate-400 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200">
					<a
						href={`/todo/${indexToNomenclature(linkedGoal)}?tab=notes`}
						class="underline-offset-2 hover:text-violet-600 hover:underline dark:hover:text-violet-300"
					>
						{getGoalLabelFromIndex(linkedGoal)}
					</a>
					<button
						type="button"
						class="text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200"
						aria-label={`Unlink ${getGoalLabelFromIndex(linkedGoal)}`}
						onclick={() => store.unlinkNoteFromGoal(selectedNote.id, linkedGoal)}
					>
						x
					</button>
				</span>
			{/each}
			{#if !linkPanelOpen}
				<button
					type="button"
					class="rounded border border-violet-400/40 px-2.5 py-1 text-xs font-medium text-violet-400 transition hover:bg-violet-500/15"
					onclick={openLinkPanel}
				>
					+ to goal
				</button>
			{:else}
				<div class="inline-flex w-52 max-w-full">
					<GoalSelect
						allGoals={allGoals}
						bind:value={linkGoalValue}
						includeUnassigned={false}
						includeNewList={false}
						stringValues={true}
					/>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="p-4 pb-24 md:p-8 md:pb-8">
	<div class="mx-auto max-w-7xl">
		{#if !mobileMenuOpen}
			<div class="mb-3 md:hidden">
				<WorkspaceToolbar
					mode="mobile"
					inputMode="none"
					showSidebarToggle={true}
					onSidebarToggle={() => (mobileMenuOpen = true)}
					showHamburger={false}
					composeTabDefault="note"
					onNew={createNewNote}
				>
					{#snippet trailing()}
						{@render notesDeleteToolbarTrailing()}
					{/snippet}
				</WorkspaceToolbar>
			</div>
		{/if}

		<div class="hidden gap-8 md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
		<aside class="h-[calc(100vh-5.5rem)] overflow-y-auto px-2 pt-2 pb-3">
			<h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">NOTES</h2>
			<div class="mb-3 px-1">
				<ClearableTextInput
					placeholder="Search..."
					bind:value={searchText}
					wrapperClass="relative w-full"
					class="w-full rounded-lg bg-slate-500/10 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-violet-500/50 dark:bg-slate-700/30 dark:text-slate-100 dark:placeholder-slate-500"
					clearLabel="Clear search"
				/>
			</div>
			{#if typeof scopedGoalIndex === 'number'}
				<div class="mb-2 flex items-center gap-2 px-1">
					<a
						href="/notes"
						onclick={() => store.clearLastOpenedNote()}
						class="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-500/10 dark:text-slate-400 dark:hover:bg-white/5"
						aria-label="Back to all notes"
					>
						<ChevronLeft class="h-4 w-4" />
					</a>
					<div class="min-w-0">
						<a
							href={`/todo/${indexToNomenclature(scopedGoalIndex)}`}
							class="truncate text-sm font-medium text-slate-800 underline-offset-2 hover:text-violet-600 hover:underline dark:text-slate-100 dark:hover:text-violet-300"
						>
							{getGoalLabelFromIndex(scopedGoalIndex)}
						</a>
					</div>
				</div>
			{/if}
			<div class="space-y-0.5">
				{#each filteredNotes as note (note.id)}
					<button
						type="button"
						onclick={() => selectNote(note.id)}
						class={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${
							selectedNote?.id === note.id
								? 'bg-violet-500/20 dark:bg-violet-500/25'
								: 'hover:bg-slate-500/10 dark:hover:bg-white/5'
						}`}
					>
						<div class="truncate font-semibold text-slate-900 dark:text-slate-100">{getNoteTitle(note.content)}</div>
						<div class="flex items-baseline gap-1.5 mt-0.5">
							<span class="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatUpdatedAt(note.updatedAt)}</span>
							{#if getNotePreview(note.content)}
								<span class="truncate text-xs text-slate-500 dark:text-slate-400">{getNotePreview(note.content)}</span>
							{/if}
						</div>
						{#if getNoteGoalLabel(note.id)}
							<div class="truncate text-xs text-slate-400 dark:text-slate-500 mt-0.5">{getNoteGoalLabel(note.id)}</div>
						{/if}
					</button>
				{/each}
			</div>
		</aside>

			<div class="min-w-0">
				{#if !dataLoaded}
					<div class="goal-loading-message py-10">Loading notes...</div>
				{:else if hasInvalidGoal}
					<div class="goal-loading-message py-10">Invalid goal filter.</div>
				{:else}
					{#if !selectedNote}
						<div class="mb-3 hidden justify-end md:flex">
							{@render notesDesktopHeaderActions()}
						</div>
						<div class="todo-empty-section-card">
							<p class="todo-empty-section-text">No notes yet for this view.</p>
						</div>
					{:else}
					<div class={`p-4 ${isEditing ? 'rounded-lg bg-white dark:bg-slate-900/70 dark:ring-1 dark:ring-slate-700/70' : 'todo-panel'}`}>
							{#if isEditing || isNoteEmpty(selectedNote)}
							<div class="mb-3 hidden justify-end md:flex">
								{@render notesDesktopHeaderActions()}
							</div>
							<NoteHybridMarkdownEditor
								bind:this={editEditorDesktop}
								bind:value={editContent}
								treatFirstLineAsTitle={true}
								minHeight="22rem"
								placeholder="Write in markdown. First line becomes the title."
							/>
					{:else}
					<div class="mb-3 flex items-center gap-2">
						<h1 class="min-w-0 flex-1 text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
							<button
								type="button"
								class="inline-block w-full cursor-text border-0 bg-transparent p-0 text-left font-semibold tracking-tight text-inherit outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
								onclick={enterEditMode}
							>
								{getNoteTitle(selectedNote.content)}
							</button>
						</h1>
						<button
							type="button"
							onclick={toggleSpeech}
							class="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-violet-500/10 hover:text-violet-400 dark:hover:text-violet-300"
							aria-label={isSpeaking ? 'Stop reading note aloud' : 'Read note aloud'}
							title={isSpeaking ? 'Stop reading' : 'Read aloud'}
						>
							{#if isSpeaking}
								<Square class="h-4 w-4" />
							{:else}
								<Volume2 class="h-4 w-4" />
							{/if}
						</button>
						<button
							type="button"
							onclick={() => (presentationOpen = true)}
							class="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-violet-500/10 hover:text-violet-400 dark:hover:text-violet-300"
							aria-label="Present note"
							title="Present fullscreen"
						>
							<Maximize2 class="h-4 w-4" />
						</button>
						<div class="hidden shrink-0 items-center gap-2 md:flex">
							{@render notesDesktopHeaderActions()}
						</div>
					</div>
					<div
						role="button"
						tabindex="0"
						class="notes-markdown-display markdown min-h-[22rem] !bg-transparent !border-transparent"
						onclick={enterEditMode}
						onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && enterEditMode()}
					>
						{@html renderNoteBodyMarkdown(selectedNote.content)}
					</div>
					{/if}

						<div class="mt-4 pt-4">
							{#if isEditing || isNoteEmpty(selectedNote)}
								<div class="space-y-3">
									{@render noteLinkControls()}
									<button
										type="button"
										onclick={saveNote}
										class="shrink-0 rounded-md border border-violet-600/70 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500"
									>
										Save
									</button>
								</div>
							{:else}
								{@render noteLinkControls()}
							{/if}
							<p class="hidden mt-3 text-xs text-slate-400">
								Updated {formatUpdatedAt(selectedNote.updatedAt)}
							</p>
						</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<div class="md:hidden overflow-hidden">
			<div
				class="flex w-[200%] transition-transform duration-300 ease-out"
				style={`transform: translateX(${mobileMenuOpen ? '0%' : '-50%'});`}
			>
				<div class="w-1/2 pr-4">
				<div class="h-[calc(100vh-8rem)] overflow-y-auto px-2 pt-2 pb-3">
					<h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">NOTES</h2>
					<div class="mb-3 px-1">
						<ClearableTextInput
							placeholder="Search..."
							bind:value={searchText}
							wrapperClass="relative w-full"
							class="w-full rounded-lg bg-slate-500/10 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-violet-500/50 dark:bg-slate-700/30 dark:text-slate-100 dark:placeholder-slate-500"
							clearLabel="Clear search"
						/>
					</div>
					{#if typeof scopedGoalIndex === 'number'}
						<div class="mb-2 flex items-center gap-2 px-1">
							<a
								href="/notes"
								onclick={() => store.clearLastOpenedNote()}
								class="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-500/10 dark:text-slate-400 dark:hover:bg-white/5"
								aria-label="Back to all notes"
							>
								<ChevronLeft class="h-4 w-4" />
							</a>
							<div class="min-w-0">
								<a
									href={`/todo/${indexToNomenclature(scopedGoalIndex)}`}
									class="truncate text-sm font-medium text-slate-800 underline-offset-2 hover:text-violet-600 hover:underline dark:text-slate-100 dark:hover:text-violet-300"
								>
									{getGoalLabelFromIndex(scopedGoalIndex)}
								</a>
							</div>
						</div>
					{/if}
					<div class="space-y-0.5">
						{#each filteredNotes as note (note.id)}
							<button
								type="button"
								onclick={() => selectNote(note.id)}
								class={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${
									selectedNote?.id === note.id
										? 'bg-violet-500/20 dark:bg-violet-500/25'
										: 'hover:bg-slate-500/10 dark:hover:bg-white/5'
								}`}
							>
								<div class="truncate font-semibold text-slate-900 dark:text-slate-100">{getNoteTitle(note.content)}</div>
								<div class="flex items-baseline gap-1.5 mt-0.5">
									<span class="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatUpdatedAt(note.updatedAt)}</span>
									{#if getNotePreview(note.content)}
										<span class="truncate text-xs text-slate-500 dark:text-slate-400">{getNotePreview(note.content)}</span>
									{/if}
								</div>
								{#if getNoteGoalLabel(note.id)}
									<div class="truncate text-xs text-slate-400 dark:text-slate-500 mt-0.5">{getNoteGoalLabel(note.id)}</div>
								{/if}
							</button>
						{/each}
					</div>
				</div>
				</div>

				<div class="w-1/2 pl-2">
					{#if !selectedNote}
						<div class="todo-empty-section-card">
							<p class="todo-empty-section-text">No notes yet for this view.</p>
						</div>
					{:else}
						{#if isEditing || isNoteEmpty(selectedNote)}
						<NoteHybridMarkdownEditor
							bind:this={editEditorMobile}
							bind:value={editContent}
							treatFirstLineAsTitle={true}
							minHeight="18rem"
							placeholder="Write in markdown. First line becomes the title."
						/>
					{:else}
					<div class="mb-3 flex items-start gap-2">
						<h1 class="min-w-0 flex-1 text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
							<button
								type="button"
								class="inline-block w-full cursor-text border-0 bg-transparent p-0 text-left font-semibold tracking-tight text-inherit outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
								onclick={enterEditMode}
							>
								{getNoteTitle(selectedNote.content)}
							</button>
						</h1>
						<button
							type="button"
							onclick={toggleSpeech}
							class="mt-0.5 shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-violet-500/10 hover:text-violet-400 dark:hover:text-violet-300"
							aria-label={isSpeaking ? 'Stop reading note aloud' : 'Read note aloud'}
							title={isSpeaking ? 'Stop reading' : 'Read aloud'}
						>
							{#if isSpeaking}
								<Square class="h-4 w-4" />
							{:else}
								<Volume2 class="h-4 w-4" />
							{/if}
						</button>
						<button
							type="button"
							onclick={() => (presentationOpen = true)}
							class="mt-0.5 shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-violet-500/10 hover:text-violet-400 dark:hover:text-violet-300"
							aria-label="Present note"
							title="Present fullscreen"
						>
							<Maximize2 class="h-4 w-4" />
						</button>
					</div>
				<div
					role="button"
					tabindex="0"
					class="notes-markdown-display markdown min-h-[18rem] !p-3 !bg-transparent !border-transparent"
					onclick={enterEditMode}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && enterEditMode()}
				>
					{@html renderNoteBodyMarkdown(selectedNote.content)}
				</div>
					{/if}

						<div class="my-4">
							{#if isEditing || isNoteEmpty(selectedNote)}
								<div class="space-y-3">
									{@render noteLinkControls()}
									<button
										type="button"
										onclick={saveNote}
										class="shrink-0 rounded-md border border-violet-600/70 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500"
									>
										Save
									</button>
								</div>
							{:else}
								{@render noteLinkControls()}
							{/if}
							<p class="hidden mt-3 text-xs text-slate-400">
								Updated {formatUpdatedAt(selectedNote.updatedAt)}
							</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

{#if presentationOpen && selectedNote}
	<NotesPresentationOverlay note={selectedNote} notes={filteredNotes} onclose={() => (presentationOpen = false)} />
{/if}
