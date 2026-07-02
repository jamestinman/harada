import { normalizeUrl, parseStandaloneUrl } from './urlUtils.js';

const MARKDOWN_LINK_RE = /^\[([^\]]*)\]\(([^)\s]+)\)$/;

/**
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @param {string} marker
 */
function hasOutsideMarkers(state, from, to, marker) {
	const markerLen = marker.length;
	if (from < markerLen || to + markerLen > state.doc.length) return false;

	const before = state.sliceDoc(from - markerLen, from);
	const after = state.sliceDoc(to, to + markerLen);
	if (before !== marker || after !== marker) return false;

	if (marker === '*') {
		const charBefore =
			from - markerLen > 0 ? state.sliceDoc(from - markerLen - 1, from - markerLen) : '';
		const charAfter =
			to + markerLen < state.doc.length ? state.sliceDoc(to + markerLen, to + markerLen + 1) : '';
		if (charBefore === '*' || charAfter === '*') return false;
	}

	return true;
}

/**
 * @param {string} selected
 * @param {string} marker
 */
function selectionHasWrappingMarkers(selected, marker) {
	const markerLen = marker.length;
	if (selected.length < markerLen * 2) return false;
	if (!selected.startsWith(marker) || !selected.endsWith(marker)) return false;

	if (marker === '*') {
		if (selected.startsWith('**') || selected.endsWith('**')) return false;
	}

	return true;
}

/**
 * Toggle inline markdown markers around the current selection.
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} marker
 */
export function toggleInlineMarkdown(view, marker) {
	const { state } = view;
	const { from, to, empty } = state.selection.main;
	const markerLen = marker.length;
	const selected = state.sliceDoc(from, to);

	if (hasOutsideMarkers(state, from, to, marker)) {
		view.dispatch({
			changes: [
				{ from: from - markerLen, to: from, insert: '' },
				{ from: to, to: to + markerLen, insert: '' }
			],
			selection: { anchor: from - markerLen, head: to - markerLen }
		});
		return true;
	}

	if (selectionHasWrappingMarkers(selected, marker)) {
		const inner = selected.slice(markerLen, selected.length - markerLen);
		view.dispatch({
			changes: { from, to, insert: inner },
			selection: empty
				? { anchor: from + markerLen }
				: { anchor: from + markerLen, head: from + markerLen + inner.length }
		});
		return true;
	}

	view.dispatch({
		changes: { from, to, insert: `${marker}${selected}${marker}` },
		selection: empty
			? { anchor: from + markerLen }
			: { anchor: from + markerLen, head: to + markerLen }
	});
	return true;
}

/** @param {import('@codemirror/view').EditorView} view */
export function toggleBold(view) {
	const { state } = view;
	const { from, to, empty, anchor, head } = state.selection.main;
	const marker = '**';
	const markerLen = marker.length;
	const selected = state.sliceDoc(from, to);

	if (hasOutsideMarkers(state, from, to, marker)) {
		view.dispatch({
			changes: [
				{ from: from - markerLen, to: from, insert: '' },
				{ from: to, to: to + markerLen, insert: '' }
			],
			selection: { anchor: from - markerLen, head: to - markerLen }
		});
		return true;
	}

	if (selectionIsSingleBold(selected)) {
		const inner = selected.slice(markerLen, selected.length - markerLen);
		view.dispatch({
			changes: { from, to, insert: inner },
			selection: empty
				? { anchor: from + markerLen }
				: { anchor: from + markerLen, head: from + markerLen + inner.length }
		});
		return true;
	}

	if (selectionContainsInternalBold(selected)) {
		const newText = stripInternalBold(selected);
		view.dispatch({
			changes: { from, to, insert: newText },
			selection: {
				anchor: from + mapPosThroughStripBold(anchor - from, selected),
				head: from + mapPosThroughStripBold(head - from, selected)
			}
		});
		return true;
	}

	view.dispatch({
		changes: { from, to, insert: `${marker}${selected}${marker}` },
		selection: empty
			? { anchor: from + markerLen }
			: { anchor: from + markerLen, head: to + markerLen }
	});
	return true;
}

const BOLD_MARKER_LEN = 2;

/** @param {string} text */
function selectionIsSingleBold(text) {
	return /^\*\*([^*\n]+)\*\*$/.test(text);
}

/** @param {string} text */
function selectionContainsInternalBold(text) {
	return /\*\*([^*\n]+)\*\*/.test(text);
}

/** @param {string} text */
function stripInternalBold(text) {
	return text.replace(/\*\*([^*\n]+)\*\*/g, '$1');
}

