import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	CHART_EVENT_OPS,
	chartEventOpLabel,
	createChartEvent,
	createBatchId,
	isKnownChartEventOp,
	bumpIsoTimestamp,
	bumpMsTimestamp,
	isMissingChartEventsSchemaError
} from './chartEvents.js';

test('createChartEvent assembles a pushable row and embeds occurred_at', () => {
	const event = createChartEvent({
		op: CHART_EVENT_OPS.SWAP_GOAL_PAIR,
		payload: { source: 10, target: 20 },
		deviceId: 'dev_test',
		occurredAt: '2026-08-18T10:00:00.000Z'
	});
	assert.ok(event.client_event_id.startsWith('evt_'));
	assert.equal(event.device_id, 'dev_test');
	assert.ok(event.batch_id.startsWith('batch_'));
	assert.equal(event.op, 'swap_goal_pair');
	assert.deepEqual(event.payload, {
		source: 10,
		target: 20,
		occurred_at: '2026-08-18T10:00:00.000Z'
	});
	assert.equal(event.inverse, null);
	assert.equal(event.recorded_at, '2026-08-18T10:00:00.000Z');
});

test('createChartEvent defaults occurred_at to now and generates unique ids', () => {
	const a = createChartEvent({ op: CHART_EVENT_OPS.CLEAR_GOAL, payload: { goalIndex: 4 }, deviceId: 'd' });
	const b = createChartEvent({ op: CHART_EVENT_OPS.CLEAR_GOAL, payload: { goalIndex: 4 }, deviceId: 'd' });
	assert.ok(a.payload.occurred_at);
	assert.notEqual(a.client_event_id, b.client_event_id);
});

test('createChartEvent rejects unknown ops and missing device id', () => {
	assert.equal(createChartEvent({ op: 'rm_rf', payload: {}, deviceId: 'd' }), null);
	assert.equal(createChartEvent({ op: CHART_EVENT_OPS.CLEAR_GOAL, payload: {} }), null);
});

test('isKnownChartEventOp matches the op set', () => {
	assert.equal(isKnownChartEventOp('merge_goal_cells'), true);
	assert.equal(isKnownChartEventOp('restore_snapshot'), true);
	assert.equal(isKnownChartEventOp('rm_rf'), false);
});

test('chartEventOpLabel gives a short label for every op', () => {
	for (const op of Object.values(CHART_EVENT_OPS)) {
		const label = chartEventOpLabel(op);
		assert.ok(label && label !== 'Chart changed', `label for ${op}`);
	}
	assert.equal(chartEventOpLabel('mystery_op'), 'Chart changed');
});

test('createBatchId is unique-ish', () => {
	assert.notEqual(createBatchId(), createBatchId());
});

test('bumpIsoTimestamp never moves a newer local stamp backwards', () => {
	const older = '2026-08-18T09:00:00.000Z';
	const newer = '2026-08-18T11:00:00.000Z';
	// Op newer than the entity: op wins (normal origin-device case)
	assert.equal(bumpIsoTimestamp(older, newer), newer);
	// Entity edited after the op (replay case): keep the local stamp
	assert.equal(bumpIsoTimestamp(newer, older), newer);
	// Missing existing stamp: adopt the op's
	assert.equal(bumpIsoTimestamp(null, older), older);
	assert.equal(bumpIsoTimestamp(undefined, older), older);
	// Missing op stamp: keep the existing one
	assert.equal(bumpIsoTimestamp(newer, null), newer);
});

test('bumpMsTimestamp mirrors the ISO behavior for millisecond stamps', () => {
	const olderIso = '2026-08-18T09:00:00.000Z';
	const olderMs = new Date(olderIso).getTime();
	const newerIso = '2026-08-18T11:00:00.000Z';
	const newerMs = new Date(newerIso).getTime();
	assert.equal(bumpMsTimestamp(olderMs, newerIso), newerMs);
	assert.equal(bumpMsTimestamp(newerMs, olderIso), newerMs);
	assert.equal(bumpMsTimestamp(null, olderIso), olderMs);
	assert.equal(bumpMsTimestamp(newerMs, null), newerMs);
});

test('isMissingChartEventsSchemaError detects undeployed schema', () => {
	assert.equal(isMissingChartEventsSchemaError({ code: '42P01' }), true);
	assert.equal(isMissingChartEventsSchemaError({ code: 'PGRST202' }), true);
	assert.equal(isMissingChartEventsSchemaError({ code: 'PGRST205' }), true);
	assert.equal(
		isMissingChartEventsSchemaError({ message: 'relation "chart_events" does not exist' }),
		true
	);
	assert.equal(
		isMissingChartEventsSchemaError({ message: 'Could not find the function append_chart_events' }),
		true
	);
	assert.equal(isMissingChartEventsSchemaError({ code: '23505', message: 'duplicate key' }), false);
	assert.equal(isMissingChartEventsSchemaError(null), false);
});
