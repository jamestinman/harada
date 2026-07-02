<script>
	import { onMount } from 'svelte';
	import { EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	import { createMarkdownEditorExtensions } from '$lib/markdownEditorExtensions.js';
	import { toggleBold, toggleItalic, cycleHeadingLevel } from '$lib/markdownEditorFormatting.js';

	let {
		value = $bindable(''),
		placeholder = '',
		minHeight = '140px',
		treatFirstLineAsTitle = false,
		showFormattingToolbar = false,
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

	export function applyBold() {
		if (!view) return;
		toggleBold(view);
		view.focus();
	}

	export function applyItalic() {
		if (!view) return;
		toggleItalic(view);
		view.focus();
	}

	export function applyHeading() {
		if (!view) return;
		cycleHeadingLevel(view);
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

	const editorClass = $derived(
		'notes-hybrid-markdown-editor composer-textarea !min-h-0' +
			(showFormattingToolbar ? '' : ' notes-markdown-editor') +
			(className ? ` ${className}` : '')
	);
</script>

{#if showFormattingToolbar}
	<div class="notes-markdown-editor notes-markdown-editor-with-toolbar overflow-hidden p-0 {className}">
		<div
			class="note-formatting-toolbar flex items-center gap-0.5 border-b px-2 py-1"
			role="toolbar"
			aria-label="Text formatting"
		>
			<button
				type="button"
				class="note-formatting-toolbar-btn"
				aria-label="Bold"
				title="Bold (⌘B)"
				onclick={applyBold}
			>
				<span class="font-bold">B</span>
			</button>
			<button
				type="button"
				class="note-formatting-toolbar-btn"
				aria-label="Italic"
				title="Italic (⌘I)"
				onclick={applyItalic}
			>
				<span class="italic">I</span>
			</button>
			<button
				type="button"
				class="note-formatting-toolbar-btn"
				aria-label="Heading"
				title="Cycle heading level"
				onclick={applyHeading}
			>
				<span class="font-semibold">H</span>
			</button>
		</div>
		<div
			bind:this={container}
			class={editorClass}
			role="textbox"
			aria-multiline="true"
			aria-label={placeholder || 'Note editor'}
		></div>
	</div>
{:else}
	<div
		bind:this={container}
		class={editorClass}
		role="textbox"
		aria-multiline="true"
		aria-label={placeholder || 'Note editor'}
	></div>
{/if}
