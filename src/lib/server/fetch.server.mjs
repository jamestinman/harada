import { NODE_ENV } from '$env/static/private';
import { Agent } from 'undici';

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
	return fetch(url, {
		method: 'GET',
		...(dispatcher ? { dispatcher } : {})
	});
}
