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

export async function fetchNoteSpeechBlob(text, { signal } = {}) {
	const endpoint = noteSpeechEndpoint();
	console.log('[Notes TTS][Client] requesting speech blob', {
		endpoint,
		textLength: text.length
	});

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text }),
		signal
	});
	console.log('[Notes TTS][Client] speech response received', {
		status: response.status,
		ok: response.ok,
		contentType: response.headers.get('content-type')
	});

	if (!response.ok) {
		let message = 'Could not generate speech audio';
		try {
			const payload = await response.json();
			if (typeof payload?.error === 'string') message = payload.error;
		} catch {
			// Keep the default message if the response is not JSON.
		}
		throw new Error(message);
	}

	const blob = await response.blob();
	console.log('[Notes TTS][Client] speech blob ready', {
		size: blob.size,
		type: blob.type
	});
	return blob;
}
