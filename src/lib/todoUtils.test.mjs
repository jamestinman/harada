import test from 'node:test';
import assert from 'node:assert/strict';
import {
	mergeTodoLists,
	buildFeedPinnedRows,
	filterFeedPinnedRowsBySearch,
	buildAllTasksFeed,
	buildTaskNoteIndexMaps,
	buildGoalBlockSwapMap,
	buildGoalBlockRelocateMap,
	buildPairSwapMap,
	resolveGoalDropTargetIndex,
	shouldMoveGoalToVacantSlot,
	collectGoalIndexRemaps,
	defaultMergedGoalTitle,
	appendGoalReadmes,
	goalBlockHasContent,
	getGoalBlockIndexSet,
	getLinkedGoalIndex,
	goalIndexMatchesCanonical,
	RECENTLY_COMPLETED_MS,
	isRecentlyCompletedTodo,
	shouldRetainTodoInStore,
	filterRetainedTodos,
	shouldRetainTaskRow,
	filterRetainedTaskRows,
	collectDescendantTaskIds,
	organizeTodosWithHierarchy,
	getGoalViewIndentLevel,
	renderMarkdown
} from './todoUtils.js';

test('collectDescendantTaskIds returns nested descendants via parentId', () => {
	const todos = [
		{ id: 'a', parentId: null },
		{ id: 'b', parentId: 'a' },
		{ id: 'c', parentId: 'b' },
		{ id: 'd', parentId: 'a' },
		{ id: 'e', parentId: 'x' }
	];
	assert.deepEqual(collectDescendantTaskIds('a', todos).sort(), ['b', 'c', 'd']);
	assert.deepEqual(collectDescendantTaskIds('b', todos), ['c']);
	assert.deepEqual(collectDescendantTaskIds('e', todos), []);
});

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

test('mergeTodoLists preserves url when newer remote row lacks it', () => {
	const id = 'todo-1';
	const local = {
		id,
		title: 'Article',
		url: 'https://techcrunch.com/example',
		updatedAt: 1000,
		ordering: 1
	};
	const remote = { id, title: 'Article', url: '', updatedAt: 2000, ordering: 1 };

	const merged = mergeTodoLists([local], [remote]);
	assert.equal(merged.length, 1);
	assert.equal(merged[0].url, 'https://techcrunch.com/example');
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
	const taskGoalLinks = [
		{ taskId: 'p', goalIndex: -1, parentId: null, ordering: 1 },
		{ taskId: 'c', goalIndex: -1, parentId: 'p', ordering: 2 },
		{ taskId: 'pc', goalIndex: -1, parentId: 'p', ordering: 3 }
	];
	const taskGoalKeySet = new Set(['p:-1', 'c:-1', 'pc:-1']);

	const rows = buildFeedPinnedRows([parent, child, pinnedChild], undefined, {
		taskGoalKeySet,
		taskGoalLinks
	});
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
	const taskGoalLinks = [
		{ taskId: 'p', goalIndex: -1, parentId: null, ordering: 1 },
		{ taskId: 'c', goalIndex: -1, parentId: 'p', ordering: 2 }
	];
	const taskGoalKeySet = new Set(['p:-1', 'c:-1']);

	const rows = buildFeedPinnedRows([parent, child], undefined, { taskGoalKeySet, taskGoalLinks });
	assert.deepEqual(
		rows.map((r) => r.todo.id),
		['p', 'c']
	);
});

test('buildFeedPinnedRows nests pinned child under parent without pinned goal links', () => {
	const parent = { id: 'p', pinned: true, status: 'todo', parentId: null, ordering: 1 };
	const child = { id: 'c', pinned: true, status: 'todo', parentId: 'p', ordering: 2 };

	const rows = buildFeedPinnedRows([parent, child], undefined, {
		taskGoalKeySet: new Set(),
		taskGoalLinks: []
	});

	assert.deepEqual(
		rows.map((r) => [r.todo.id, r.indentLevel]),
		[
			['p', 0],
			['c', 1]
		]
	);
});

