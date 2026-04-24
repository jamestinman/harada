<script>
	import { cubicOut } from 'svelte/easing';
	import {
		indexToNomenclature,
		NEW_LIST_OPTION_VALUE,
		parseListSelection,
		renderMarkdown
	} from '$lib/todoUtils.js';
	import GoalSelect from './GoalSelect.svelte';
	import { ArrowRightToLine, ArrowLeftFromLine, ChevronDown, Check, Pin } from 'lucide-svelte';

	let { 
		todo,
		onUpdate,
		onDelete,
		onToggleStatus,
		allGoals = [],
		onCreateNext = null,
		onDeletePrevious = null,
		onMakeSubtask = null,
		onOutdent = null,
		allTodos = [],
		indentLevel = 0,
		canIndent = false,
		canOutdent = false,
		onTitleFocus = null,
		disableAutoFocus = false,
		hasChildren = false,
		isCollapsed = false,
		onToggleCollapse = null,
		/** Omit DOM id so duplicate pinned rows on /todo don’t steal querySelector from the canonical row */
		isFeedPinnedDuplicate = false,
		/** 'top' = pinned strip under + New task; 'inline' = same task under its goal on /todo */
		mainFeedPinStyle = null,
		linkedNotes = [],
		onUpsertLinkedNote = null,
		onCreateLinkedNote = null,
		onRemoveNoteLink = null
	} = $props();

	let isEditing = $state(false);
	let isEditingTitle = $state(false);
	let isEditingMarkdown = $state(false);
	let showMobileEditor = $state(false);
	let editTitle = $state('');
	let editMarkdown = $state('');
	let editListValue = $state('');
	let editNewListName = $state('');
	let editLinkedNotes = $state([]);
	let titleInputElement = $state(null);
	let markdownTextareaElement = $state(null);
	let markdownPreviewElement = $state(null);
	let isCreatingNext = $state(false);

	const hasNotes = $derived(
		linkedNotes.length > 0 || (typeof todo.markdown === 'string' && todo.markdown.trim().length > 0)
	);
	const inlineNotePreview = $derived.by(() => {
		const firstLinked = linkedNotes[0]?.content || '';
		const raw = (firstLinked || todo.markdown || '').trim();
		if (!raw) return '';
		const firstNonEmptyLine = raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0);
		if (!firstNonEmptyLine) return '';
		return firstNonEmptyLine
			.replace(/^#+\s*/, '')
			.replace(/[*_`~[\]]/g, '')
			.trim();
	});
	const isPinned = $derived(todo.pinned === true);
	const showOutdentAction = $derived(!canIndent && canOutdent);
	const isNewEmptyTodo = $derived(
		(!todo.title || todo.title.trim() === '') && 
		todo.createdAt && 
		Date.now() - todo.createdAt < 1000 // Created within last second
	);

	// Filter to only show goals with custom titles (not just the default nomenclature)
	const goalsWithTitles = $derived.by(() => {
		return allGoals.filter((goal) => {
			// A goal has a custom title if its label is different from its code
			return goal.label && goal.label !== goal.code;
		});
	});

	// Auto-start editing if this is a new empty todo (unless auto-focus is disabled)
	$effect(() => {
		if (isNewEmptyTodo && !isEditingTitle && !isEditing && !disableAutoFocus) {
			startEditingTitle();
		}
	});

	function handleCheckbox() {
		onToggleStatus();
	}

	function togglePinned(e) {
		e?.stopPropagation?.();
		onUpdate({ pinned: !isPinned });
	}

	function startEditingTitle() {
		editTitle = todo.title || '';
		isEditingTitle = true;
		if (onTitleFocus) onTitleFocus(todo.id);
		// Focus the input after it renders
		setTimeout(() => {
			if (titleInputElement) {
				titleInputElement.focus();
				if (titleInputElement.value === '') {
					titleInputElement.select();
				} else {
					const len = titleInputElement.value.length;
					titleInputElement.setSelectionRange(len, len);
				}
			}
		}, 0);
	}

	function saveTitle() {
		if (isCreatingNext) return; // Don't save if we're creating next
		if (editTitle.trim() !== (todo.title || '').trim()) {
			onUpdate({ title: editTitle.trim() });
		}
		isEditingTitle = false;
	}

	function handleTitleKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveTitle(); // Save before setting isCreatingNext so the guard doesn't block it
			isCreatingNext = true;
			// Create new todo below and focus it
			if (onCreateNext) {
				const newTodo = onCreateNext();
				if (newTodo) {
					// Click the edit button to enter edit mode (works even when disableAutoFocus=true),
					// then focus the input once it renders.
					requestAnimationFrame(() => {
						const nextTodoElement = document.querySelector(`[data-todo-item-id="${newTodo.id}"]`);
						const editButton = nextTodoElement?.querySelector('button.flex-1');
						if (editButton) {
							editButton.click();
						}
						const tryFocus = (attempts = 0) => {
							const nextInput = document.querySelector(`[data-todo-id="${newTodo.id}"]`);
							if (nextInput) {
								nextInput.focus();
								nextInput.select();
								isCreatingNext = false;
							} else if (attempts < 10) {
								setTimeout(() => tryFocus(attempts + 1), 20);
							} else {
								isCreatingNext = false;
							}
						};
						setTimeout(() => tryFocus(), 50);
					});
				} else {
					isCreatingNext = false;
				}
			} else {
				isCreatingNext = false;
			}
		} else if ((e.metaKey || e.ctrlKey) && e.code === 'BracketRight') {
			e.preventDefault();
			if (onMakeSubtask && canIndent) {
				onMakeSubtask();
			}
		} else if ((e.metaKey || e.ctrlKey) && e.code === 'BracketLeft') {
			e.preventDefault();
			if (onOutdent && canOutdent) {
				onOutdent();
			}
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			// If title is empty or will be empty after this keypress, delete and focus previous
			const trimmedTitle = editTitle.trim();
			const isCurrentlyEmpty = trimmedTitle === '';
			// For backspace: if length is 0 or 1, it will be empty after
			// For delete: if already empty, delete
			const willBeEmptyAfterKeypress = 
				(e.key === 'Backspace' && editTitle.length <= 1) ||
				(e.key === 'Delete' && isCurrentlyEmpty);
			
			if ((isCurrentlyEmpty || willBeEmptyAfterKeypress) && onDeletePrevious) {
				e.preventDefault();
				onDeletePrevious();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			// If this is a new empty todo, delete it like backspace would
			const trimmedTitle = editTitle.trim();
			const originalTrimmedTitle = (todo.title || '').trim();
			const isEmpty = trimmedTitle === '' && originalTrimmedTitle === '';
			
			if (isEmpty && isNewEmptyTodo && onDeletePrevious) {
				onDeletePrevious();
			} else {
				isEditingTitle = false;
				editTitle = todo.title || '';
			}
		}
	}

	function startEditingNotes() {
		editTitle = todo.title || '';
		editLinkedNotes = linkedNotes.length
			? linkedNotes.map((note) => ({ id: note.id, content: note.content || '' }))
			: [{ id: null, content: '' }];
		editMarkdown = todo.markdown || '';
		if (todo.listType === 'custom') {
			editListValue = NEW_LIST_OPTION_VALUE;
			editNewListName = todo.listName || '';
		} else {
			editListValue = typeof todo.goalIndex === 'number' ? String(todo.goalIndex) : '';
			editNewListName = '';
		}

		// Check if mobile (window width < 768px)
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			showMobileEditor = true;
		} else {
			isEditing = true;
			isEditingMarkdown = false;
		}
	}

	function enterMarkdownEdit() {
		if (isEditingMarkdown) return;
		const previewHeight = markdownPreviewElement?.offsetHeight ?? null;
		isEditingMarkdown = true;
		setTimeout(() => {
			if (markdownTextareaElement) {
				if (previewHeight) markdownTextareaElement.style.height = `${previewHeight}px`;
				markdownTextareaElement.focus();
				const len = markdownTextareaElement.value.length;
				markdownTextareaElement.setSelectionRange(len, len);
			}
		}, 0);
	}

	function saveChanges() {
		const listMeta = parseListSelection(editListValue, editNewListName);
		if (!listMeta) return;
		onUpdate({
			title: editTitle,
			...listMeta
		});
		if (onUpsertLinkedNote || onCreateLinkedNote) {
			for (const note of editLinkedNotes) {
				const content = (note?.content || '').trim();
				if (note?.id && onUpsertLinkedNote) {
					onUpsertLinkedNote(note.id, note.content || '');
					continue;
				}
				if (!note?.id && content && onCreateLinkedNote) {
					onCreateLinkedNote(content);
				}
			}
		}
		isEditing = false;
		isEditingMarkdown = false;
		showMobileEditor = false;
	}

	function addLinkedNoteDraft() {
		editLinkedNotes = [...editLinkedNotes, { id: null, content: '' }];
	}

	function removeLinkedNoteDraft(index) {
		const note = editLinkedNotes[index];
		if (note?.id && onRemoveNoteLink) {
			onRemoveNoteLink(note.id);
		}
		editLinkedNotes = editLinkedNotes.filter((_, i) => i !== index);
		if (editLinkedNotes.length === 0) {
			editLinkedNotes = [{ id: null, content: '' }];
		}
	}

	const selectedGoalIndexForMap = $derived.by(() => {
		if (editListValue === '' || editListValue === NEW_LIST_OPTION_VALUE) return null;
		const parsed = Number(editListValue);
		return Number.isNaN(parsed) ? null : parsed;
	});

	function cancelEdit() {
		isEditing = false;
		isEditingMarkdown = false;
		showMobileEditor = false;
	}

	function handleDelete() {
		onDelete();
		isEditing = false;
		showMobileEditor = false;
	}

	function sheet3d(_node, { duration = 220, distance = 20, angle = 3 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t, u) =>
				`transform: perspective(850px) translateY(${u * distance}px) rotateX(${u * angle}deg); opacity: ${t};`
		};
	}
</script>

<!-- Compact single-line view -->
{#if !isEditing}
	<div
		data-todo-item-id={isFeedPinnedDuplicate ? undefined : todo.id}
		class={`group task relative rounded-md transition-colors ${
			mainFeedPinStyle === 'top'
				? '!border-2 border-pink-400/50'
				: mainFeedPinStyle === 'inline'
					? ''
					: ''
		}`}
		style="margin-left: {indentLevel * 1.5}rem;"
	>
		<!-- Collapse toggle: absolutely positioned in the left padding so checkboxes always line up -->
		{#if hasChildren}
			<button
				type="button"
				onpointerdown={(e) => e.stopPropagation()}
				onclick={(e) => { e.stopPropagation(); onToggleCollapse && onToggleCollapse(); }}
				class="absolute -left-6 top-1/2 -translate-y-1/2 rounded p-0.5 transition todo-collapse-toggle"
				title={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
			>
				<ChevronDown class={`h-5 w-5 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`} />
			</button>
		{/if}

		<!-- Checkbox -->
		<button
			type="button"
			onclick={handleCheckbox}
			class={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
				todo.status === 'done'
					? 'border-emerald-500 bg-emerald-500 text-white'
					: 'todo-checkbox-todo'
			}`}
			title={todo.status === 'done' ? 'Mark as to-do' : 'Mark as done'}
		>
			{#if todo.status === 'done'}
				<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
				</svg>
			{/if}
		</button>

		<!-- Title - editable inline -->
		{#if isEditingTitle}
			<div class="flex-1 flex items-center gap-1">
				<input
					data-todo-id={todo.id}
					bind:this={titleInputElement}
					type="text"
					bind:value={editTitle}
					onfocus={() => onTitleFocus && onTitleFocus(todo.id)}
					onkeydown={handleTitleKeydown}
					onblur={() => {
						if (!isCreatingNext) {
							saveTitle();
						}
					}}
					class={`flex-1 px-2 py-1 text-base md:text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 ${
						todo.status === 'done' ? 'line-through opacity-70' : ''
					}`}
					placeholder="Untitled"
				/>
			</div>
		{:else}
			<button
				type="button"
				onclick={hasNotes ? startEditingNotes : startEditingTitle}
				class={`flex-1 text-left text-sm min-h-[1.5rem] py-1 transition ${
					todo.status === 'done'
						? 'line-through'
						: ''
				}`}
			>
				<div class="flex flex-col">
					<span class={!todo.title || todo.title.trim() === '' ? 'opacity-0' : ''}>
						{todo.title || '\u00A0'}
					</span>
					{#if hasNotes}
						<div class="max-h-16 overflow-hidden text-xs leading-relaxed opacity-70">
							{inlineNotePreview}
						</div>
					{/if}
				</div>
			</button>
		{/if}

		<!-- Notes button - opens full editor -->
		{#if isEditingTitle}
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => saveTitle()}
				class="flex-shrink-0 p-1 rounded text-emerald-400 transition hover:bg-emerald-500/20 hover:text-emerald-300"
				title="Save and close (don’t create new task)"
			>
				<Check class="w-4 h-4" />
			</button>
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => {
					if (!showOutdentAction && onMakeSubtask) {
						onMakeSubtask();
					} else if (onOutdent) {
						onOutdent();
					}
				}}
				disabled={!canIndent && !canOutdent}
				class={`flex-shrink-0 p-1 rounded transition ${
					canIndent || canOutdent
						? 'todo-indent-button-enabled'
						: 'todo-indent-button-disabled cursor-not-allowed'
				}`}
				title={showOutdentAction ? 'Outdent (Ctrl/Cmd+[)' : 'Indent (Ctrl/Cmd+])'}
			>
				{#if showOutdentAction}
					<ArrowLeftFromLine class="w-4 h-4" />
				{:else}
					<ArrowRightToLine class="w-4 h-4" />
				{/if}
			</button>
		{/if}
		<button
			type="button"
			onpointerdown={(e) => e.stopPropagation()}
			onclick={togglePinned}
			class={`flex-shrink-0 rounded p-1 transition ${
				isPinned
					? 'text-pink-400 hover:bg-pink-500/20 hover:text-pink-300'
					: 'text-slate-500 hover:bg-slate-700/50 hover:text-slate-300'
			}`}
			title={isPinned ? 'Unpin' : 'Pin to top of Todo feed'}
			aria-pressed={isPinned}
		>
			<Pin
				class={`h-4 w-4 ${isPinned ? '' : 'opacity-60'}`}
				strokeWidth={2}
				fill={isPinned ? 'currentColor' : 'none'}
			/>
		</button>
		<button
			type="button"
			onclick={startEditingNotes}
			class={`flex-shrink-0 transition ${
				hasNotes
					? 'todo-notes-button-has-notes'
					: 'todo-notes-button-empty'
			}`}
			title={hasNotes ? 'Edit notes' : 'Add notes'}
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
		</button>
	</div>
{:else}
	<!-- Desktop expanded editor -->
			<div class="desktop-expanded-editor">

    <!-- Title input -->
		<input
			type="text"
			bind:value={editTitle}
			placeholder="Task"
		/>

		<!-- Goal selection -->
		<div class="mb-3 flex flex-col gap-1">
			<GoalSelect
				allGoals={allGoals}
				bind:value={editListValue}
				includeUnassigned={true}
				includeNewList={false}
				hideWhenNoGoals={true}
				stringValues={true}
				unassignedLabel="No goal assigned"
			/>
		</div>

		<!-- Linked notes -->
		<div class="mb-3 space-y-2">
			{#each editLinkedNotes as linkedNote, idx (linkedNote.id || `draft-${idx}`)}
				<div class="space-y-1">
					<textarea
						bind:value={editLinkedNotes[idx].content}
						placeholder="Add note in markdown..."
					></textarea>
					<div class="flex justify-end">
						<button
							type="button"
							onclick={() => removeLinkedNoteDraft(idx)}
							class="rounded-md px-2 py-1 text-xs text-rose-300 transition hover:bg-rose-900/40"
						>
							Remove note
						</button>
					</div>
				</div>
			{/each}
			<button
				type="button"
				onclick={addLinkedNoteDraft}
				class="rounded-md px-2 py-1 text-xs text-violet-300 transition hover:bg-violet-900/40"
			>
				+ Add linked note
			</button>
		</div>


		<!-- Actions -->
		<div class="flex items-center justify-between gap-2">
			<button
				type="button"
				onclick={handleDelete}
				class="rounded-md px-3 py-1.5 text-sm font-medium text-rose-300 transition hover:bg-rose-900/40"
			>
				Delete
			</button>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={cancelEdit}
					class="todo-desktop-cancel"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={saveChanges}
					disabled={editListValue === NEW_LIST_OPTION_VALUE && !editNewListName.trim()}
					class="rounded-md border border-violet-600/70 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500"
				>
					Save
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Mobile bottom sheet editor -->
{#if showMobileEditor}
	<div
		class="composer-backdrop md:hidden"
		onclick={(e) => e.target === e.currentTarget && cancelEdit()}
		onkeydown={(e) => e.key === 'Escape' && cancelEdit()}
		role="button"
		tabindex="-1"
		aria-label="Close editor"
	>
		<div
			transition:sheet3d
			class="composer-panel"
		>
			<!-- Header -->
			<div class="mb-4 flex items-center justify-between">
				<h3 class="composer-title">Edit Todo</h3>
				<button
					type="button"
					onclick={cancelEdit}
					class="composer-close-button"
					aria-label="Close editor"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Title input -->
			<div class="mb-4">
				<input
					type="text"
					bind:value={editTitle}
					placeholder="Task"
					class="composer-input"
				/>
			</div>

			<!-- Goal selection -->
			<div class="mb-4 flex flex-col gap-1">
				<span class="todo-panel-label">
					Goal
				</span>
				<GoalSelect
					allGoals={allGoals}
					bind:value={editListValue}
					includeUnassigned={true}
					includeNewList={false}
					hideWhenNoGoals={true}
					stringValues={true}
					unassignedLabel="No goal assigned"
					selectClass="w-full"
				/>
			</div>

			<!-- Linked notes -->
			<div class="mb-4 space-y-2">
				{#each editLinkedNotes as linkedNote, idx (linkedNote.id || `mobile-draft-${idx}`)}
					<div class="space-y-1">
						<textarea
							bind:value={editLinkedNotes[idx].content}
							placeholder=""
							class="composer-textarea"
						></textarea>
						<div class="flex justify-end">
							<button
								type="button"
								onclick={() => removeLinkedNoteDraft(idx)}
								class="rounded-md px-2 py-1 text-xs text-rose-300 transition hover:bg-rose-900/40"
							>
								Remove note
							</button>
						</div>
					</div>
				{/each}
				<button
					type="button"
					onclick={addLinkedNoteDraft}
					class="rounded-md px-2 py-1 text-xs text-violet-300 transition hover:bg-violet-900/40"
				>
					+ Add linked note
				</button>
			</div>

			<!-- Actions -->
			<div class="flex flex-col gap-2">
				<button
					type="button"
					onclick={saveChanges}
					disabled={editListValue === NEW_LIST_OPTION_VALUE && !editNewListName.trim()}
					class="w-full rounded-md border border-violet-600/70 bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
				>
					Save
				</button>
				<button
					type="button"
					onclick={handleDelete}
					class="w-full rounded-md border border-rose-700/70 bg-rose-900/40 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-900/60"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
