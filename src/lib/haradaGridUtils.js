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

/**
 * A cell emptied by a deliberate user action (merge or clear).
 *
 * Always blank, and always carries a timestamp. Sync resolves each cell by
 * last-write-wins on updated_at, so an untimestamped clear counts as time 0 and
 * loses to the remote copy that still holds the old text - which is how merged
 * goals used to reappear in their old squares after a sync.
 *
 * Distinct from the store's defaultCell(index), which re-seeds placeholder text
 * ("Goal 3") at template positions - not what a merge wants.
 *
 * @param {string} [timestamp] ISO string; defaults to now.
 */
export function clearedCell(timestamp = new Date().toISOString()) {
	return { text: '', status: 'todo', readme: '', color: 'default', updated_at: timestamp };
}

/** @param {{updated_at?: string | null} | null | undefined} cell */
function cellTime(cell) {
	const raw = cell?.updated_at;
	if (!raw) return 0;
	const time = new Date(raw).getTime();
	return Number.isFinite(time) ? time : 0;
}

/**
 * Decide which version of a single grid cell wins during sync.
 *
 * Shared by the snapshot merge and the realtime handler so the two cannot drift.
 *
 * @param {object|null|undefined} localCell
 * @param {object|null|undefined} remoteCell
 * @returns {{ cell: object|null|undefined, changed: boolean }}
 */
export function resolveGridCell(localCell, remoteCell) {
	const localTime = cellTime(localCell);
	const remoteTime = cellTime(remoteCell);
	const localText = (localCell?.text ?? '').trim();
	const remoteText = (remoteCell?.text ?? '').trim();

	// Never let a freshly-seeded blank remote cell (no updated_at, no text) wipe a
	// populated local title just because local also lacks updated_at.
	if (localText && !remoteText && remoteTime === 0) {
		return { cell: localCell, changed: false };
	}

	if (remoteTime > localTime) {
		return { cell: remoteCell, changed: true };
	}

	if (remoteTime === localTime && JSON.stringify(remoteCell) !== JSON.stringify(localCell)) {
		// Tie on timestamp: prefer the cell that actually holds content over a blank one.
		if (localText && !remoteText) return { cell: localCell, changed: false };
		return { cell: remoteCell, changed: true };
	}

	return { cell: localCell, changed: false };
}

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
