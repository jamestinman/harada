/**
 * Chart events: structural chart operations (goal moves, merges, clears)
 * recorded as an append-only log and replayed on other devices.
 *
 * Why: state-based last-write-wins sync cannot tell "this goal was merged
 * away elsewhere" apart from "my copy still has it", so structural changes
 * used to resurrect. Devices replay unseen events (in server seq order)
 * BEFORE the snapshot merge; content edits stay last-write-wins.
 *
 * Pure helpers only - persistence lives in LocalHaradaDb.js, application in
 * the store. Keep this file dependency-free so it stays unit-testable.
 */

export const CHART_EVENT_OPS = Object.freeze({
	SWAP_GOAL_PAIR: 'swap_goal_pair',
	SWAP_GOAL_BLOCKS: 'swap_goal_blocks',
	MERGE_GOAL_CELLS: 'merge_goal_cells',
	MERGE_GOAL_BLOCKS: 'merge_goal_blocks',
	CLEAR_GOAL: 'clear_goal',
	/** Undo of a merge/clear: re-imposes the captured pre-op state. */
	RESTORE_SNAPSHOT: 'restore_snapshot'
});

const KNOWN_OPS = new Set(Object.values(CHART_EVENT_OPS));

/** Short human labels for the undo toast ("Goals merged - Undo"). */
export function chartEventOpLabel(op) {
	switch (op) {
		case CHART_EVENT_OPS.SWAP_GOAL_PAIR:
			return 'Goal moved';
		case CHART_EVENT_OPS.SWAP_GOAL_BLOCKS:
			return 'Goals swapped';
		case CHART_EVENT_OPS.MERGE_GOAL_CELLS:
		case CHART_EVENT_OPS.MERGE_GOAL_BLOCKS:
			return 'Goals merged';
		case CHART_EVENT_OPS.CLEAR_GOAL:
			return 'Goal cleared';
		case CHART_EVENT_OPS.RESTORE_SNAPSHOT:
			return 'Change restored';
		default:
			return 'Chart changed';
	}
}

function randomSuffix() {
	return Math.random().toString(36).slice(2, 10);
}

export function createBatchId() {
	return `batch_${Date.now()}_${randomSuffix()}`;
}

/**
 * Assemble an event row ready for the outbox / append_chart_events RPC.
 * `occurredAt` (ISO) is embedded in the payload: every device stamps the
 * affected cells/todos/links with the SAME timestamp when applying this op,
 * so replayed state converges with the origin device's state exactly.
 */
export function createChartEvent({ op, payload = {}, inverse = null, deviceId, batchId = null, occurredAt = null }) {
	if (!KNOWN_OPS.has(op)) return null;
	if (!deviceId) return null;
	const occurred = occurredAt || new Date().toISOString();
	return {
		client_event_id: `evt_${Date.now()}_${randomSuffix()}`,
		device_id: deviceId,
		batch_id: batchId || createBatchId(),
		op,
		payload: { ...payload, occurred_at: occurred },
		inverse,
		recorded_at: occurred
	};
}

export function isKnownChartEventOp(op) {
	return KNOWN_OPS.has(op);
}

/**
 * Timestamp bumps: applying an op must never move an entity's timestamp
 * backwards, or a local edit made after the op (by wall clock) would lose
 * the snapshot merge and never reach the server.
 */
export function bumpIsoTimestamp(existingIso, opIso) {
	const existing = existingIso ? new Date(existingIso).getTime() : 0;
	const op = opIso ? new Date(opIso).getTime() : 0;
	if (!Number.isFinite(existing) || existing <= 0) return opIso;
	if (!Number.isFinite(op) || op <= 0) return existingIso;
	return existing >= op ? existingIso : opIso;
}

export function bumpMsTimestamp(existingMs, opIso) {
	const existing = Number(existingMs);
	const op = opIso ? new Date(opIso).getTime() : 0;
	if (!Number.isFinite(existing) || existing <= 0) return Number.isFinite(op) && op > 0 ? op : Date.now();
	if (!Number.isFinite(op) || op <= 0) return existing;
	return Math.max(existing, op);
}

/**
 * True when the error means the chart_events table/RPC has not been deployed
 * to this Supabase project yet - the client then quietly skips event sync
 * (ops still queue in the outbox and push once the schema exists).
 */
export function isMissingChartEventsSchemaError(error) {
	if (!error) return false;
	const code = error.code || '';
	if (code === '42P01' || code === 'PGRST202' || code === 'PGRST205') return true;
	const message = `${error.message || ''}`.toLowerCase();
	return (
		message.includes('does not exist') ||
		message.includes('could not find the table') ||
		message.includes('could not find the function')
	);
}

const DEVICE_ID_KEY = 'harada_device_id';

/** Stable per-browser-profile id used to skip our own events when pulling. */
export function getDeviceId() {
	if (typeof localStorage === 'undefined') return 'unknown';
	try {
		let id = localStorage.getItem(DEVICE_ID_KEY);
		if (!id) {
			id =
				typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
					? `dev_${crypto.randomUUID()}`
					: `dev_${Date.now()}_${randomSuffix()}`;
			localStorage.setItem(DEVICE_ID_KEY, id);
		}
		return id;
	} catch {
		return 'unknown';
	}
}
