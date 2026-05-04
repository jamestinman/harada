import { browser } from '$app/environment';
import { localGet, localSet } from '$lib/PersistentStorage.mjs';

export const WORKSPACE_KEYS = {
	todoPath: 'harada_workspace_todo_last_path',
	notesPath: 'harada_workspace_notes_last_path',
	todoMobileSidebar: 'harada_workspace_todo_mobile_sidebar',
	notesMobileSidebar: 'harada_workspace_notes_mobile_sidebar'
};

function sanitizePath(raw, prefix, fallback) {
	if (typeof raw !== 'string' || !raw.startsWith(prefix)) return fallback;
	return raw;
}

/** Remember last URL while inside each workspace (called from root layout on navigation). */
export function persistWorkspacePath(pathname) {
	if (!browser) return;
	if (pathname.startsWith('/todo')) {
		localSet(WORKSPACE_KEYS.todoPath, pathname);
	} else if (pathname.startsWith('/notes')) {
		localSet(WORKSPACE_KEYS.notesPath, pathname);
	}
}

export function resumePathTodo() {
	return sanitizePath(localGet(WORKSPACE_KEYS.todoPath, '/todo'), '/todo', '/todo');
}

export function resumePathNotes() {
	return sanitizePath(localGet(WORKSPACE_KEYS.notesPath, '/notes'), '/notes', '/notes');
}

export function persistTodoMobileSidebar(open) {
	if (!browser) return;
	localSet(WORKSPACE_KEYS.todoMobileSidebar, open ? 'open' : 'closed');
}

export function readTodoMobileSidebarOpen() {
	return localGet(WORKSPACE_KEYS.todoMobileSidebar, 'closed') === 'open';
}

export function persistNotesMobileSidebar(open) {
	if (!browser) return;
	localSet(WORKSPACE_KEYS.notesMobileSidebar, open ? 'open' : 'closed');
}

export function readNotesMobileSidebarOpen() {
	return localGet(WORKSPACE_KEYS.notesMobileSidebar, 'closed') === 'open';
}

export function isWorkspaceNarrowLayout() {
	return (
		browser &&
		typeof window !== 'undefined' &&
		window.matchMedia('(max-width: 1023px)').matches
	);
}

/** @param {string} [path] */
export function normalizeWorkspacePathname(path) {
	return (typeof path === 'string' ? path : '/').replace(/\/+$/, '') || '/';
}

/**
 * Primary app nav (Goals / Tasks / Notes).
 * @returns {'goals' | 'tasks' | 'notes' | null}
 */
export function workspaceNavActiveSection(pathname) {
	const p = normalizeWorkspacePathname(pathname);
	if (p === '/harada' || p.startsWith('/harada/')) return 'goals';
	if (p.startsWith('/todo')) return 'tasks';
	if (p.startsWith('/notes')) return 'notes';
	return null;
}

/**
 * Marketing site centre nav.
 * @returns {'harada' | 'todo' | 'notes' | 'chart' | null}
 */
export function websiteNavActiveSection(pathname) {
	const p = normalizeWorkspacePathname(pathname);
	if (p === '/harada-chart' || p.startsWith('/harada-chart/')) return 'chart';
	if (p === '/harada' || p.startsWith('/harada/')) return 'harada';
	if (p.startsWith('/todo')) return 'todo';
	if (p.startsWith('/notes')) return 'notes';
	return null;
}
