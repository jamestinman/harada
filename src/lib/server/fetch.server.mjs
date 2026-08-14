import { NODE_ENV } from '$env/static/private';
import { Agent, fetch as undiciFetch } from 'undici';

function devDispatcher() {
	if (NODE_ENV !== 'development') return undefined;
	return new Agent({
		connect: {
			rejectUnauthorized: false
		}
	});
}

/**
 * @param {string} url
 * @param {{ followRedirects?: boolean }} [options] pass `followRedirects: false`
 *   for user-supplied URLs so each hop can be re-validated by the SSRF guard.
 */
export async function doFetchRaw(url, { followRedirects = true } = {}) {
	const redirect = followRedirects ? 'follow' : 'manual';
	const dispatcher = devDispatcher();
	if (dispatcher) {
		// Node's global fetch cannot use an Agent from the npm undici package.
		return undiciFetch(url, { method: 'GET', redirect, dispatcher });
	}
	return fetch(url, { method: 'GET', redirect });
}
