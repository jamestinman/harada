// Utility functions for todo management
import { marked } from 'marked';

export function createTodoId() {
	return `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function defaultTodo() {
	const now = Date.now();
	return {
		id: createTodoId(),
		goalIndex: null,
		listType: 'goal',
		listId: 'goal:none',
		listName: null,
		title: '',
		markdown: '',
		status: 'todo',
		parentId: null,
		pinned: false,
		createdAt: now,
		updatedAt: now,
		ordering: now
	};
}

export function createNoteId() {
	return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function defaultNote({ content = '' } = {}) {
	const now = Date.now();
	return {
		id: createNoteId(),
		content: typeof content === 'string' ? content : '',
		createdAt: now,
		updatedAt: now
	};
}

function slugifyListName(name) {
	return String(name || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export const NEW_LIST_OPTION_VALUE = '__new_list__';

export function buildGoalListMeta(goalIndex) {
	const canonicalGoal =
		typeof goalIndex === 'number' && !Number.isNaN(goalIndex)
			? canonicalGoalIndex(goalIndex)
			: null;
	return {
		goalIndex: canonicalGoal,
		listType: 'goal',
		listId: canonicalGoal === null ? 'goal:none' : `goal:${canonicalGoal}`,
		listName: null
	};
}

export function buildCustomListMeta(listName) {
	const safeName =
		typeof listName === 'string' && listName.trim() ? listName.trim() : 'New list';
	return {
		goalIndex: null,
		listType: 'custom',
		listId: `custom:${slugifyListName(safeName) || 'new-list'}`,
		listName: safeName
	};
}

export function parseListSelection(value, newListName = '') {
	if (value === NEW_LIST_OPTION_VALUE) {
		const trimmedName = String(newListName || '').trim();
		if (!trimmedName) return null;
		return buildCustomListMeta(trimmedName);
	}
	if (value === '' || value === null || typeof value === 'undefined') {
		return buildGoalListMeta(null);
	}
	const parsedGoal = Number(value);
	if (Number.isNaN(parsedGoal)) return buildGoalListMeta(null);
	return buildGoalListMeta(parsedGoal);
}

export function normalizeTodoListMeta(todo) {
	const normalizedOrdering =
		typeof todo?.ordering === 'number' && Number.isFinite(todo.ordering)
			? todo.ordering
			: typeof todo?.createdAt === 'number' && Number.isFinite(todo.createdAt)
				? todo.createdAt
				: Date.now();

	const isCustom =
		todo?.listType === 'custom' ||
		(typeof todo?.listId === 'string' && todo.listId.startsWith('custom:'));

	if (isCustom) {
		const safeName =
			typeof todo?.listName === 'string' && todo.listName.trim()
				? todo.listName.trim()
				: 'New list';
		const safeId =
			typeof todo?.listId === 'string' && todo.listId.startsWith('custom:')
				? todo.listId
				: `custom:${slugifyListName(safeName) || 'new-list'}`;
		return {
			...todo,
			goalIndex: null,
			listType: 'custom',
			listId: safeId,
			listName: safeName,
			ordering: normalizedOrdering,
			pinned: todo?.pinned === true
		};
	}

	return {
		...todo,
		...buildGoalListMeta(todo?.goalIndex),
		ordering: normalizedOrdering,
		pinned: todo?.pinned === true
	};
}

export function normalizeNote(note) {
	if (!note || typeof note !== 'object') return defaultNote();
	const createdAt =
		typeof note.createdAt === 'number' && Number.isFinite(note.createdAt)
			? note.createdAt
			: Date.now();
	const updatedAt =
		typeof note.updatedAt === 'number' && Number.isFinite(note.updatedAt)
			? note.updatedAt
			: createdAt;
	return {
		id: typeof note.id === 'string' && note.id ? note.id : createNoteId(),
		content: typeof note.content === 'string' ? note.content : '',
		createdAt,
		updatedAt
	};
}

export function mergeNoteLists(localNotes, remoteNotes) {
	const safeLocal = Array.isArray(localNotes) ? localNotes.map((note) => normalizeNote(note)) : [];
	const safeRemote = Array.isArray(remoteNotes) ? remoteNotes.map((note) => normalizeNote(note)) : [];
	const byId = new Map();

	for (const note of [...safeLocal, ...safeRemote]) {
		const existing = byId.get(note.id);
		if (!existing || note.updatedAt > existing.updatedAt) {
			byId.set(note.id, note);
		}
	}

	return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

// Merge two todo arrays by id, preferring the todo with the newer updatedAt timestamp
export function mergeTodoLists(localTodos, remoteTodos) {
	const safeLocal = Array.isArray(localTodos) ? localTodos : [];
	const safeRemote = Array.isArray(remoteTodos) ? remoteTodos : [];

	const byIdLocal = new Map();
	const byIdRemote = new Map();

	for (const todo of safeLocal) {
		if (todo && typeof todo.id === 'string') {
			byIdLocal.set(todo.id, todo);
		}
	}

	for (const todo of safeRemote) {
		if (todo && typeof todo.id === 'string') {
			byIdRemote.set(todo.id, todo);
		}
	}

	const merged = [];
	const allIds = new Set([...byIdLocal.keys(), ...byIdRemote.keys()]);

	for (const id of allIds) {
		const localTodo = byIdLocal.get(id);
		const remoteTodo = byIdRemote.get(id);

		if (localTodo && remoteTodo) {
			const localUpdated =
				typeof localTodo.updatedAt === 'number' && Number.isFinite(localTodo.updatedAt)
					? localTodo.updatedAt
					: 0;
			const remoteUpdated =
				typeof remoteTodo.updatedAt === 'number' && Number.isFinite(remoteTodo.updatedAt)
					? remoteTodo.updatedAt
					: 0;

			merged.push(remoteUpdated > localUpdated ? remoteTodo : localTodo);
		} else if (localTodo) {
			merged.push(localTodo);
		} else if (remoteTodo) {
			merged.push(remoteTodo);
		}
	}

	// Preserve a stable ordering using the ordering field when available
	return merged.sort((a, b) => {
		const aOrder =
			typeof a?.ordering === 'number' && Number.isFinite(a.ordering)
				? a.ordering
				: typeof a?.createdAt === 'number' && Number.isFinite(a.createdAt)
					? a.createdAt
					: 0;
		const bOrder =
			typeof b?.ordering === 'number' && Number.isFinite(b.ordering)
				? b.ordering
				: typeof b?.createdAt === 'number' && Number.isFinite(b.createdAt)
					? b.createdAt
					: 0;
		return aOrder - bOrder;
	});
}

export function escapeHtml(str) {
	if (!str) return '';
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function normalizeNoteLinkHref(href) {
	if (typeof href !== 'string') return '';
	const trimmed = href.trim();
	if (!trimmed) return '';
	if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
	if (trimmed.startsWith('https://')) return trimmed;
	if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
	if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

function rewriteRenderedAnchors(html) {
	if (typeof html !== 'string' || html.length === 0) return html;
	return html.replace(/<a\b([^>]*?)\bhref=(["'])(.*?)\2([^>]*)>/gi, (_m, before, _q, rawHref, after) => {
		const normalizedHref = escapeHtml(normalizeNoteLinkHref(rawHref));
		if (!normalizedHref) return `<a${before}${after}>`;
		let attrs = `${before}${after}`;
		attrs = attrs.replace(/\s*\btarget=(["']).*?\1/gi, '');
		attrs = attrs.replace(/\s*\brel=(["']).*?\1/gi, '');
		return `<a${attrs} href="${normalizedHref}" target="_blank" rel="noopener noreferrer">`;
	});
}

// Configure marked with custom renderers for Tailwind styling
class CustomRenderer extends marked.Renderer {
	heading(token) {
		const level = token.depth;
		const text = this.parser.parseInline(token.tokens);
		const classes = {
			1: 'text-sm font-semibold mb-2',
			2: 'text-xs font-semibold mb-1',
			3: 'text-xs font-semibold mb-1'
		};
		return `<h${level} class="${classes[level] || 'text-xs font-semibold mb-1'}">${text}</h${level}>`;
	}

	code(token) {
		return `<code class="rounded bg-slate-800 px-1 py-0.5 text-[10px]">${token.text}</code>`;
	}

	codespan(token) {
		return `<code class="rounded bg-slate-800 px-1 py-0.5 text-[10px]">${token.text}</code>`;
	}

	list(token) {
		const tag = token.ordered ? 'ol' : 'ul';
		const classes = token.ordered ? 'mb-1 list-decimal ml-4' : 'mb-1 list-disc ml-4';
		const body = this.parser.parse(token.items);
		return `<${tag} class="${classes}">${body}</${tag}>`;
	}

	listitem(token) {
		const text = this.parser.parse(token.tokens);
		return `<li class="mb-1">${text}</li>`;
	}

	paragraph(token) {
		const text = this.parser.parseInline(token.tokens);
		return `<p class="mb-1">${text}</p>`;
	}

	link(token) {
		const text = this.parser.parseInline(token.tokens);
		const href = escapeHtml(normalizeNoteLinkHref(token.href || ''));
		if (!href) return text;
		const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : '';
		return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
	}
}

marked.use({
	gfm: true,
	breaks: true,
	renderer: new CustomRenderer()
});

export function renderMarkdown(md) {
	if (!md) return '';
	return rewriteRenderedAnchors(marked.parse(md));
}

function nextOrderedMarker(marker) {
	const match = marker.match(/^(\d+)([.)])$/);
	if (!match) return marker;
	const next = Number(match[1]) + 1;
	return `${next}${match[2]}`;
}

/**
 * Continue markdown list markers on Enter in a textarea.
 * Returns true when custom handling occurred.
 */
export function continueMarkdownListOnEnter(event) {
	if (!event || event.key !== 'Enter') return false;
	if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
	const el = event.target;
	if (!(el instanceof HTMLTextAreaElement)) return false;

	const start = el.selectionStart;
	const end = el.selectionEnd;
	if (typeof start !== 'number' || typeof end !== 'number' || start !== end) return false;

	const value = el.value ?? '';
	const lineStart = value.lastIndexOf('\n', start - 1) + 1;
	const lineEnd = value.indexOf('\n', start);
	const safeLineEnd = lineEnd === -1 ? value.length : lineEnd;

	const line = value.slice(lineStart, safeLineEnd);
	const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
	if (!match) return false;

	const [, indent, marker, content] = match;
	event.preventDefault();

	// If current list item is empty, pressing Enter exits the list.
	if (content.trim() === '') {
		const newValue = `${value.slice(0, lineStart)}${value.slice(safeLineEnd)}`;
		el.value = newValue;
		el.selectionStart = lineStart;
		el.selectionEnd = lineStart;
		el.dispatchEvent(new Event('input', { bubbles: true }));
		return true;
	}

	const nextMarker = /^\d+[.)]$/.test(marker) ? nextOrderedMarker(marker) : marker;
	const insertion = `\n${indent}${nextMarker} `;
	const newCursor = start + insertion.length;
	const newValue = `${value.slice(0, start)}${insertion}${value.slice(start)}`;

	el.value = newValue;
	el.selectionStart = newCursor;
	el.selectionEnd = newCursor;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

function getCurrentLineBounds(value, cursor) {
	const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
	const lineEnd = value.indexOf('\n', cursor);
	return {
		lineStart,
		lineEnd: lineEnd === -1 ? value.length : lineEnd
	};
}

function listLineParts(line) {
	return line.match(/^(\s*)([-*+]|\d+[.)])(\s+.*)?$/);
}

/**
 * Handle markdown editor keyboard behavior for lists:
 * - Enter: continue/exit list
 * - Tab / Shift+Tab: indent/outdent list item
 */
export function handleMarkdownEditorKeydown(event) {
	if (continueMarkdownListOnEnter(event)) return true;
	if (!event) return false;

	const el = event.target;
	if (!(el instanceof HTMLTextAreaElement)) return false;
	const start = el.selectionStart;
	const end = el.selectionEnd;
	if (typeof start !== 'number' || typeof end !== 'number') return false;

	const value = el.value ?? '';
	const { lineStart, lineEnd } = getCurrentLineBounds(value, start);
	const line = value.slice(lineStart, lineEnd);
	const parts = listLineParts(line);
	if (!parts) return false;

	const [, indent, marker] = parts;
	const shouldIndent = event.key === 'Tab' && !event.shiftKey;
	const shouldOutdent = event.key === 'Tab' && event.shiftKey;
	if (!shouldIndent && !shouldOutdent) return false;

	event.preventDefault();
	const indentStep = '  ';
	let nextIndent = indent;
	if (shouldIndent) {
		nextIndent = `${indent}${indentStep}`;
	} else if (shouldOutdent) {
		nextIndent = indent.startsWith(indentStep)
			? indent.slice(indentStep.length)
			: indent.startsWith(' ')
				? indent.slice(1)
				: indent;
	}
	if (nextIndent === indent) return true;

	const contentStart = lineStart + indent.length;
	const newLine = `${nextIndent}${marker}${line.slice(indent.length + marker.length)}`;
	const newValue = `${value.slice(0, lineStart)}${newLine}${value.slice(lineEnd)}`;
	const delta = nextIndent.length - indent.length;

	el.value = newValue;
	el.selectionStart = Math.max(lineStart, start + delta);
	el.selectionEnd = Math.max(lineStart, end + delta);
	if (start > contentStart && end > contentStart && delta !== 0) {
		el.selectionStart = start + delta;
		el.selectionEnd = end + delta;
	}
	el.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

export function getNoteTitle(markdown, fallback = 'Untitled') {
	if (typeof markdown !== 'string') return fallback;
	const firstLine = markdown.split(/\r?\n/, 1)[0]?.trim() || '';
	if (!firstLine) return fallback;
	const withoutHashes = firstLine.replace(/^#+\s*/, '').trim();
	return withoutHashes || fallback;
}

export function renderNoteMarkdown(markdown) {
	if (typeof markdown !== 'string' || markdown.trim() === '') return '';
	const lines = markdown.split(/\r?\n/);
	const firstLine = (lines[0] || '').trim();
	if (!firstLine || firstLine.startsWith('#')) {
		return renderMarkdown(markdown);
	}
	const rest = lines.slice(1).join('\n').trim();
	const withHeading = rest ? `# ${firstLine}\n\n${rest}` : `# ${firstLine}`;
	return renderMarkdown(withHeading);
}

