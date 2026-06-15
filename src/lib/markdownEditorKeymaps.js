import { keymap } from '@codemirror/view';

function nextOrderedMarker(marker) {
	const match = marker.match(/^(\d+)([.)])$/);
	if (!match) return marker;
	const next = Number(match[1]) + 1;
	return `${next}${match[2]}`;
}

function getCurrentLine(state, pos) {
	const line = state.doc.lineAt(pos);
	return {
		lineStart: line.from,
		lineEnd: line.to,
		lineText: line.text
	};
}

function listLineParts(line) {
	return line.match(/^(\s*)([-*+]|\d+[.)])(\s+.*)?$/);
}

function continueListOnEnter(view) {
	const { state } = view;
	const { main } = state.selection;
	if (!main.empty) return false;

	const pos = main.head;
	const { lineStart, lineEnd, lineText } = getCurrentLine(state, pos);
	const match = lineText.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
	if (!match) return false;

	const [, indent, marker, content] = match;

	if (content.trim() === '') {
		view.dispatch({
			changes: { from: lineStart, to: lineEnd, insert: '' },
			selection: { anchor: lineStart }
		});
		return true;
	}

	const nextMarker = /^\d+[.)]$/.test(marker) ? nextOrderedMarker(marker) : marker;
	const insertion = `\n${indent}${nextMarker} `;
	view.dispatch({
		changes: { from: pos, insert: insertion },
		selection: { anchor: pos + insertion.length }
	});
	return true;
}

function indentListItem(view, outdent = false) {
	const { state } = view;
	const { main } = state.selection;
	const pos = main.head;
	const { lineStart, lineEnd, lineText } = getCurrentLine(state, pos);
	const parts = listLineParts(lineText);
	if (!parts) return false;

	const [, indent, marker] = parts;
	const indentStep = '  ';
	let nextIndent = indent;
	if (!outdent) {
		nextIndent = `${indent}${indentStep}`;
	} else if (indent.startsWith(indentStep)) {
		nextIndent = indent.slice(indentStep.length);
	} else if (indent.startsWith(' ')) {
		nextIndent = indent.slice(1);
	}
	if (nextIndent === indent) return true;

	const contentStart = lineStart + indent.length;
	const newLine = `${nextIndent}${marker}${lineText.slice(indent.length + marker.length)}`;
	const delta = nextIndent.length - indent.length;

	let anchor = Math.max(lineStart, main.anchor + delta);
	let head = Math.max(lineStart, main.head + delta);
	if (main.anchor > contentStart && main.head > contentStart && delta !== 0) {
		anchor = main.anchor + delta;
		head = main.head + delta;
	}

	view.dispatch({
		changes: { from: lineStart, to: lineEnd, insert: newLine },
		selection: { anchor, head }
	});
	return true;
}

export const markdownListKeymap = keymap.of([
	{ key: 'Enter', run: continueListOnEnter },
	{ key: 'Tab', run: (view) => indentListItem(view, false) },
	{ key: 'Shift-Tab', run: (view) => indentListItem(view, true) }
]);
