import { browser, dev } from '$app/environment';
import {
	filterRetainedTaskRows
} from '$lib/todoUtils.js';

const DB_NAME = 'harada_local_mirror';
// v2: events_outbox store for pending chart_events (structural op log)
// v3: events_journal store - this device's own ops, feeds undo
const DB_VERSION = 3;
const DEFAULT_OWNER = 'local';

const TABLES = [
	'tasks',
	'notes',
	'note_task_links',
	'note_goal_links',
	'task_goal_links'
];

let dbPromise = null;
const signatureCache = new Map();
const keyCache = new Map();

function ownerKey(userId) {
	return typeof userId === 'string' && userId ? userId : DEFAULT_OWNER;
}

function rowKey(owner, id) {
	return `${owner}:${id}`;
}

function cacheKey(owner, table) {
	return `${owner}:${table}`;
}

function compositeKey(...parts) {
	return parts.map((part) => String(part ?? '')).join(':');
}

function requestToPromise(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function txDone(tx) {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

function createStore(db, name) {
	if (db.objectStoreNames.contains(name)) return;
	const store = db.createObjectStore(name, { keyPath: '_key' });
	store.createIndex('owner', '_owner', { unique: false });
	store.createIndex('updated_at', 'updated_at', { unique: false });
}

function openDb() {
	if (!browser || typeof indexedDB === 'undefined') return Promise.resolve(null);
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			createStore(db, 'charts');
			for (const table of TABLES) createStore(db, table);
			createStore(db, 'sync_meta');
			createStore(db, 'events_outbox');
			createStore(db, 'events_journal');
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('Harada local database upgrade was blocked.'));
	});

	return dbPromise;
}

function withOwner(row, owner, id) {
	return {
		...row,
		_key: rowKey(owner, id),
		_owner: owner
	};
}

function stripLocalFields(row) {
	if (!row || typeof row !== 'object') return row;
	const { _key, _owner, ...rest } = row;
	return rest;
}

function getLinkId(table, row) {
	if (typeof row?.id === 'string' && row.id) return row.id;
	if (table === 'note_task_links') return compositeKey(row?.note_id, row?.task_id);
	if (table === 'note_goal_links') return compositeKey(row?.note_id, row?.goal_index);
	if (table === 'task_goal_links') return compositeKey(row?.task_id, row?.goal_index);
	return null;
}

function getRowId(table, row) {
	if (!row || typeof row !== 'object') return null;
	if (table === 'tasks' || table === 'notes') {
		return typeof row.id === 'string' && row.id ? row.id : null;
	}
	return getLinkId(table, row);
}

function rowSignature(row) {
	const { _key, _owner, ...rest } = row || {};
	return JSON.stringify(rest);
}

async function getAllForOwner(store, owner) {
	const index = store.index('owner');
	const rows = await requestToPromise(index.getAll(owner));
	return Array.isArray(rows) ? rows : [];
}

function chartSignature(chart) {
	return JSON.stringify({
		grid: chart?.grid || [],
		title: chart?.title || 'My Harada Chart'
	});
}

function setCachedRows(owner, table, rows) {
	const signatures = new Map();
	const keys = new Set();
	for (const row of rows || []) {
		if (!row?._key) continue;
		signatures.set(row._key, rowSignature(row));
		keys.add(row._key);
	}
	signatureCache.set(cacheKey(owner, table), signatures);
	keyCache.set(cacheKey(owner, table), keys);
}

async function getCachedRows(store, owner, table) {
	const key = cacheKey(owner, table);
	if (signatureCache.has(key) && keyCache.has(key)) {
		return {
			signatures: signatureCache.get(key),
			keys: keyCache.get(key)
		};
	}

	const existingRows = await getAllForOwner(store, owner);
	setCachedRows(owner, table, existingRows);
	return {
		signatures: signatureCache.get(key),
		keys: keyCache.get(key)
	};
}