/** Everything after the first line (first line is the note title for list/detail chrome). */
export function getNoteBodyMarkdown(markdown) {
	if (typeof markdown !== 'string') return '';
	const lines = markdown.split(/\r?\n/);
	return lines.slice(1).join('\n').trim();
}

export function renderNoteBodyMarkdown(markdown) {
	const body = getNoteBodyMarkdown(markdown);
	if (!body) return '';
	return renderMarkdown(body);
}

// Convert grid index to chess-like nomenclature (e.g., 40 -> "E5")
export function indexToNomenclature(index) {
	const row = Math.floor(index / 9) + 1; // 1-9
	const col = (index % 9) + 1; // 1-9
	const colLetter = String.fromCharCode(64 + col); // A-I
	return `${colLetter}${row}`;
}

// Convert nomenclature to grid index.
// Primary format: "E5". Legacy fallback: "5E".
export function nomenclatureToIndex(nomenclature, goalIndices = []) {
	if (!nomenclature) return null;

	// Primary: column-letter + row-number (e.g. "E5")
	if (nomenclature.length >= 2) {
		const match = nomenclature.match(/^([A-I])(\d)$/i);
		if (match) {
			const col = match[1].toUpperCase().charCodeAt(0) - 64; // A=1, B=2, etc.
			const row = parseInt(match[2], 10) - 1; // 0-8
			if (row >= 0 && row <= 8 && col >= 1 && col <= 9) {
				const index = row * 9 + (col - 1);
				if (goalIndices.length === 0 || goalIndices.includes(index)) {
					return index;
				}
			}
		}
	}

	// Legacy fallback: row-number + column-letter (e.g. "5E")
	if (nomenclature.length >= 2) {
		const legacyMatch = nomenclature.match(/^(\d)([A-I])$/i);
		if (legacyMatch) {
			const row = parseInt(legacyMatch[1], 10) - 1; // 0-8
			const col = legacyMatch[2].toUpperCase().charCodeAt(0) - 64; // A=1, B=2, etc.
			if (row >= 0 && row <= 8 && col >= 1 && col <= 9) {
				const index = row * 9 + (col - 1);
				if (goalIndices.length === 0 || goalIndices.includes(index)) {
					return index;
				}
			}
		}
	}

	// Fallback: plain numeric key (e.g. "40")
	if (/^\d+$/.test(nomenclature)) {
		const numericIndex = parseInt(nomenclature, 10);
		if (!Number.isNaN(numericIndex) && numericIndex >= 0 && numericIndex <= 80) {
			if (goalIndices.length === 0 || goalIndices.includes(numericIndex)) {
				return numericIndex;
			}
		}
	}

	return null;
}

