import { json } from '@sveltejs/kit';
import {
	buildCustomListMeta,
	buildGoalListMeta,
	createTodoId,
	canonicalGoalIndex
} from '$lib/todoUtils.js';
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

function taskSignPayload(body) {
	return {
		id: typeof body.id === 'string' ? body.id : null,
		title: body.title ?? '',
		markdown: body.markdown ?? '',
		status: body.status === 'done' ? 'done' : 'todo',
		list_type: body.list_type === 'custom' ? 'custom' : 'goal',
		list_id: body.list_id ?? null,
		list_name: body.list_name ?? null,
		goal_index:
			typeof body.goal_index === 'number' && Number.isFinite(body.goal_index)
				? canonicalGoalIndex(body.goal_index)
				: null,
		parent_id: typeof body.parent_id === 'string' ? body.parent_id : null,
		ordering: typeof body.ordering === 'number' ? body.ordering : null,
		pinned: body.pinned === true
	};
}

function rowFromBody(body, userId) {
	const pick = taskSignPayload(body);
	const id =
		pick.id && String(pick.id).trim()
			? String(pick.id).trim()
			: createTodoId();
	let listMeta;
	if (pick.list_type === 'goal' && pick.goal_index !== null) {
		listMeta = buildGoalListMeta(pick.goal_index);
	} else if (pick.list_type === 'custom') {
		const meta = buildCustomListMeta(pick.list_name || 'New list');
		listMeta = {
			goalIndex: null,
			listType: 'custom',
			listId: pick.list_id || meta.listId,
			listName: meta.listName
		};
	} else {
		listMeta = {
			goalIndex: pick.goal_index,
			listType: pick.list_type,
			listId: pick.list_id || 'goal:none',
			listName: pick.list_name
		};
	}
	const now = new Date().toISOString();
	const ordering =
		pick.ordering !== null && Number.isFinite(pick.ordering)
			? pick.ordering
			: Date.now();
	return {
		id,
		user_id: userId,
		title: pick.title,
		markdown: pick.markdown,
		status: pick.status,
		list_type: listMeta.listType,
		list_id: listMeta.listId,
		list_name: listMeta.listName,
		goal_index: listMeta.goalIndex,
		parent_id: pick.parent_id,
		ordering,
		pinned: pick.pinned,
		created_at: now,
		updated_at: now,
		deleted_at: null
	};
}

export async function GET({ url }) {
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');

		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg = `TASKS_GET:${humanEmail}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const admin = adminOrThrow();

		const { data, error } = await admin
			.from('tasks')
			.select('*')
			.eq('user_id', userId)
			.is('deleted_at', null)
			.order('ordering', { ascending: true });
		if (error) throw error;
		return json({ tasks: data ?? [] });
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
		const signCore = taskSignPayload(body);
		const expectedMsg = `TASKS_POST:${humanEmail}:${stableStringify(signCore)}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const row = rowFromBody(body, userId);
		const admin = adminOrThrow();

		// Reject a caller-supplied id that belongs to a different user, and keep
		// the original created_at when updating an existing row.
		const existed = await assertRowOwnedOrNew(admin, 'tasks', row.id, userId);
		if (existed) delete row.created_at;

		const { error: upErr } = await admin.from('tasks').upsert(row, { onConflict: 'id' });
		if (upErr) throw upErr;

		const { data, error } = await admin.from('tasks').select('*').eq('id', row.id).maybeSingle();
		if (error) throw error;
		return json({ ok: true, task: data });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
