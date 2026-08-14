import { supabase } from '$lib/supabaseClient.js';

const HOSTED_RETRIEVE_ENDPOINT = 'https://haradato.com/api/retrieve';

function retrieveEndpoint() {
	if (typeof window === 'undefined') return '/api/retrieve';
	if (window.Capacitor?.isNativePlatform?.()) return HOSTED_RETRIEVE_ENDPOINT;
	if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') {
		return HOSTED_RETRIEVE_ENDPOINT;
	}
	return '/api/retrieve';
}

/** /api/retrieve fetches on the user's behalf, so it requires a signed-in session. */
async function accessToken() {
	if (!supabase) return null;
	try {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		return session?.access_token ?? null;
	} catch {
		return null;
	}
}

export async function fetchUrlContent(url) {
	const token = await accessToken();
	if (!token) {
		return { ok: 0, status: 401, message: 'Sign in to load content from a URL' };
	}

	const response = await fetch(`${retrieveEndpoint()}?url=${encodeURIComponent(url)}`, {
		headers: {
			Authorization: `Bearer ${token}`
		}
	});

	if (!response.ok) {
		let message = 'Unable to load URL';
		try {
			const body = await response.json();
			message = body.message || message;
		} catch {
			message = response.statusText || message;
		}
		return { ok: 0, status: response.status, message };
	}

	try {
		return await response.json();
	} catch {
		return { ok: 0, status: 500, message: 'Invalid response from server' };
	}
}