function isMainGoalIndex(index) {
	return index === 40;
}

function isCenterSubGoalIndex(index) {
	if (typeof index !== 'number' || index < 0 || index > 80) return false;
	const row = Math.floor(index / 9);
	const col = index % 9;
	return row >= 3 && row <= 5 && col >= 3 && col <= 5 && !isMainGoalIndex(index);
}

function isOuterBlockCenterIndex(index) {
	if (typeof index !== 'number' || index < 0 || index > 80) return false;
	if (isMainGoalIndex(index)) return false;
	const row = Math.floor(index / 9);
	const col = index % 9;
	return row % 3 === 1 && col % 3 === 1;
}

// Linked goal for the "shadow" pairs:
// D4 <-> B2, E4 <-> E2, ..., F6 <-> H8.
export function getLinkedGoalIndex(index) {
	if (isCenterSubGoalIndex(index)) {
		const row = Math.floor(index / 9);
		const col = index % 9;
		const localRow = row - 3;
		const localCol = col - 3;
		const outerRow = localRow * 3 + 1;
		const outerCol = localCol * 3 + 1;
		return outerRow * 9 + outerCol;
	}

	if (isOuterBlockCenterIndex(index)) {
		const row = Math.floor(index / 9);
		const col = index % 9;
		const blockRow = Math.floor(row / 3);
		const blockCol = Math.floor(col / 3);
		const centerRow = 3 + blockRow;
		const centerCol = 3 + blockCol;
		return centerRow * 9 + centerCol;
	}

	return null;
}

