import test from 'node:test';
import assert from 'node:assert/strict';
import {
	BlockedUrlError,
	isBlockedAddress,
	assertPublicUrl,
	fetchGuardedRedirects,
	readCappedBytes
} from './urlGuard.server.mjs';

test('isBlockedAddress rejects loopback, private and link-local IPv4', () => {
	for (const ip of [
		'127.0.0.1',
		'127.1.2.3',
		'10.0.0.1',
		'172.16.0.1',
		'172.31.255.254',
		'192.168.1.1',
		'169.254.169.254', // AWS/GCP metadata
		'100.64.0.1', // CGNAT
		'0.0.0.0',
		'255.255.255.255',
		'224.0.0.1'
	]) {
		assert.equal(isBlockedAddress(ip), true, `${ip} should be blocked`);
	}
});

test('isBlockedAddress allows public IPv4', () => {
	for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '11.0.0.1']) {
		assert.equal(isBlockedAddress(ip), false, `${ip} should be allowed`);
	}
});

test('isBlockedAddress rejects loopback and internal IPv6', () => {
	for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1']) {
		assert.equal(isBlockedAddress(ip), true, `${ip} should be blocked`);
	}
	assert.equal(isBlockedAddress('2606:4700:4700::1111'), false);
});

test('isBlockedAddress rejects non-IP input', () => {
	assert.equal(isBlockedAddress('not-an-ip'), true);
	assert.equal(isBlockedAddress(''), true);
});

test('assertPublicUrl rejects non-http protocols', async () => {
	for (const url of ['file:///etc/passwd', 'gopher://x.com', 'ftp://x.com']) {
		await assert.rejects(() => assertPublicUrl(url), BlockedUrlError);
	}
});

test('assertPublicUrl rejects localhost and literal private IPs', async () => {
	for (const url of [
		'http://localhost:5026/x',
		'http://app.localhost/x',
		'http://127.0.0.1/x',
		'http://169.254.169.254/latest/meta-data/',
		'http://[::1]:8080/x',
		'http://192.168.0.1/'
	]) {
		await assert.rejects(() => assertPublicUrl(url), BlockedUrlError, `${url} should be blocked`);
	}
});

test('assertPublicUrl allows a public literal IP', async () => {
	const parsed = await assertPublicUrl('https://8.8.8.8/x');
	assert.equal(parsed.hostname, '8.8.8.8');
});

test('fetchGuardedRedirects re-validates each redirect hop', async () => {
	const seen = [];
	const rawFetch = async (url) => {
		seen.push(url);
		if (url === 'https://8.8.8.8/start') {
			return new Response(null, {
				status: 302,
				headers: { location: 'http://169.254.169.254/latest/meta-data/' }
			});
		}
		return new Response('ok', { status: 200 });
	};

	await assert.rejects(
		() => fetchGuardedRedirects('https://8.8.8.8/start', rawFetch),
		BlockedUrlError
	);
	// The metadata endpoint must never have been requested.
	assert.deepEqual(seen, ['https://8.8.8.8/start']);
});

test('fetchGuardedRedirects gives up after too many redirects', async () => {
	const rawFetch = async () =>
		new Response(null, { status: 302, headers: { location: 'https://8.8.8.8/loop' } });
	await assert.rejects(
		() => fetchGuardedRedirects('https://8.8.8.8/loop', rawFetch),
		/Too many redirects/
	);
});

test('readCappedBytes rejects an oversized declared content-length', async () => {
	const response = new Response('x', { headers: { 'content-length': String(50 * 1024 * 1024) } });
	await assert.rejects(() => readCappedBytes(response), BlockedUrlError);
});

test('readCappedBytes rejects a body that exceeds the cap while streaming', async () => {
	const stream = new ReadableStream({
		pull(controller) {
			controller.enqueue(new Uint8Array(64 * 1024));
		}
	});
	await assert.rejects(() => readCappedBytes(new Response(stream), 128 * 1024), BlockedUrlError);
});

test('readCappedBytes returns the body when under the cap', async () => {
	const bytes = await readCappedBytes(new Response('hello'), 1024);
	assert.equal(new TextDecoder().decode(bytes), 'hello');
});
