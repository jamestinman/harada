import { json } from '@sveltejs/kit';
import {
	buildCustomListMeta,
	buildGoalListMeta,
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
import { adminOrThrow, normalizeHumanEmail } from '$lib/server/agentAccess.js';

function collectTaskPatch(body) {
	const keys = [
		'title',
		'markdown',
		'status',
		'list_type',
		'list_id',
		'list_name',
		'goal_index',
		'parent_id',
		'ordering',
		'pinned'
	];
	/** @type {Record<string, unknown>} */
	const patch = {};
	for (const k of keys) {
		if (k in body) patch[k] = body[k];
	}
	return patch;
}

export async function GET({ url, params }) {
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');
		const taskId = params.taskId;
		if (!taskId) return badRequest('task id required', 'missing_task_id');

		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg = `TASKS_GET:${humanEmail}:${taskId}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const admin = adminOrThrow();
		const { data, error } = await admin
			.from('tasks')
			.select('*')
			.eq('user_id', userId)
			.eq('id', taskId)
			.maybeSingle();
		if (error) throw error;
		return json({ task: data });
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
		const taskId = params.taskId;
		if (!taskId) return badRequest('task id required', 'missing_task_id');

		const agentDumbname = await authorizeAgent(new URLSearchParams(), body, 'patch');
		const pack = readMlAuth(new URLSearchParams(), body, 'body');
		const patch = collectTaskPatch(body);
		const expectedMsg = `TASKS_PATCH:${humanEmail}:${taskId}:${stableStringify(patch)}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const admin = adminOrThrow();
		const { data: cur, error: readErr } = await admin
			.from('tasks')
			.select('*')
			.eq('user_id', userId)
			.eq('id', taskId)
			.maybeSingle();
		if (readErr) throw readErr;
		if (!cur) return json({ error: 'task not found', code: 'not_found' }, { status: 404 });

		const next = { ...cur };
		if (typeof patch.title === 'string') next.title = patch.title;
		if (typeof patch.markdown === 'string') next.markdown = patch.markdown;
		if (patch.status === 'done' || patch.status === 'todo') next.status = patch.status;
		if (typeof patch.parent_id === 'string' || patch.parent_id === null) {
			next.parent_id = patch.parent_id;
		}
		if (typeof patch.ordering === 'number' && Number.isFinite(patch.ordering)) {
			next.ordering = patch.ordering;
		}
		if (patch.pinned === true || patch.pinned === false) next.pinned = patch.pinned;

		let listType = next.list_type;
		if (patch.list_type === 'goal' || patch.list_type === 'custom') listType = patch.list_type;

		if (listType === 'goal') {
			const giRaw = patch.goal_index ?? next.goal_index;
			const gi =
				typeof giRaw === 'number' && Number.isFinite(giRaw) ? canonicalGoalIndex(giRaw) : null;
			if (gi !== null) {
				const meta = buildGoalListMeta(gi);
				next.goal_index = meta.goalIndex;
				next.list_id = patch.list_id ?? meta.listId;
				next.list_type = 'goal';
				next.list_name = null;
			}
		} else if (listType === 'custom') {
			const meta = buildCustomListMeta(
				typeof patch.list_name === 'string'
					? patch.list_name
					: (next.list_name ?? 'New list')
			);
			next.list_type = 'custom';
			next.list_id = typeof patch.list_id === 'string' ? patch.list_id : meta.listId;
			next.list_name = meta.listName;
			next.goal_index = null;
		}

		next.updated_at = new Date().toISOString();

		const { error: upErr } = await admin
			.from('tasks')
			.update(next)
			.eq('user_id', userId)
			.eq('id', taskId);
		if (upErr) throw upErr;

		const { data, error } = await admin.from('tasks').select('*').eq('id', taskId).maybeSingle();
		if (error) throw error;
		return json({ ok: true, task: data });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}

export async function DELETE({ url, params }) {
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');
		const taskId = params.taskId;
		if (!taskId) return badRequest('task id required', 'missing_task_id');

		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg = `TASKS_DELETE:${humanEmail}:${taskId}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const admin = adminOrThrow();
		const now = new Date().toISOString();
		const { error } = await admin
			.from('tasks')
			.update({ deleted_at: now, updated_at: now })
			.eq('user_id', userId)
			.eq('id', taskId);
		if (error) throw error;
		return json({ ok: true });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
