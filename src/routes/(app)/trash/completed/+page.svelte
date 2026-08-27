<script>
	import { browser } from '$app/environment';
	import { authStore } from '$stores/auth.svelte.js';
	import { store } from '$stores/store.svelte.js';
	import {
		DEFAULT_ARCHIVE_RANGE_ID,
		RECENTLY_COMPLETED_MS,
		archiveRangeById
	} from '$lib/todoUtils.js';
	import ArchiveRangeFilter from '$components/ArchiveRangeFilter.svelte';
	import { Bookmark, ListTodo, RotateCcw, Trash2 } from 'lucide-svelte';

	/** @type {Array<{ id: string; kind: 'task' | 'bookmark' | 'note'; title: string; preview: string; dateAt: string; url?: string }>} */
	let items = $state([]);
	let loading = $state(true);
	let error = $state(/** @type {string | null} */ (null));
	let rangeId = $state(DEFAULT_ARCHIVE_RANGE_ID);
	let truncated = $state(false);
	let localOnly = $state(false);
	/** @type {string | null} */
	let busyKey = $state(null);
	let emptying = $state(false);

	const userId = $derived(authStore.user?.id ?? null);
	const retentionDays = $derived(Math.round(RECENTLY_COMPLETED_MS / (24 * 60 * 60 * 1000)));
	const emptyScope = $derived(archiveRangeById(rangeId).emptyScope);

	$effect(() => {
		if (!browser || authStore.loading) return;
		void userId;
		const range = rangeId;
		let cancelled = false;
		(async () => {
			loading = true;
			error = null;
			const result = await store.loadCompletedTrash({ rangeId: range });
			if (cancelled) return;
			items = result.items ?? [];
			error = result.error;
			truncated = !!result.truncated;
			localOnly = result.source === 'local';
			loading = false;
		})();
		return () => {
			cancelled = true;
		};
	});

	function itemKey(item) {
		return `${item.kind}:${item.id}`;
	}

	function kindLabel(kind) {
		if (kind === 'bookmark') return 'Bookmark';
		return 'Task';
	}

	function formatRelativeDate(dateAt) {
		if (!dateAt) return '';
		const when = new Date(dateAt);
		if (Number.isNaN(when.getTime())) return '';
		const days = Math.floor((Date.now() - when.getTime()) / (24 * 60 * 60 * 1000));
		if (days <= 0) return 'Completed today';
		if (days === 1) return 'Completed yesterday';
		return `Completed ${days} days ago`;
	}

	function previewText(item) {
		const preview = (item.preview || '').replace(/\s+/g, ' ').trim();
		if (!preview || preview === item.title) return '';
		return preview.length > 160 ? `${preview.slice(0, 157)}…` : preview;
	}

	async function handleRestore(item) {
		const key = itemKey(item);
		busyKey = key;
		error = null;
		const result = await store.restoreCompletedItem(item.id);
		busyKey = null;
		if (!result.success) {
			error = result.error || 'Failed to restore';
			return;
		}
		items = items.filter((row) => itemKey(row) !== key);
	}

	async function handleDelete(item) {
		const key = itemKey(item);
		busyKey = key;
		error = null;
		const result = await store.softDeleteCompletedItem(item.id);
		busyKey = null;
		if (!result.success) {
			error = result.error || 'Failed to delete';
			return;
		}
		items = items.filter((row) => itemKey(row) !== key);
	}

	async function handleDeleteAll() {
		const count = items.length;
		if (count === 0) return;
		// emptyCompletedTrash clears ALL completed items, not just the visible
		// window - say so, or the count in the prompt reads as the whole scope.
		const confirmed = confirm(
			`Move every completed item to deleted trash (${count} shown here)? You can still restore them from Deleted.`
		);
		if (!confirmed) return;

		emptying = true;
		error = null;
		const result = await store.emptyCompletedTrash();
		emptying = false;
		if (!result.success) {
			error = result.error || 'Failed to empty completed';
			return;
		}
		items = [];
	}
</script>

<svelte:head>
	<title>Completed - Haradato</title>
</svelte:head>

<p class="mb-4 text-sm text-slate-600 dark:text-slate-400">
	Completed tasks and bookmarks. Restore marks them to-do again; Delete moves them to Deleted.
	Items older than about {retentionDays} days are hidden from your main lists but stay here.
</p>

<div class="mb-4 flex flex-wrap items-center gap-3">
	<ArchiveRangeFilter
		value={rangeId}
		label="Completed time range"
		onChange={(next) => (rangeId = next)}
	/>
	{#if truncated}
		<span class="text-xs text-slate-500 dark:text-slate-400">
			Showing the most recent 300 - narrow the range to see older items.
		</span>
	{/if}
</div>

{#if loading || authStore.loading}
	<p class="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
{:else if localOnly}
	<p
		class="mb-4 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
	>
		{#if authStore.user}
			Offline - showing completions stored on this device (about the last {retentionDays} days).
		{:else}
			Showing completions stored on this device (about the last {retentionDays} days). Sign in to
			keep full history and recover completions on any device.
		{/if}
	</p>
{:else if error}
	<p class="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
{/if}

{#if !loading && !authStore.loading && items.length === 0 && !error}
	<p class="text-sm text-slate-500 dark:text-slate-400">
		Nothing completed {emptyScope}.
	</p>
{/if}

{#if items.length > 0 && !localOnly}
	<div class="mb-4 flex justify-end">
		<button
			type="button"
			disabled={emptying || busyKey != null}
			onclick={handleDeleteAll}
			class="inline-flex items-center gap-1.5 rounded-md border border-red-300/80 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
		>
			<Trash2 class="h-4 w-4" />
			{#if emptying}
				Deleting…
			{:else}
				Delete all
			{/if}
		</button>
	</div>
{/if}

{#if items.length > 0}
	<ul class="space-y-3">
		{#each items as item (itemKey(item))}
			{@const busy = emptying || busyKey === itemKey(item)}
			{@const preview = previewText(item)}
			<li
				class="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900/50"
			>
				<div class="flex items-start gap-3">
					<div
						class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
						aria-hidden="true"
					>
						{#if item.kind === 'bookmark'}
							<Bookmark class="h-4 w-4" />
						{:else}
							<ListTodo class="h-4 w-4" />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span
								class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300"
							>
								{kindLabel(item.kind)}
							</span>
							<span class="text-xs text-slate-500 dark:text-slate-400">
								{formatRelativeDate(item.dateAt)}
							</span>
						</div>
						<div class="mt-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
							{item.title}
						</div>
						{#if preview}
							<p class="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
								{preview}
							</p>
						{/if}
						{#if item.kind === 'bookmark' && item.url}
							<p class="mt-0.5 truncate text-xs text-violet-600 dark:text-violet-400">
								{item.url}
							</p>
						{/if}
					</div>
				</div>
				<div class="mt-3 flex flex-wrap justify-end gap-2">
					<button
						type="button"
						disabled={busy}
						onclick={() => handleRestore(item)}
						class="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
					>
						<RotateCcw class="h-3.5 w-3.5" />
						Restore
					</button>
					<button
						type="button"
						disabled={busy}
						onclick={() => handleDelete(item)}
						class="inline-flex items-center gap-1.5 rounded-md border border-red-300/80 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
					>
						<Trash2 class="h-3.5 w-3.5" />
						Delete
					</button>
				</div>
			</li>
		{/each}
	</ul>
{/if}
