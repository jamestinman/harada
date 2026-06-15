<script>
	import { onMount } from 'svelte';
	import { EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	import { createMarkdownEditorExtensions } from '$lib/markdownEditorExtensions.js';

	let {
		value = $bindable(''),
		placeholder = '',
		minHeight = '140px',
		treatFirstLineAsTitle = false,
		onchange = undefined,
		class: className = ''
	} = $props();

	let container = $state(null);
	/** @type {EditorView | null} */
	let view = null;
	let syncingFromEditor = false;

	export function focus() {
		view?.focus();
	}

	export function selectAll() {
		if (!view) return;
		const len = view.state.doc.length;
		view.dispatch({
			selection: { anchor: 0, head: len }
		});
	}

	export function focusEnd() {
		if (!view) return;
		const len = view.state.doc.length;
		view.dispatch({ selection: { anchor: len } });
		view.focus();
	}

	onMount(() => {
		if (!container) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (!update.docChanged) return;
			syncingFromEditor = true;
			const next = update.state.doc.toString();
			value = next;
			onchange?.(next);
			syncingFromEditor = false;
		});

		view = new EditorView({
			state: EditorState.create({
				doc: value,
				extensions: [
					...createMarkdownEditorExtensions(placeholder, { treatFirstLineAsTitle }),
					updateListener
				]
			}),
			parent: container
		});

		return () => {
			view?.destroy();
			view = null;
		};
	});

	$effect(() => {
		if (!view || syncingFromEditor) return;
		const current = view.state.doc.toString();
		if (current === value) return;
		view.dispatch({
			changes: { from: 0, to: current.length, insert: value ?? '' }
		});
	});

	$effect(() => {
		if (!container) return;
		container.style.minHeight = minHeight;
	});
</script>

<div
	bind:this={container}
	class="notes-hybrid-markdown-editor notes-markdown-editor composer-textarea !min-h-0 {className}"
	role="textbox"
	aria-multiline="true"
	aria-label={placeholder || 'Note editor'}
></div>