export async function loadLocalHaradaSnapshot(userId = null) {
	const start = browser ? performance.now() : 0;
	const db = await openDb();
	if (!db) return null;

	const owner = ownerKey(userId);
	const tx = db.transaction(['charts', ...TABLES], 'readonly');
	const chart = await requestToPromise(tx.objectStore('charts').get(rowKey(owner, 'chart')));
	setCachedRows(owner, 'charts', chart ? [chart] : []);
	const result = {
		grid: Array.isArray(chart?.grid) ? chart.grid : [],
		title: chart?.title || 'My Harada Chart',
		tasks: [],
		notes: [],
		noteTaskLinks: [],
		noteGoalLinks: [],
		taskGoalLinks: []
	};

	for (const table of TABLES) {
		const rows = await getAllForOwner(tx.objectStore(table), owner);
		setCachedRows(owner, table, rows);
		result[
			table === 'note_task_links'
				? 'noteTaskLinks'
				: table === 'note_goal_links'
					? 'noteGoalLinks'
					: table === 'task_goal_links'
						? 'taskGoalLinks'
						: table
		] = rows.filter((row) => !row.deleted_at).map(stripLocalFields);
	}

	await txDone(tx);

	result.tasks = filterRetainedTaskRows(result.tasks);
	const retainedTaskIds = new Set(result.tasks.map((row) => row.id));
	result.noteTaskLinks = result.noteTaskLinks.filter((row) => retainedTaskIds.has(row.task_id));
	result.taskGoalLinks = result.taskGoalLinks.filter((row) => retainedTaskIds.has(row.task_id));

	if (
		!chart &&
		result.tasks.length === 0 &&
		result.notes.length === 0 &&
		result.noteTaskLinks.length === 0 &&
		result.noteGoalLinks.length === 0 &&
		result.taskGoalLinks.length === 0
	) {
		return null;
	}

	return result;
}

export async function saveLocalHaradaSnapshot({
	userId = null,
	grid = [],
	title = 'My Harada Chart',
	tasks = [],
	notes = [],
	noteTaskLinks = [],
	noteGoalLinks = [],
	taskGoalLinks = []
} = {}) {
	const start = browser ? performance.now() : 0;
	const retainedTasks = filterRetainedTaskRows(tasks);
	const retainedTaskIds = new Set(retainedTasks.map((row) => row.id));
	const retainedNoteTaskLinks = (noteTaskLinks ?? []).filter((row) =>
		retainedTaskIds.has(row.task_id)
	);
	const retainedTaskGoalLinks = (taskGoalLinks ?? []).filter((row) =>
		retainedTaskIds.has(row.task_id)
	);

	const db = await openDb();
	if (!db) return false;

	const owner = ownerKey(userId);
	const tx = db.transaction(['charts', ...TABLES, 'sync_meta'], 'readwrite');

	const chartStore = tx.objectStore('charts');
	const chartKey = rowKey(owner, 'chart');
	const chart = {
		_key: chartKey,
		_owner: owner,
		grid: Array.isArray(grid) ? grid : [],
		title,
		updated_at: new Date().toISOString()
	};
	const chartCache = await getCachedRows(chartStore, owner, 'charts');
	const nextChartSignature = chartSignature(chart);
	if (chartCache.signatures.get(chartKey) !== nextChartSignature) {
		chartStore.put(chart);
		chartCache.signatures.set(chartKey, nextChartSignature);
		chartCache.keys.add(chartKey);
	}

	const tableRows = {
		tasks: retainedTasks,
		notes,
		note_task_links: retainedNoteTaskLinks,
		note_goal_links: noteGoalLinks,
		task_goal_links: retainedTaskGoalLinks
	};

	for (const table of TABLES) {
		const store = tx.objectStore(table);
		const incomingRows = Array.isArray(tableRows[table]) ? tableRows[table] : [];
		const cached = await getCachedRows(store, owner, table);
		const liveKeys = new Set();

		for (const row of incomingRows) {
			const id = getRowId(table, row);
			if (!id) continue;
			const keyed = withOwner(row, owner, id);
			liveKeys.add(keyed._key);
			const signature = rowSignature(keyed);
			if (cached.signatures.get(keyed._key) !== signature) {
				store.put(keyed);
				cached.signatures.set(keyed._key, signature);
			}
			cached.keys.add(keyed._key);
		}

		for (const existingKey of [...cached.keys]) {
			if (!liveKeys.has(existingKey)) {
				store.delete(existingKey);
				cached.keys.delete(existingKey);
				cached.signatures.delete(existingKey);
			}
		}
	}

	tx.objectStore('sync_meta').put({
		_key: rowKey(owner, 'last_local_save'),
		_owner: owner,
		value: new Date().toISOString()
	});

	await txDone(tx);
	return true;
}

