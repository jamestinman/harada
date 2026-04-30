import { getSupabaseAdmin } from './supabaseAdmin.js';

function emptyGrid() {
	return Array.from({ length: 81 }, () => ({
		text: '',
		status: 'todo',
		readme: '',
		color: 'default',
		updated_at: null
	}));
}

/**
 * @param {string} userId
 * @returns {Promise<{ grid: object[], title?: string }>}
 */
export async function loadOrCreateChart(userId) {
	const admin = getSupabaseAdmin();
	const { data, error } = await admin
		.from('harada_charts')
		.select('grid, title')
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw error;
	if (data?.grid && Array.isArray(data.grid) && data.grid.length === 81) {
		return { grid: data.grid, title: data.title };
	}
	const grid = emptyGrid();
	const { error: insErr } = await admin.from('harada_charts').insert({
		user_id: userId,
		grid,
		title: 'My Harada Chart'
	});
	if (insErr) throw insErr;
	return { grid, title: 'My Harada Chart' };
}

/**
 * @param {string} userId
 * @param {unknown[]} grid
 */
export async function persistChartGrid(userId, grid) {
	const admin = getSupabaseAdmin();
	const { error } = await admin
		.from('harada_charts')
		.update({ grid, updated_at: new Date().toISOString() })
		.eq('user_id', userId);
	if (error) throw error;
}

function defaultCell() {
	return {
		text: '',
		status: 'todo',
		readme: '',
		color: 'default',
		updated_at: new Date().toISOString()
	};
}

/**
 * @param {unknown[]} grid
 * @param {number} goalIndex
 */
export function ensureCell(grid, goalIndex) {
	if (!grid[goalIndex] || typeof grid[goalIndex] !== 'object') {
		grid[goalIndex] = defaultCell();
	}
	return grid[goalIndex];
}

export { defaultCell };
