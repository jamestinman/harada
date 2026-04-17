<script>
	import { goto } from '$app/navigation';
	import { store } from '$stores/store.svelte.js';
	import {
		canonicalGoalIndex,
		indexToNomenclature,
		nomenclatureToIndex,
		getNoteTitle,
		renderNoteMarkdown
	} from '$lib/todoUtils.js';
	import GoalSelect from './GoalSelect.svelte';
	import { ChevronLeft } from 'lucide-svelte';

	let { goalParam = null } = $props();

	const grid = $derived(store.harada_chart.grid);
	const notes = $derived(store.notes);
	const dataLoaded = $derived(!store.isBootstrapping);
	let mobileMenuOpen = $state(false);

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
		if (typeof scopedGoalIndex !== 'number') return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
		return notes
			.filter((note) => note.goalIndex === scopedGoalIndex)
			.sort((a, b) => b.updatedAt - a.updatedAt);
	});

	const goalNotesCount = $derived.by(() => {
		if (typeof selectedNote?.goalIndex !== 'number') return 0;
		return notes.filter((n) => n.goalIndex === selectedNote.goalIndex).length;
	});

	const goalTodosCount = $derived.by(() => {
		if (typeof selectedNote?.goalIndex !== 'number') return 0;
		const listId = `goal:${selectedNote.goalIndex}`;
		return store.harada_chart.todos.filter(
			(t) => t.listId === listId && t.status !== 'done'
		).length;
	});

	let selectedNoteId = $state(null);
	let isEditing = $state(false);
	let editContent = $state('');
	let editGoalValue = $state('');
	let editTextareaElement = $state(null);
	let markdownPreviewElement = $state(null);
	let shouldAutoEdit = $state(false);
	let lastSavedContent = $state('');
	let lastSavedGoalIndex = $state(null);