// Canonical todo target: outer block center is the source of truth.
export function canonicalGoalIndex(index) {
	if (typeof index !== 'number' || index < 0 || index > 80) return index;
	if (isCenterSubGoalIndex(index)) {
		return getLinkedGoalIndex(index) ?? index;
	}
	return index;
}

// Get the parent goal index in the hierarchy:
// - Outer block centers (like B2) → main goal (E5, index 40)
// - Center sub-goals (like D4) → their linked outer block center → main goal (E5, index 40)
// - Main goal (E5, index 40) → null (no parent)
export function getParentGoalIndex(index) {
	if (typeof index !== 'number' || index < 0 || index > 80) return null;
	
	// Main goal has no parent
	if (isMainGoalIndex(index)) {
		return null;
	}
	
	// Center sub-goals: get their linked outer block center, then its parent
	if (isCenterSubGoalIndex(index)) {
		const linkedOuter = getLinkedGoalIndex(index);
		if (linkedOuter !== null) {
			// The outer block center's parent is the main goal
			return 40;
		}
		return null;
	}
	
	// Outer block centers: parent is the main goal
	if (isOuterBlockCenterIndex(index)) {
		return 40;
	}
	
	// Other cells have no parent
	return null;
}

// Get all sub-goal indices for a given goal index:
// - Main goal (40) → all outer block centers + their linked center sub-goals
// - Outer block centers → their linked center sub-goal
// - Center sub-goals → empty array (no sub-goals)
// - Other cells → empty array (no sub-goals)
export function getSubGoalIndices(index) {
	if (typeof index !== 'number' || index < 0 || index > 80) return [];
	
	const canonical = canonicalGoalIndex(index);
	const subGoals = [];
	
	// Main goal: get all outer block centers and their linked center sub-goals
	if (isMainGoalIndex(canonical)) {
		// Outer block centers are at positions where row % 3 === 1 && col % 3 === 1 (excluding main goal)
		for (let i = 0; i < 81; i++) {
			if (isOuterBlockCenterIndex(i)) {
				subGoals.push(i);
				// Also add the linked center sub-goal
				const linkedCenter = getLinkedGoalIndex(i);
				if (linkedCenter !== null) {
					subGoals.push(linkedCenter);
				}
			}
		}
		return subGoals;
	}
	
	// Outer block centers: get their linked center sub-goal
	if (isOuterBlockCenterIndex(canonical)) {
		const linkedCenter = getLinkedGoalIndex(canonical);
		if (linkedCenter !== null) {
			subGoals.push(linkedCenter);
		}
		return subGoals;
	}
	
	// Center sub-goals and other cells have no sub-goals
	return [];
}

