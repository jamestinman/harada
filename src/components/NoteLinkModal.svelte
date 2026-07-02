<script>
	import { fade } from 'svelte/transition';
	import { fetchUrlContent } from '$lib/urlContent.mjs';
	import { normalizeUrl, sanitizeUrlInput } from '$lib/urlUtils.js';

	let {
		isOpen = $bindable(false),
		url = $bindable(''),
		title = $bindable(''),
		lockTitle = false,
		onSave = null,
		onCancel = null
	} = $props();

	let urlInputEl = $state(null);
	let titleEdited = $state(false);
	let fetchingTitle = $state(false);
	let fetchGeneration = 0;

	const canSave = $derived(Boolean(normalizeUrl(url)));

	$effect(() => {
		if (!isOpen) {
			titleEdited = false;
			fetchingTitle = false;
			return;
		}
		titleEdited = lockTitle && Boolean((title ?? '').trim());
		if (urlInputEl) {
			urlInputEl.focus();
			urlInputEl.select();
		}
	});

	$effect(() => {
		if (!isOpen) return;
		const normalized = normalizeUrl(url);
		if (!normalized || titleEdited) return;

		const generation = ++fetchGeneration;
		const timer = setTimeout(async () => {
			fetchingTitle = true;
			try {
				const content = await fetchUrlContent(normalized);
				if (generation !== fetchGeneration || titleEdited || !isOpen) return;
				if (content?.title && !(title ?? '').trim()) {
					title = String(content.title).trim();
				}
			} finally {
				if (generation === fetchGeneration) fetchingTitle = false;
			}
		}, 400);

		return () => {
			clearTimeout(timer);
			if (generation === fetchGeneration) fetchingTitle = false;
		};
	});

	function close() {
		isOpen = false;
		onCancel?.();
	}

	function save() {
		if (!canSave) return;
		isOpen = false;
		onSave?.({ url, title });
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') close();
	}

	function handleUrlInput(event) {
		url = sanitizeUrlInput(event.currentTarget.value);
	}

	function handleTitleInput(event) {
		title = event.currentTarget.value;
		titleEdited = Boolean((title ?? '').trim());
	}
</script>

{#if isOpen}
	<div
		transition:fade={{ duration: 160 }}
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
		onclick={(e) => e.target === e.currentTarget && close()}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="note-link-modal-title"
		tabindex="-1"
	>
		<div
			class="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
		>
			<div class="border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800">
				<h2
					id="note-link-modal-title"
					class="text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100"
				>
					Insert link
				</h2>
			</div>

			<div class="space-y-4 px-5 py-4">
				<div class="space-y-2">
					<label for="note-link-url" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
						URL
					</label>
					<input
						id="note-link-url"
						bind:this={urlInputEl}
						value={url}
						type="url"
						inputmode="url"
						autocomplete="url"
						placeholder="https://example.com"
						class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
						oninput={handleUrlInput}
						onkeydown={(e) => {
							if (e.key === 'Enter' && canSave) {
								e.preventDefault();
								save();
							}
						}}
					/>
				</div>

				<div class="space-y-2">
					<div class="flex items-center justify-between gap-2">
						<label for="note-link-title" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
							Title
						</label>
						{#if fetchingTitle}
							<span class="text-xs text-slate-400">Fetching title…</span>
						{/if}
					</div>
					<input
						id="note-link-title"
						value={title}
						type="text"
						placeholder="Link text"
						class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
						oninput={handleTitleInput}
						onkeydown={(e) => {
							if (e.key === 'Enter' && canSave) {
								e.preventDefault();
								save();
							}
						}}
					/>
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 bg-slate-50 px-5 py-4 dark:bg-slate-800/50">
				<button
					type="button"
					onclick={close}
					class="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-700/70"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={save}
					disabled={!canSave}
					class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Save
				</button>
			</div>
		</div>
	</div>
{/if}
