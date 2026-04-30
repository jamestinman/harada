import { json } from '@sveltejs/kit';
import { getLinkedGoalIndex } from '$lib/todoUtils.js';
import { stableStringify } from '$lib/server/stableStringify.js';
import {
	authorizeAgent,
	authorizeAgentForHuman,
	badRequest,
	readJsonBody,
	jsonFromAgentError,
	readMlAuth
} from '$lib/server/agentRoutes.js';
import { normalizeHumanEmail, parseGoalIndexParam } from '$lib/server/agentAccess.js';
import {
	defaultCell,
	ensureCell,
	loadOrCreateChart,
	persistChartGrid
} from '$lib/server/agentChart.js';

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET(event) {
	const { url, params } = event;
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');

		const idx = parseGoalIndexParam(params.goalIndex);
		if (idx === null) return badRequest('invalid goal_index', 'invalid_goal_index');

		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg = `GOALS_GET:${humanEmail}:${params.goalIndex}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const { grid } = await loadOrCreateChart(userId);
		return json({ goal_index: idx, cell: grid[idx] ?? null });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function PATCH(event) {
	const { request, params } = event;
	try {
		const parsed = await readJsonBody(request);
		if (!parsed.ok) return badRequest('invalid_json', 'invalid_json');
		const body = parsed.body;
		const humanEmail = normalizeHumanEmail(
			typeof body.human_email === 'string' ? body.human_email : ''
		);
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');

		const idx = parseGoalIndexParam(params.goalIndex);
		if (idx === null) return badRequest('invalid goal_index', 'invalid_goal_index');

		const agentDumbname = await authorizeAgent(new URLSearchParams(), body, 'patch');
		const pack = readMlAuth(new URLSearchParams(), body, 'body');
		const patch = {
			...(typeof body.text === 'string' ? { text: body.text } : {}),
			...(typeof body.readme === 'string' ? { readme: body.readme } : {}),
			...(body.status === 'done' || body.status === 'todo' ? { status: body.status } : {}),
			...(typeof body.color === 'string' ? { color: body.color } : {})
		};
		const expectedMsg = `GOALS_PATCH:${humanEmail}:${params.goalIndex}:${stableStringify(patch)}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const { grid: gridRaw } = await loadOrCreateChart(userId);
		const grid = [...gridRaw];
		const cell = ensureCell(grid, idx);
		Object.assign(cell, patch);
		cell.updated_at = new Date().toISOString();

		const linked = getLinkedGoalIndex(idx);
		if (linked !== null) {
			const twin = ensureCell(grid, linked);
			if ('text' in patch) twin.text = cell.text;
			if ('readme' in patch) twin.readme = cell.readme;
			if ('status' in patch) twin.status = cell.status;
			if ('color' in patch) twin.color = cell.color;
			twin.updated_at = cell.updated_at;
		}

		await persistChartGrid(userId, grid);
		return json({ ok: true, goal_index: idx, cell: grid[idx] });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function DELETE(event) {
	const { url, params } = event;
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');

		const idx = parseGoalIndexParam(params.goalIndex);
		if (idx === null) return badRequest('invalid goal_index', 'invalid_goal_index');

		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg = `GOALS_DELETE:${humanEmail}:${params.goalIndex}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const { grid: gridRaw } = await loadOrCreateChart(userId);
		const grid = [...gridRaw];
		grid[idx] = { ...defaultCell(), updated_at: new Date().toISOString() };
		const linked = getLinkedGoalIndex(idx);
		if (linked !== null) {
			grid[linked] = { ...defaultCell(), updated_at: grid[idx].updated_at };
		}
		await persistChartGrid(userId, grid);
		return json({ ok: true, goal_index: idx });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
