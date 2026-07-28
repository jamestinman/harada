import { normalizeUrl, parseStandaloneUrl } from './urlUtils.js';

const MARKDOWN_LINK_RE = /^\[([^\]]*)\]\(([^)\s]+)\)$/;
const BOLD_MARKER = '**';
const BOLD_MARKER_LEN = 2;

/**
 * Length of leading list / heading markup that must stay outside inline markers.
 * Supports `- `, `* `, `+ `, `1. `, task lists (`- [ ] `), and ATX headings.
 * @param {string} lineText
 */
export function structuralPrefixLength(lineText) {
	const task = lineText.match(/^(\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+)/);
	if (task) return task[1].length;

	const list = lineText.match(/^(\s*(?:[-*+]|\d+[.)])\s+)/);
	if (list) return list[1].length;

	const heading = lineText.match(/^(#{1,6}\s+)/);
	if (heading) return heading[1].length;

	return 0;
}

/**
 * Content ranges to format within a selection, excluding list/heading prefixes.
 * Empty selections return a single caret segment (bumped past any prefix).
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} from
 * @param {number} to
 * @returns {Array<{ from: number, to: number }>}
 */
export function getInlineFormatSegments(state, from, to) {
	if (from === to) {
		const line = state.doc.lineAt(from);
		const contentStart = line.from + structuralPrefixLength(line.text);
		const at = Math.max(from, contentStart);
		return [{ from: at, to: at }];
	}

	const startLine = state.doc.lineAt(from);
	const endLine = state.doc.lineAt(to);
	/** @type {Array<{ from: number, to: number }>} */
	const segments = [];

	for (let n = startLine.number; n <= endLine.number; n++) {
		const line = state.doc.line(n);
		if (n === endLine.number && n !== startLine.number && to === line.from) break;

		let segFrom = n === startLine.number ? from : line.from;
		let segTo = n === endLine.number ? to : line.to;
		if (segFrom >= segTo) continue;

		const contentStart = line.from + structuralPrefixLength(line.text);
		segFrom = Math.max(segFrom, contentStart);
		if (segFrom >= segTo) continue;

		segments.push({ from: segFrom, to: segTo });
	}

	return segments.length > 0 ? segments : [{ from, to }];
}

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
 * @param {import('@codemirror/state').EditorState} state
 * @param {{ from: number, to: number }} segment
 * @param {string} marker
 */
function segmentIsMarked(state, segment, marker) {
	if (segment.from === segment.to) return false;
	if (hasOutsideMarkers(state, segment.from, segment.to, marker)) return true;
	return selectionHasWrappingMarkers(state.sliceDoc(segment.from, segment.to), marker);
}

/**
 * @param {Array<{ from: number, to: number }>} segments
 * @param {string} marker
 * @param {'wrap' | 'unwrap'} mode
 */
function buildSegmentMarkerChanges(state, segments, marker, mode) {
	const markerLen = marker.length;
	/** @type {Array<{ from: number, to: number, insert: string }>} */
	const changes = [];

	for (const seg of segments) {
		if (mode === 'wrap') {
			const text = state.sliceDoc(seg.from, seg.to);
			changes.push({ from: seg.from, to: seg.to, insert: `${marker}${text}${marker}` });
			continue;
		}

		if (hasOutsideMarkers(state, seg.from, seg.to, marker)) {
			changes.push({ from: seg.from - markerLen, to: seg.from, insert: '' });
			changes.push({ from: seg.to, to: seg.to + markerLen, insert: '' });
			continue;
		}

		const selected = state.sliceDoc(seg.from, seg.to);
		if (selectionHasWrappingMarkers(selected, marker)) {
			changes.push({
				from: seg.from,
				to: seg.to,
				insert: selected.slice(markerLen, selected.length - markerLen)
			});
		}
	}

	return changes;
}

/**
 * Selection covering wrapped segment contents after wrap/unwrap.
 * @param {import('@codemirror/state').EditorState} state
 * @param {Array<{ from: number, to: number }>} segments
 * @param {string} marker
 * @param {'wrap' | 'unwrap'} mode
 * @param {boolean} empty
 */
function selectionAfterSegmentToggle(state, segments, marker, mode, empty) {
	const markerLen = marker.length;
	const first = segments[0];

	if (empty || (segments.length === 1 && first.from === first.to)) {
		const caret = mode === 'wrap' ? first.from + markerLen : first.from;
		return { anchor: caret, head: caret };
	}

	if (mode === 'wrap') {
		const anchor = first.from + markerLen;
		const markersBeforeLastEnd = (segments.length - 1) * 2 * markerLen + markerLen;
		const head = segments[segments.length - 1].to + markersBeforeLastEnd;
		return { anchor, head };
	}

	let anchor = first.from;
	let head = first.to;
	let deletedBefore = 0;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		let contentFrom = seg.from - deletedBefore;
		let contentTo = seg.to - deletedBefore;

		if (hasOutsideMarkers(state, seg.from, seg.to, marker)) {
			contentFrom -= markerLen;
			contentTo -= markerLen;
			deletedBefore += 2 * markerLen;
		} else if (selectionHasWrappingMarkers(state.sliceDoc(seg.from, seg.to), marker)) {
			contentTo -= 2 * markerLen;
			deletedBefore += 2 * markerLen;
		}

		if (i === 0) anchor = contentFrom;
		if (i === segments.length - 1) head = contentTo;
	}
	return { anchor, head };
}

