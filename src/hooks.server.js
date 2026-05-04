import { redirect } from '@sveltejs/kit';

/** @param {import('@sveltejs/kit').Handle} handler */
function agentCorsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization'
	};
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	if (event.url.pathname === '/home' || event.url.pathname.startsWith('/home/')) {
		const suffix = event.url.pathname.slice('/home'.length) || '';
		throw redirect(308, `/harada${suffix}${event.url.search}`);
	}

	if (event.url.pathname.startsWith('/api/agent')) {
		if (event.request.method === 'OPTIONS') {
			return new Response(null, { headers: agentCorsHeaders() });
		}
		const res = await resolve(event);
		for (const [k, v] of Object.entries(agentCorsHeaders())) {
			res.headers.set(k, v);
		}
		return res;
	}
	return resolve(event);
}
