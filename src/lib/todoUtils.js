// Utility functions for todo management

export function createTodoId() {
	return `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function defaultTodo() {
	return {
		id: createTodoId(),
		goalIndex: null,
		title: '',
		markdown: '',
		status: 'todo',
		createdAt: Date.now()
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

export function renderMarkdown(md) {
	if (!md) return '';
	let html = escapeHtml(md);

	// Headings
	html = html.replace(/^### (.*)$/gim, '<h3 class="text-xs font-semibold mb-1">$1</h3>');
	html = html.replace(/^## (.*)$/gim, '<h2 class="text-xs font-semibold mb-1">$1</h2>');
	html = html.replace(/^# (.*)$/gim, '<h1 class="text-sm font-semibold mb-2">$1</h1>');

	// Bold / italic / code
	html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
	html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
	html = html.replace(
		/`([^`]+)`/gim,
		'<code class="rounded bg-slate-800 px-1 py-0.5 text-[10px]">$1</code>'
	);

	// Simple unordered lists
	html = html.replace(/^(?:-|\*) (.*)$/gim, '<li class="ml-4 list-disc">$1</li>');
	html = html.replace(/(<li[\s\S]*?<\/li>)/gim, '<ul class="mb-1">$1</ul>');

	// Line breaks
	html = html.replace(/\n/g, '<br />');

	return html;
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
