import test from 'node:test';
import assert from 'node:assert/strict';
import { clearedCell, isChartEmpty, isChartUnset, resolveGridCell } from './haradaGridUtils.js';

test('isChartEmpty is true for blank grids', () => {
	const grid = Array.from({ length: 81 }, () => ({ text: '' }));
	assert.equal(isChartEmpty(grid), true);
	assert.equal(isChartUnset(grid), true);
});

test('isChartUnset treats auto-seeded placeholders as unset', () => {
	const grid = Array.from({ length: 81 }, () => ({ text: '' }));
	grid[40] = { text: 'Central Goal' };
	grid[10] = { text: 'Goal 1' };
	assert.equal(isChartEmpty(grid), false);
	assert.equal(isChartUnset(grid), true);
});

test('isChartUnset is false once the user has entered a custom goal', () => {
	const grid = Array.from({ length: 81 }, () => ({ text: '' }));
	grid[40] = { text: 'Run a marathon' };
	assert.equal(isChartUnset(grid), false);
});

// Regression: merged goals reappearing in their old square after a sync.
// A cleared cell used to be written with updated_at: null, which counts as time
// 0, so the remote copy that still held the old title always won.

test('clearedCell is blank and carries a timestamp', () => {
	const cell = clearedCell('2026-08-16T09:00:00.000Z');
	assert.equal(cell.text, '');
	assert.equal(cell.readme, '');
	assert.equal(cell.updated_at, '2026-08-16T09:00:00.000Z');
});

test('a timestamped clear beats a stale remote cell that still has the title', () => {
	const local = clearedCell('2026-08-16T09:00:00.000Z');
	const remote = { text: 'CURTXT', status: 'todo', readme: '', color: 'default', updated_at: '2026-08-15T09:00:00.000Z' };

	const { cell, changed } = resolveGridCell(local, remote);
	assert.equal(cell.text, '', 'merged goal must not come back');
	assert.equal(changed, false);
});

test('an untimestamped clear would lose - this is the old bug', () => {
	const brokenClear = { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
	const remote = { text: 'CURTXT', status: 'todo', readme: '', color: 'default', updated_at: '2026-08-15T09:00:00.000Z' };

	// Documents why clearedCell must stamp: with updated_at null the old title wins.
	assert.equal(resolveGridCell(brokenClear, remote).cell.text, 'CURTXT');
});

test('a genuinely newer remote edit still wins over an older local cell', () => {
	const local = { text: 'old title', updated_at: '2026-08-15T09:00:00.000Z' };
	const remote = { text: 'new title', updated_at: '2026-08-16T09:00:00.000Z' };

	const { cell, changed } = resolveGridCell(local, remote);
	assert.equal(cell.text, 'new title');
	assert.equal(changed, true);
});

test('a remote clear made on another device still propagates', () => {
	const local = { text: 'CURTXT', updated_at: '2026-08-15T09:00:00.000Z' };
	const remote = clearedCell('2026-08-16T09:00:00.000Z');

	const { cell, changed } = resolveGridCell(local, remote);
	assert.equal(cell.text, '', 'a clear from another device must still apply');
	assert.equal(changed, true);
});

test('a blank untimestamped remote cell never wipes a populated local title', () => {
	const local = { text: 'Haradato', updated_at: '2026-08-15T09:00:00.000Z' };
	const remote = { text: '', updated_at: null };

	const { cell, changed } = resolveGridCell(local, remote);
	assert.equal(cell.text, 'Haradato');
	assert.equal(changed, false);
});
