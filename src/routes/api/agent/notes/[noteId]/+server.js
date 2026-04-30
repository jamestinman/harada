import { json } from '@sveltejs/kit';
import { stableStringify } from '$lib/server/stableStringify.js';
import {
	authorizeAgent,
	authorizeAgentForHuman,
	badRequest,
	readJsonBody,
	jsonFromAgentError,
	readMlAuth
} from '$lib/server/agentRoutes.js';
import { adminOrThrow, normalizeHumanEmail } from '$lib/server/agentAccess.js';

function collectNotePatch(body) {
	/** @type {Record<string, unknown>} */
	const patch = {};
	if ('content' in body) patch.content = body.content;
	if ('goal_index' in body) patch.goal_index = body.goal_index;
	return patch;
}

export async function GET({ url, params }) {
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');
		const noteId = params.noteId;
		if (!noteId) return badRequest('note id required', 'missing_note_id');

		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg = `NOTES_GET:${humanEmail}:${noteId}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const admin = adminOrThrow();
		const { data, error } = await admin
			.from('notes')
			.select('*')
			.eq('user_id', userId)
			.eq('id', noteId)
			.maybeSingle();
		if (error) throw error;
		return json({ note: data });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}

export async function PATCH({ request, params }) {
	try {
		const parsed = await readJsonBody(request);
		if (!parsed.ok) return badRequest('invalid_json', 'invalid_json');
		const body = parsed.body;
		const humanEmail = normalizeHumanEmail(
			typeof body.human_email === 'string' ? body.human_email : ''
		);
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');
		const noteId = params.noteId;
		if (!noteId) return badRequest('note id required', 'missing_note_id');

		const agentDumbname = await authorizeAgent(new URLSearchParams(), body, 'patch');
		const pack = readMlAuth(new URLSearchParams(), body, 'body');
		const patch = collectNotePatch(body);
		const expectedMsg = `NOTES_PATCH:${humanEmail}:${noteId}:${stableStringify(patch)}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const admin = adminOrThrow();

		const dbPatch = { updated_at: new Date().toISOString() };
		if (typeof patch.content === 'string') dbPatch.content = patch.content;
		if (patch.goal_index === null) dbPatch.goal_index = null;
		else if (typeof patch.goal_index === 'number' && Number.isFinite(patch.goal_index)) {
			dbPatch.goal_index = patch.goal_index;
		}

		const { error: upErr } = await admin
			.from('notes')
			.update(dbPatch)
			.eq('user_id', userId)
			.eq('id', noteId);
		if (upErr) throw upErr;

		const { data, error } = await admin.from('notes').select('*').eq('id', noteId).maybeSingle();
		if (error) throw error;
		return json({ ok: true, note: data });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}

export async function DELETE({ url, params }) {
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');
		const noteId = params.noteId;
		if (!noteId) return badRequest('note id required', 'missing_note_id');

		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg = `NOTES_DELETE:${humanEmail}:${noteId}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const admin = adminOrThrow();
		const now = new Date().toISOString();
		const { error } = await admin
			.from('notes')
			.update({ deleted_at: now, updated_at: now })
			.eq('user_id', userId)
			.eq('id', noteId);
		if (error) throw error;
		return json({ ok: true });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
