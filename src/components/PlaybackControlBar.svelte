<script>
	import { playback } from '$stores/playback.svelte.js';
	import { SkipBack, Rewind, Pause, Play, FastForward } from 'lucide-svelte';

	let intervalId = null;

	const visible = $derived(playback.curItem != null);
	const title = $derived(playback.curItem?.title ?? '');
	const progress = $derived(playback.curItem?.progress ?? 0);
	const isPlaying = $derived(
		playback.playStatus === 'PLAYING' || playback.playStatus === 'BUFFERING'
	);

	$effect(() => {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}

		if (playback.playStatus === 'PLAYING') {
			intervalId = setInterval(() => {
				playback.updateProgress();
			}, 250);
		}

		return () => {
			if (intervalId) {
				clearInterval(intervalId);
				intervalId = null;
			}
		};
	});
</script>

{#if visible}
	<div
		class="playback-control-bar"
		role="region"
		aria-label="Playback controls"
		style="padding-bottom: env(safe-area-inset-bottom, 0px);"
	>
		<div class="playback-control-bar-inner mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3">
			<p class="truncate text-center text-sm font-medium" title={title}>
				{title}
			</p>

			<div
				class="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
				role="progressbar"
				aria-valuenow={progress}
				aria-valuemin="0"
				aria-valuemax="100"
			>
				<div
					class="h-full rounded-full bg-emerald-500 transition-all duration-200 dark:bg-emerald-400"
					style="width: {progress}%"
				></div>
			</div>

			<div class="flex flex-row items-center justify-center gap-2">
				<button
					type="button"
					class="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
					aria-label="Skip to start"
					onclick={() => {
						if (playback.preventMultipleBtnPresses()) return;
						void playback.skipStartTrack();
					}}
				>
					<SkipBack class="h-7 w-7" />
				</button>

				<button
					type="button"
					class="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
					aria-label="Rewind chunk"
					onclick={() => {
						if (playback.preventMultipleBtnPresses()) return;
						void playback.skipPrevChunk();
					}}
				>
					<Rewind class="h-7 w-7" />
				</button>

				{#if isPlaying}
					<button
						type="button"
						class="rounded-full bg-slate-900 p-3 text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
						aria-label="Pause"
						onclick={async () => {
							await playback.stop();
						}}
					>
						<Pause class="h-8 w-8" />
					</button>
				{:else}
					<button
						type="button"
						class="rounded-full bg-slate-900 p-3 text-white transition hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
						aria-label="Play"
						disabled={playback.loading}
						onclick={async () => {
							if (playback.preventMultipleBtnPresses()) return;
							await playback.resume();
						}}
					>
						<Play class="h-8 w-8" />
					</button>
				{/if}

				<button
					type="button"
					class="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
					aria-label="Fast forward chunk"
					onclick={() => {
						if (playback.preventMultipleBtnPresses()) return;
						void playback.skipNextChunk();
					}}
				>
					<FastForward class="h-7 w-7" />
				</button>
			</div>
		</div>
	</div>
{/if}
