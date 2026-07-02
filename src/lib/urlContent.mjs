const HOSTED_RETRIEVE_ENDPOINT = 'https://haradato.com/api/retrieve';

function retrieveEndpoint() {
	if (typeof window === 'undefined') return '/api/retrieve';
	if (window.Capacitor?.isNativePlatform?.()) return HOSTED_RETRIEVE_ENDPOINT;
	if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') {
		return HOSTED_RETRIEVE_ENDPOINT;
	}
	return '/api/retrieve';
}

export async function fetchUrlContent(url) {
	const response = await fetch(
		`${retrieveEndpoint()}?url=${encodeURIComponent(url)}`,
		{
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
			}
		}
	);

	if (!response.ok) {
		let message = 'Unable to load URL';
		try {
			const body = await response.json();
			message = body.message || message;
		} catch {
			message = response.statusText || message;
		}
		return { ok: 0, status: response.status, message };
	}

	try {
		return await response.json();
	} catch {
		return { ok: 0, status: 500, message: 'Invalid response from server' };
	}
}
