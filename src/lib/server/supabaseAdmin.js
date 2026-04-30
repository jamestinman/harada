import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SECRET_KEY } from '$env/static/private';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let _admin = null;

export function getSupabaseAdmin() {
	if (!PUBLIC_SUPABASE_URL) throw new Error('Missing PUBLIC_SUPABASE_URL');
	if (!SUPABASE_SECRET_KEY) {
		throw new Error('Missing SUPABASE_SECRET_KEY (service role) for agent API');
	}
	if (!_admin) {
		_admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
			auth: { persistSession: false, autoRefreshToken: false }
		});
	}
	return _admin;
}