// Update the updated_at timestamp for a goal (and its linked goal if applicable)
export function updateGoalTimestamp(grid, goalIndex) {
	if (!grid || typeof goalIndex !== 'number' || goalIndex < 0 || goalIndex > 80) return grid;
	
	const timestamp = new Date().toISOString();
	const canonicalIndex = canonicalGoalIndex(goalIndex);
	
	// Update the canonical goal
	if (!grid[canonicalIndex]) {
		grid[canonicalIndex] = { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
	}
	grid[canonicalIndex] = {
		...grid[canonicalIndex],
		updated_at: timestamp
	};
	
	// Also update the linked goal if it exists
	const linkedGoalIndex = getLinkedGoalIndex(goalIndex);
	if (linkedGoalIndex !== null && linkedGoalIndex !== canonicalIndex) {
		if (!grid[linkedGoalIndex]) {
			grid[linkedGoalIndex] = { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
		}
		grid[linkedGoalIndex] = {
			...grid[linkedGoalIndex],
			updated_at: timestamp
		};
	}
	
	// If editing a center sub-goal directly, also update it
	if (goalIndex !== canonicalIndex && goalIndex !== linkedGoalIndex) {
		if (!grid[goalIndex]) {
			grid[goalIndex] = { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
		}
		grid[goalIndex] = {
			...grid[goalIndex],
			updated_at: timestamp
		};
	}
	
	return grid;
}

export function getTodoOrderingValue(todo) {
	if (typeof todo?.ordering === 'number' && Number.isFinite(todo.ordering)) return todo.ordering;
	if (typeof todo?.createdAt === 'number' && Number.isFinite(todo.createdAt)) return todo.createdAt;
	return 0;
}

/**
 * Rows for the /todo pinned strip: pinned roots (no pinned ancestor), each followed by
 * all active descendants in tree order. indentLevel is relative to that pinned root.
 */
export function buildFeedPinnedRows(todos, getTodoOrdering = getTodoOrderingValue) {
	const active = (todos ?? []).filter((t) => t.status !== 'done');
	if (active.length === 0) return [];

	const byId = new Map(active.map((t) => [t.id, t]));
	const pinnedIds = new Set(active.filter((t) => t.pinned === true).map((t) => t.id));
	if (pinnedIds.size === 0) return [];

	function hasPinnedAncestor(todo) {
		let currentId = todo.parentId;
		const visited = new Set();
		while (currentId) {
			if (visited.has(currentId)) break;
			visited.add(currentId);
			if (pinnedIds.has(currentId)) return true;
			const parent = byId.get(currentId);
			if (!parent) break;
			currentId = parent.parentId;
		}
		return false;
	}

	const childrenByParent = new Map();
	for (const todo of active) {
		const parentKey = todo.parentId ?? '__root__';
		if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
		childrenByParent.get(parentKey).push(todo);
	}
	for (const siblings of childrenByParent.values()) {
		siblings.sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b));
	}

	const rows = [];
	function walkDescendants(parentId, depth) {
		for (const child of childrenByParent.get(parentId) ?? []) {
			rows.push({ todo: child, indentLevel: depth });
			walkDescendants(child.id, depth + 1);
		}
	}

	const roots = active
		.filter((t) => t.pinned === true && !hasPinnedAncestor(t))
		.sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b));

	for (const root of roots) {
		rows.push({ todo: root, indentLevel: 0 });
		walkDescendants(root.id, 1);
	}

	return rows;
}

