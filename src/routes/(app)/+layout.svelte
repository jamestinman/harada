<script>
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { afterNavigate, goto, onNavigate } from '$app/navigation';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import {
		indexToNomenclature,
		canonicalGoalIndex,
		defaultTodo,
		buildGoalListMeta,
		resolveTopOrderingForNewTodo
	} from '$lib/todoUtils.js';
	import { enqueueTodoUrlEnrichment } from '$lib/urlUtils.js';
	import Nav from '$components/Nav.svelte';
	import SignInBanner from '$components/SignInBanner.svelte';
	import PlaybackControlBar from '$components/PlaybackControlBar.svelte';
	import UndoToast from '$components/UndoToast.svelte';
	import { playback } from '$stores/playback.svelte.js';
	import { persistWorkspacePath } from '$lib/workspaceNavResume.js';
	import '../layout.css';

	let { children } = $props();
	let lastAuthUserId = $state(undefined);

	const needsSignIn = $derived(
		store.isOnline && !authStore.loading && !authStore.user && !!authStore.lastKnownUser
	);

	// Use icon.png for OG: favicon.png is 192×192 (below Meta/WhatsApp minimum 200×200 for link images)
	const ogImageUrl = $derived(`${page.url.origin}/icon.png`);
	const ogPageUrl = $derived(`${page.url.origin}${page.url.pathname}`);
	const playbackBarVisible = $derived(playback.curItem != null);

	// Grid is reactive via the store - no local copy needed
	const grid = $derived(store.harada_chart.grid);

	// Watch for auth changes and (re)initialize Supabase sync when needed
	$effect(() => {
		if (!browser || authStore.loading) return;
		const userId = authStore.user?.id ?? null;
		// First auth resolution is handled by store.initialize(); only react to later changes.
		if (lastAuthUserId === undefined) {
			lastAuthUserId = userId;
			return;
		}
		if (userId === lastAuthUserId) return;
		lastAuthUserId = userId;
		store.handleAuthChange();
	});

	// Remember last To-Do / Notes URLs after each navigation (more reliable than tracking page in an effect).
	if (browser) {
		afterNavigate(({ to }) => {
			if (to?.url) persistWorkspacePath(to.url.pathname);
		});
	}

	function parseAppDeepLink(url) {
		if (!url) return null;
		try {
			const parsed = new URL(url);
			const host = parsed.hostname.toLowerCase();
			if (host !== 'haradato.com' && host !== 'www.haradato.com') return null;
			const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
			return target || '/';
		} catch {
			return null;
		}
	}

	// Handle universal links/deep links opened from outside the app.
	$effect(() => {
		if (!browser) return;

		let cleanup = () => {};
		import('@capacitor/app')
			.then(async ({ App }) => {
				const launch = await App.getLaunchUrl();
				const launchPath = parseAppDeepLink(launch?.url);
				if (launchPath) {
					goto(launchPath, { replaceState: true });
				}

				const listener = await App.addListener('appUrlOpen', (event) => {
					const path = parseAppDeepLink(event?.url);
					if (path) {
						goto(path, { replaceState: true });
					}
				});

				cleanup = () => {
					listener.remove();
				};
			})
			.catch(() => {
				// Capacitor App plugin is unavailable in plain web context.
			});

		return () => cleanup();
	});

	// Hide iOS keyboard accessory bar (Done/Prev/Next) so it doesn’t overlap the bottom nav
  /*
	$effect(() => {
		if (!browser) return;
		import('@capacitor/keyboard').then(({ Keyboard }) => {
			Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
		});
	});
  */

	const goalIndices = Array.from({ length: 81 }, (_, i) => i);
	const allGoals = $derived.by(() => {
		const uniqueCanonical = [...new Set(goalIndices.map((idx) => canonicalGoalIndex(idx)))];
		return uniqueCanonical
			.map((idx) => {
				const cell = grid[idx];
				const text = (cell?.text ?? '').trim();
				return {
					index: idx,
					code: indexToNomenclature(idx),
					label: text || indexToNomenclature(idx),
					isMainGoal: Math.floor(idx / 9) === 4 && idx % 9 === 4,
					updated_at: cell?.updated_at || null
				};
			})
			.sort((a, b) => {
				// Main goal always first
				if (a.isMainGoal) return -1;
				if (b.isMainGoal) return 1;
				
				// Sort by updated_at descending (most recently updated first)
				const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
				const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
				if (aTime !== bTime) {
					return bTime - aTime; // Descending order
				}
				
				// Fallback to index order if timestamps are equal or both null
				return a.index - b.index;
			});
	});

	function createTodoFromComposer({ title, markdown, goalIndex } = {}) {
		const normalizedGoalIndex =
			typeof goalIndex === 'number' ? canonicalGoalIndex(goalIndex) : null;
		const listMeta = buildGoalListMeta(normalizedGoalIndex);
		const taskGoalKeySet = new Set(
			(store.taskGoalLinks ?? []).map((link) => `${link.taskId}:${link.goalIndex}`)
		);
		const linkedTaskIdSet = new Set((store.taskGoalLinks ?? []).map((link) => link.taskId));
		const ordering = resolveTopOrderingForNewTodo(store.harada_chart.todos, listMeta, {
			taskGoalKeySet,
			linkedTaskIdSet,
			taskGoalLinks: store.taskGoalLinks ?? []
		});
		const todo = {
			...defaultTodo(),
			title: title || '',
			markdown: '',
			...listMeta,
			parentId: null,
			ordering
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];
		if (markdown?.trim()) {
			store.setPrimaryNoteForTask(todo.id, {
				content: markdown.trim(),
				goalIndex: normalizedGoalIndex
			});
		}
		if (typeof normalizedGoalIndex === 'number') {
			store.bumpGoalAfterTodoActivity(normalizedGoalIndex);
		}
		enqueueTodoUrlEnrichment(store, todo.id, title);
		store.saveNow();
		const taskQ = new URLSearchParams({ task: todo.id }).toString();
		if (typeof normalizedGoalIndex === 'number') {
			goto(`/todo/${indexToNomenclature(normalizedGoalIndex)}?${taskQ}`);
		} else {
			goto(`/todo?${taskQ}`);
		}
	}

	function createNoteFromComposer(content = '') {
		const normalizedGoalIndex =
			typeof store.currentGoalIndex === 'number'
				? canonicalGoalIndex(store.currentGoalIndex)
				: null;
		const note = store.createNote({ content });
		store.pendingSelectNoteId = note.id;
		if (typeof normalizedGoalIndex === 'number') {
			store.linkNoteToGoal(note.id, normalizedGoalIndex);
		}
		store.currentGoalIndex = normalizedGoalIndex;
		if (typeof normalizedGoalIndex === 'number') {
			goto(`/notes/${indexToNomenclature(normalizedGoalIndex)}`);
			return;
		}
		goto('/notes');
	}

	// Enable view transitions for all navigation
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<!-- WhatsApp / Facebook / iMessage use Open Graph; rel=icon is not used for link previews -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Haradato" />
	<meta property="og:url" content={ogPageUrl} />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="560" />
	<meta property="og:image:height" content="560" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:image" content={ogImageUrl} />
</svelte:head>

<div
  id="root-container"
	class="{store.activeTheme} min-h-dvh overflow-x-hidden {playbackBarVisible ? 'has-playback-bar' : ''} {needsSignIn ? 'pt-[calc(env(safe-area-inset-top,0px)+2.75rem)] lg:pt-[8.5rem]' : 'pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] lg:pt-[3rem]'}"
	style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.75rem);"
>
	{#if needsSignIn}
		<SignInBanner onSignIn={() => authStore.openSignInModal()} />
	{/if}

	{@render children()}

  <Nav
    {allGoals}
    defaultGoalIndex={null}
    onCreateTodo={createTodoFromComposer}
    onCreateNote={createNoteFromComposer}
  />

  <PlaybackControlBar />

  <UndoToast />

</div>

