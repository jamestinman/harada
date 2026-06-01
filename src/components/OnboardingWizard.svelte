<script>
	import { fade, fly } from 'svelte/transition';
	import { store } from '$stores/store.svelte.js';
	import { canonicalGoalIndex, getLinkedGoalIndex, updateGoalTimestamp } from '$lib/todoUtils.js';

	let { isOpen = $bindable(false) } = $props();

	// The 8 "pillar" cells are the outer-block centres; each is shadow-linked to a
	// centre-block sub-goal, so writing one mirrors to its pair (same as the chart editor).
	const PILLAR_INDICES = [10, 13, 16, 37, 43, 64, 67, 70];

	const templates = {
		life: {
			label: 'Get on top of my life',
			hint: 'Balance the big areas of your life',
			emoji: '🧭',
			centre: 'Get on top of my life',
			centrePlaceholder: 'What does winning at life look like for you?',
			areas: ['Health', 'Career', 'Money', 'Relationships', 'Growth', 'Home', 'Mind', 'Fun']
		},
		goal: {
			label: 'Chase one big goal',
			hint: 'Everything that supports a single ambition',
			emoji: '🎯',
			centre: '',
			centrePlaceholder: 'e.g. Run a marathon · Launch my business',
			areas: ['Skills', 'Health & energy', 'Mindset', 'Daily routine', 'People & support', 'Knowledge', 'Environment', 'Resources']
		},
		blank: {
			label: 'Start blank',
			hint: "I'll fill it in myself",
			emoji: '✏️',
			centre: '',
			centrePlaceholder: 'What do you want to achieve?',
			areas: ['', '', '', '', '', '', '', '']
		}
	};

	let screen = $state('welcome'); // 'welcome' | 'template' | 'fill'
	let chosen = $state(null);
	let centre = $state('');
	let areas = $state(['', '', '', '', '', '', '', '']);
	let centrePlaceholder = $state('What do you want to achieve?');

	function pick(key) {
		chosen = key;
		const t = templates[key];
		centre = t.centre ?? '';
		areas = [...t.areas];
		centrePlaceholder = t.centrePlaceholder ?? 'What do you want to achieve?';
		if (key === 'blank') {
			finish();
			return;
		}
		screen = 'fill';
	}

	function applyGoal(grid, index, text) {
		const t = (text || '').trim();
		if (!t) return;
		const canonical = canonicalGoalIndex(index);
		const linked = getLinkedGoalIndex(canonical);
		const base = grid[canonical]
			? { ...grid[canonical] }
			: { text: '', status: 'todo', readme: '', color: 'default', updated_at: null };
		base.text = t;
		grid[canonical] = base;
		if (linked !== null) grid[linked] = { ...base };
		updateGoalTimestamp(grid, canonical);
	}

	function createChart() {
		const grid = store.harada_chart.grid.map((c) => ({ ...c }));
		applyGoal(grid, 40, centre);
		PILLAR_INDICES.forEach((idx, i) => applyGoal(grid, idx, areas[i]));
		store.harada_chart.grid = grid;
		store.saveNow();
		finish();
	}

	function finish() {
		isOpen = false;
		// Reset so a later re-run (from the menu) starts clean.
		screen = 'welcome';
		chosen = null;
		centre = '';
		areas = ['', '', '', '', '', '', '', ''];
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') finish();
	}
</script>

