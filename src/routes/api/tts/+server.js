import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_VOICE = 'Kore';
const SAMPLE_RATE = 24000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

function createWavHeader(dataLength) {
	const blockAlign = (NUM_CHANNELS * BITS_PER_SAMPLE) / 8;
	const byteRate = SAMPLE_RATE * blockAlign;
	const buffer = new ArrayBuffer(44);
	const view = new DataView(buffer);

	const writeString = (offset, value) => {
		for (let i = 0; i < value.length; i += 1) {
			view.setUint8(offset + i, value.charCodeAt(i));
		}
	};

	writeString(0, 'RIFF');
	view.setUint32(4, 36 + dataLength, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, NUM_CHANNELS, true);
	view.setUint32(24, SAMPLE_RATE, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, BITS_PER_SAMPLE, true);
	writeString(36, 'data');
	view.setUint32(40, dataLength, true);

	return new Uint8Array(buffer);
}

function pcmToWav(pcmBytes) {
	const header = createWavHeader(pcmBytes.length);
	const wav = new Uint8Array(header.length + pcmBytes.length);
	wav.set(header, 0);
	wav.set(pcmBytes, header.length);
	return wav;
}

function extractInlineAudio(responseJson) {
	const parts = responseJson?.candidates?.[0]?.content?.parts;
	if (!Array.isArray(parts)) return null;
	for (const part of parts) {
		const inline = part?.inlineData;
		if (inline?.data) return inline;
	}
	return null;
}

export async function POST({ request, fetch }) {
	console.log('[api/tts] POST received');
	const apiKey = env.GOOGLE_API_KEY;
	if (!apiKey) {
		console.error('[api/tts] Missing GOOGLE_API_KEY');
		return json({ error: 'Missing GOOGLE_API_KEY' }, { status: 500 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		console.error('[api/tts] Invalid JSON body');
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const rawText = typeof body?.text === 'string' ? body.text : '';
	const text = rawText.trim();
	if (!text) {
		console.warn('[api/tts] Empty text payload');
		return json({ error: 'text is required' }, { status: 400 });
	}

	const voiceName =
		typeof body?.voiceName === 'string' && body.voiceName.trim()
			? body.voiceName.trim()
			: DEFAULT_VOICE;
	const model =
		typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
	console.log('[api/tts] Request parsed', {
		model,
		voiceName,
		textLength: text.length
	});
	console.log('[api/tts] Sending request to Gemini');

	const prompt = `Read naturally and clearly:\n\n${text}`;

	const ttsResp = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-goog-api-key': apiKey
			},
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }],
				generationConfig: {
					responseModalities: ['AUDIO'],
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: {
								voiceName
							}
						}
					}
				}
			})
		}
	);
	console.log('[api/tts] Gemini response status', ttsResp.status);

	if (!ttsResp.ok) {
		const errorText = await ttsResp.text();
		console.error('[api/tts] Gemini TTS request failed', {
			status: ttsResp.status,
			errorText
		});
		return json({ error: 'Gemini TTS request failed', details: errorText }, { status: 502 });
	}

	const ttsJson = await ttsResp.json();
	console.log('[api/tts] Gemini JSON received');
	const inlineData = extractInlineAudio(ttsJson);
	if (!inlineData?.data) {
		console.error('[api/tts] No inline audio in Gemini response', {
			candidateCount: Array.isArray(ttsJson?.candidates) ? ttsJson.candidates.length : 0
		});
		return json({ error: 'No audio returned from Gemini TTS' }, { status: 502 });
	}

	const audioBytes = Uint8Array.from(Buffer.from(inlineData.data, 'base64'));
	const mimeType = String(inlineData.mimeType || '').toLowerCase();
	const wavBytes =
		mimeType.includes('wav') || mimeType.includes('wave') ? audioBytes : pcmToWav(audioBytes);
	console.log('[api/tts] Audio prepared', {
		sourceMimeType: inlineData.mimeType || 'unknown',
		outputBytes: wavBytes.length
	});

	return new Response(wavBytes, {
		status: 200,
		headers: {
			'Content-Type': 'audio/wav',
			'Cache-Control': 'no-store'
		}
	});
}