/**
 * Map a position within `text` to the same logical spot after stripping internal bold.
 * @param {number} relPos
 * @param {string} text
 */
function mapPosThroughStripBold(relPos, text) {
	if (relPos <= 0) return 0;

	let orig = 0;
	let mapped = 0;
	while (orig < relPos && orig < text.length) {
		const rest = text.slice(orig);
		const match = rest.match(/^\*\*([^*\n]+)\*\*/);
		if (match) {
			const fullLen = match[0].length;
			const innerLen = match[1].length;
			if (orig + fullLen <= relPos) {
				orig += fullLen;
				mapped += innerLen;
				continue;
			}

			const innerPos = relPos - orig - BOLD_MARKER_LEN;
			if (innerPos < 0) return mapped;
			if (innerPos > innerLen) return mapped + innerLen;
			return mapped + innerPos;
		}

		orig += 1;
		mapped += 1;
	}

	return mapped;
}

/** @param {import('@codemirror/view').EditorView} view */
export function toggleItalic(view) {
	return toggleInlineMarkdown(view, '*');
}

const MAX_HEADING_LEVEL = 4;

/**
 * @param {string} lineText
 * @returns {{ level: number, prefixLen: number } | null}
 */
function parseHeadingPrefix(lineText) {
	const match = lineText.match(/^(#+)\s+/);
	if (!match) return null;
	return { level: match[1].length, prefixLen: match[0].length };
}

/**
 * @param {number} pos
 * @param {number} lineStart
 * @param {number} lineEnd
 * @param {number} oldPrefixLen
 * @param {number} newPrefixLen
 */
function mapLinePos(pos, lineStart, lineEnd, oldPrefixLen, newPrefixLen) {
	if (pos < lineStart || pos > lineEnd) return pos;
	if (pos >= lineStart + oldPrefixLen) return pos + (newPrefixLen - oldPrefixLen);
	return lineStart + newPrefixLen;
}

/** Cycle ATX heading level (# through ####) on the line containing the cursor. */
export function cycleHeadingLevel(view) {
	const { state } = view;
	const { anchor, head } = state.selection.main;
	const pos = head;
	const line = state.doc.lineAt(pos);
	const lineStart = line.from;
	const lineEnd = line.to;
	const lineText = line.text;

	const parsed = parseHeadingPrefix(lineText);
	let newPrefix = '';
	let oldPrefixLen = 0;

	if (!parsed) {
		newPrefix = '# ';
	} else if (parsed.level < MAX_HEADING_LEVEL) {
		newPrefix = '#'.repeat(parsed.level + 1) + ' ';
		oldPrefixLen = parsed.prefixLen;
	} else {
		oldPrefixLen = parsed.prefixLen;
	}

	const newLineText = newPrefix + lineText.slice(oldPrefixLen);

	view.dispatch({
		changes: { from: lineStart, to: lineEnd, insert: newLineText },
		selection: {
			anchor: mapLinePos(anchor, lineStart, lineEnd, oldPrefixLen, newPrefix.length),
			head: mapLinePos(head, lineStart, lineEnd, oldPrefixLen, newPrefix.length)
		}
	});
	return true;
}

/**
 * Infer URL/title fields from the current editor selection.
 * @param {string} text
 */
export function parseLinkSelection(text) {
	const trimmed = String(text ?? '').trim();
	if (!trimmed) return { url: '', title: '', lockTitle: false };

	const mdMatch = trimmed.match(MARKDOWN_LINK_RE);
	if (mdMatch) {
		return { url: mdMatch[2], title: mdMatch[1], lockTitle: true };
	}

	const url = parseStandaloneUrl(trimmed);
	if (url) {
		return { url, title: '', lockTitle: false };
	}

	return { url: '', title: trimmed, lockTitle: Boolean(trimmed) };
}

/** @param {string} text */
function escapeMarkdownLinkText(text) {
	return String(text ?? '').replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/**
 * Insert or replace a markdown link at the given range.
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} from
 * @param {number} to
 * @param {string} title
 * @param {string} url
 */
export function insertMarkdownLink(view, from, to, title, url) {
	const normalized = normalizeUrl(url);
	if (!normalized) return false;

	const label = String(title ?? '').trim() || normalized;
	const markdown = `[${escapeMarkdownLinkText(label)}](${normalized})`;

	view.dispatch({
		changes: { from, to, insert: markdown },
		selection: { anchor: from + markdown.length }
	});
	return true;
}