/** Keep ancestor context when search matches a pinned subtree member. */
export function filterFeedPinnedRowsBySearch(rows, matchesSearch) {
	if (!rows.length) return [];
	if (!matchesSearch) return rows;

	const rowById = new Map(rows.map((row) => [row.todo.id, row]));
	const includeIds = new Set();

	function includeAncestors(todoId) {
		let parentId = rowById.get(todoId)?.todo?.parentId;
		const visited = new Set();
		while (parentId) {
			if (visited.has(parentId)) break;
			visited.add(parentId);
			const parentRow = rowById.get(parentId);
			if (!parentRow) break;
			includeIds.add(parentId);
			parentId = parentRow.todo.parentId ?? null;
		}
	}

	function includeDescendants(fromIndex) {
		const rootDepth = rows[fromIndex].indentLevel;
		for (let i = fromIndex + 1; i < rows.length; i++) {
			if (rows[i].indentLevel <= rootDepth) break;
			includeIds.add(rows[i].todo.id);
		}
	}

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (!matchesSearch(row.todo)) continue;
		includeIds.add(row.todo.id);
		includeAncestors(row.todo.id);
		includeDescendants(i);
	}

	return rows.filter((row) => includeIds.has(row.todo.id));
}

export function organizeTodosWithHierarchy(todosList, getTodoOrdering = getTodoOrderingValue) {
	const byParent = new Map();
	const ids = new Set(todosList.map((todo) => todo.id));
	for (const todo of todosList) {
		const parentKey = todo.parentId && ids.has(todo.parentId) ? todo.parentId : '__root__';
		if (!byParent.has(parentKey)) byParent.set(parentKey, []);
		byParent.get(parentKey).push(todo);
	}

	for (const siblingList of byParent.values()) {
		siblingList.sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b));
	}

	const ordered = [];
	function walk(parentId = null) {
		const key = parentId ?? '__root__';
		const siblings = byParent.get(key) || [];
		for (const todo of siblings) {
			ordered.push(todo);
			walk(todo.id);
		}
	}

	walk(null);
	return ordered;
}

