import { json } from '@sveltejs/kit';
import { verifyAgentRequest } from './mlauth.js';
import { assertAgentCanAccessHuman, adminOrThrow, normalizeHumanEmail } from './agentAccess.js';

export function badRequest(msg, code = 'bad_request') {
	return json({ error: msg, code }, { status: 400 });
}

/**
 * @param {unknown} err
 * @param {string} [fallback]
 */
export function jsonFromAgentError(err, fallback = 'server_error') {
	if (!(err instanceof Error)) {
		return json({ error: fallback, code: fallback }, { status: 500 });
	}
	const code = 'code' in err && typeof err.code === 'string' ? err.code : fallback;
	const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;
	if (status >= 500) console.error('[agent-api]', err);
	const msg =
		status === 404
			? 'Not found'
			: status === 403
				? 'Forbidden'
				: status === 401
					? 'Unauthorized'
					: err.message || fallback;
	return json({ error: msg, code }, { status });
}

/**
 * @param {Request} request
 * @returns {Promise<{ ok: true, body: Record<string, unknown> } | { ok: false }>}
 */
export async function readJsonBody(request) {
	try {
		const body = await request.json();
		return { ok: true, body: body && typeof body === 'object' ? body : {} };
	} catch {
		return { ok: false };
	}
}

/**
 * @param {URLSearchParams} sp
 * @param {'qs' | 'body'} source
 */
export function readMlAuth(sp, body, source) {
	/** @type {string | undefined} */
	let dumbname;
	/** @type {string | undefined} */
	let timestamp;
	/** @type {string | undefined} */
	let signature;
	/** @type {string | undefined} */
	let message;
	if (source === 'qs') {
		dumbname = sp.get('dumbname') ?? undefined;
		timestamp = sp.get('timestamp') ?? undefined;
		signature = sp.get('signature') ?? undefined;
		message = sp.get('message') ?? undefined;
	} else {
		dumbname = typeof body.dumbname === 'string' ? body.dumbname : undefined;
		timestamp = typeof body.timestamp === 'string' ? body.timestamp : undefined;
		signature = typeof body.signature === 'string' ? body.signature : undefined;
		message = typeof body.message === 'string' ? body.message : undefined;
	}
	return { dumbname, timestamp, signature, message };
}

/**
 * @param {URLSearchParams} sp
 * @param {Record<string, unknown>} body
 * @param {'get' | 'post' | 'patch' | 'delete'} verb
 */
export async function authorizeAgent(sp, body, verb) {
	const pack = readMlAuth(sp, body, verb === 'get' ? 'qs' : 'body');
	if (!pack.dumbname?.trim() || !pack.timestamp || !pack.signature) {
		throw Object.assign(new Error('missing_mlauth'), { code: 'missing_mlauth', status: 401 });
	}
	await verifyAgentRequest(pack.dumbname, pack.timestamp, pack.signature, pack.message ?? '');
	return pack.dumbname.trim();
}

/**
 * @param {string} humanEmailRaw
 * @param {string} agentDumbname
 */
export async function authorizeAgentForHuman(humanEmailRaw, agentDumbname) {
	const humanEmail = normalizeHumanEmail(humanEmailRaw);
	if (!humanEmail) {
		throw Object.assign(new Error('missing_human_email'), { code: 'missing_human_email', status: 400 });
	}
	const admin = adminOrThrow();
	return assertAgentCanAccessHuman(admin, humanEmail, agentDumbname);
}
