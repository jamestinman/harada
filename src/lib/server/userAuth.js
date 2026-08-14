import { getSupabaseAdmin } from './supabaseAdmin.js';

/**
 * Resolve the signed-in user from a Supabase access token sent as
 * `Authorization: Bearer <token>`.
 *
 * The app is local-first and has no server-side session, so endpoints that act
 * on a user's behalf verify the client's Supabase JWT instead of a cookie.
 *
 * @param {Request} request
 * @returns {Promise<string>} the authenticated user id
 */
export async function requireUserId(request) {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
	if (!match) {
		throw Object.assign(new Error('Sign-in required'), {
			status: 401,
			code: 'auth_required'
		});
	}

	let admin;
	try {
		admin = getSupabaseAdmin();
	} catch {
		throw Object.assign(new Error('Auth is not configured'), {
			status: 503,
			code: 'auth_unavailable'
		});
	}

	const { data, error } = await admin.auth.getUser(match[1]);
	if (error || !data?.user?.id) {
		throw Object.assign(new Error('Invalid or expired session'), {
			status: 401,
			code: 'invalid_token'
		});
	}

	return data.user.id;
}
