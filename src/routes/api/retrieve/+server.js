import { json } from '@sveltejs/kit';
import { extractContentServer } from '$lib/server/content.server.mjs';
import { normalizeUrl } from '$lib/urlUtils.js';

export async function GET({ url }) {
	const rawUrl = url.searchParams.get('url');
	if (!rawUrl) {
		return json({ ok: 0, status: 400, message: 'Missing url parameter' }, { status: 400 });
	}

	const normalized = normalizeUrl(rawUrl);
	if (!normalized) {
		return json({ ok: 0, status: 400, message: 'Invalid url' }, { status: 400 });
	}

	try {
		const content = await extractContentServer(normalized);
		if (content && content.ok === 0) {
			return json(content, { status: content.status || 500 });
		}
		if (!content?.title) {
			return json(
				{ ok: 0, status: 404, message: 'No title returned from URL' },
				{ status: 404 }
			);
		}
		return json(content ?? { ok: 0, status: 500, message: 'No content returned' });
	} catch (e) {
		console.error('[api/retrieve]', e);
		return json(
			{ ok: 0, status: 500, message: e?.message || 'Internal Error' },
			{ status: 500 }
		);
	}
}
