<script>
	import { fade } from 'svelte/transition';

	let {
		isOpen = $bindable(false),
		sourceLabel = '',
		targetLabel = '',
		mergedTitle = $bindable(''),
		onConfirm = null,
		onCancel = null
	} = $props();

	let titleInputEl = $state(null);

	$effect(() => {
		if (isOpen && titleInputEl) {
			titleInputEl.focus();
			titleInputEl.select();
		}
	});

	function close() {
		isOpen = false;
		onCancel?.();
	}

	async function confirm() {
		const title = (mergedTitle ?? '').trim();
		if (onConfirm) await onConfirm(title);
		isOpen = false;
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') close();
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void confirm();
		}
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
		aria-labelledby="goal-merge-title"
		tabindex="-1"
	>
		<div
			class="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden"
		>
			<div class="px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
				<h2
					id="goal-merge-title"
					class="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug"
				>
					Merge {sourceLabel} with {targetLabel}
				</h2>
				<p class="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
					Tasks and notes from {sourceLabel} will join {targetLabel}. The source goal will be cleared.
				</p>
			</div>

			<div class="px-5 py-4 space-y-2">
				<label for="goal-merge-title-field" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
					New title
				</label>
				<input
					id="goal-merge-title-field"
					bind:this={titleInputEl}
					bind:value={mergedTitle}
					type="text"
					placeholder="Merged goal title"
					class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							void confirm();
						}
					}}
				/>
			</div>

			<div class="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 dark:bg-slate-800/50">
				<button
					type="button"
					onclick={close}
					class="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={() => void confirm()}
					class="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition shadow-sm"
				>
					Merge
				</button>
			</div>
		</div>
	</div>
{/if}
