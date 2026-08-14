import { json } from '@sveltejs/kit';
import { createNoteId } from '$lib/todoUtils.js';
import { stableStringify } from '$lib/server/stableStringify.js';
import {
	authorizeAgent,
	authorizeAgentForHuman,
	badRequest,
	readJsonBody,
	jsonFromAgentError,
	readMlAuth
} from '$lib/server/agentRoutes.js';
import {
	adminOrThrow,
	assertRowOwnedOrNew,
	normalizeHumanEmail
} from '$lib/server/agentAccess.js';

function noteSignPayload(body) {
	return {
		id: typeof body.id === 'string' ? body.id : null,
		content: typeof body.content === 'string' ? body.content : '',
		goal_index:
			typeof body.goal_index === 'number' && Number.isFinite(body.goal_index)
				? body.goal_index
				: null
	};
}

export async function GET({ url }) {
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');

		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg = `NOTES_GET:${humanEmail}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const admin = adminOrThrow();
		const { data, error } = await admin
			.from('notes')
			.select('*')
			.eq('user_id', userId)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false });
		if (error) throw error;
		return json({ notes: data ?? [] });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}

export async function POST({ request }) {
	try {
		const parsed = await readJsonBody(request);
		if (!parsed.ok) return badRequest('invalid_json', 'invalid_json');
		const body = parsed.body;
		const humanEmail = normalizeHumanEmail(
			typeof body.human_email === 'string' ? body.human_email : ''
		);
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');

		const agentDumbname = await authorizeAgent(new URLSearchParams(), body, 'post');
		const pack = readMlAuth(new URLSearchParams(), body, 'body');
		const signCore = noteSignPayload(body);
		const expectedMsg = `NOTES_POST:${humanEmail}:${stableStringify(signCore)}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const id =
			signCore.id && String(signCore.id).trim()
				? String(signCore.id).trim()
				: createNoteId();
		const now = new Date().toISOString();
		const row = {
			id,
			user_id: userId,
			content: signCore.content,
			goal_index: signCore.goal_index,
			created_at: now,
			updated_at: now,
			deleted_at: null
		};

		const admin = adminOrThrow();

		// Reject a caller-supplied id that belongs to a different user, and keep
		// the original created_at when updating an existing row.
		const existed = await assertRowOwnedOrNew(admin, 'notes', id, userId);
		if (existed) delete row.created_at;

		const { error: upErr } = await admin.from('notes').upsert(row, { onConflict: 'id' });
		if (upErr) throw upErr;

		const { data, error } = await admin.from('notes').select('*').eq('id', id).maybeSingle();
		if (error) throw error;
		return json({ ok: true, note: data });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