{#if isOpen}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed inset-0 z-[200] flex items-stretch justify-center bg-slate-900/70 backdrop-blur-sm sm:items-center sm:p-4"
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Set up your Harada chart"
		tabindex="-1"
	>
		<div
			transition:fly={{ y: 24, duration: 220 }}
			class="flex w-full flex-col bg-white shadow-2xl dark:bg-slate-900 sm:max-w-lg sm:rounded-3xl sm:border sm:border-slate-200 sm:dark:border-slate-800"
			style="max-height: 100dvh;"
		>
			<!-- Header -->
			<div class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
				<div class="flex items-center gap-2.5">
					<span class="grid grid-cols-3 gap-[2px]" aria-hidden="true">
						{#each Array(9) as _, i}
							<span class="h-1.5 w-1.5 rounded-[2px] {i === 4 ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'}"></span>
						{/each}
					</span>
					<span class="text-sm font-semibold text-slate-700 dark:text-slate-200">Set up your chart</span>
				</div>
				<button
					type="button"
					onclick={finish}
					class="rounded-lg px-2.5 py-1 text-sm font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
				>
					{screen === 'welcome' ? 'Skip' : 'Skip for now'}
				</button>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto px-6 py-7">
				{#if screen === 'welcome'}
					<div class="flex flex-col items-center text-center">
						<!-- decorative grid -->
						<div class="mb-6 grid grid-cols-3 gap-1.5">
							{#each Array(9) as _, i}
								<div
									class="flex h-12 w-12 items-center justify-center rounded-lg text-[10px] font-semibold transition
									{i === 4
										? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30'
										: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}"
								>
									{i === 4 ? 'YOU' : ''}
								</div>
							{/each}
						</div>
						<h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Let's build your chart</h2>
						<p class="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-slate-600 dark:text-slate-300">
							Your whole life on one page: one focus in the middle, eight areas around it. It takes a minute, and you can change everything later.
						</p>
						<div class="mt-8 flex w-full flex-col gap-2.5">
							<button type="button" onclick={() => (screen = 'template')} class="wiz-primary">Get started</button>
							<button type="button" onclick={finish} class="wiz-ghost">I'll explore on my own</button>
						</div>
					</div>
				{:else if screen === 'template'}
					<div>
						<button type="button" onclick={() => (screen = 'welcome')} class="mb-4 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">← Back</button>
						<h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Where do you want to start?</h2>
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Pick a starting point - it's just a scaffold you can rewrite.</p>
						<div class="mt-5 flex flex-col gap-3">
							{#each Object.entries(templates) as [key, t]}
								<button
									type="button"
									onclick={() => pick(key)}
									class="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-400 hover:bg-violet-50/50 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-violet-500 dark:hover:bg-violet-950/30"
								>
									<span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-xl dark:bg-slate-700/60">{t.emoji}</span>
									<span class="min-w-0 flex-1">
										<span class="block font-semibold text-slate-900 dark:text-white">{t.label}</span>
										<span class="block text-sm text-slate-500 dark:text-slate-400">{t.hint}</span>
									</span>
									<svg class="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-violet-500 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
								</button>
							{/each}
						</div>
					</div>
				{:else if screen === 'fill'}
					<div>
						<button type="button" onclick={() => (screen = 'template')} class="mb-4 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">← Back</button>
						<h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Fill in the basics</h2>
						<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Just enough to get going. Leave anything blank and add it later.</p>

						<label class="mt-5 block">
							<span class="text-xs font-semibold uppercase tracking-wide text-violet-500">The centre · your main focus</span>
							<input
								type="text"
								bind:value={centre}
								placeholder={centrePlaceholder}
								class="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[0.95rem] font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
							/>
						</label>

						<p class="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">The 8 areas around it</p>
						<div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#each areas as _, i}
								<div class="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
									<span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{i + 1}</span>
									<input
										type="text"
										bind:value={areas[i]}
										placeholder="Area {i + 1}"
										class="w-full border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-white"
									/>
								</div>
							{/each}
						</div>

						<button type="button" onclick={createChart} class="wiz-primary mt-7 w-full">Create my chart</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.wiz-primary {
		border-radius: 0.75rem;
		background: rgb(124 58 237);
		padding: 0.7rem 1.25rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: white;
		transition: background-color 0.15s ease;
	}
	.wiz-primary:hover {
		background: rgb(139 92 246);
	}
	.wiz-ghost {
		border-radius: 0.75rem;
		padding: 0.6rem 1.25rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: rgb(100 116 139);
		transition: background-color 0.15s ease, color 0.15s ease;
	}
	.wiz-ghost:hover {
		color: rgb(51 65 85);
	}
	:global(.dark) .wiz-ghost {
		color: rgb(148 163 184);
	}
	:global(.dark) .wiz-ghost:hover {
		color: rgb(226 232 240);
	}
</style>
