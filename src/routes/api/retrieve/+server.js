import { json } from '@sveltejs/kit';
import { extractContentServer } from '$lib/server/content.server.mjs';
import { normalizeUrl } from '$lib/urlUtils.js';
import { requireUserId } from '$lib/server/userAuth.js';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function jsonWithCors(data, init) {
	const response = json(data, init);
	for (const [key, value] of Object.entries(corsHeaders)) {
		response.headers.set(key, value);
	}
	return response;
}

export function OPTIONS() {
	return new Response(null, { headers: corsHeaders });
}

export async function GET({ url, request }) {
	let userId;
	try {
		userId = await requireUserId(request);
	} catch (e) {
		const status = e?.status ?? 401;
		return jsonWithCors({ ok: 0, status, message: e?.message || 'Unauthorized' }, { status });
	}

	const rawUrl = url.searchParams.get('url');
	if (!rawUrl) {
		return jsonWithCors({ ok: 0, status: 400, message: 'Missing url parameter' }, { status: 400 });
	}

	const normalized = normalizeUrl(rawUrl);
	if (!normalized) {
		return jsonWithCors({ ok: 0, status: 400, message: 'Invalid url' }, { status: 400 });
	}

	try {
		// extractContentServer applies the SSRF guard (see urlGuard.server.mjs) so
		// any public URL is allowed but internal addresses are refused.
		const content = await extractContentServer(normalized);
		if (content && content.ok === 0) {
			return jsonWithCors(content, { status: content.status || 500 });
		}
		if (!content?.title) {
			return jsonWithCors(
				{ ok: 0, status: 404, message: 'No title returned from URL' },
				{ status: 404 }
			);
		}
		return jsonWithCors(content ?? { ok: 0, status: 500, message: 'No content returned' });
	} catch (e) {
		console.error('[api/retrieve]', userId, e);
		// Don't echo internal error text back to the caller.
		return jsonWithCors({ ok: 0, status: 500, message: 'Internal Error' }, { status: 500 });
	}
}
