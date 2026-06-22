import test from 'node:test';
import assert from 'node:assert/strict';
import { isChartEmpty, isChartUnset } from './haradaGridUtils.js';

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
