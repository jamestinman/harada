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
		createdAt: now,
		updatedAt: now,
		ordering: now
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
			ordering: normalizedOrdering
		};
	}

	return {
		...todo,
		...buildGoalListMeta(todo?.goalIndex),
		ordering: normalizedOrdering
	};
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
}

marked.use({
	gfm: true,
	breaks: true,
	renderer: new CustomRenderer()
});

export function renderMarkdown(md) {
	if (!md) return '';
	return marked.parse(md);
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
