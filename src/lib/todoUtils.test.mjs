import test from 'node:test';
import assert from 'node:assert/strict';
import {
	mergeTodoLists,
	buildFeedPinnedRows,
	filterFeedPinnedRowsBySearch
} from './todoUtils.js';

test('mergeTodoLists prefers todo with newer updatedAt', () => {
	const id = 'todo-1';
	const older = { id, title: 'Old', updatedAt: 1000, ordering: 1 };
	const newer = { id, title: 'New', updatedAt: 2000, ordering: 1 };

	const merged1 = mergeTodoLists([older], [newer]);
	assert.equal(merged1.length, 1);
	assert.equal(merged1[0].title, 'New');

	const merged2 = mergeTodoLists([newer], [older]);
	assert.equal(merged2.length, 1);
	assert.equal(merged2[0].title, 'New');
});

test('mergeTodoLists keeps todos that exist only on one side', () => {
	const localOnly = { id: 'local', title: 'Local', updatedAt: 1000, ordering: 1 };
	const remoteOnly = { id: 'remote', title: 'Remote', updatedAt: 1000, ordering: 2 };

	const merged = mergeTodoLists([localOnly], [remoteOnly]);
	const ids = merged.map((t) => t.id).sort();

	assert.deepEqual(ids, ['local', 'remote']);
});

test('mergeTodoLists uses ordering or createdAt for stable sort', () => {
	const a = { id: 'a', title: 'A', ordering: 2000, createdAt: 2000 };
	const b = { id: 'b', title: 'B', ordering: 1000, createdAt: 1000 };

	const merged = mergeTodoLists([a], [b]);
	const titles = merged.map((t) => t.title);

	assert.deepEqual(titles, ['B', 'A']);
});

test('buildFeedPinnedRows lists descendants under a pinned parent', () => {
	const parent = {
		id: 'p',
		pinned: true,
		status: 'todo',
		parentId: null,
		ordering: 1
	};
	const child = {
		id: 'c',
		pinned: false,
		status: 'todo',
		parentId: 'p',
		ordering: 2
	};
	const pinnedChild = {
		id: 'pc',
		pinned: true,
		status: 'todo',
		parentId: 'p',
		ordering: 3
	};

	const rows = buildFeedPinnedRows([parent, child, pinnedChild]);
	assert.deepEqual(
		rows.map((r) => [r.todo.id, r.indentLevel]),
		[
			['p', 0],
			['c', 1],
			['pc', 1]
		]
	);
});

test('buildFeedPinnedRows omits pinned child as separate root when parent is pinned', () => {
	const parent = { id: 'p', pinned: true, status: 'todo', parentId: null, ordering: 1 };
	const child = { id: 'c', pinned: true, status: 'todo', parentId: 'p', ordering: 2 };

	const rows = buildFeedPinnedRows([parent, child]);
	assert.deepEqual(
		rows.map((r) => r.todo.id),
		['p', 'c']
	);
});

test('filterFeedPinnedRowsBySearch keeps pinned ancestors of matching descendants', () => {
	const rows = [
		{ todo: { id: 'p', title: 'Parent', parentId: null }, indentLevel: 0 },
		{ todo: { id: 'c', title: 'Southampton', parentId: 'p' }, indentLevel: 1 }
	];
	const filtered = filterFeedPinnedRowsBySearch(rows, (todo) =>
		(todo.title ?? '').toLowerCase().includes('south')
	);
	assert.deepEqual(
		filtered.map((r) => r.todo.id),
		['p', 'c']
	);
});

