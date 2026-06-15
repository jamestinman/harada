import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { markdownListKeymap } from './markdownEditorKeymaps.js';

class PlaceholderWidget extends WidgetType {
	/** @param {string} text */
	constructor(text) {
		super();
		this.text = text;
	}

	eq(other) {
		return other.text === this.text;
	}

	toDOM() {
		const span = document.createElement('span');
		span.className = 'cm-placeholder';
		span.textContent = this.text;
		return span;
	}

	ignoreEvent() {
		return false;
	}
}

/**
 * @param {string} text
 */
function placeholderExtension(text) {
	return ViewPlugin.fromClass(
		class {
			/** @param {EditorView} view */
			constructor(view) {
				this.decorations = this.build(view);
			}

			/** @param {import('@codemirror/view').ViewUpdate} update */
			update(update) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.build(update.view);
				}
			}

			/** @param {EditorView} view */
			build(view) {
				const doc = view.state.doc;
				const isEmpty = doc.length === 0 || (doc.lines === 1 && doc.line(1).length === 0);
				if (!isEmpty || !text) return Decoration.none;
				return Decoration.set([Decoration.widget({ widget: new PlaceholderWidget(text), side: 1 }).range(0)]);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

/** Style line 1 as the note title when it is plain text (no leading `#`). */
function noteTitleLineExtension() {
	return ViewPlugin.fromClass(
		class {
			/** @param {EditorView} view */
			constructor(view) {
				this.decorations = this.build(view);
			}

			/** @param {import('@codemirror/view').ViewUpdate} update */
			update(update) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.build(update.view);
				}
			}

			/** @param {EditorView} view */
			build(view) {
				const doc = view.state.doc;
				if (doc.lines < 1) return Decoration.none;

				const firstLine = doc.line(1);
				const text = firstLine.text;
				if (!text.trim()) return Decoration.none;
				// Already an explicit ATX heading — markdown highlighter handles it.
				if (/^#+\s/.test(text)) return Decoration.none;

				return Decoration.set([
					Decoration.line({ class: 'cm-note-title-line' }).range(firstLine.from)
				]);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

const markdownHighlightStyle = HighlightStyle.define([
	{ tag: tags.heading1, class: 'cm-md-h1' },
	{ tag: tags.heading2, class: 'cm-md-h2' },
	{ tag: tags.heading3, class: 'cm-md-h3' },
	{ tag: tags.heading4, class: 'cm-md-h4' },
	{ tag: tags.heading5, class: 'cm-md-h5' },
	{ tag: tags.heading6, class: 'cm-md-h6' },
	{ tag: tags.strong, fontWeight: '700' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strikethrough, textDecoration: 'line-through' },
	{ tag: tags.link, class: 'cm-md-link' },
	{ tag: tags.url, class: 'cm-md-link' },
	{ tag: tags.monospace, class: 'cm-md-code' },
	{ tag: tags.quote, class: 'cm-md-quote' },
	{ tag: tags.list, class: 'cm-md-list' },
	{ tag: tags.contentSeparator, class: 'cm-md-hr' }
]);

const editorBaseTheme = EditorView.theme({
	'&': {
		fontSize: '0.875rem',
		lineHeight: '1.5'
	},
	'.cm-content': {
		fontFamily: 'inherit',
		padding: '0.75rem 0',
		caretColor: 'var(--cm-caret-color, #7c3aed)'
	},
	'.cm-line': {
		padding: '0 0.75rem'
	},
	'.cm-scroller': {
		overflow: 'auto',
		fontFamily: 'inherit'
	},
	'.cm-gutters': {
		display: 'none'
	},
	'&.cm-focused': {
		outline: 'none'
	},
	'.cm-md-h1': {
		fontSize: '1.125rem',
		fontWeight: '600',
		lineHeight: '1.4'
	},
	'.cm-md-h2': {
		fontSize: '1rem',
		fontWeight: '600',
		lineHeight: '1.4'
	},
	'.cm-md-h3': {
		fontSize: '0.9375rem',
		fontWeight: '600',
		lineHeight: '1.4'
	},
	'.cm-md-h4, .cm-md-h5, .cm-md-h6': {
		fontSize: '0.875rem',
		fontWeight: '600',
		lineHeight: '1.4'
	},
	'.cm-md-code': {
		fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
		fontSize: '0.8125rem',
		borderRadius: '0.25rem',
		padding: '0.05rem 0.2rem',
		backgroundColor: 'var(--cm-code-bg, rgba(15, 23, 42, 0.08))'
	},
	'.cm-md-link': {
		color: 'var(--cm-link-color, #6d28d9)',
		textDecoration: 'underline',
		textUnderlineOffset: '2px'
	},
	'.cm-md-quote': {
		color: 'var(--cm-quote-color, #64748b)',
		fontStyle: 'italic'
	},
	'.cm-line.cm-note-title-line': {
		fontSize: '1.125rem',
		fontWeight: '600',
		lineHeight: '1.35',
		letterSpacing: '-0.01em'
	}
});

/**
 * @param {string} [placeholderText]
 * @param {{ treatFirstLineAsTitle?: boolean }} [options]
 */
export function createMarkdownEditorExtensions(placeholderText = '', options = {}) {
	const { treatFirstLineAsTitle = false } = options;
	const extensions = [
		markdown(),
		EditorView.lineWrapping,
		editorBaseTheme,
		syntaxHighlighting(markdownHighlightStyle),
		markdownListKeymap
	];

	if (treatFirstLineAsTitle) {
		extensions.push(noteTitleLineExtension());
	}

	if (placeholderText) {
		extensions.push(placeholderExtension(placeholderText));
	}

	return extensions;
}
