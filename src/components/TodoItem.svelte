<script>
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import {
		indexToNomenclature
	} from '$lib/todoUtils.js';
	import { store } from '$stores/store.svelte.js';
	import { todoEditorStore } from '$stores/todoEditor.svelte.js';
	import GoalSelect from './GoalSelect.svelte';
	import NoteHybridMarkdownEditor from './NoteHybridMarkdownEditor.svelte';
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
		indentLevel = 0,
		/** Per-column flag indicating whether the tree-line at that ancestor column
		 *  continues past this row (true) or terminates at the elbow (false).
		 *  Length should equal `indentLevel`. Null/empty for unindented rows. */
		treeContinues = null,
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
		primaryNote = null,
		linkedNotes = [],
		onUpsertPrimaryNote = null,
		linkedGoalIndices = [],
		/** When set (from `?task=` query), empty tasks focus even if `disableAutoFocus` is true */
		pageTaskId = null,
		isHighlighted = false,
		/** Parent requested title edit + focus (e.g. Return → new task below) */
		focusTitle = false,
		onFocusTitleHandled = null
	} = $props();

	let isEditing = $state(false);
	let isEditingTitle = $state(false);
	let showMobileEditor = $state(false);
	let editTitle = $state('');
	let editMarkdown = $state('');
	let linkPanelOpen = $state(false);
	let linkGoalValue = $state('');
	let titleInputElement = $state(null);
	let markdownEditorElement = $state(null);
	let isCreatingNext = $state(false);
	let autoFocusedTodoId = $state(null);

	const taskNoteContent = $derived(
		(primaryNote?.content || todo.markdown || linkedNotes[0]?.content || '')
	);
	const hasPrimaryNote = $derived(taskNoteContent.trim().length > 0);
	const hasNotes = $derived(hasPrimaryNote);
	const inlineNotePreview = $derived.by(() => {
		const raw = taskNoteContent.trim();
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
	const isEmptyTitle = $derived(!todo.title || todo.title.trim() === '');
	const isNewEmptyTodo = $derived(
		isEmptyTitle && todo.createdAt && Date.now() - todo.createdAt < 1000
	);
	const isUrlTargetEmptyTodo = $derived(
		pageTaskId === todo.id && isEmptyTitle && !isFeedPinnedDuplicate
	);

	// Filter to only show goals with custom titles (not just the default nomenclature)
	const goalsWithTitles = $derived.by(() => {
		return allGoals.filter((goal) => {
			// A goal has a custom title if its label is different from its code
			return goal.label && goal.label !== goal.code;
		});
	});

	// Auto-start editing for a fresh empty todo, when ?task= points at this row, or parent focus request.
	$effect(() => {
		const allowRecentEmpty =
			isNewEmptyTodo && !disableAutoFocus && !isFeedPinnedDuplicate;
		const allowLinkedEmpty = isUrlTargetEmptyTodo;
		const allowParentFocus = focusTitle && !isFeedPinnedDuplicate;

		if (
			(allowRecentEmpty || allowLinkedEmpty || allowParentFocus) &&
			autoFocusedTodoId !== todo.id &&
			!isEditingTitle &&
			!isEditing
		) {
			autoFocusedTodoId = todo.id;
			const syncHighlight = allowRecentEmpty || allowLinkedEmpty;
			void startEditingTitle({ syncHighlight }).then(() => {
				if (allowParentFocus) onFocusTitleHandled?.();
			});
		}
	});

	function handleCheckbox() {
		onToggleStatus();
	}

	function togglePinned(e) {
		e?.stopPropagation?.();
		onUpdate({ pinned: !isPinned });
	}

	async function startEditingTitle({ syncHighlight = true } = {}) {
		editTitle = todo.title || '';
		isEditingTitle = true;
		if (syncHighlight && onTitleFocus) onTitleFocus(todo.id);
		await tick();
		if (!titleInputElement) return;
		titleInputElement.focus();
		if (titleInputElement.value === '') {
			titleInputElement.select();
		} else {
			const len = titleInputElement.value.length;
			titleInputElement.setSelectionRange(len, len);
		}
	}

	function saveTitle(syncHighlight = true) {
		if (isCreatingNext) return; // Don't save if we're creating next
		if (editTitle.trim() !== (todo.title || '').trim()) {
			onUpdate({ title: editTitle.trim() });
		}
		isEditingTitle = false;
		if (syncHighlight && onTitleFocus) onTitleFocus(todo.id);
	}

	function handleTitleKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveTitle(false);
			isCreatingNext = true;
			onCreateNext?.();
			requestAnimationFrame(() => {
				isCreatingNext = false;
			});
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

	function isMobileEditor() {
		return typeof window !== 'undefined' && window.innerWidth < 768;
	}

	function focusMarkdownEditor() {
		setTimeout(() => {
			markdownEditorElement?.focusEnd();
		}, 0);
	}

	function openExpandedEditor({ title, markdown, focusNote = !markdown.trim() } = {}) {
		editTitle = title;
		editMarkdown = markdown;
		linkPanelOpen = false;
		linkGoalValue = '';
		if (onTitleFocus) onTitleFocus(todo.id);

		if (isMobileEditor()) {
			showMobileEditor = true;
			isEditing = false;
		} else {
			isEditing = true;
			showMobileEditor = false;
		}
		if (focusNote) focusMarkdownEditor();
	}

	function startEditingNotes() {
		const title = todo.title || '';
		const markdown = taskNoteContent;
		todoEditorStore.open(todo.id, { title, markdown });
		openExpandedEditor({ title, markdown });
	}

	function restoreExpandedEditorIfNeeded() {
		if (isFeedPinnedDuplicate) return;
		if (todoEditorStore.expandedTaskId !== todo.id) return;
		if (isEditing || showMobileEditor) return;
		const title = todoEditorStore.draftTitle || todo.title || '';
		const markdown = todoEditorStore.draftMarkdown || taskNoteContent;
		openExpandedEditor({ title, markdown });
	}

	function saveChanges() {
		onUpdate({
			title: editTitle
		});
		if (onUpsertPrimaryNote) {
			onUpsertPrimaryNote(editMarkdown || '');
		}
		todoEditorStore.close(todo.id);
		isEditing = false;
		showMobileEditor = false;
		if (onTitleFocus) onTitleFocus(todo.id);
	}

	function getGoalLabel(goalIndex) {
		const goal = goalsWithTitles.find((item) => item.index === goalIndex);
		return goal?.label || indexToNomenclature(goalIndex);
	}

	function openLinkPanel() {
		linkGoalValue = '';
		linkPanelOpen = true;
	}

	function addSelectedLink() {
		const parsedGoal = linkGoalValue === '' ? null : Number(linkGoalValue);
		if (typeof parsedGoal === 'number' && !Number.isNaN(parsedGoal)) {
			store.linkTaskToGoal(todo.id, parsedGoal);
		}
		linkPanelOpen = false;
		linkGoalValue = '';
	}

	$effect(() => {
		if (!linkPanelOpen) return;
		const parsedGoal = linkGoalValue === '' ? null : Number(linkGoalValue);
		if (typeof parsedGoal === 'number' && !Number.isNaN(parsedGoal)) {
			addSelectedLink();
		}
	});

	$effect(() => {
		if (isFeedPinnedDuplicate) return;
		if (todoEditorStore.expandedTaskId === todo.id && (isEditing || showMobileEditor)) {
			todoEditorStore.syncDraft({ title: editTitle, markdown: editMarkdown });
		}
	});

	$effect(() => {
		if (isFeedPinnedDuplicate) return;
		todoEditorStore.expandedTaskId;
		linkedGoalIndices;
		restoreExpandedEditorIfNeeded();
	});

	const linkedGoalsForDisplay = $derived(
		[...new Set(linkedGoalIndices)].filter((idx) => typeof idx === 'number')
	);

	function cancelEdit() {
		todoEditorStore.close(todo.id);
		isEditing = false;
		showMobileEditor = false;
	}

	function handleDelete() {
		todoEditorStore.close(todo.id);
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

{#snippet taskLinkControls()}
	<div class="flex flex-wrap items-center gap-1.5">
			{#each linkedGoalsForDisplay as linkedGoal}
				<span class="task-link-chip">
					<a
						href={`/todo/${indexToNomenclature(linkedGoal)}`}
						class="underline-offset-2 hover:text-violet-600 hover:underline dark:hover:text-violet-300"
					>
						{getGoalLabel(linkedGoal)}
					</a>
					<button
						type="button"
						class="text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-300"
						aria-label={`Unlink ${getGoalLabel(linkedGoal)}`}
						onclick={() => store.unlinkTaskFromGoal(todo.id, linkedGoal)}
					>
						×
					</button>
				</span>
			{/each}
			{#if !linkPanelOpen}
				<button
					type="button"
					class="task-link-add-button"
					onclick={openLinkPanel}
				>
					+ link goal
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
{/snippet}

<!-- Compact single-line view -->
{#if !isEditing}
	<div
		data-todo-item-id={isFeedPinnedDuplicate ? undefined : todo.id}
		class={`group task ${
			isHighlighted ? 'rounded-md' : ''
		} ${mainFeedPinStyle === 'top' ? 'task-pinned-top' : ''}`}
		style="margin-left: {indentLevel * 1.5}rem;"
	>
		{#if indentLevel > 0 && Array.isArray(treeContinues) && treeContinues.length === indentLevel}
			{#each treeContinues as continues, c}
				{@const offsetRem = (c - indentLevel) * 1.5 + 1.375}
				{#if c < indentLevel - 1}
					{#if continues}
						<span class="task-tree-line" style="left: {offsetRem}rem;" aria-hidden="true"></span>
					{/if}
				{:else}
					<span class="task-tree-elbow" style="left: {offsetRem}rem;" aria-hidden="true"></span>
					{#if continues}
						<span class="task-tree-line-half" style="left: {offsetRem}rem;" aria-hidden="true"></span>
					{/if}
				{/if}
			{/each}
		{/if}
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
					: `todo-checkbox-todo`
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
			<div
				role="button"
				tabindex="0"
				onclick={() => startEditingTitle()}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						startEditingTitle();
					}
				}}
				class={`flex-1 text-left text-sm min-h-[1.5rem] py-1 transition cursor-text ${
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
						<div
							role="button"
							tabindex="0"
							class="max-h-16 overflow-hidden text-xs leading-relaxed opacity-70"
							onclick={(e) => { e.stopPropagation(); startEditingNotes(); }}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.stopPropagation(), startEditingNotes())}
						>
							{inlineNotePreview}
						</div>
					{/if}
				</div>
			</div>
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
			{#if canOutdent}
				<button
					type="button"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => onOutdent && onOutdent()}
					class="flex-shrink-0 p-1 rounded transition todo-indent-button-enabled"
					title="Outdent (Ctrl/Cmd+[)"
				>
					<ArrowLeftFromLine class="w-4 h-4" />
				</button>
			{/if}
			{#if canIndent}
				<button
					type="button"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => onMakeSubtask && onMakeSubtask()}
					class="flex-shrink-0 p-1 rounded transition todo-indent-button-enabled"
					title="Indent (Ctrl/Cmd+])"
				>
					<ArrowRightToLine class="w-4 h-4" />
				</button>
			{/if}
		{/if}
		<button
			type="button"
			onpointerdown={(e) => e.stopPropagation()}
			onclick={togglePinned}
			class={`flex-shrink-0 rounded p-1 transition ${
				isPinned
					? 'text-pink-400 hover:bg-pink-500/20 hover:text-pink-300'
					: isHighlighted
						? '!text-black hover:!text-black hover:bg-black/10'
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
					: isHighlighted
						? 'rounded p-1 !text-black hover:!text-black hover:bg-black/10'
						: 'todo-notes-button-empty'
			}`}
			title={hasNotes ? 'Edit notes' : 'Add notes'}
		>
			<svg
				class={`h-4 w-4 ${hasNotes ? '' : isHighlighted ? 'opacity-60' : ''}`}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
		</button>
	</div>
{:else}
	<!-- Desktop expanded editor -->
	<div class="desktop-expanded-editor" style="margin-left: {indentLevel * 1.5}rem;">
		<input
			type="text"
			bind:value={editTitle}
			placeholder="Task title"
			class="task-edit-title"
		/>

		{@render taskLinkControls()}

		<NoteHybridMarkdownEditor
			bind:this={markdownEditorElement}
			bind:value={editMarkdown}
			placeholder="Add a note..."
			minHeight="4.5rem"
			class="task-edit-note"
		/>

		<div class="task-edit-actions">
			<div class="ml-auto flex items-center gap-1">
				<button
					type="button"
					onclick={handleDelete}
					class="task-edit-delete-button"
				>
					Delete
				</button>
				<button
					type="button"
					onclick={cancelEdit}
					class="task-edit-cancel-button"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={saveChanges}
					class="task-edit-save-button"
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
		class="md:hidden"
		onclick={(e) => e.target === e.currentTarget && cancelEdit()}
		onkeydown={(e) => e.key === 'Escape' && cancelEdit()}
		role="button"
		tabindex="-1"
		aria-label="Close editor"
	>
		<div
			transition:sheet3d
			class="composer-panel !rounded-2xl"
		>
			<input
				type="text"
				bind:value={editTitle}
				placeholder="Task title"
				class="composer-title-input"
			/>

			{@render taskLinkControls()}

			<NoteHybridMarkdownEditor
				bind:this={markdownEditorElement}
				bind:value={editMarkdown}
				placeholder="Add a note…"
				minHeight="8rem"
				class="task-edit-note mt-3"
			/>

			<div class="task-edit-actions">
				<div class="ml-auto flex items-center gap-1">
					<button
						type="button"
						onclick={handleDelete}
						class="task-edit-delete-button"
					>
						Delete
					</button>
					<button
						type="button"
						onclick={cancelEdit}
						class="task-edit-cancel-button"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={saveChanges}
						class="task-edit-save-button"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
