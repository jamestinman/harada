<script>
	import { indexToNomenclature } from '$lib/todoUtils.js';
	import SquareMap from './SquareMap.svelte';
	import { ArrowRightToLine, ArrowLeftFromLine } from 'lucide-svelte';

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
		onTitleFocus = null
	} = $props();

	let isEditing = $state(false);
	let isEditingTitle = $state(false);
	let showMobileEditor = $state(false);
	let editTitle = $state('');
	let editMarkdown = $state('');
	let editGoalIndex = $state(null);
	let titleInputElement = $state(null);
	let isCreatingNext = $state(false);

	const hasNotes = $derived((todo.markdown || '').trim().length > 0);
	const showOutdentAction = $derived(!canIndent && canOutdent);
	const isNewEmptyTodo = $derived(
		(!todo.title || todo.title.trim() === '') && 
		todo.createdAt && 
		Date.now() - todo.createdAt < 1000 // Created within last second
	);

	// Auto-start editing if this is a new empty todo
	$effect(() => {
		if (isNewEmptyTodo && !isEditingTitle && !isEditing) {
			startEditingTitle();
		}
	});

	function handleCheckbox() {
		onToggleStatus();
	}

	function startEditingTitle() {
		editTitle = todo.title || '';
		isEditingTitle = true;
		if (onTitleFocus) onTitleFocus(todo.id);
		// Focus the input after it renders
		setTimeout(() => {
			if (titleInputElement) {
				titleInputElement.focus();
				titleInputElement.select();
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
			isCreatingNext = true;
			saveTitle();
			// Create new todo below and focus it
			if (onCreateNext) {
				const newTodo = onCreateNext();
				if (newTodo) {
					// The new todo will auto-start editing via the effect
					// Just ensure focus happens after a brief delay for DOM update
					setTimeout(() => {
						const nextInput = document.querySelector(`[data-todo-id="${newTodo.id}"]`);
						if (nextInput) {
							nextInput.focus();
							nextInput.select();
						}
						isCreatingNext = false;
					}, 100);
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
			isEditingTitle = false;
			editTitle = todo.title || '';
		}
	}

	function startEditingNotes() {
		editTitle = todo.title || '';
		editMarkdown = todo.markdown || '';
		editGoalIndex = todo.goalIndex;
		
		// Check if mobile (window width < 768px)
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			showMobileEditor = true;
		} else {
			isEditing = true;
		}
	}

	function saveChanges() {
		onUpdate({
			title: editTitle,
			markdown: editMarkdown,
			goalIndex: editGoalIndex
		});
		isEditing = false;
		showMobileEditor = false;
	}

	function cancelEdit() {
		isEditing = false;
		showMobileEditor = false;
	}

	function handleDelete() {
		onDelete();
		isEditing = false;
		showMobileEditor = false;
	}
</script>

<!-- Compact single-line view -->
{#if !isEditing}
	<div data-todo-item-id={todo.id} class="group flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-950/40 px-3 py-2 transition hover:border-slate-600 hover:bg-slate-900/50" style="margin-left: {indentLevel * 1.5}rem;">
		<!-- Checkbox -->
		<button
			type="button"
			onclick={handleCheckbox}
			class={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
				todo.status === 'done'
					? 'border-emerald-500 bg-emerald-500 text-white'
					: 'border-slate-600 hover:border-slate-500'
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
					class={`flex-1 rounded border border-violet-500 bg-slate-900 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-violet-500/50 ${
						todo.status === 'done'
							? 'text-slate-500 line-through'
							: 'text-slate-200'
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
						? 'text-slate-500 line-through'
						: 'text-slate-200 hover:text-slate-100'
				}`}
			>
				<span class={!todo.title || todo.title.trim() === '' ? 'opacity-0' : ''}>
					{todo.title || '\u00A0'}
				</span>
			</button>
		{/if}

		<!-- Notes button - opens full editor -->
		{#if isEditingTitle}
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
						? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
						: 'text-slate-700 cursor-not-allowed'
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
			onclick={startEditingNotes}
			class={`flex-shrink-0 transition ${
				hasNotes
					? 'text-slate-400 hover:text-slate-300'
					: 'text-slate-600 hover:text-slate-400'
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
	<div class="rounded-lg border border-slate-600 bg-slate-900/60 p-4">
		<!-- Title input -->
		<input
			type="text"
			bind:value={editTitle}
			placeholder="Todo title"
			class="mb-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
		/>

		<!-- Notes -->
		<div class="mb-3">
			<textarea
				bind:value={editMarkdown}
				placeholder="Add notes, checklists, etc..."
				class="min-h-[120px] w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
			></textarea>
		</div>

		<!-- Move to goal -->
		{#if allGoals.length > 0}
			<div class="mb-3 flex items-center gap-2">
				<SquareMap goal={editGoalIndex !== null ? indexToNomenclature(editGoalIndex) : ''} />
				<select
					bind:value={editGoalIndex}
					class="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
				>
					{#each allGoals as goal}
						<option value={goal.index}>{goal.label !== goal.code ? goal.label : goal.code}</option>
					{/each}
				</select>
			</div>
		{/if}

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
					class="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
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
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:hidden"
		onclick={(e) => e.target === e.currentTarget && cancelEdit()}
		onkeydown={(e) => e.key === 'Escape' && cancelEdit()}
		role="button"
		tabindex="-1"
		aria-label="Close editor"
	>
		<div class="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-slate-900 p-4 shadow-2xl">
			<!-- Header -->
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-slate-100">Edit Todo</h3>
				<button
					type="button"
					onclick={cancelEdit}
					class="text-slate-400 hover:text-slate-200"
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
					placeholder="Todo title"
					class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
				/>
			</div>

			<!-- Notes -->
			<div class="mb-4">
				<textarea
					bind:value={editMarkdown}
					placeholder="Add notes, checklists, etc..."
					class="min-h-[150px] w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
				></textarea>
			</div>

			<!-- Move to goal -->
			{#if allGoals.length > 0}
				<div class="mb-4 flex items-center gap-2">
          <span class="text-sm text-slate-400">Part of goal:</span>
					<select
						bind:value={editGoalIndex}
						class="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50"
					>
						{#each allGoals as goal}
							<option value={goal.index}>{goal.code} {goal.label !== goal.code ? `- ${goal.label}` : ''}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex flex-col gap-2">
				<button
					type="button"
					onclick={saveChanges}
					class="w-full rounded-md border border-violet-600/70 bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
				>
					Save Changes
				</button>
				<button
					type="button"
					onclick={handleDelete}
					class="w-full rounded-md border border-rose-700/70 bg-rose-900/40 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-900/60"
				>
					Delete Todo
				</button>
			</div>
		</div>
	</div>
{/if}
