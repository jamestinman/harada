import { canonicalGoalIndex, nomenclatureToIndex, isPinnedGoalNomenclature, PINNED_GOAL_INDEX, isPinnedGoalIndex } from '$lib/todoUtils.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

export function normalizeHumanEmail(email) {
	return String(email || '')
		.trim()
		.toLowerCase();
}

/**
 * @param {string | undefined} raw
 * @returns {number | null}
 */
export function parseGoalIndexParam(raw) {
	if (raw == null || raw === '') return null;
	const s = String(raw);
	if (isPinnedGoalNomenclature(s)) return PINNED_GOAL_INDEX;
	if (/^\d+$/.test(s)) {
		const n = parseInt(s, 10);
		if (n < 0 || n > 80) return null;
		return canonicalGoalIndex(n);
	}
	const idx = nomenclatureToIndex(s, []);
	if (idx === null) return null;
	if (isPinnedGoalIndex(idx)) return PINNED_GOAL_INDEX;
	return canonicalGoalIndex(idx);
}

/** @param {import('@supabase/supabase-js').SupabaseClient} admin */
export async function lookupUserIdByEmail(admin, email) {
	const normalized = normalizeHumanEmail(email);
	if (!normalized) return null;
	const { data, error } = await admin.rpc('lookup_user_id_by_email', { lookup_email: normalized });
	if (error) {
		console.error('lookup_user_id_by_email', error.message);
		return null;
	}
	return data || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} humanEmail
 * @param {string} agentDumbname
 */
export async function assertAgentCanAccessHuman(admin, humanEmail, agentDumbname) {
	const userId = await lookupUserIdByEmail(admin, humanEmail);
	if (!userId) {
		throw Object.assign(new Error('user_not_found'), { code: 'user_not_found', status: 404 });
	}

	const { data: settings } = await admin
		.from('user_agent_api_settings')
		.select('enabled')
		.eq('user_id', userId)
		.maybeSingle();

	if (!settings?.enabled) {
		throw Object.assign(new Error('agent_api_disabled'), { code: 'agent_api_disabled', status: 403 });
	}

	const { data: row } = await admin
		.from('agent_access_requests')
		.select('status')
		.eq('user_id', userId)
		.eq('agent_dumbname', agentDumbname)
		.maybeSingle();

	if (!row || row.status !== 'approved') {
		throw Object.assign(new Error('agent_not_approved'), { code: 'agent_not_approved', status: 403 });
	}

	return { userId };
}

/** @returns {import('@supabase/supabase-js').SupabaseClient} */
export function adminOrThrow() {
	return getSupabaseAdmin();
}
