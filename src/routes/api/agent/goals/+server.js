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
import {
	normalizeHumanEmail,
	parseGoalIndexParam
} from '$lib/server/agentAccess.js';
import { ensureCell, loadOrCreateChart, persistChartGrid } from '$lib/server/agentChart.js';

function goalPatchSignObject(body) {
	const idx = parseGoalIndexParam(String(body.goal_index ?? ''));
	return {
		goal_index: idx,
		text: body.text ?? null,
		readme: body.readme ?? null,
		status: body.status ?? null,
		color: body.color ?? null
	};
}

export async function GET({ url }) {
	try {
		const sp = url.searchParams;
		const humanEmail = normalizeHumanEmail(sp.get('human_email') ?? '');
		if (!humanEmail) return badRequest('human_email required', 'missing_human_email');

		const goalRaw = sp.get('goal_index');
		const agentDumbname = await authorizeAgent(sp, {}, 'get');
		const pack = readMlAuth(sp, {}, 'qs');
		const expectedMsg =
			goalRaw !== null && goalRaw !== ''
				? `GOALS_GET:${humanEmail}:${goalRaw}`
				: `GOALS_GET:${humanEmail}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch for goals read', 'message_mismatch');
		}

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const { grid } = await loadOrCreateChart(userId);

		if (goalRaw !== null && goalRaw !== '') {
			const idx = parseGoalIndexParam(goalRaw);
			if (idx === null) return badRequest('invalid goal_index', 'invalid_goal_index');
			return json({ goal_index: idx, cell: grid[idx] ?? null });
		}

		return json({ grid });
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
		const signObj = goalPatchSignObject(body);
		if (signObj.goal_index === null) {
			return badRequest('Invalid goal_index', 'invalid_goal_index');
		}
		const expectedMsg = `GOALS_POST:${humanEmail}:${stableStringify(signObj)}`;
		if ((pack.message ?? '') !== expectedMsg) {
			return badRequest('Signed message mismatch for goals create/update', 'message_mismatch');
		}

		const idx = signObj.goal_index;

		const { userId } = await authorizeAgentForHuman(humanEmail, agentDumbname);
		const { grid: gridRaw } = await loadOrCreateChart(userId);
		const grid = [...gridRaw];

		const cell = ensureCell(grid, idx);
		if (typeof body.text === 'string') cell.text = body.text;
		if (typeof body.readme === 'string') cell.readme = body.readme;
		if (body.status === 'done' || body.status === 'todo') cell.status = body.status;
		if (typeof body.color === 'string') cell.color = body.color;
		cell.updated_at = new Date().toISOString();

		const linked = getLinkedGoalIndex(idx);
		if (linked !== null) {
			const twin = ensureCell(grid, linked);
			if (typeof body.text === 'string') twin.text = cell.text;
			if (typeof body.readme === 'string') twin.readme = cell.readme;
			if (body.status === 'done' || body.status === 'todo') twin.status = cell.status;
			if (typeof body.color === 'string') twin.color = cell.color;
			twin.updated_at = cell.updated_at;
		}

		await persistChartGrid(userId, grid);
		return json({ ok: true, goal_index: idx, cell: grid[idx] });
	} catch (e) {
		return jsonFromAgentError(e);
	}
}
