import { browser } from '$app/environment';
import { fetchUrlContent } from '$lib/urlContent.mjs';
import { chunkText, groupChunks } from '$lib/speechChunking.mjs';
import { speechTextFromNoteContent } from '$lib/noteSpeech.js';
import { getNoteTitle } from '$lib/todoUtils.js';
import { store } from '$stores/store.svelte.js';
import { mediaPlayer, setMediaPlayerChunkDoneHandler } from '$services/MediaPlayer.mjs';

class PlaybackStore {
	playStatus = $state('READY'); // READY, BUFFERING, PLAYING, CHUNKDONE, STOPPED
	curItem = $state(null);
	chunks = $state([]);
	lastBtnSuccessfullyPressedAt = 0;
	loading = $state(false);
	/** @type {AbortController | null} */
	prepareAbort = null;

	constructor() {
		if (browser) {
			setMediaPlayerChunkDoneHandler(() => {
				this.playStatus = 'CHUNKDONE';
				void this.playNextChunk();
			});
		}
	}

	get isBarVisible() {
		return this.curItem != null;
	}

	getCurrent() {
		return mediaPlayer.getCurrent();
	}

	isActiveItem(id) {
		return (
			this.curItem?.id === id &&
			(this.playStatus === 'PLAYING' || this.playStatus === 'BUFFERING')
		);
	}

	isItemCurrent(id) {
		return this.curItem?.id === id && this.curItem != null;
	}

	preventMultipleBtnPresses() {
		if (this.lastBtnSuccessfullyPressedAt && Date.now() - this.lastBtnSuccessfullyPressedAt < 1000) {
			return true;
		}
		this.lastBtnSuccessfullyPressedAt = Date.now();
		return false;
	}

	async stop() {
		this.prepareAbort?.abort();
		this.prepareAbort = null;
		await mediaPlayer.stop();
		this.playStatus = 'STOPPED';
		this.loading = false;
	}

	finish() {
		this.playStatus = 'STOPPED';
		this.curItem = null;
		this.chunks = [];
		this.loading = false;
	}

	buildChunks(text, title) {
		const chunks = [];
		const trimmedTitle = title?.trim();
		if (trimmedTitle) {
			chunks.push({ chunkType: 'title', text: trimmedTitle });
		}
		for (const chunk of groupChunks(chunkText(text))) {
			chunks.push({ chunkType: 'content', text: chunk });
		}
		return chunks;
	}

	async prepareItem(item) {
		this.loading = true;
		const controller = new AbortController();
		this.prepareAbort = controller;

		try {
			if (item.type === 'note') {
				const note = store.notes.find((n) => n.id === item.id);
				const content = note?.content ?? item.text ?? '';
				const text = speechTextFromNoteContent(content);
				if (!text) {
					throw new Error('No text to read in this note');
				}
				const title = item.title || getNoteTitle(content) || 'Note';
				return { ...item, title, text };
			}

			if (item.type === 'todo') {
				const todo = store.harada_chart.todos?.find((t) => t.id === item.id);
				const url = item.url || todo?.url;
				if (!url) {
					throw new Error('No URL linked to this task');
				}
				const title = item.title || todo?.title || url;
				if (item.text) {
					return { ...item, title, url, text: item.text };
				}
				const content = await fetchUrlContent(url);
				if (controller.signal.aborted) return false;
				if (!content?.text) {
					throw new Error(content?.message || 'Could not extract text from URL');
				}
				const resolvedTitle = content.title || title;
				return { ...item, title: resolvedTitle, url, text: content.text };
			}

			throw new Error('Unknown playback item type');
		} finally {
			if (this.prepareAbort === controller) {
				this.prepareAbort = null;
			}
			this.loading = false;
		}
	}

	async play(item) {
		if (!item?.id) return false;

		if (
			this.curItem?.id === item.id &&
			(this.playStatus === 'PLAYING' || this.playStatus === 'BUFFERING')
		) {
			return true;
		}

		if (this.curItem?.id && this.curItem.id !== item.id) {
			await this.stop();
		}

		this.playStatus = 'BUFFERING';
		this.loading = true;

		try {
			const prepared = await this.prepareItem(item);
			if (!prepared) {
				this.playStatus = 'STOPPED';
				return false;
			}

			this.chunks = this.buildChunks(prepared.text, prepared.title);
			if (!this.chunks.length) {
				throw new Error('Nothing to read');
			}

			const chunkNum =
				this.curItem?.id === prepared.id && typeof this.curItem.chunkNum === 'number'
					? Math.min(this.curItem.chunkNum, this.chunks.length - 1)
					: 0;

			this.curItem = {
				id: prepared.id,
				type: prepared.type,
				title: prepared.title,
				url: prepared.url,
				text: prepared.text,
				chunkNum,
				totalChunks: this.chunks.length,
				progress: 0
			};

			return await this.playCurrentChunk();
		} catch (error) {
			console.error('[playback.play]', error);
			this.playStatus = 'STOPPED';
			this.loading = false;
			if (this.curItem) {
				this.curItem = { ...this.curItem, error: error.message };
			}
			return false;
		}
	}

