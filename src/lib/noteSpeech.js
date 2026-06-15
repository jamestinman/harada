const HOSTED_TTS_ENDPOINT = 'https://haradato.com/api/notes/tts';

function noteSpeechEndpoint() {
	if (typeof window === 'undefined') return '/api/notes/tts';
	if (window.Capacitor?.isNativePlatform?.()) return HOSTED_TTS_ENDPOINT;
	if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') {
		return HOSTED_TTS_ENDPOINT;
	}
	return '/api/notes/tts';
}

export function speechTextFromNoteContent(content = '') {
	return content
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
		.replace(/[#>*_`~-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function isWebSpeechAvailable() {
	return (
		typeof window !== 'undefined' &&
		typeof speechSynthesis !== 'undefined' &&
		typeof SpeechSynthesisUtterance !== 'undefined'
	);
}

export function isGeminiPlaybackAvailable() {
	return (
		typeof Audio !== 'undefined' &&
		typeof URL !== 'undefined' &&
		typeof URL.createObjectURL === 'function'
	);
}

export function isNoteSpeechSupported() {
	return isGeminiPlaybackAvailable() || isWebSpeechAvailable();
}

export function cancelNoteSpeech() {
	if (typeof speechSynthesis !== 'undefined') {
		speechSynthesis.cancel();
	}
}

function pickEnglishVoice() {
	const voices = speechSynthesis.getVoices();
	return (
		voices.find((voice) => voice.lang.startsWith('en') && voice.localService) ??
		voices.find((voice) => voice.lang.startsWith('en')) ??
		voices[0] ??
		null
	);
}

function speakWithWebSpeech(text, { signal, onended } = {}) {
	return new Promise((resolve, reject) => {
		if (!isWebSpeechAvailable()) {
			reject(new Error('Web Speech API not supported'));
			return;
		}

		if (signal?.aborted) {
			reject(new DOMException('Aborted', 'AbortError'));
			return;
		}

		const utterance = new SpeechSynthesisUtterance(text);
		const voice = pickEnglishVoice();
		if (voice) utterance.voice = voice;

		let settled = false;
		const settle = (fn, value) => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener('abort', onAbort);
			fn(value);
		};

		const onAbort = () => {
			speechSynthesis.cancel();
			settle(reject, new DOMException('Aborted', 'AbortError'));
		};

		utterance.onend = () => {
			onended?.();
			settle(resolve);
		};
		utterance.onerror = (event) => {
			settle(reject, new Error(event.error || 'Web Speech synthesis failed'));
		};

		signal?.addEventListener('abort', onAbort, { once: true });

		const start = () => {
			speechSynthesis.cancel();
			speechSynthesis.speak(utterance);
		};

		if (speechSynthesis.getVoices().length === 0) {
			const onVoicesChanged = () => {
				speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
				const nextVoice = pickEnglishVoice();
				if (nextVoice) utterance.voice = nextVoice;
				start();
			};
			speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
		} else {
			start();
		}
	});
}

function playAudioBlob(blob, { signal, onended } = {}) {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const audio = new Audio(url);

		let settled = false;
		const cleanup = () => {
			audio.pause();
			audio.onended = null;
			audio.onerror = null;
			audio.src = '';
			URL.revokeObjectURL(url);
		};

		const settle = (fn, value) => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener('abort', onAbort);
			cleanup();
			fn(value);
		};

		const onAbort = () => {
			settle(reject, new DOMException('Aborted', 'AbortError'));
		};

		audio.onended = () => {
			onended?.();
			settle(resolve);
		};
		audio.onerror = () => {
			settle(reject, new Error('Audio playback failed'));
		};

		signal?.addEventListener('abort', onAbort, { once: true });

		audio.play().catch((error) => settle(reject, error));
	});
}

function shouldUseWebSpeechFirst() {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function fetchNoteSpeechBlob(text, { signal } = {}) {
	const endpoint = noteSpeechEndpoint();
	console.log('[Notes TTS][Client] requesting speech blob', {
		endpoint,
		textLength: text.length
	});

	let response;
	try {
		response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text }),
			signal
		});
	} catch (error) {
		if (error?.name === 'AbortError') throw error;
		console.warn('[Notes TTS][Client] network error reaching TTS endpoint:', error);
		const networkError = new Error('TTS network error');
		networkError.fallback = true;
		throw networkError;
	}

	console.log('[Notes TTS][Client] speech response received', {
		status: response.status,
		ok: response.ok,
		contentType: response.headers.get('content-type')
	});

	if (!response.ok) {
		let message = 'Could not generate speech audio';
		let fallback = response.status >= 500 || response.status === 429 || response.status === 503;
		try {
			const payload = await response.json();
			if (typeof payload?.error === 'string') message = payload.error;
			if (payload?.fallback === true) fallback = true;
		} catch {
			// Keep defaults when response body is not JSON.
		}
		const error = new Error(message);
		error.fallback = fallback;
		throw error;
	}

	const blob = await response.blob();
	console.log('[Notes TTS][Client] speech blob ready', {
		size: blob.size,
		type: blob.type
	});
	return blob;
}

/** @returns {'gemini' | 'web-speech'} */
export async function speakNoteText(text, { signal, onended } = {}) {
	if (!text) {
		throw new Error('No text to speak');
	}

	if (shouldUseWebSpeechFirst()) {
		if (!isWebSpeechAvailable()) {
			throw new Error('Speech is unavailable while offline');
		}
		console.log('[Notes TTS][Client] offline, using Web Speech API');
		await speakWithWebSpeech(text, { signal, onended });
		return 'web-speech';
	}

	if (isGeminiPlaybackAvailable()) {
		try {
			const blob = await fetchNoteSpeechBlob(text, { signal });
			await playAudioBlob(blob, { signal, onended });
			return 'gemini';
		} catch (error) {
			if (error?.name === 'AbortError') throw error;
			if (error?.fallback !== false && isWebSpeechAvailable()) {
				console.warn(
					'[Notes TTS][Client] Gemini TTS unavailable, falling back to Web Speech API:',
					error.message
				);
				await speakWithWebSpeech(text, { signal, onended });
				return 'web-speech';
			}
			throw error;
		}
	}

	if (isWebSpeechAvailable()) {
		await speakWithWebSpeech(text, { signal, onended });
		return 'web-speech';
	}

	throw new Error('Speech is not supported in this browser');
}
