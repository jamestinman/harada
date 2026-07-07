<script>
	import { playback } from '$stores/playback.svelte.js';
	import { Pause, Play, X } from 'lucide-svelte';

	let intervalId = null;
	let progressBarEl = $state(null);
	let isDragging = $state(false);
	let dragProgress = $state(0);

	const visible = $derived(playback.curItem != null);
	const title = $derived(playback.curItem?.title ?? '');
	const progress = $derived(playback.curItem?.progress ?? 0);
	const displayProgress = $derived(isDragging ? dragProgress : progress);
	const isPlaying = $derived(
		playback.playStatus === 'PLAYING' || playback.playStatus === 'BUFFERING'
	);

	function progressFromClientX(clientX) {
		if (!progressBarEl) return 0;
		const rect = progressBarEl.getBoundingClientRect();
		if (!rect.width) return 0;
		const x = clientX - rect.left;
		return Math.max(0, Math.min(100, (x / rect.width) * 100));
	}

	function handleProgressPointerDown(event) {
		if (!progressBarEl) return;
		isDragging = true;
		dragProgress = progressFromClientX(event.clientX);
		progressBarEl.setPointerCapture(event.pointerId);
	}

	function handleProgressPointerMove(event) {
		if (!isDragging) return;
		dragProgress = progressFromClientX(event.clientX);
	}

	function handleProgressPointerUp(event) {
		if (!isDragging || !progressBarEl) return;
		isDragging = false;
		const target = progressFromClientX(event.clientX);
		if (progressBarEl.hasPointerCapture(event.pointerId)) {
			progressBarEl.releasePointerCapture(event.pointerId);
		}
		void playback.seekToProgress(target);
	}

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
			<div class="relative flex items-center justify-center">
				<p class="truncate px-8 text-center text-sm font-medium" title={title}>
					{title}
				</p>
				{#if !isPlaying}
					<button
						type="button"
						class="absolute right-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-200/80 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
						aria-label="Close playback"
						onclick={() => {
							void playback.dismiss();
						}}
					>
						<X class="h-5 w-5" />
					</button>
				{/if}
			</div>

			<button
				bind:this={progressBarEl}
				type="button"
				class="group flex h-5 w-full touch-none items-center"
				aria-label="Seek playback position"
				onpointerdown={handleProgressPointerDown}
				onpointermove={handleProgressPointerMove}
				onpointerup={handleProgressPointerUp}
				onpointercancel={handleProgressPointerUp}
			>
				<span
					class="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200 group-hover:h-2 dark:bg-slate-700"
					role="progressbar"
					aria-valuenow={displayProgress}
					aria-valuemin="0"
					aria-valuemax="100"
				>
					<span
						class={`absolute inset-y-0 left-0 rounded-full bg-emerald-500 dark:bg-emerald-400 ${
							isDragging ? '' : 'transition-all duration-200'
						}`}
						style="width: {displayProgress}%"
					></span>
				</span>
			</button>

			<div class="flex flex-row items-center justify-center">
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
			</div>
		</div>
	</div>
{/if}
