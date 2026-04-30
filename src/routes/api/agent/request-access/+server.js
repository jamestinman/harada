import { json } from '@sveltejs/kit';
import { PUBLIC_APP_ORIGIN } from '$env/static/public';
import { verifyAgentRequest } from '$lib/server/mlauth.js';
import {
	badRequest,
	readJsonBody,
	jsonFromAgentError,
	readMlAuth
} from '$lib/server/agentRoutes.js';
import { adminOrThrow, lookupUserIdByEmail, normalizeHumanEmail } from '$lib/server/agentAccess.js';

const publicOrigin = PUBLIC_APP_ORIGIN || 'https://www.haradato.com';

export async function POST({ request }) {
	try {
		const parsed = await readJsonBody(request);
		if (!parsed.ok) return badRequest('invalid_json', 'invalid_json');
		const body = parsed.body;
		const humanEmailRaw = typeof body.human_email === 'string' ? body.human_email : '';
		const humanEmail = normalizeHumanEmail(humanEmailRaw);
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');

		const pack = readMlAuth(new URLSearchParams(), body, 'body');
		const dumbname = typeof pack.dumbname === 'string' ? pack.dumbname.trim() : '';
		if (!dumbname || !pack.timestamp || !pack.signature) {
			return json({ error: 'missing_mlauth', code: 'missing_mlauth' }, { status: 401 });
		}
		const expectedMessage = `REQUEST_ACCESS:${humanEmail}`;
		if ((pack.message ?? '') !== expectedMessage) {
			return badRequest('Signed message must match REQUEST_ACCESS:<human_email>', 'message_mismatch');
		}

		await verifyAgentRequest(dumbname, pack.timestamp, pack.signature, expectedMessage);

		const admin = adminOrThrow();
		const userId = await lookupUserIdByEmail(admin, humanEmail);
		if (!userId) {
			return json(
				{
					error: 'No Haradato account for that email',
					code: 'user_not_found'
				},
				{ status: 404 }
			);
		}

		const { data: existing } = await admin
			.from('agent_access_requests')
			.select('status')
			.eq('user_id', userId)
			.eq('agent_dumbname', dumbname)
			.maybeSingle();

		if (existing?.status === 'approved') {
			return json({
				ok: true,
				state: 'already_approved',
				message_for_agent: 'Access was already approved. You can call data APIs with MLAuth signatures.',
				human_settings_url: `${publicOrigin}/`
			});
		}

		const { error: upErr } = await admin.from('agent_access_requests').upsert(
			{
				user_id: userId,
				agent_dumbname: dumbname,
				status: 'pending',
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,agent_dumbname' }
		);
		if (upErr) throw upErr;

		return json({
			ok: true,
			state: existing?.status === 'pending' ? 'still_pending' : 'pending_created',
			agent_dumbname: dumbname,
			message_for_agent: `Ask your human to open Haradato → Settings → AI agent access, turn on “Allow AI agent access”, then approve the pending request for MLAuth identity “${dumbname}”.`,
			human_settings_url: `${publicOrigin}/`
		});
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