/**
 * Build task→note and task→goal lookup maps in a single pass for O(1) row rendering.
 */
export function buildTaskNoteIndexMaps(notes, noteTaskLinks, taskGoalLinks, todos) {
	const notesById = new Map((notes ?? []).map((note) => [note.id, note]));
	const primaryNoteByTaskId = new Map();
	const freeNotesByTaskId = new Map();

	for (const link of noteTaskLinks ?? []) {
		const note = notesById.get(link.noteId);
		if (!note) continue;
		if (link.isPrimary === true) {
			primaryNoteByTaskId.set(link.taskId, note);
			continue;
		}
		if (!freeNotesByTaskId.has(link.taskId)) freeNotesByTaskId.set(link.taskId, []);
		freeNotesByTaskId.get(link.taskId).push(note);
	}

	for (const notesList of freeNotesByTaskId.values()) {
		notesList.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
	}

	const goalIndicesByTaskId = new Map();
	for (const link of taskGoalLinks ?? []) {
		if (!goalIndicesByTaskId.has(link.taskId)) goalIndicesByTaskId.set(link.taskId, []);
		const indices = goalIndicesByTaskId.get(link.taskId);
		if (!indices.includes(link.goalIndex)) indices.push(link.goalIndex);
	}
	for (const todo of todos ?? []) {
		if (typeof todo?.goalIndex !== 'number' || !todo.id) continue;
		const canonical = canonicalGoalIndex(todo.goalIndex);
		if (!goalIndicesByTaskId.has(todo.id)) goalIndicesByTaskId.set(todo.id, []);
		const indices = goalIndicesByTaskId.get(todo.id);
		if (!indices.includes(canonical)) indices.push(canonical);
	}
	for (const [taskId, indices] of goalIndicesByTaskId) {
		goalIndicesByTaskId.set(
			taskId,
			[...indices].sort((a, b) => a - b)
		);
	}

	return { primaryNoteByTaskId, freeNotesByTaskId, goalIndicesByTaskId };
}

const GOAL_GROUP_ORDER_STEP = 1024;

/**
 * Single O(n) pass to build All Tasks feed groups, sidebar menu items, and counts.
 */
