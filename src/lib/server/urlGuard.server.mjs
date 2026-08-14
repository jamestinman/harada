import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard for user-supplied URLs.
 *
 * /api/retrieve deliberately fetches any URL a signed-in user asks for, so we
 * cannot use an allowlist. Instead we block targets that are only reachable
 * from inside our own network: loopback, link-local (cloud metadata),
 * RFC1918/ULA, CGNAT and other reserved ranges.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const MAX_REDIRECTS = 5;
/** Cap on fetched body size; a large remote file would otherwise OOM the function. */
export const MAX_FETCH_BYTES = 8 * 1024 * 1024;

export class BlockedUrlError extends Error {
	constructor(message) {
		super(message);
		this.name = 'BlockedUrlError';
		this.status = 400;
		this.code = 'blocked_url';
	}
}

function ipv4ToInt(ip) {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		const n = Number(part);
		if (!Number.isInteger(n) || n < 0 || n > 255) return null;
		value = value * 256 + n;
	}
	return value;
}

/** [network, prefix length] pairs that must never be fetched. */
const BLOCKED_V4_CIDRS = [
	['0.0.0.0', 8], // "this network"
	['10.0.0.0', 8], // RFC1918
	['100.64.0.0', 10], // CGNAT
	['127.0.0.0', 8], // loopback
	['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
	['172.16.0.0', 12], // RFC1918
	['192.0.0.0', 24], // IETF protocol assignments
	['192.0.2.0', 24], // TEST-NET-1
	['192.168.0.0', 16], // RFC1918
	['198.18.0.0', 15], // benchmarking
	['198.51.100.0', 24], // TEST-NET-2
	['203.0.113.0', 24], // TEST-NET-3
	['224.0.0.0', 4], // multicast
	['240.0.0.0', 4] // reserved, incl. 255.255.255.255
];

function isBlockedIpv4(ip) {
	const value = ipv4ToInt(ip);
	if (value === null) return true;
	for (const [network, bits] of BLOCKED_V4_CIDRS) {
		const base = ipv4ToInt(network);
		if (base === null) continue;
		const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
		if ((value & mask) === (base & mask)) return true;
	}
	return false;
}

function isBlockedIpv6(ip) {
	const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];

	// IPv4-mapped (::ffff:1.2.3.4) and IPv4-compatible forms defer to the v4 rules.
	const mapped = /^(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/.exec(normalized);
	if (mapped) return isBlockedIpv4(mapped[1]);

	if (normalized === '::' || normalized === '::1') return true;
	if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local
	if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link local
	if (/^ff[0-9a-f]{2}:/.test(normalized)) return true; // ff00::/8 multicast
	if (/^64:ff9b:/.test(normalized)) return true; // NAT64, can reach private v4
	if (/^2002:/.test(normalized)) return true; // 6to4, embeds arbitrary v4
	return false;
}

/** @param {string} ip */
export function isBlockedAddress(ip) {
	const family = isIP(ip);
	if (family === 4) return isBlockedIpv4(ip);
	if (family === 6) return isBlockedIpv6(ip);
	return true;
}

/**
 * Validate a single URL: http(s) only, and every address its hostname resolves
 * to must be publicly routable.
 * @param {string} rawUrl
 * @returns {Promise<URL>}
 */
export async function assertPublicUrl(rawUrl) {
	let parsed;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new BlockedUrlError('Invalid url');
	}

	if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
		throw new BlockedUrlError(`Unsupported protocol: ${parsed.protocol}`);
	}

	const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
	if (!hostname) throw new BlockedUrlError('Invalid url host');

	// Literal IP in the URL - check it directly, no DNS needed.
	if (isIP(hostname)) {
		if (isBlockedAddress(hostname)) {
			throw new BlockedUrlError('Refusing to fetch a private or reserved address');
		}
		return parsed;
	}

	if (hostname.toLowerCase() === 'localhost' || hostname.toLowerCase().endsWith('.localhost')) {
		throw new BlockedUrlError('Refusing to fetch a private or reserved address');
	}

	let addresses;
	try {
		addresses = await dnsLookup(hostname, { all: true, verbatim: true });
	} catch {
		throw new BlockedUrlError('Could not resolve host');
	}

	if (!addresses.length) throw new BlockedUrlError('Could not resolve host');
	for (const { address } of addresses) {
		if (isBlockedAddress(address)) {
			throw new BlockedUrlError('Refusing to fetch a private or reserved address');
		}
	}

	return parsed;
}

/**
 * Follow redirects manually, re-validating every hop. `redirect: 'follow'`
 * would let a public URL bounce us to 169.254.169.254.
 *
 * @param {string} url
 * @param {(url: string) => Promise<Response>} rawFetch fetcher that must not follow redirects
 * @returns {Promise<Response>}
 */
export async function fetchGuardedRedirects(url, rawFetch) {
	let current = (await assertPublicUrl(url)).toString();

	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		const response = await rawFetch(current);
		if (response.status < 300 || response.status > 399) return response;

		const location = response.headers.get('location');
		if (!location) return response;

		const next = new URL(location, current).toString();
		await assertPublicUrl(next);
		current = next;
	}

	throw new BlockedUrlError('Too many redirects');
}

/**
 * Read a response body with a hard byte cap.
 * @param {Response} response
 * @param {number} maxBytes
 * @returns {Promise<Uint8Array>}
 */
export async function readCappedBytes(response, maxBytes = MAX_FETCH_BYTES) {
	const declared = Number(response.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) {
		throw new BlockedUrlError('Remote content too large');
	}

	if (!response.body) return new Uint8Array(0);

	const chunks = [];
	let total = 0;
	const reader = response.body.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) throw new BlockedUrlError('Remote content too large');
			chunks.push(value);
		}
	} finally {
		reader.releaseLock?.();
	}

	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}
