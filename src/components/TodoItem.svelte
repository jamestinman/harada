<script>
	import { indexToNomenclature } from '$lib/todoUtils.js';
	import SquareMap from './SquareMap.svelte';

	let { 
		todo,
		onUpdate,
		onDelete,
		onToggleStatus,
		allGoals = []
	} = $props();

	let isEditing = $state(false);
	let showMobileEditor = $state(false);
	let editTitle = $state('');
	let editMarkdown = $state('');
	let editGoalIndex = $state(null);

	const hasNotes = $derived((todo.markdown || '').trim().length > 0);

	function handleCheckbox() {
		onToggleStatus();
	}

	function startEditing() {
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
		if (confirm('Delete this todo?')) {
			onDelete();
			isEditing = false;
			showMobileEditor = false;
		}
	}
</script>

<!-- Compact single-line view -->
{#if !isEditing}
	<div class="group flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-950/40 px-3 py-2 transition hover:border-slate-600 hover:bg-slate-900/50">
		<!-- Checkbox -->
		<button
			type="button"
			onclick={handleCheckbox}
			class={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
				todo.status === 'done'
					? 'border-emerald-500 bg-emerald-500 text-white'
					: todo.status === 'underway'
						? 'border-yellow-500 bg-yellow-500/20'
						: 'border-slate-600 hover:border-slate-500'
			}`}
			title={todo.status === 'done' ? 'Mark as to-do' : todo.status === 'underway' ? 'Mark as done' : 'Mark as underway'}
		>
			{#if todo.status === 'done'}
				<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
				</svg>
			{:else if todo.status === 'underway'}
				<div class="h-2 w-2 rounded-full bg-yellow-500"></div>
			{/if}
		</button>

		<!-- Title -->
		<button
			type="button"
			onclick={startEditing}
			class={`flex-1 text-left text-sm transition ${
				todo.status === 'done'
					? 'text-slate-500 line-through'
					: 'text-slate-200 hover:text-slate-100'
			}`}
		>
			{todo.title || 'Untitled todo'}
		</button>

		<!-- Notes indicator -->
		{#if hasNotes}
			<button
				type="button"
				onclick={startEditing}
				class="flex-shrink-0 text-slate-400 transition hover:text-slate-300"
				title="Has notes"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
			</button>
		{/if}
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
					<SquareMap goal={editGoalIndex !== null ? indexToNomenclature(editGoalIndex) : ''} />
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
