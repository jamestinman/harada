import { PUBLIC_APP_ORIGIN } from '$env/static/public';

const HOSTED_SAY_ENDPOINT = 'https://haradato.com/api/say';

export function sayEndpoint() {
	if (typeof window === 'undefined') return '/api/say';
	if (window.Capacitor?.isNativePlatform?.()) return HOSTED_SAY_ENDPOINT;
	if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') {
		return HOSTED_SAY_ENDPOINT;
	}
	if (PUBLIC_APP_ORIGIN && typeof window !== 'undefined') {
		try {
			const origin = new URL(PUBLIC_APP_ORIGIN).origin;
			if (origin !== window.location.origin) {
				return `${origin}/api/say`;
			}
		} catch {
			// fall through to relative endpoint
		}
	}
	return '/api/say';
}