// ---------------------------------------------------------------------------
// Chart events: outbox of structural ops awaiting push, plus the per-owner
// cursor of the last server seq applied locally. Both survive offline periods.
// ---------------------------------------------------------------------------

export async function enqueueChartEventLocal(userId, event) {
	const db = await openDb();
	if (!db || !event?.client_event_id) return false;

	const owner = ownerKey(userId);
	const tx = db.transaction(['events_outbox'], 'readwrite');
	tx.objectStore('events_outbox').put(withOwner(event, owner, event.client_event_id));
	await txDone(tx);
	return true;
}

export async function getPendingChartEventsLocal(userId) {
	const db = await openDb();
	if (!db) return [];

	const owner = ownerKey(userId);
	const tx = db.transaction(['events_outbox'], 'readonly');
	const rows = await getAllForOwner(tx.objectStore('events_outbox'), owner);
	await txDone(tx);
	return rows
		.map(stripLocalFields)
		.sort((a, b) => (a.recorded_at || '').localeCompare(b.recorded_at || ''));
}

export async function removeChartEventsLocal(userId, clientEventIds = []) {
	if (!clientEventIds.length) return true;
	const db = await openDb();
	if (!db) return false;

	const owner = ownerKey(userId);
	const tx = db.transaction(['events_outbox'], 'readwrite');
	const store = tx.objectStore('events_outbox');
	for (const id of clientEventIds) store.delete(rowKey(owner, id));
	await txDone(tx);
	return true;
}

// ---------------------------------------------------------------------------
// Chart event journal: ops THIS device performed, newest last. Feeds the undo
// stack (undo pops the newest entry and applies its stored inverse). Kept
// separate from the outbox, which empties as soon as events are pushed.
// ---------------------------------------------------------------------------

const JOURNAL_MAX_ENTRIES = 50;

export async function appendChartEventJournal(userId, event) {
	const db = await openDb();
	if (!db || !event?.client_event_id) return false;

	const owner = ownerKey(userId);
	const tx = db.transaction(['events_journal'], 'readwrite');
	const store = tx.objectStore('events_journal');
	store.put(withOwner(event, owner, event.client_event_id));

	// Cap the journal so decades of ops don't accumulate.
	const rows = await getAllForOwner(store, owner);
	if (rows.length > JOURNAL_MAX_ENTRIES) {
		rows.sort((a, b) => (a.recorded_at || '').localeCompare(b.recorded_at || ''));
		for (const row of rows.slice(0, rows.length - JOURNAL_MAX_ENTRIES)) {
			store.delete(row._key);
		}
	}

	await txDone(tx);
	return true;
}

export async function getLatestChartEventJournalEntry(userId) {
	const db = await openDb();
	if (!db) return null;

	const owner = ownerKey(userId);
	const tx = db.transaction(['events_journal'], 'readonly');
	const rows = await getAllForOwner(tx.objectStore('events_journal'), owner);
	await txDone(tx);
	if (!rows.length) return null;
	rows.sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || ''));
	return stripLocalFields(rows[0]);
}

export async function removeChartEventJournalEntry(userId, clientEventId) {
	if (!clientEventId) return false;
	const db = await openDb();
	if (!db) return false;

	const owner = ownerKey(userId);
	const tx = db.transaction(['events_journal'], 'readwrite');
	tx.objectStore('events_journal').delete(rowKey(owner, clientEventId));
	await txDone(tx);
	return true;
}

export async function getChartEventCursor(userId) {
	const db = await openDb();
	if (!db) return null;

	const owner = ownerKey(userId);
	const tx = db.transaction(['sync_meta'], 'readonly');
	const row = await requestToPromise(
		tx.objectStore('sync_meta').get(rowKey(owner, 'chart_events_cursor'))
	);
	await txDone(tx);
	const value = Number(row?.value);
	return Number.isFinite(value) ? value : null;
}

export async function setChartEventCursor(userId, seq) {
	const db = await openDb();
	if (!db || !Number.isFinite(Number(seq))) return false;

	const owner = ownerKey(userId);
	const tx = db.transaction(['sync_meta'], 'readwrite');
	tx.objectStore('sync_meta').put({
		_key: rowKey(owner, 'chart_events_cursor'),
		_owner: owner,
		value: Number(seq)
	});
	await txDone(tx);
	return true;
}

