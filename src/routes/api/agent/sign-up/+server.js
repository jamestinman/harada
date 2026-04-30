import { json } from '@sveltejs/kit';
import { verifyAgentRequest } from '$lib/server/mlauth.js';
import { badRequest, readJsonBody, jsonFromAgentError } from '$lib/server/agentRoutes.js';

export async function POST({ request }) {
	try {
		const parsed = await readJsonBody(request);
		if (!parsed.ok) return badRequest('invalid_json', 'invalid_json');
		const body = parsed.body;
		const dumbname = typeof body.dumbname === 'string' ? body.dumbname.trim() : '';
		const timestamp = typeof body.timestamp === 'string' ? body.timestamp : '';
		const signature = typeof body.signature === 'string' ? body.signature : '';
		const message = typeof body.message === 'string' ? body.message : 'SIGNUP';
		if (!dumbname || !timestamp || !signature) {
			return json({ error: 'missing_mlauth', code: 'missing_mlauth' }, { status: 401 });
		}
		if (message !== 'SIGNUP') return badRequest('Signed message must be SIGNUP', 'invalid_message');
		const agent = await verifyAgentRequest(dumbname, timestamp, signature, message);
		return json({
			ok: true,
			dumbname: agent?.dumbname ?? dumbname,
			agent_id: agent?.agent_id ?? null,
			karma: agent?.karma ?? 0,
			key_status: agent?.key_status ?? null
		});
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
