<script>
	import { fly } from 'svelte/transition';
	import { store } from '$stores/store.svelte.js';

	const AUTO_HIDE_MS = 8000;
	let undoing = $state(false);

	// Auto-hide the toast; the journal keeps the op undoable beyond this window,
	// this only retires the on-screen prompt.
	$effect(() => {
		const toast = store.undoToast;
		if (!toast) return;
		const timer = setTimeout(() => {
			if (store.undoToast === toast) store.dismissUndoToast();
		}, AUTO_HIDE_MS);
		return () => clearTimeout(timer);
	});

	async function undo() {
		if (undoing) return;
		const toast = store.undoToast;
		if (typeof toast?.undo !== 'function') return;
		undoing = true;
		try {
			await toast.undo();
			// Retire the prompt once acted on - unless the undo itself queued a
			// new toast, which is then the live one.
			if (store.undoToast === toast) store.dismissUndoToast();
		} catch (err) {
			console.error('Undo failed:', err);
		} finally {
			undoing = false;
		}
	}

	function isEditableTarget(el) {
		return !!el?.closest?.('input, textarea, select, [contenteditable], .cm-editor');
	}

	// Cmd/Ctrl+Z undoes the action ONLY while the toast is visible - outside
	// that window the shortcut stays reserved for text editing, so a stray
	// Cmd+Z can't silently revert a change from an hour ago.
	function onKeydown(event) {
		if (!store.undoToast) return;
		if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return;
		if ((event.key || '').toLowerCase() !== 'z') return;
		if (isEditableTarget(event.target)) return;
		event.preventDefault();
		void undo();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if store.undoToast}
	<!-- in: only - an out transition depends on rAF ticks and can strand an
	     invisible inert node when the tab is throttled; instant removal is safer -->
	<div
		in:fly={{ y: 16, duration: 150 }}
		class="undo-toast fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900/95 py-2 pl-4 pr-2 text-sm text-white shadow-lg ring-1 ring-white/10 backdrop-blur dark:bg-slate-800/95"
		style="bottom: calc(env(safe-area-inset-bottom, 0px) + 5.5rem);"
		role="status"
	>
		<span>{store.undoToast.label}</span>
		<button
			type="button"
			onclick={undo}
			disabled={undoing}
			class="rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25 disabled:opacity-50"
		>
			{undoing ? 'Undoing…' : 'Undo'}
		</button>
		<button
			type="button"
			onclick={() => store.dismissUndoToast()}
			aria-label="Dismiss"
			class="rounded-full px-2 py-1 text-white/60 hover:text-white"
		>
			✕
		</button>
	</div>
{/if}
