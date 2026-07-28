import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import {
	structuralPrefixLength,
	getInlineFormatSegments,
	toggleBold,
	toggleItalic
} from './markdownEditorFormatting.js';

/**
 * @param {string} doc
 * @param {number} anchor
 * @param {number} [head]
 */
function createTestEditor(doc, anchor, head = anchor) {
	let state = EditorState.create({
		doc,
		selection: { anchor, head }
	});
	return {
		get state() {
			return state;
		},
		dispatch(spec) {
			state = state.update(spec).state;
		}
	};
}

test('structuralPrefixLength recognizes lists, tasks, and headings', () => {
	assert.equal(structuralPrefixLength('- item'), 2);
	assert.equal(structuralPrefixLength('  - item'), 4);
	assert.equal(structuralPrefixLength('1. item'), 3);
	assert.equal(structuralPrefixLength('10) item'), 4);
	assert.equal(structuralPrefixLength('- [ ] item'), 6);
	assert.equal(structuralPrefixLength('- [x] item'), 6);
	assert.equal(structuralPrefixLength('## Title'), 3);
	assert.equal(structuralPrefixLength('plain'), 0);
});

test('getInlineFormatSegments skips list markers on each line', () => {
	const doc = '- curtext.com\n- curtext.com';
	const state = EditorState.create({ doc });
	const segments = getInlineFormatSegments(state, 0, doc.length);
	assert.deepEqual(segments, [
		{ from: 2, to: 13 },
		{ from: 16, to: 27 }
	]);
});

test('toggleBold wraps list item content, not the bullet', () => {
	const doc = '- curtext.com';
	const view = createTestEditor(doc, 0, doc.length);
	toggleBold(view);
	assert.equal(view.state.doc.toString(), '- **curtext.com**');
});

test('toggleBold wraps each selected list line separately', () => {
	const doc = '- curtext.com\n- curtext.com';
	const view = createTestEditor(doc, 0, doc.length);
	toggleBold(view);
	assert.equal(view.state.doc.toString(), '- **curtext.com**\n- **curtext.com**');
});

test('toggleBold does not wrap across list markers for mixed selection', () => {
	const doc = '- alpha\n- beta\nplain';
	const view = createTestEditor(doc, 0, doc.length);
	toggleBold(view);
	assert.equal(view.state.doc.toString(), '- **alpha**\n- **beta**\n**plain**');
});

test('toggleBold unwraps bold list items via internal markers', () => {
	const doc = '- **curtext.com**\n- **curtext.com**';
	const view = createTestEditor(doc, 0, doc.length);
	toggleBold(view);
	assert.equal(view.state.doc.toString(), '- curtext.com\n- curtext.com');
});

test('toggleBold still wraps a plain selection', () => {
	const doc = 'hello';
	const view = createTestEditor(doc, 0, doc.length);
	toggleBold(view);
	assert.equal(view.state.doc.toString(), '**hello**');
});

test('toggleBold inserts markers at caret inside a list item', () => {
	const doc = '- hello';
	const view = createTestEditor(doc, doc.length);
	toggleBold(view);
	assert.equal(view.state.doc.toString(), '- hello****');
	assert.equal(view.state.selection.main.head, '- hello**'.length);
});

test('toggleItalic wraps list item content, not the bullet', () => {
	const doc = '- curtext.com\n- other.com';
	const view = createTestEditor(doc, 0, doc.length);
	toggleItalic(view);
	assert.equal(view.state.doc.toString(), '- *curtext.com*\n- *other.com*');
});

test('toggleBold respects ordered and task list prefixes', () => {
	const ordered = createTestEditor('1. ship it', 0, '1. ship it'.length);
	toggleBold(ordered);
	assert.equal(ordered.state.doc.toString(), '1. **ship it**');

	const task = createTestEditor('- [ ] ship it', 0, '- [ ] ship it'.length);
	toggleBold(task);
	assert.equal(task.state.doc.toString(), '- [ ] **ship it**');
});

test('toggleBold respects heading prefixes', () => {
	const view = createTestEditor('## Title', 0, '## Title'.length);
	toggleBold(view);
	assert.equal(view.state.doc.toString(), '## **Title**');
});

test('toggleBold unwraps the buggy whole-selection wrap around lists', () => {
	const doc = '**- curtext.com\n- curtext.com**';
	const view = createTestEditor(doc, 2, doc.length - 2);
	toggleBold(view);
	assert.equal(view.state.doc.toString(), '- curtext.com\n- curtext.com');
});
