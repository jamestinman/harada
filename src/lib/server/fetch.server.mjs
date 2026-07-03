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

export async function doFetchRaw(url) {
	const dispatcher = devDispatcher();
	if (dispatcher) {
		// Node's global fetch cannot use an Agent from the npm undici package.
		return undiciFetch(url, { method: 'GET', dispatcher });
	}
	return fetch(url, { method: 'GET' });
}