let previousSelectedNoteId = $state(null);

	const selectedNote = $derived.by(() => {
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
		if (!selectedNote) {
			selectedNoteId = null;
			editContent = '';
			editGoalValue = '';
			lastSavedContent = '';
			lastSavedGoalIndex = null;
			isEditing = false;
			previousSelectedNoteId = null;
			return;
		}
		selectedNoteId = selectedNote.id;
		const selectedNoteChanged = selectedNote.id !== previousSelectedNoteId;
		previousSelectedNoteId = selectedNote.id;

		const content = selectedNote.content || '';
		const goalIndex =
			typeof selectedNote.goalIndex === 'number' ? selectedNote.goalIndex : null;

		editContent = content;
		editGoalValue = typeof goalIndex === 'number' ? String(goalIndex) : '';
		lastSavedContent = content;
		lastSavedGoalIndex = goalIndex;

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

async function showGoalNotesOnMobile(goalIndex) {
	if (typeof goalIndex !== 'number') return;
	mobileMenuOpen = true;
	await goto(`/notes/${indexToNomenclature(goalIndex)}`);
}

	function createNoteForCurrentView() {
		const goalIndex = typeof scopedGoalIndex === 'number' ? scopedGoalIndex : null;
		const note = store.createNote({ goalIndex, content: '' });
		selectedNoteId = note.id;
		editContent = '';
		editGoalValue = typeof goalIndex === 'number' ? String(goalIndex) : '';
		shouldAutoEdit = true;
		isEditing = true;
		mobileMenuOpen = false;
	}

	function getGoalIndexFromEditValue() {
		const parsedGoal = editGoalValue === '' ? null : canonicalGoalIndex(Number(editGoalValue));
		return Number.isNaN(parsedGoal) ? null : parsedGoal;
	}

	function saveNote() {
		if (!selectedNote) return;
		const goalIndex = getGoalIndexFromEditValue();
		const normalizedContent = editContent;
	const noteIsEmpty = normalizedContent.trim().length === 0;

		store.updateNote(selectedNote.id, {
			content: normalizedContent,
			goalIndex
		});

		lastSavedContent = normalizedContent;
		lastSavedGoalIndex = goalIndex;
	isEditing = noteIsEmpty;
	}

	function handleTextareaBlur() {
		if (!selectedNote) return;
		if (!isEditing) return;

		const goalIndex = getGoalIndexFromEditValue();
		const content = editContent;
	const noteIsEmpty = content.trim().length === 0;

		const changed = content !== lastSavedContent || goalIndex !== lastSavedGoalIndex;
		if (!changed) {
		isEditing = noteIsEmpty;
			return;
		}

		saveNote();
	}

	function deleteNote() {
		if (!selectedNote) return;
		const deletingId = selectedNote.id;
		store.deleteNote(deletingId);
		const remaining = filteredNotes.filter((note) => note.id !== deletingId);
		selectedNoteId = remaining[0]?.id || null;
		isEditing = false;
	}

	function selectNote(noteId) {
		selectedNoteId = noteId;
		isEditing = false;
		shouldAutoEdit = false;
		mobileMenuOpen = false;
	}

	function enterEditMode() {
		if (!selectedNote) return;
		if (isEditing) return;
		const previewHeight = markdownPreviewElement?.offsetHeight ?? null;
		isEditing = true;
		setTimeout(() => {
			if (editTextareaElement) {
				if (previewHeight) editTextareaElement.style.height = `${previewHeight}px`;
				editTextareaElement.focus();
				editTextareaElement.select();
			}
		}, 0);
	}
</script>

<div class="p-4 pb-24 md:p-8 md:pb-8">
	<div class="mx-auto max-w-7xl">
		<div class="hidden gap-8 md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
			<aside class="todo-panel h-[calc(100vh-5.5rem)] overflow-y-auto p-3">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">NOTES</h2>
				{#if typeof scopedGoalIndex === 'number'}
					<div class="mb-3 flex items-center gap-2 p-1">
						<a
							href="/notes"
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
				<div class="mt-3">
					<button type="button" onclick={createNoteForCurrentView} class="rounded-btn w-full">+ New note</button>
				</div>
			</aside>

			<div class="min-w-0">
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
					<div class="todo-panel p-4">
						<div class="mb-3 flex items-start justify-between gap-2">
							<div>
								<h2 class="text-lg font-semibold">{getNoteTitle(selectedNote.content)}</h2>
								<p class="mt-0.5 text-xs text-slate-400">Updated {formatUpdatedAt(selectedNote.updatedAt)}</p>
								{#if !(isEditing || isNoteEmpty(selectedNote)) && typeof selectedNote.goalIndex === 'number'}
									<div class="mt-2 flex items-center gap-2">
										<span class="text-xs text-slate-400">{getGoalLabelFromIndex(selectedNote.goalIndex)}</span>
										<span class="text-slate-600">·</span>
										<a
											href={`/notes/${indexToNomenclature(selectedNote.goalIndex)}`}
											class="rounded border border-violet-400/40 bg-violet-500/5 px-2.5 py-1 text-xs font-medium text-violet-400 transition hover:bg-violet-500/15"
										>
											{goalNotesCount} note{goalNotesCount === 1 ? '' : 's'}
										</a>
										<a
											href={`/todo/${indexToNomenclature(selectedNote.goalIndex)}`}
											class="rounded border border-violet-400/40 bg-violet-500/5 px-2.5 py-1 text-xs font-medium text-violet-400 transition hover:bg-violet-500/15"
										>
											{goalTodosCount} task{goalTodosCount === 1 ? '' : 's'}
										</a>
									</div>
								{/if}
						</div>
						<div class="flex shrink-0 gap-2">
								{#if isEditing || isNoteEmpty(selectedNote)}
									<button type="button" onclick={saveNote} class="rounded-md border border-violet-600/70 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500">Save</button>
								{/if}
								<button type="button" onclick={deleteNote} class="rounded-md border border-rose-600/70 bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-500">Delete</button>
							</div>
						</div>

							{#if isEditing || isNoteEmpty(selectedNote)}
								<div class="mb-3 max-w-xs">
									<GoalSelect
										allGoals={allGoals}
										bind:value={editGoalValue}
										includeUnassigned={true}
										includeNewList={false}
										stringValues={true}
										unassignedLabel="No goal association"
									/>
								</div>
								<textarea
									bind:this={editTextareaElement}
									bind:value={editContent}
									class="composer-textarea min-h-[22rem]"
									placeholder="Write in markdown. First line becomes the title."
									onblur={handleTextareaBlur}
								></textarea>
						{:else}
							<div
								bind:this={markdownPreviewElement}
								role="button"
								tabindex="0"
								class="notes-markdown-display markdown min-h-[22rem]"
								onclick={enterEditMode}
								onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && enterEditMode()}
							>
								{@html renderNoteMarkdown(selectedNote.content)}
							</div>
						{/if}
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
							<button type="button" onclick={createNoteForCurrentView} class="rounded-btn w-full">+ New note</button>
						</div>
					</div>
				</div>

				<div class="w-1/2 pl-2">
					<div class="mb-3">
						<button
							type="button"
							onclick={() => (mobileMenuOpen = true)}
							class="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-sm transition hover:border-violet-500/60 hover:bg-violet-500/10"
						>
							<ChevronLeft class="h-4 w-4" />
						</button>
					</div>
					{#if !selectedNote}
						<div class="todo-empty-section-card">
							<p class="todo-empty-section-text">No notes yet for this view.</p>
						</div>
					{:else}
					<div class="mb-3">
						<h1 class="mb-0.5">{getNoteTitle(selectedNote.content)}</h1>
						<p class="text-xs text-slate-400">Updated {formatUpdatedAt(selectedNote.updatedAt)}</p>
						{#if !(isEditing || isNoteEmpty(selectedNote)) && typeof selectedNote.goalIndex === 'number'}
							<div class="mt-2 flex flex-wrap items-center gap-2">
								<span class="text-xs text-slate-400">{getGoalLabelFromIndex(selectedNote.goalIndex)}</span>
								<span class="text-slate-600">·</span>
								<a
									href={`/notes/${indexToNomenclature(selectedNote.goalIndex)}`}
									onclick={async (event) => {
										event.preventDefault();
										await showGoalNotesOnMobile(selectedNote.goalIndex);
									}}
									class="rounded border border-violet-400/40 bg-violet-500/5 px-2.5 py-1 text-xs font-medium text-violet-400 transition hover:bg-violet-500/15"
								>
									{goalNotesCount} note{goalNotesCount === 1 ? '' : 's'}
								</a>
								<a
									href={`/todo/${indexToNomenclature(selectedNote.goalIndex)}`}
									class="rounded border border-violet-400/40 bg-violet-500/5 px-2.5 py-1 text-xs font-medium text-violet-400 transition hover:bg-violet-500/15"
								>
									{goalTodosCount} task{goalTodosCount === 1 ? '' : 's'}
								</a>
							</div>
						{/if}
					</div>
					<div class="mb-3 flex gap-2">
						{#if isEditing || isNoteEmpty(selectedNote)}
							<button type="button" onclick={saveNote} class="rounded-md border border-violet-600/70 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500">Save</button>
						{/if}
						<button type="button" onclick={deleteNote} class="rounded-md border border-rose-600/70 bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-500">Delete</button>
					</div>
						{#if isEditing || isNoteEmpty(selectedNote)}
							<div class="mb-3">
								<GoalSelect
									allGoals={allGoals}
									bind:value={editGoalValue}
									includeUnassigned={true}
									includeNewList={false}
									stringValues={true}
									unassignedLabel="No goal association"
								/>
							</div>
							<textarea
								bind:this={editTextareaElement}
								bind:value={editContent}
								class="composer-textarea min-h-[18rem]"
								placeholder="Write in markdown. First line becomes the title."
								onblur={handleTextareaBlur}
							></textarea>
						{:else}
						<div
							bind:this={markdownPreviewElement}
							role="button"
							tabindex="0"
							class="notes-markdown-display markdown min-h-[18rem] !p-3"
							onclick={enterEditMode}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && enterEditMode()}
						>
							{@html renderNoteMarkdown(selectedNote.content)}
						</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