	async playCurrentChunk(startOffset = 0) {
		const item = this.curItem;
		if (!item || !this.chunks.length) return false;

		const chunk = this.chunks[item.chunkNum];
		if (!chunk) {
			return this.finish();
		}

		const offset =
			typeof startOffset === 'number' && Number.isFinite(startOffset)
				? Math.max(0, Math.min(1, startOffset))
				: typeof item.chunkStartOffset === 'number'
					? Math.max(0, Math.min(1, item.chunkStartOffset))
					: 0;

		this.playStatus = 'BUFFERING';
		this.loading = true;

		try {
			const voiceName = chunk.chunkType === 'title' ? 'Jennifer' : 'Puck';
			await mediaPlayer.say({
				text: chunk.text,
				voiceName,
				id: item.id,
				chunkNum: item.chunkNum,
				totalChunks: item.totalChunks,
				startOffset: offset,
				onPlaying: () => {
					this.playStatus = 'PLAYING';
					this.loading = false;
					this.updateProgress();
				}
			});
			if (this.curItem) {
				this.curItem = { ...this.curItem, chunkStartOffset: 0 };
			}
			return true;
		} catch (error) {
			console.error('[playback.playCurrentChunk]', error);
			this.playStatus = 'STOPPED';
			this.loading = false;
			return false;
		}
	}

	async playNextChunk() {
		const item = this.curItem;
		if (!item) return this.finish();

		if (item.chunkNum >= this.chunks.length - 1) {
			return this.finish();
		}

		this.curItem = { ...item, chunkNum: item.chunkNum + 1 };
		return this.playCurrentChunk();
	}

	async skipStartTrack() {
		if (!this.curItem) return false;
		await mediaPlayer.stop();
		this.curItem = { ...this.curItem, chunkNum: 0, progress: 0 };
		this.playStatus = 'BUFFERING';
		return this.playCurrentChunk();
	}

	async skipPrevChunk() {
		if (!this.curItem) return false;
		await mediaPlayer.stop();
		const chunkNum = Math.max(0, (this.curItem.chunkNum ?? 0) - 1);
		this.curItem = { ...this.curItem, chunkNum, progress: 0 };
		this.playStatus = 'BUFFERING';
		return this.playCurrentChunk();
	}

	async skipNextChunk() {
		if (!this.curItem) return false;
		await mediaPlayer.stop();
		if (this.curItem.chunkNum >= this.chunks.length - 1) {
			return this.finish();
		}
		this.curItem = { ...this.curItem, chunkNum: this.curItem.chunkNum + 1, progress: 0 };
		this.playStatus = 'BUFFERING';
		return this.playCurrentChunk();
	}

	async resume() {
		if (!this.curItem) return false;
		return this.playCurrentChunk();
	}

	async seekToProgress(percent) {
		const item = this.curItem;
		if (!item?.totalChunks || !this.chunks.length) return false;

		const clamped = Math.max(0, Math.min(100, percent));
		const target = (clamped / 100) * item.totalChunks;
		const chunkNum = Math.min(item.totalChunks - 1, Math.max(0, Math.floor(target)));
		const chunkStartOffset = target - chunkNum;
		const wasPlaying = this.playStatus === 'PLAYING' || this.playStatus === 'BUFFERING';

		await mediaPlayer.stop();

		this.curItem = {
			...item,
			chunkNum,
			chunkStartOffset,
			progress: clamped
		};

		if (!wasPlaying) {
			this.playStatus = 'STOPPED';
			this.loading = false;
			return true;
		}

		return this.playCurrentChunk(chunkStartOffset);
	}

	updateProgress() {
		const current = this.getCurrent();
		if (this.curItem && current?.id === this.curItem.id && current.progress <= 100) {
			this.curItem = { ...this.curItem, progress: current.progress };
		}
	}
}

export const playback = new PlaybackStore();
