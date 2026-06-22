/** Placeholder cells applied when a user has not configured their chart yet. */
const SEEDED_CELLS = [
	{ text: 'Central Goal', index: 4 * 9 + 4 },
	{ text: 'Goal 1', index: 10 },
	{ text: 'Goal 1', index: 3 * 9 + 3 },
	{ text: 'Goal 2', index: 13 },
	{ text: 'Goal 2', index: 3 * 9 + 4 },
	{ text: 'Goal 3', index: 16 },
	{ text: 'Goal 3', index: 3 * 9 + 5 },
	{ text: 'Goal 4', index: 37 },
	{ text: 'Goal 4', index: 4 * 9 + 3 },
	{ text: 'Goal 5', index: 43 },
	{ text: 'Goal 5', index: 4 * 9 + 5 },
	{ text: 'Goal 6', index: 64 },
	{ text: 'Goal 6', index: 5 * 9 + 3 },
	{ text: 'Goal 7', index: 67 },
	{ text: 'Goal 7', index: 5 * 9 + 4 },
	{ text: 'Goal 8', index: 70 },
	{ text: 'Goal 8', index: 5 * 9 + 5 }
];

const seededTextByIndex = new Map(SEEDED_CELLS.map((cell) => [cell.index, cell.text]));

/** @param {unknown} grid */
export function isChartEmpty(grid) {
	if (!Array.isArray(grid)) return true;
	return grid.every((cell) => !(cell?.text ?? '').trim());
}

/** True when every cell is blank or still has only the auto-seeded placeholder text. */
export function isChartUnset(grid) {
	if (!Array.isArray(grid)) return true;
	return grid.every((cell, i) => {
		const text = (cell?.text ?? '').trim();
		if (!text) return true;
		return text === (seededTextByIndex.get(i) ?? '');
	});
}
