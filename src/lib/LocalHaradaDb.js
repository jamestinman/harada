import { browser, dev } from '$app/environment';

const DB_NAME = 'harada_local_mirror';
const DB_VERSION = 1;
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
		tasks,
		notes,
		note_task_links: noteTaskLinks,
		note_goal_links: noteGoalLinks,
		task_goal_links: taskGoalLinks
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

