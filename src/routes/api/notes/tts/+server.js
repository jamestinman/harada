import { json } from '@sveltejs/kit';
import { GOOGLE_API_KEY } from '$env/static/private';

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`;
const MAX_TEXT_LENGTH = 8000;
const GEMINI_FETCH_TIMEOUT_MS = 20000;
const PCM_SAMPLE_RATE = 24000;
const PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonWithCors(data, init) {
	const response = json(data, init);
	for (const [key, value] of Object.entries(corsHeaders)) {
		response.headers.set(key, value);
	}
	return response;
}

function badRequest(message) {
	return jsonWithCors({ error: message }, { status: 400 });
}

function pcmToWav(pcm) {
	const header = Buffer.alloc(44);
	const byteRate = PCM_SAMPLE_RATE * PCM_CHANNELS * (PCM_BITS_PER_SAMPLE / 8);
	const blockAlign = PCM_CHANNELS * (PCM_BITS_PER_SAMPLE / 8);

	header.write('RIFF', 0);
	header.writeUInt32LE(36 + pcm.length, 4);
	header.write('WAVE', 8);
	header.write('fmt ', 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(PCM_CHANNELS, 22);
	header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
	header.writeUInt32LE(byteRate, 28);
	header.writeUInt16LE(blockAlign, 32);
	header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34);
	header.write('data', 36);
	header.writeUInt32LE(pcm.length, 40);

	return Buffer.concat([header, pcm]);
}

function geminiTextPrompt(text) {
	return `Read these notes aloud clearly and naturally. Keep the wording exactly as written.\n\n${text}`;
}

export function OPTIONS() {
	return new Response(null, { headers: corsHeaders });
}

export async function POST({ request, fetch }) {
	const requestId = Math.random().toString(36).slice(2, 10);
	console.log(`[Notes TTS][Server][${requestId}] request received`);

	if (!GOOGLE_API_KEY) {
		console.error(`[Notes TTS][Server][${requestId}] missing GOOGLE_API_KEY`);
		return jsonWithCors({ error: 'Missing GOOGLE_API_KEY' }, { status: 500 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		console.warn(`[Notes TTS][Server][${requestId}] invalid JSON body`);
		return badRequest('Invalid JSON');
	}

	const text = typeof body?.text === 'string' ? body.text.trim() : '';
	console.log(`[Notes TTS][Server][${requestId}] text length: ${text.length}`);
	if (!text) return badRequest('Text is required');
	if (text.length > MAX_TEXT_LENGTH) {
		return badRequest(`Text must be ${MAX_TEXT_LENGTH} characters or fewer`);
	}

	console.log(
		`[Notes TTS][Server][${requestId}] sending Gemini request (timeout ${GEMINI_FETCH_TIMEOUT_MS}ms)`
	);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), GEMINI_FETCH_TIMEOUT_MS);

	let geminiResponse;
	try {
		geminiResponse = await fetch(GEMINI_TTS_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-goog-api-key': GOOGLE_API_KEY
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [{ text: geminiTextPrompt(text) }]
					}
				],
				generationConfig: {
					responseModalities: ['AUDIO'],
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: { voiceName: 'Kore' }
						}
					}
				}
			}),
			signal: controller.signal
		});
	} catch (error) {
		if (error?.name === 'AbortError') {
			console.error(
				`[Notes TTS][Server][${requestId}] Gemini request timed out after ${GEMINI_FETCH_TIMEOUT_MS}ms`
			);
			return jsonWithCors({ error: 'Gemini TTS request timed out' }, { status: 504 });
		}
		console.error(`[Notes TTS][Server][${requestId}] Gemini fetch threw error:`, error);
		return jsonWithCors({ error: 'Gemini TTS network error' }, { status: 502 });
	} finally {
		clearTimeout(timeout);
	}
	console.log(
		`[Notes TTS][Server][${requestId}] Gemini response status: ${geminiResponse.status}`
	);

	if (!geminiResponse.ok) {
		const detail = await geminiResponse.text();
		console.error(`[Notes TTS][Server][${requestId}] Gemini request failed:`, detail);
		return jsonWithCors({ error: 'Gemini TTS request failed' }, { status: 502 });
	}

	const payload = await geminiResponse.json();
	const audioPart = payload?.candidates?.[0]?.content?.parts?.find(
		(part) => part?.inlineData?.data || part?.inline_data?.data
	);
	const inlineData = audioPart?.inlineData ?? audioPart?.inline_data;
	const base64Audio = inlineData?.data;

	if (!base64Audio) {
		console.error(
			`[Notes TTS][Server][${requestId}] Gemini response did not include inline audio data`
		);
		return jsonWithCors({ error: 'Gemini response did not include audio' }, { status: 502 });
	}

	const pcm = Buffer.from(base64Audio, 'base64');
	const wav = pcmToWav(pcm);
	console.log(
		`[Notes TTS][Server][${requestId}] audio generated: pcm=${pcm.length} bytes, wav=${wav.length} bytes`
	);

	return new Response(wav, {
		headers: {
			...corsHeaders,
			'Content-Type': 'audio/wav',
			'Content-Length': String(wav.length),
			'Cache-Control': 'no-store'
		}
	});
}
