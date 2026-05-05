<script>
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import {
		indexToNomenclature,
		renderMarkdown,
		handleMarkdownEditorKeydown
	} from '$lib/todoUtils.js';
	import { store } from '$stores/store.svelte.js';
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
		primaryNote = null,
		linkedNotes = [],
		onUpsertPrimaryNote = null,
		linkedGoalIndices = [],
		/** When set (from `?task=` query), empty tasks focus even if `disableAutoFocus` is true */
		pageTaskId = null
	} = $props();

	let isEditing = $state(false);
	let isEditingTitle = $state(false);
	let isEditingMarkdown = $state(false);
	let showMobileEditor = $state(false);
	let editTitle = $state('');
	let editMarkdown = $state('');
	let linkPanelOpen = $state(false);
	let linkGoalValue = $state('');
	let titleInputElement = $state(null);
	let markdownTextareaElement = $state(null);
	let markdownPreviewElement = $state(null);
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

	// Auto-start editing for a fresh empty todo, or when ?task= points at this empty row (e.g. + New task)
	$effect(() => {
		const allowRecentEmpty =
			isNewEmptyTodo && !disableAutoFocus && !isFeedPinnedDuplicate;
		const allowLinkedEmpty = isUrlTargetEmptyTodo;

		if (
			(allowRecentEmpty || allowLinkedEmpty) &&
			autoFocusedTodoId !== todo.id &&
			!isEditingTitle &&
			!isEditing
		) {
			autoFocusedTodoId = todo.id;
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

	async function startEditingTitle() {
		editTitle = todo.title || '';
		isEditingTitle = true;
		if (onTitleFocus) onTitleFocus(todo.id);
		await tick();
		// URL/deep-link + freshly inserted rows need a beat so the input mounts and scroll settles
		const delayMs =
			pageTaskId === todo.id ? 120 : isNewEmptyTodo ? 64 : 0;
		setTimeout(() => {
			const applyFocus = () => {
				if (!titleInputElement) return;
				titleInputElement.focus();
				if (titleInputElement.value === '') {
					titleInputElement.select();
				} else {
					const len = titleInputElement.value.length;
					titleInputElement.setSelectionRange(len, len);
				}
			};
			applyFocus();
			if (document.activeElement !== titleInputElement) {
				requestAnimationFrame(() => applyFocus());
			}
		}, delayMs);
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
		editMarkdown = taskNoteContent;
		linkPanelOpen = false;
		linkGoalValue = '';

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
		onUpdate({
			title: editTitle
		});
		if (onUpsertPrimaryNote) {
			onUpsertPrimaryNote(editMarkdown || '');
		}
		isEditing = false;
		isEditingMarkdown = false;
		showMobileEditor = false;
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

	const linkedGoalsForDisplay = $derived(
		[...new Set(linkedGoalIndices)].filter((idx) => typeof idx === 'number')
	);

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

{#snippet taskLinkControls()}
	<div class="flex flex-wrap items-center gap-2">
			{#each linkedGoalsForDisplay as linkedGoal}
				<span class="inline-flex items-center gap-1 rounded-md border border-slate-400 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200">
					<a
						href={`/todo/${indexToNomenclature(linkedGoal)}`}
						class="underline-offset-2 hover:text-violet-600 hover:underline dark:hover:text-violet-300"
					>
						{getGoalLabel(linkedGoal)}
					</a>
					<button
						type="button"
						class="text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200"
						aria-label={`Unlink ${getGoalLabel(linkedGoal)}`}
						onclick={() => store.unlinkTaskFromGoal(todo.id, linkedGoal)}
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
{/snippet}

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
				onclick={startEditingTitle}
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

		<!-- Links -->
		<div class="mb-3">
			{@render taskLinkControls()}
		</div>

		<!-- Primary note -->
		<div class="mb-3 space-y-2">
			<div class="space-y-1">
				{#if isEditingMarkdown || !editMarkdown.trim()}
					<textarea
						bind:this={markdownTextareaElement}
						bind:value={editMarkdown}
						placeholder="Task note"
						onkeydown={handleMarkdownEditorKeydown}
					></textarea>
				{:else}
					<div
						bind:this={markdownPreviewElement}
						role="button"
						tabindex="0"
						class="markdown cursor-text rounded-md border border-slate-700/70 p-3 text-sm transition hover:border-violet-500/40 hover:bg-violet-500/10"
						onclick={enterMarkdownEdit}
						onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && enterMarkdownEdit()}
					>
						{@html renderMarkdown(editMarkdown)}
					</div>
				{/if}
			</div>
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

			<!-- Links -->
			<div class="mb-4">
				<span class="todo-panel-label">Links</span>
				<div class="mt-2">
					{@render taskLinkControls()}
				</div>
			</div>

			<!-- Primary note -->
			<div class="mb-4 space-y-2">
				<div class="space-y-1">
					{#if isEditingMarkdown || !editMarkdown.trim()}
						<textarea
							bind:this={markdownTextareaElement}
							bind:value={editMarkdown}
							placeholder="Task note"
							class="composer-textarea"
							onkeydown={handleMarkdownEditorKeydown}
						></textarea>
					{:else}
						<div
							bind:this={markdownPreviewElement}
							role="button"
							tabindex="0"
							class="markdown cursor-text rounded-md border border-slate-700/70 bg-slate-950/20 p-3 text-sm transition hover:border-violet-500/40 hover:bg-violet-500/10"
							onclick={enterMarkdownEdit}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && enterMarkdownEdit()}
						>
							{@html renderMarkdown(editMarkdown)}
						</div>
					{/if}
				</div>
			</div>

			<!-- Actions -->
			<div class="flex flex-col gap-2">
				<button
					type="button"
					onclick={saveChanges}
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