test('buildFeedPinnedRows infers pinned nesting from real goal links', () => {
	const parent = { id: 'p', pinned: true, status: 'todo', parentId: null, ordering: 1 };
	const child = { id: 'c', pinned: true, status: 'todo', parentId: null, ordering: 2 };
	const taskGoalLinks = [
		{ taskId: 'p', goalIndex: -1, parentId: null, ordering: 1 },
		{ taskId: 'c', goalIndex: -1, parentId: null, ordering: 2 },
		{ taskId: 'p', goalIndex: 10, parentId: null, ordering: 1 },
		{ taskId: 'c', goalIndex: 10, parentId: 'p', ordering: 2 }
	];
	const taskGoalKeySet = new Set(['p:-1', 'c:-1', 'p:10', 'c:10']);

	const rows = buildFeedPinnedRows([parent, child], undefined, {
		taskGoalKeySet,
		taskGoalLinks
	});

	assert.deepEqual(
		rows.map((r) => [r.todo.id, r.indentLevel]),
		[
			['p', 0],
			['c', 1]
		]
	);
});

test('Z1 goal hierarchy infers pinned nesting from real goal links', () => {
	const parent = { id: 'p', pinned: true, status: 'todo', parentId: null, ordering: 1 };
	const child = { id: 'c', pinned: true, status: 'todo', parentId: null, ordering: 2 };
	const taskGoalLinks = [
		{ taskId: 'p', goalIndex: -1, parentId: null, ordering: 1 },
		{ taskId: 'c', goalIndex: -1, parentId: null, ordering: 2 },
		{ taskId: 'p', goalIndex: 10, parentId: null, ordering: 1 },
		{ taskId: 'c', goalIndex: 10, parentId: 'p', ordering: 2 }
	];

	const organized = organizeTodosWithHierarchy([parent, child], undefined, {
		goalIndex: -1,
		taskGoalLinks
	});

	assert.deepEqual(organized.map((todo) => todo.id), ['p', 'c']);
	assert.equal(getGoalViewIndentLevel('c', -1, organized, taskGoalLinks), 1);
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

test('buildAllTasksFeed buckets todos in a single pass', () => {
	const grid = Array.from({ length: 81 }, () => ({
		text: '',
		status: 'todo',
		readme: '',
		color: 'default',
		updated_at: null
	}));
	grid[10] = { ...grid[10], text: 'Goal A', todo_group_ordering: 1024 };
	const todos = [
		{ id: 't1', title: 'One', listType: 'goal', goalIndex: 10, status: 'todo', ordering: 1 },
		{ id: 't2', title: 'Two', listType: 'goal', goalIndex: null, status: 'todo', ordering: 2 },
		{
			id: 't3',
			title: 'Custom',
			listType: 'custom',
			listId: 'custom:work',
			listName: 'Work',
			status: 'todo',
			ordering: 3
		}
	];
	const feed = buildAllTasksFeed({
		todos,
		grid,
		taskGoalKeySet: new Set(),
		linkedTaskIdSet: new Set()
	});

	assert.equal(feed.allTodos.length, 3);
	assert.ok(feed.todoGroups.some((g) => g.id === 'no-goal'));
	assert.equal(feed.todoGroups.find((g) => g.id === 'no-goal')?.goalIndex, -2);
	assert.ok(feed.todoGroups.some((g) => g.id === 'goal-10'));
	assert.ok(feed.todoGroups.some((g) => g.id === 'custom:work'));
	assert.equal(feed.groupsByTodoId.get('t1')?.id, 'goal-10');
	assert.equal(feed.goalMenuItems.length, 1);
	assert.equal(feed.goalMenuItems[0].goalIndex, 10);
	assert.equal(feed.goalMenuItems[0].goalOrdering, 1024);
	assert.equal(feed.goalMenuItems[0].count, 1);
});

test('buildAllTasksFeed menu includes chart goals with zero tasks', () => {
	const grid = Array.from({ length: 81 }, () => ({
		text: '',
		status: 'todo',
		readme: '',
		color: 'default',
		updated_at: null
	}));
	grid[10] = { ...grid[10], text: 'Goal A', todo_group_ordering: 1024 };
	grid[20] = { ...grid[20], text: 'Goal B', todo_group_ordering: 2048 };
	const todos = [
		{ id: 't1', title: 'One', listType: 'goal', goalIndex: 10, status: 'todo', ordering: 1 }
	];

	const feed = buildAllTasksFeed({
		todos,
		grid,
		taskGoalKeySet: new Set(),
		linkedTaskIdSet: new Set()
	});

	assert.deepEqual(
		feed.goalMenuItems.map((item) => [item.id, item.goalIndex, item.goalOrdering, item.count]),
		[
			['goal-10', 10, 1024, 1],
			['goal-20', 20, 2048, 0]
		]
	);
});

test('buildAllTasksFeed menu includes untitled goals that have tasks', () => {
	const grid = Array.from({ length: 81 }, () => ({
		text: '',
		status: 'todo',
		readme: '',
		color: 'default',
		updated_at: null
	}));
	grid[13] = { ...grid[13], todo_group_ordering: 500 };
	const todos = [
		{ id: 't1', title: 'CURTXT task', listType: 'goal', goalIndex: 13, status: 'todo', ordering: 1 }
	];

	const feed = buildAllTasksFeed({
		todos,
		grid,
		taskGoalKeySet: new Set(),
		linkedTaskIdSet: new Set()
	});

	assert.equal(feed.goalMenuItems.length, 1);
	assert.equal(feed.goalMenuItems[0].goalIndex, 13);
	assert.equal(feed.goalMenuItems[0].goalOrdering, 500);
	assert.equal(feed.goalMenuItems[0].count, 1);
	assert.equal(feed.goalMenuItems[0].label, 'E2');
});

test('buildTaskNoteIndexMaps provides O(1) task lookups', () => {
	const notes = [
		{ id: 'n1', content: 'Primary', updatedAt: 2 },
		{ id: 'n2', content: 'Extra', updatedAt: 1 }
	];
	const noteTaskLinks = [
		{ id: 'l1', noteId: 'n1', taskId: 't1', isPrimary: true, updatedAt: 1 },
		{ id: 'l2', noteId: 'n2', taskId: 't1', isPrimary: false, updatedAt: 1 }
	];
	const taskGoalLinks = [{ id: 'g1', taskId: 't1', goalIndex: 10, updatedAt: 1 }];
	const todos = [{ id: 't1', goalIndex: 10 }];

	const maps = buildTaskNoteIndexMaps(notes, noteTaskLinks, taskGoalLinks, todos);
	assert.equal(maps.primaryNoteByTaskId.get('t1')?.id, 'n1');
	assert.equal(maps.freeNotesByTaskId.get('t1')?.length, 1);
	assert.deepEqual(maps.goalIndicesByTaskId.get('t1'), [10]);
});

test('buildPairSwapMap exchanges two cell indices', () => {
	const map = buildPairSwapMap(10, 12);
	assert.equal(map.get(10), 12);
	assert.equal(map.get(12), 10);
	assert.equal(map.size, 2);
});

test('buildGoalBlockSwapMap maps outer blocks and linked center cells', () => {
	// B2 outer center (10) <-> E2 outer center (37)
	const map = buildGoalBlockSwapMap(10, 37);
	assert.equal(map.get(10), 37);
	assert.equal(map.get(37), 10);
	assert.equal(map.get(getLinkedGoalIndex(10)), getLinkedGoalIndex(37));
	assert.equal(map.get(30), 39);
	assert.equal(map.get(39), 30);
	// Same relative position within each 3×3 block
	assert.equal(map.get(0), 27);
	assert.equal(map.get(27), 0);
});

test('collectGoalIndexRemaps finds todos and links affected by a block swap', () => {
	const swapMap = buildGoalBlockSwapMap(10, 37);
	const todos = [
		{ id: 't1', goalIndex: 10, listType: 'goal' },
		{ id: 't2', goalIndex: 72, listType: 'goal' },
		{ id: 't3', goalIndex: null, listType: 'custom' }
	];
	const noteGoalLinks = [
		{ id: 'ngl-1', noteId: 'n1', goalIndex: 10 },
		{ id: 'ngl-2', noteId: 'n2', goalIndex: 72 }
	];
	const taskGoalLinks = [
		{ id: 'tgl-1', taskId: 't4', goalIndex: 37, parentId: null, ordering: 1000 }
	];

	const todoRemaps = collectGoalIndexRemaps(todos, swapMap, (todo) => todo.goalIndex);
	const noteRemaps = collectGoalIndexRemaps(noteGoalLinks, swapMap, (link) => link.goalIndex);
	const taskLinkRemaps = collectGoalIndexRemaps(taskGoalLinks, swapMap, (link) => link.goalIndex);

	assert.equal(todoRemaps.length, 1);
	assert.equal(todoRemaps[0].from, 10);
	assert.equal(todoRemaps[0].to, 37);

	assert.equal(noteRemaps.length, 1);
	assert.equal(noteRemaps[0].item.id, 'ngl-1');
	assert.equal(noteRemaps[0].to, 37);

	assert.equal(taskLinkRemaps.length, 1);
	assert.equal(taskLinkRemaps[0].from, 37);
	assert.equal(taskLinkRemaps[0].to, 10);
});

test('collectGoalIndexRemaps handles task-cell pair swaps', () => {
	const swapMap = buildPairSwapMap(3, 5);
	const todos = [{ id: 't1', goalIndex: 3, listType: 'goal' }];
	const remaps = collectGoalIndexRemaps(todos, swapMap, (todo) => todo.goalIndex);
	assert.deepEqual(remaps, [{ item: todos[0], from: 3, to: 5 }]);
});

test('buildGoalBlockRelocateMap is one-way from source to target block', () => {
	const map = buildGoalBlockRelocateMap(10, 37);
	assert.equal(map.get(10), 37);
	assert.equal(map.get(0), 27);
	assert.equal(map.get(30), 39);
	assert.equal(map.has(37), false);
});

test('goalIndexMatchesCanonical matches a goal and its linked pair, not sibling block cells', () => {
	const linked = getLinkedGoalIndex(10);
	assert.equal(linked, 30);
	assert.equal(goalIndexMatchesCanonical(10, 10), true);
	assert.equal(goalIndexMatchesCanonical(30, 10), true);
	assert.equal(goalIndexMatchesCanonical(0, 10), false);
	assert.equal(goalIndexMatchesCanonical(18, 10), false);
	assert.equal(getGoalBlockIndexSet(10).has(0), true);
});

test('defaultMergedGoalTitle joins source and target labels', () => {
	assert.equal(defaultMergedGoalTitle('Run', 'Health'), 'Run + Health');
	assert.equal(defaultMergedGoalTitle('', 'Health'), 'Health');
});

test('appendGoalReadmes concatenates descriptions', () => {
	assert.equal(appendGoalReadmes('Target notes', 'Source notes'), 'Target notes\n\nSource notes');
	assert.equal(appendGoalReadmes('', 'Source only'), 'Source only');
});

test('resolveGoalDropTargetIndex maps task cells to block center', () => {
	assert.equal(resolveGoalDropTargetIndex(10), 10);
	assert.equal(resolveGoalDropTargetIndex(30), 30);
	assert.equal(resolveGoalDropTargetIndex(2), 10);
	assert.equal(resolveGoalDropTargetIndex(40), null);
});

test('shouldMoveGoalToVacantSlot only when source has content and target does not', () => {
	assert.equal(shouldMoveGoalToVacantSlot(true, false), true);
	assert.equal(shouldMoveGoalToVacantSlot(false, true), false);
	assert.equal(shouldMoveGoalToVacantSlot(true, true), false);
	assert.equal(shouldMoveGoalToVacantSlot(false, false), false);
});

test('goalBlockHasContent detects title, tasks, and links', () => {
	const grid = Array.from({ length: 81 }, () => ({
		text: '',
		status: 'todo',
		readme: '',
		color: 'default',
		updated_at: null
	}));
	grid[37] = { ...grid[37], text: 'Health' };
	assert.equal(
		goalBlockHasContent({
			grid,
			canonical: 37,
			todos: [],
			noteGoalLinks: [],
			taskGoalLinks: []
		}),
		true
	);
	assert.equal(
		goalBlockHasContent({
			grid,
			canonical: 10,
			todos: [{ id: 't1', goalIndex: 2 }],
			noteGoalLinks: [],
			taskGoalLinks: []
		}),
		true
	);
	assert.equal(
		goalBlockHasContent({
			grid: Array.from({ length: 81 }, () => ({
				text: '',
				status: 'todo',
				readme: '',
				color: 'default',
				updated_at: null
			})),
			canonical: 10,
			todos: [],
			noteGoalLinks: [],
			taskGoalLinks: []
		}),
		false
	);
});

test('recently completed retention keeps active and fresh done todos', () => {
	const now = Date.now();
	const active = { id: 'a', status: 'todo', updatedAt: now };
	const recentDone = { id: 'b', status: 'done', updatedAt: now - 60_000 };
	const staleDone = { id: 'c', status: 'done', updatedAt: now - RECENTLY_COMPLETED_MS - 1 };

	assert.equal(shouldRetainTodoInStore(active, now), true);
	assert.equal(isRecentlyCompletedTodo(recentDone, now), true);
	assert.equal(shouldRetainTodoInStore(recentDone, now), true);
	assert.equal(shouldRetainTodoInStore(staleDone, now), false);

	const retained = filterRetainedTodos([active, recentDone, staleDone], now);
	assert.deepEqual(
		retained.map((todo) => todo.id),
		['a', 'b']
	);
});

test('filterRetainedTaskRows mirrors todo retention using updated_at', () => {
	const now = Date.now();
	const cutoffIso = new Date(now - RECENTLY_COMPLETED_MS - 1).toISOString();
	const rows = [
		{ id: 'a', status: 'todo', deleted_at: null },
		{ id: 'b', status: 'done', updated_at: new Date(now - 60_000).toISOString(), deleted_at: null },
		{ id: 'c', status: 'done', updated_at: cutoffIso, deleted_at: null }
	];

	const retained = filterRetainedTaskRows(rows, now);
	assert.deepEqual(
		retained.map((row) => row.id),
		['a', 'b']
	);
	assert.equal(shouldRetainTaskRow(rows[2], now), false);
});

test('renderMarkdown renders inline and display KaTeX math', () => {
	const inline = renderMarkdown('Choose $u = x$, so $du = dx$.');
	assert.match(inline, /class="katex"/);
	assert.match(inline, /u = x/);
	assert.doesNotMatch(inline, /\$u = x\$/);

	const display = renderMarkdown('$$\\int_0^{\\infty} e^{-x}\\,dx$$');
	assert.match(display, /katex-display/);
	assert.match(display, /∫|\\int/);
});

test('renderMarkdown leaves currency-like dollars alone', () => {
	const html = renderMarkdown('Cost is $5 and also $12.50 total.');
	assert.doesNotMatch(html, /class="katex"/);
	assert.match(html, /\$5/);
	assert.match(html, /\$12\.50/);
});

test('renderMarkdown strips script tags and inline event handlers', () => {
	const html = renderMarkdown('Hello\n\n<script>alert(1)</script><img src=x onerror="alert(1)">');
	assert.doesNotMatch(html, /<script/i);
	assert.doesNotMatch(html, /onerror/i);
	assert.match(html, /Hello/);
});

test('renderMarkdown defuses javascript: and data: hrefs', () => {
	// normalizeNoteLinkHref rewrites unknown schemes to https://, leaving an
	// inert link rather than an executable one.
	assert.doesNotMatch(renderMarkdown('[x](javascript:alert(1))'), /href="javascript:/i);
	assert.doesNotMatch(
		renderMarkdown('<a href="data:text/html,<script>alert(1)</script>">x</a>'),
		/href="data:/i
	);
});

test('renderMarkdown strips svg, iframe and form vectors', () => {
	const html = renderMarkdown(
		'<svg onload="alert(1)"></svg><iframe src="https://evil.test"></iframe>' +
			'<form action="https://evil.test"><input name="a"></form>'
	);
	assert.doesNotMatch(html, /onload/i);
	assert.doesNotMatch(html, /<iframe/i);
	assert.doesNotMatch(html, /<form|<input/i);
});

test('renderMarkdown neutralises MathML annotation mXSS but keeps KaTeX markup', () => {
	const attack = renderMarkdown(
		'<math><semantics><annotation encoding="text/html"><script>alert(1)</script></annotation></semantics></math>'
	);
	assert.doesNotMatch(attack, /<script/i);

	// KaTeX's own <semantics>/<annotation> wrapper must survive.
	const math = renderMarkdown('$x = 1$');
	assert.match(math, /<semantics>/);
	assert.match(math, /<annotation encoding="application\/x-tex">/);
});

test('renderMarkdown keeps safe links and external link attributes', () => {
	const html = renderMarkdown('[site](https://example.com)');
	assert.match(html, /href="https:\/\/example\.com"/);
	assert.match(html, /target="_blank"/);
	assert.match(html, /rel="noopener noreferrer"/);
});
