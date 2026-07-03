import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';
import { sayEndpoint } from '$lib/sayEndpoint.mjs';
import { speakWithWebSpeech } from '$lib/noteSpeech.js';

function isServerSide() {
	return !browser;
}

function round(value, decimals = 2) {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

let current = {
	id: '',
	chunkNum: 0,
	startTime: 0,
	elapsed: 0,
	duration: 0,
	chunkElapsed: 0,
	progress: 0,
	totalChunks: 0,
	chunkProgress: 0
};

/** @type {(() => void) | null} */
let onChunkDone = null;

const voices = {
	Jennifer: {
		name: 'en-GB-Chirp3-HD-Aoede',
		languageCode: 'en-GB'
	},
	William: {
		name: 'en-GB-Chirp3-HD-Fenrir',
		languageCode: 'en-GB'
	},
	Kore: {
		name: 'en-US-Chirp3-HD-Kore',
		languageCode: 'en-US'
	},
	Puck: {
		name: 'en-GB-Chirp3-HD-Puck',
		languageCode: 'en-GB'
	},
	Daniel: {
		name: 'en-GB-Neural2-B',
		languageCode: 'en-GB'
	}
};

const getVoice = (voiceName) => voices[voiceName] ?? voices.Puck;

class MediaPlayer {
	/** @type {AudioContext | null} */
	audioContext = null;
	/** @type {AudioBufferSourceNode | null} */
	audioSource = null;
	/** @type {HTMLAudioElement | null} */
	audioElement = null;
	positionTimer = null;
	isNativeAudio = false;
	webSpeechAbort = null;

	getCurrentId = () => (current?.id ? current.id : '');

	getCurrent = () => {
		const hasAudioSource = this.audioSource && this.audioSource.buffer && this.audioContext;
		const hasAudioElement = this.audioElement && !this.audioElement.paused;

		if (!hasAudioSource && !hasAudioElement) {
			if (!current.id) {
				current = {
					id: '',
					chunkNum: 0,
					startTime: 0,
					elapsed: 0,
					duration: 0,
					chunkElapsed: 0,
					progress: 0,
					totalChunks: 0,
					chunkProgress: 0
				};
			}
			return current;
		}

		if (this.audioElement) {
			current.duration = this.audioElement.duration || 0;
			current.elapsed = this.audioElement.currentTime || 0;
		} else if (hasAudioSource) {
			current.duration = this.audioSource.buffer.duration;
			current.elapsed = this.audioContext
				? this.audioContext.currentTime - current.startTime
				: 0;
		}

		if (current.elapsed >= current.duration) {
			current.chunkElapsed = 1;
		} else {
			current.chunkElapsed = current.duration > 0 ? current.elapsed / current.duration : 0;
		}

		if (current.totalChunks) {
			let progress = current.chunkNum / current.totalChunks;
			current.chunkProgress = current.chunkElapsed * (1 / current.totalChunks);
			progress += current.chunkProgress;
			current.progress = round(progress * 100, 2);
		} else {
			current.progress = 0;
		}

		return current;
	};

	stop = async () => {
		if (this.webSpeechAbort) {
			this.webSpeechAbort.abort();
			this.webSpeechAbort = null;
		}

		if (this.audioElement) {
			this.audioElement.pause();
			this.audioElement.currentTime = 0;
			this.audioElement.src = '';
			this.audioElement.onended = null;
			this.audioElement = null;
		}

		if (this.audioSource) {
			const source = this.audioSource;
			let stopped = false;
			await new Promise((resolve) => {
				const cleanup = () => {
					if (!stopped) {
						stopped = true;
						if (this.audioSource === source) {
							this.audioSource = null;
						}
						resolve();
					}
				};
				const timeout = setTimeout(cleanup, 500);
				source.onended = () => {
					clearTimeout(timeout);
					cleanup();
				};
				try {
					source.stop();
				} catch {
					cleanup();
				}
			});
		}

		if (typeof speechSynthesis !== 'undefined') {
			speechSynthesis.cancel();
		}

		this.stopPositionUpdates();
	};

	/**
	 * @param {{ text: string, voiceName?: string, id?: string, chunkNum?: number, totalChunks?: number, onPlaying?: () => void }} rec
	 */
	say = async (rec) => {
		if (!rec?.text?.trim()) return false;

		await this.stop();

		this.isNativeAudio =
			!isServerSide() &&
			(Capacitor.isNativePlatform() || /iPad|iPhone|iPod|Android/i.test(navigator.userAgent));

		const msg = rec.text;
		const voice = getVoice(rec.voiceName);
		const settings = { voice, speakingRate: 1 };
		const endpoint = sayEndpoint();

		let audioBytes;
		try {
			audioBytes = await this.fetchSpeechAudio(endpoint, msg, settings);
		} catch (error) {
			if (typeof navigator !== 'undefined' && navigator.onLine === false) {
				return this.playWebSpeech(rec.text, rec.onPlaying);
			}
			throw error;
		}

		if (!audioBytes?.byteLength) throw new Error('Audio response was empty');

		current = {
			id: rec.id ?? '',
			chunkNum: rec.chunkNum ?? 0,
			startTime: 0,
			elapsed: 0,
			chunkElapsed: 0,
			duration: 0,
			progress: 0,
			totalChunks: rec.totalChunks || 0,
			chunkProgress: 0
		};

		if (this.isNativeAudio) {
			return this.playMp3WithElement(audioBytes, rec.onPlaying);
		}

		return this.playMp3WithWebAudio(audioBytes, rec.onPlaying);
	};

	fetchSpeechAudio(endpoint, msg, settings) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', endpoint, true);
			xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');

			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const json = typeof xhr.response === 'string' ? JSON.parse(xhr.response) : xhr.response;
						if (!json.audio) {
							reject(new Error('No audio in response'));
							return;
						}
						const binary = atob(json.audio);
						const bytes = new Uint8Array(binary.length);
						for (let i = 0; i < binary.length; i++) {
							bytes[i] = binary.charCodeAt(i);
						}
						resolve(bytes.buffer);
					} catch (e) {
						reject(new Error('Failed to parse audio response: ' + (e.message || e)));
					}
				} else {
					reject(new Error(`Failed to generate speech: ${xhr.status}`));
				}
			};

			xhr.onerror = () => reject(new Error('Network error fetching audio'));
			xhr.send(JSON.stringify({ msg, settings }));
		});
	}

	playMp3WithElement(audioBytes, onPlaying) {
		return new Promise((resolve, reject) => {
			const blob = new Blob([audioBytes], { type: 'audio/mpeg' });
			if (!blob.size) {
				reject(new Error('Audio blob is empty'));
				return;
			}

			const audioUrl = URL.createObjectURL(blob);
			this.audioElement = new Audio(audioUrl);

			this.audioElement.onloadedmetadata = () => {
				current.duration = this.audioElement?.duration || 0;
			};

			this.audioElement.onended = () => {
				URL.revokeObjectURL(audioUrl);
				this.audioElement = null;
				this.stopPositionUpdates();
				onChunkDone?.();
				resolve();
			};

			this.audioElement.onerror = () => {
				URL.revokeObjectURL(audioUrl);
				this.audioElement = null;
				reject(new Error('Audio playback failed'));
			};

			this.audioElement
				.play()
				.then(() => {
					current.startTime = Date.now() / 1000;
					onPlaying?.();
					this.startPositionUpdates();
					resolve();
				})
				.catch((err) => {
					URL.revokeObjectURL(audioUrl);
					reject(new Error('Failed to start playback: ' + (err.message || err)));
				});
		});
	}

	async playMp3WithWebAudio(audioBytes, onPlaying) {
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
		}
		if (this.audioContext.state === 'suspended') {
			await this.audioContext.resume();
		}

		const wav = await this.audioContext.decodeAudioData(audioBytes.slice(0));

		return new Promise((resolve, reject) => {
			if (!this.audioContext) return reject(new Error('No audioContext'));

			const newSource = this.audioContext.createBufferSource();
			this.audioSource = newSource;
			this.audioSource.buffer = wav;
			this.audioSource.connect(this.audioContext.destination);

			this.audioSource.onended = () => {
				this.stopPositionUpdates();
				onChunkDone?.();
				resolve();
			};

			this.audioSource.start();
			current.startTime = this.audioContext.currentTime;
			current.duration = wav.duration;
			onPlaying?.();
			this.startPositionUpdates();
			resolve();
		});
	}

	playWebSpeech = (text, onPlaying) => {
		const controller = new AbortController();
		this.webSpeechAbort = controller;
		onPlaying?.();

		return speakWithWebSpeech(text, {
			signal: controller.signal,
			onended: () => {
				this.webSpeechAbort = null;
				this.stopPositionUpdates();
				onChunkDone?.();
			}
		});
	};

	startPositionUpdates = () => {
		this.stopPositionUpdates();
		this.positionTimer = setInterval(() => {
			const hasAudioSource = this.audioSource && this.audioContext;
			const hasAudioElement = this.audioElement && !this.audioElement.paused;
			if (!hasAudioSource && !hasAudioElement) return;
			this.getCurrent();
		}, 250);
	};

	stopPositionUpdates = () => {
		if (this.positionTimer) {
			clearInterval(this.positionTimer);
			this.positionTimer = null;
		}
	};
}

export const mediaPlayer = new MediaPlayer();

export function setMediaPlayerChunkDoneHandler(handler) {
	onChunkDone = handler;
}
