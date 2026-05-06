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
		renderNoteBodyMarkdown,
		handleMarkdownEditorKeydown
	} from '$lib/todoUtils.js';
	import GoalSelect from './GoalSelect.svelte';
	import WorkspaceToolbar from './WorkspaceToolbar.svelte';
	import { ChevronLeft, Trash2, Maximize2 } from 'lucide-svelte';
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
		if (isWorkspaceNarrowLayout() && readNotesMobileSidebarOpen()) {
			mobileMenuOpen = true;
		}
		mobileSidebarHydrated = true;
		const onResize = () => resizeTextarea({ force: true });
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
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
	let resumeNoteId = $state(store.lastOpenedNoteId);
	let isEditing = $state(false);
	let editContent = $state('');
	let linkPanelOpen = $state(false);
	let linkGoalValue = $state('');
	let hasPendingNoteLinkSave = $state(false);
	let editTextareaDesktop = $state(null);
	let editTextareaMobile = $state(null);
	/** Used so we refit height when the note changes, but not on every keystroke (preserves drag-resize). */
	let prevNoteIdForTextareaResize = null;
	let shouldAutoEdit = $state(false);
	let lastSavedContent = $state('');
  let previousSelectedNoteId = $state(null);

	var selectedNote = $derived.by(() => {
		if (selectedNoteId) {
			const fromId = filteredNotes.find((note) => note.id === selectedNoteId);
			if (fromId) return fromId;
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
		mobileMenuOpen = false;
	});

	// Restore the last-viewed note when navigating back to the notes section.
	$effect(() => {
		if (!resumeNoteId) return;
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
		return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
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

	function activeNoteTextareaEl() {
		if (!browser) return null;
		return window.matchMedia('(min-width: 768px)').matches ? editTextareaDesktop : editTextareaMobile;
	}

	function resizeTextarea(opts = {}) {
		const force = opts.force === true;
		const el = activeNoteTextareaEl();
		if (!el) return;
		const maxHeight = window.innerHeight - 64;
		const minHeight = 140;

		if (force) {
			el.style.height = 'auto';
			const h = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
			el.style.height = `${h}px`;
			el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
			return;
		}

		const prev = el.offsetHeight;
		el.style.height = 'auto';
		const needed = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
		if (needed > prev) {
			el.style.height = `${needed}px`;
		} else {
			el.style.height = `${prev}px`;
		}
		el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
	}

	$effect(() => {
		if (!browser || !isEditing) return;
		const id = selectedNote?.id;
		editContent;
		void tick().then(() => {
			const force = prevNoteIdForTextareaResize !== id;
			prevNoteIdForTextareaResize = id;
			resizeTextarea({ force });
		});
	});

	$effect(() => {
		if (!isEditing) prevNoteIdForTextareaResize = null;
	});

	function enterEditMode() {
		if (!selectedNote) return;
		if (isEditing) return;
		isEditing = true;
		setTimeout(() => {
			void tick().then(() => {
				resizeTextarea({ force: true });
				const el = activeNoteTextareaEl();
				el?.focus();
				el?.select();
			});
		}, 0);
	}

	const notesDeleteToolbarButtonClass =
		'shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-600/80 bg-rose-600 text-white transition hover:bg-rose-500';

	let presentationMode = $state(false);

	function enterPresentation() {
		if (!selectedNote || isEditing) return;
		presentationMode = true;
	}

	function exitPresentation() {
		presentationMode = false;
	}

	function presentationPrev() {
		const idx = filteredNotes.findIndex((n) => n.id === selectedNote?.id);
		if (idx > 0) selectNote(filteredNotes[idx - 1].id);
	}

	function presentationNext() {
		const idx = filteredNotes.findIndex((n) => n.id === selectedNote?.id);
		if (idx !== -1 && idx < filteredNotes.length - 1) selectNote(filteredNotes[idx + 1].id);
	}

	$effect(() => {
		if (!browser) return;
		function onKeydown(e) {
			if (!presentationMode) return;
			if (e.key === 'Escape') exitPresentation();
			else if (e.key === 'ArrowLeft') presentationPrev();
			else if (e.key === 'ArrowRight') presentationNext();
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

{#snippet presentationOverlay()}
	{#if presentationMode && selectedNote}
		{@const currentIdx = filteredNotes.findIndex((n) => n.id === selectedNote?.id)}
		{@const hasPrev = currentIdx > 0}
		{@const hasNext = currentIdx !== -1 && currentIdx < filteredNotes.length - 1}
		<div
			class="fixed inset-0 z-50 flex overflow-hidden bg-white dark:bg-slate-950"
			role="dialog"
			aria-modal="true"
		>
			<!-- Left click zone: previous note -->
			<button
				type="button"
				class="absolute inset-y-0 left-0 z-10 w-1/4 cursor-w-resize opacity-0"
				aria-label="Previous note"
				onclick={(e) => { e.stopPropagation(); presentationPrev(); }}
				disabled={!hasPrev}
			></button>

			<!-- Right click zone: next note -->
			<button
				type="button"
				class="absolute inset-y-0 right-0 z-10 w-1/4 cursor-e-resize opacity-0"
				aria-label="Next note"
				onclick={(e) => { e.stopPropagation(); presentationNext(); }}
				disabled={!hasNext}
			></button>

			<!-- Content: click to exit -->
			<div
				class="relative z-0 mx-auto w-full max-w-3xl cursor-pointer overflow-auto px-8 py-16 md:px-16 md:py-24"
				role="button"
				tabindex="0"
				aria-label="Exit presentation"
				onclick={exitPresentation}
				onkeydown={(e) => e.key === 'Enter' && exitPresentation()}
			>
				<h1 class="mb-8 text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl">
					{getNoteTitle(selectedNote.content)}
				</h1>
				<div class="presentation-markdown markdown prose prose-lg max-w-none dark:prose-invert">
					{@html renderNoteBodyMarkdown(selectedNote.content)}
				</div>
			</div>

			<!-- Subtle nav hints at edges -->
			{#if hasPrev}
				<div class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-700 text-3xl select-none">‹</div>
			{/if}
			{#if hasNext}
				<div class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-700 text-3xl select-none">›</div>
			{/if}
		</div>
	{/if}
{/snippet}

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

{#snippet noteLinkControls()}
	{#if selectedNote}
		<div class="flex flex-wrap items-center gap-2">
			{#each getLinkedGoalIndices(selectedNote.id) as linkedGoal}
				<span class="inline-flex items-center gap-1 rounded-md border border-slate-400 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200">
					<a
						href={`/todo/${indexToNomenclature(linkedGoal)}`}
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

{@render presentationOverlay()}

<div class="p-4 pb-24 md:p-8 md:pb-8">
	<div class="mx-auto max-w-7xl">
		<div class="mb-3 md:hidden">
			<WorkspaceToolbar
				mode="mobile"
				bind:searchText
				showSidebarToggle={!mobileMenuOpen}
				onSidebarToggle={() => (mobileMenuOpen = true)}
				showHamburger={false}
				composeTabDefault="note"
			>
				{#snippet trailing()}
					{@render notesDeleteToolbarTrailing()}
				{/snippet}
			</WorkspaceToolbar>
		</div>

		<div class="hidden gap-8 md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
			<aside class="todo-panel h-[calc(100vh-5.5rem)] overflow-y-auto p-3">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">NOTES</h2>
				{#if typeof scopedGoalIndex === 'number'}
					<div class="mb-3 flex items-center gap-2 p-1">
						<a
							href="/notes"
							onclick={() => store.clearLastOpenedNote()}
							class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-500 text-slate-700 transition hover:border-violet-500/60 hover:bg-violet-500/10 dark:text-slate-200"
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
				<div class="space-y-1.5">
					{#each filteredNotes as note (note.id)}
						<button
							type="button"
							onclick={() => selectNote(note.id)}
							class={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
								selectedNote?.id === note.id
									? 'border-violet-500/40 bg-violet-500/15'
									: 'border-slate-700/70 hover:border-violet-500/50 hover:bg-violet-500/10'
							}`}
						>
							<div class="flex items-center justify-between gap-2">
								<span class="truncate pr-2 font-semibold">{getNoteTitle(note.content)}</span>
							</div>
							<div class="truncate text-xs text-slate-400">{formatUpdatedAt(note.updatedAt)}</div>
						</button>
					{/each}
				</div>
			</aside>

			<div class="min-w-0">
				<div class="mb-6 hidden md:block">
					<WorkspaceToolbar mode="desktop" bind:searchText composeTabDefault="note">
						{#snippet trailing()}
							{@render notesDeleteToolbarTrailing()}
						{/snippet}
					</WorkspaceToolbar>
				</div>

				{#if !dataLoaded}
					<div class="goal-loading-message py-10">Loading notes...</div>
				{:else if hasInvalidGoal}
					<div class="goal-loading-message py-10">Invalid goal filter.</div>
				{:else}
					{#if !selectedNote}
						<div class="todo-empty-section-card">
							<p class="todo-empty-section-text">No notes yet for this view.</p>
						</div>
					{:else}
					<div class={`p-4 ${isEditing ? 'rounded-lg bg-white dark:bg-slate-900/70 dark:ring-1 dark:ring-slate-700/70' : 'todo-panel'}`}>
							{#if isEditing || isNoteEmpty(selectedNote)}
							<textarea
								bind:this={editTextareaDesktop}
								bind:value={editContent}
								class="composer-textarea notes-markdown-editor !min-h-0 resize-y"
								placeholder="Write in markdown. First line becomes the title."
								oninput={() => resizeTextarea({ force: false })}
								onkeydown={handleMarkdownEditorKeydown}
							></textarea>
					{:else}
					<div class="mb-3 flex items-start justify-between gap-2">
						<h1 class="flex-1 text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
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
							onclick={enterPresentation}
							class="shrink-0 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white p-1.5 text-slate-500 shadow-sm transition hover:border-violet-400 hover:text-violet-600 hover:shadow dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-violet-500 dark:hover:text-violet-400"
							aria-label="Enter presentation mode"
							title="Presentation mode"
						>
							<Maximize2 class="h-4 w-4" strokeWidth={1.75} />
						</button>
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
					<div class="todo-panel h-[calc(100vh-8rem)] overflow-y-auto p-3">
						<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">NOTES</h2>
						{#if typeof scopedGoalIndex === 'number'}
							<div class="mb-3 flex items-center gap-2 p-1">
								<a
									href="/notes"
									onclick={() => store.clearLastOpenedNote()}
									class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-500 text-slate-700 transition hover:border-violet-500/60 hover:bg-violet-500/10 dark:text-slate-200"
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
						<div class="space-y-1.5">
							{#each filteredNotes as note (note.id)}
								<button
									type="button"
									onclick={() => selectNote(note.id)}
									class={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
										selectedNote?.id === note.id
											? 'border-violet-500/40 bg-violet-500/15'
											: 'border-slate-700/70 hover:border-violet-500/50 hover:bg-violet-500/10'
									}`}
								>
									<div class="flex items-center justify-between gap-2">
										<span class="truncate pr-2 font-semibold">{getNoteTitle(note.content)}</span>
									</div>
									<div class="truncate text-xs text-slate-400">{formatUpdatedAt(note.updatedAt)}</div>
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
						<textarea
							bind:this={editTextareaMobile}
							bind:value={editContent}
							class="composer-textarea notes-markdown-editor !min-h-0 resize-y"
							placeholder="Write in markdown. First line becomes the title."
							oninput={() => resizeTextarea({ force: false })}
							onkeydown={handleMarkdownEditorKeydown}
						></textarea>
						{:else}
						<h1 class="mb-3 text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
							<button
								type="button"
								class="inline-block w-full cursor-text border-0 bg-transparent p-0 text-left font-semibold tracking-tight text-inherit outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
								onclick={enterEditMode}
							>
								{getNoteTitle(selectedNote.content)}
							</button>
						</h1>
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
