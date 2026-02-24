import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTodoLists } from './todoUtils.js';

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

