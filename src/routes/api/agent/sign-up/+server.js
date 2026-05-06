import { json } from '@sveltejs/kit';
import { PUBLIC_APP_ORIGIN } from '$env/static/public';
import { verifyAgentRequest } from '$lib/server/mlauth.js';
import { badRequest, readJsonBody, jsonFromAgentError } from '$lib/server/agentRoutes.js';
import { adminOrThrow, lookupUserIdByEmail, normalizeHumanEmail } from '$lib/server/agentAccess.js';

const publicOrigin = PUBLIC_APP_ORIGIN || 'https://www.haradato.com';

export async function POST({ request }) {
	try {
		const parsed = await readJsonBody(request);
		if (!parsed.ok) return badRequest('invalid_json', 'invalid_json');
		const body = parsed.body;
		const dumbname = typeof body.dumbname === 'string' ? body.dumbname.trim() : '';
		const timestamp = typeof body.timestamp === 'string' ? body.timestamp : '';
		const signature = typeof body.signature === 'string' ? body.signature : '';
		const humanEmail = normalizeHumanEmail(typeof body.human_email === 'string' ? body.human_email : '');
		const expectedMessage = humanEmail ? `SIGNUP:${humanEmail}` : 'SIGNUP';
		const message = typeof body.message === 'string' ? body.message : expectedMessage;
		if (!dumbname || !timestamp || !signature) {
			return json({ error: 'missing_mlauth', code: 'missing_mlauth' }, { status: 401 });
		}
		if (message !== expectedMessage) {
			return badRequest(
				humanEmail ? 'Signed message must be SIGNUP:<human_email>' : 'Signed message must be SIGNUP',
				'invalid_message'
			);
		}
		const agent = await verifyAgentRequest(dumbname, timestamp, signature, message);

		/** @type {string | null} */
		let userId = null;
		/** @type {'existing' | 'created' | null} */
		let humanAccountState = null;
		if (humanEmail) {
			const admin = adminOrThrow();
			userId = await lookupUserIdByEmail(admin, humanEmail);
			if (userId) {
				humanAccountState = 'existing';
			} else {
				const { data, error } = await admin.auth.admin.inviteUserByEmail(humanEmail, {
					redirectTo: `${publicOrigin}/`
				});
				if (error) throw error;
				userId = data?.user?.id ?? null;
				humanAccountState = 'created';
			}

			if (userId) {
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
			}
		}

		return json({
			ok: true,
			dumbname: agent?.dumbname ?? dumbname,
			agent_id: agent?.agent_id ?? null,
			karma: agent?.karma ?? 0,
			key_status: agent?.key_status ?? null,
			human_email: humanEmail || null,
			human_account_state: humanAccountState,
			next_step_for_human: humanEmail
				? `Open ${publicOrigin}/, sign in with ${humanEmail}, then approve agent access in Settings → AI agent access.`
				: null
		});
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