export function buildAllTasksFeed({
	todos = [],
	grid = [],
	taskGoalKeySet = new Set(),
	linkedTaskIdSet = new Set(),
	getTodoOrdering = getTodoOrderingValue,
	goalGroupOrderStep = GOAL_GROUP_ORDER_STEP
} = {}) {
	const active = (todos ?? []).filter((t) => !t?.isDraft && t.status !== 'done');

	function isUnassignedNoGoalTodo(t) {
		return (
			(t.listType === 'goal' || !t.listType) &&
			t.goalIndex == null &&
			!linkedTaskIdSet.has(t.id)
		);
	}

	const noGoalTodos = [];
	const goalBuckets = new Map();
	const customBuckets = new Map();

	for (const t of active) {
		if (t.listType === 'custom') {
			if (!customBuckets.has(t.listId)) {
				customBuckets.set(t.listId, { listName: t.listName || 'New list', todos: [] });
			}
			customBuckets.get(t.listId).todos.push(t);
			continue;
		}

		if (t.listType !== 'goal' && t.listType) continue;

		if (isUnassignedNoGoalTodo(t)) {
			if (!t.pinned) noGoalTodos.push(t);
			continue;
		}

		if (typeof t.goalIndex === 'number') {
			const idx = canonicalGoalIndex(t.goalIndex);
			if (!goalBuckets.has(idx)) goalBuckets.set(idx, new Map());
			goalBuckets.get(idx).set(t.id, t);
		}

		for (const key of taskGoalKeySet) {
			const sep = key.lastIndexOf(':');
			if (sep === -1) continue;
			const taskId = key.slice(0, sep);
			const goalIdx = Number(key.slice(sep + 1));
			if (taskId !== t.id || Number.isNaN(goalIdx)) continue;
			if (!goalBuckets.has(goalIdx)) goalBuckets.set(goalIdx, new Map());
			goalBuckets.get(goalIdx).set(t.id, t);
		}
	}

	const goalGroups = [];
	for (const [goalIndex, bucketMap] of goalBuckets) {
		const bucketTodos = [...bucketMap.values()];
		const organized = organizeTodosWithHierarchy(bucketTodos, getTodoOrdering);
		if (organized.length === 0) continue;
		const cell = grid[goalIndex];
		const text = (cell?.text ?? '').trim();
		goalGroups.push({
			id: `goal-${goalIndex}`,
			groupType: 'goal',
			goalIndex,
			label: text || indexToNomenclature(goalIndex),
			href: `/todo/${indexToNomenclature(goalIndex)}`,
			addTitle: 'Add todo to this goal',
			todos: organized,
			goalOrdering:
				typeof cell?.todo_group_ordering === 'number' && Number.isFinite(cell.todo_group_ordering)
					? cell.todo_group_ordering
					: (goalIndex + 1) * goalGroupOrderStep,
			updated_at: cell?.updated_at || null
		});
	}

	goalGroups.sort((a, b) => {
		if (a.goalOrdering !== b.goalOrdering) return a.goalOrdering - b.goalOrdering;
		return a.goalIndex - b.goalIndex;
	});

	const groups = [...goalGroups];
	const organizedNoGoal = organizeTodosWithHierarchy(noGoalTodos, getTodoOrdering);
	if (organizedNoGoal.length > 0) {
		groups.unshift({
			id: 'no-goal',
			groupType: 'no-goal',
			goalIndex: null,
			label: '',
			href: null,
			addTitle: 'Add todo without goal',
			todos: organizedNoGoal
		});
	}

	const customGroups = [];
	for (const [listId, { listName, todos: customTodos }] of customBuckets) {
		customGroups.push({
			id: listId,
			groupType: 'custom',
			goalIndex: null,
			listId,
			label: listName,
			href: null,
			addTitle: `Add todo to ${listName}`,
			todos: organizeTodosWithHierarchy(customTodos, getTodoOrdering)
		});
	}

	const todoGroups = [...groups, ...customGroups];
	const goalMenuItems = goalGroups.map((group) => ({
		id: group.id,
		label: group.label,
		href: group.href,
		count: group.todos.length
	}));
	const allTodos = [...active].sort((a, b) => getTodoOrdering(a) - getTodoOrdering(b));

	const groupsByTodoId = new Map();
	for (const group of todoGroups) {
		for (const todo of group.todos) {
			groupsByTodoId.set(todo.id, group);
		}
	}

	return { todoGroups, goalMenuItems, allTodos, groupsByTodoId, goalGroups };
}
