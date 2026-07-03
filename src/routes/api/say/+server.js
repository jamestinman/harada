import textToSpeech from '@google-cloud/text-to-speech';
import { getServiceAccount } from '$lib/server/gcp.server.mjs';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

/** @type {import('@google-cloud/text-to-speech').TextToSpeechClient | null} */
let client = null;

function getClient() {
	if (!client) {
		client = new textToSpeech.TextToSpeechClient({ credentials: getServiceAccount() });
	}
	return client;
}

export function OPTIONS() {
	return new Response(null, { headers: corsHeaders });
}

export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
	}

	const { msg, settings } = body ?? {};
	if (!msg || typeof msg !== 'string') {
		return new Response('Missing msg', { status: 400, headers: corsHeaders });
	}

	try {
		const ttsClient = getClient();
		const [res] = await ttsClient.synthesizeSpeech({
			input: { text: msg },
			voice: {
				name: settings?.voice?.name,
				languageCode: settings?.voice?.languageCode
			},
			audioConfig: {
				audioEncoding: 'MP3',
				speakingRate: settings?.speakingRate || 1.0
			}
		});

		const audioContent = res.audioContent;
		if (!audioContent) throw new Error('No audio content returned');

		const audioBuffer = Buffer.from(
			typeof audioContent === 'string' ? audioContent : audioContent,
			typeof audioContent === 'string' ? 'base64' : undefined
		);

		return new Response(
			JSON.stringify({
				audio: audioBuffer.toString('base64'),
				size: audioBuffer.length
			}),
			{
				status: 200,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			}
		);
	} catch (e) {
		console.error('[api/say]', e.message);
		return new Response(e.message || 'TTS failed', { status: 500, headers: corsHeaders });
	}
}
