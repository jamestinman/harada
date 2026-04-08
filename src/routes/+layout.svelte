<script>
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import { store } from '$stores/store.svelte.js';
	import { authStore } from '$stores/auth.svelte.js';
	import {
		indexToNomenclature,
		canonicalGoalIndex,
		defaultTodo,
		updateGoalTimestamp,
		buildGoalListMeta
	} from '$lib/todoUtils.js';
	import Nav from '$components/Nav.svelte';
	import './layout.css';

	let { children } = $props();
	let lastAuthUserId = $state(undefined);

	// Use icon.png for OG: favicon.png is 192×192 (below Meta/WhatsApp minimum 200×200 for link images)
	const ogImageUrl = $derived(`${page.url.origin}/icon.png`);
	const ogPageUrl = $derived(`${page.url.origin}${page.url.pathname}`);

	// Grid is reactive via the store — no local copy needed
	const grid = $derived(store.harada_chart.grid);

	// Watch for auth changes and (re)initialize Supabase sync when needed
	$effect(() => {
		if (!browser) return;
		const userId = authStore.user?.id ?? null;
		if (userId === lastAuthUserId) return;
		lastAuthUserId = userId;
		store.handleAuthChange();
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
		const siblings = store.harada_chart.todos.filter(
			(t) => t.listId === listMeta.listId && (t?.parentId ?? null) === null
		);
		const ordering =
			siblings.length > 0
				? Math.min(
						...siblings.map((t) =>
							typeof t?.ordering === 'number' && Number.isFinite(t.ordering)
								? t.ordering
								: typeof t?.createdAt === 'number' && Number.isFinite(t.createdAt)
									? t.createdAt
									: Date.now()
						)
					) - 1024
				: 1024;
		const todo = {
			...defaultTodo(),
			title: title || '',
			markdown: markdown || '',
			...listMeta,
			parentId: null,
			ordering
		};
		store.harada_chart.todos = [...store.harada_chart.todos, todo];
		if (typeof normalizedGoalIndex === 'number') {
			updateGoalTimestamp(store.harada_chart.grid, normalizedGoalIndex);
			store.harada_chart.grid = [...store.harada_chart.grid];
		}
		store.saveNow();
	}

	// Enable view transitions for all navigation
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		// Flush any pending changes to localStorage/Supabase before navigating away.
		if (browser && store._isInitialized) {
			store.saveNow();
		}

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
	class="{store.theme} min-h-dvh overflow-x-hidden lg:pr-28"
	style="
		padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.75rem);
	"
>
	{@render children()}

  <Nav
    {allGoals}
    defaultGoalIndex={null}
    onCreateTodo={createTodoFromComposer}
  />

</div>