/**
 * Toggle inline markdown markers around the current selection.
 * Multi-line / list selections wrap each line's content after structural prefixes.
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} marker
 */
export function toggleInlineMarkdown(view, marker) {
	const { state } = view;
	const { from, to, empty } = state.selection.main;
	const markerLen = marker.length;

	// Whole-selection outside markers (including the buggy list-wrapping case).
	if (!empty && hasOutsideMarkers(state, from, to, marker)) {
		view.dispatch({
			changes: [
				{ from: from - markerLen, to: from, insert: '' },
				{ from: to, to: to + markerLen, insert: '' }
			],
			selection: { anchor: from - markerLen, head: to - markerLen }
		});
		return true;
	}

	const segments = getInlineFormatSegments(state, from, to);
	const selected = empty ? '' : state.sliceDoc(from, to);

	if (
		!empty &&
		segments.length === 1 &&
		segments[0].from === from &&
		segments[0].to === to &&
		selectionHasWrappingMarkers(selected, marker)
	) {
		const inner = selected.slice(markerLen, selected.length - markerLen);
		view.dispatch({
			changes: { from, to, insert: inner },
			selection: { anchor: from, head: from + inner.length }
		});
		return true;
	}

	const allMarked =
		!empty && segments.length > 0 && segments.every((seg) => segmentIsMarked(state, seg, marker));
	const mode = allMarked ? 'unwrap' : 'wrap';

	view.dispatch({
		changes: buildSegmentMarkerChanges(state, segments, marker, mode),
		selection: selectionAfterSegmentToggle(state, segments, marker, mode, empty)
	});
	return true;
}

/** @param {import('@codemirror/view').EditorView} view */
export function toggleBold(view) {
	const { state } = view;
	const { from, to, empty, anchor, head } = state.selection.main;
	const marker = BOLD_MARKER;
	const markerLen = marker.length;
	const selected = state.sliceDoc(from, to);

	if (!empty && hasOutsideMarkers(state, from, to, marker)) {
		view.dispatch({
			changes: [
				{ from: from - markerLen, to: from, insert: '' },
				{ from: to, to: to + markerLen, insert: '' }
			],
			selection: { anchor: from - markerLen, head: to - markerLen }
		});
		return true;
	}

	if (!empty && selectionIsSingleBold(selected)) {
		const inner = selected.slice(markerLen, selected.length - markerLen);
		view.dispatch({
			changes: { from, to, insert: inner },
			selection: { anchor: from, head: from + inner.length }
		});
		return true;
	}

	// Strip bold inside the selection (including list lines like `- **x**`).
	if (!empty && selectionContainsInternalBold(selected) && !selectionIsSingleBold(selected)) {
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

	const segments = getInlineFormatSegments(state, from, to);
	const allMarked =
		!empty && segments.length > 0 && segments.every((seg) => segmentIsMarked(state, seg, marker));
	const mode = allMarked ? 'unwrap' : 'wrap';

	view.dispatch({
		changes: buildSegmentMarkerChanges(state, segments, marker, mode),
		selection: selectionAfterSegmentToggle(state, segments, marker, mode, empty)
	});
	return true;
}

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
