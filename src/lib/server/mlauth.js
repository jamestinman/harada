import { createVerify } from 'node:crypto';

const MLAUTH_AGENT_URL = 'https://mlauth.ai/api/agent';
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

/** @param {string} ts */
export function assertFreshIsoTimestamp(ts) {
	const ms = Date.parse(ts);
	if (Number.isNaN(ms)) {
		throw Object.assign(new Error('invalid_timestamp'), { code: 'invalid_timestamp', status: 401 });
	}
	if (Math.abs(Date.now() - ms) > TIMESTAMP_WINDOW_MS) {
		throw Object.assign(new Error('stale_timestamp'), { code: 'stale_timestamp', status: 401 });
	}
}

/** @param {string} dumbname */
export async function fetchMlAuthAgent(dumbname) {
	const res = await fetch(`${MLAUTH_AGENT_URL}/${encodeURIComponent(dumbname)}`);
	if (res.status === 404) return null;
	if (!res.ok) {
		throw Object.assign(new Error(`mlauth_agent_fetch_${res.status}`), {
			code: 'mlauth_unavailable',
			status: 502
		});
	}
	return await res.json();
}

/**
 * @param {string} publicKeyPem
 * @param {string} signatureB64
 * @param {string} signedPayloadUtf8
 */
export function verifyEcdsaSha256(publicKeyPem, signatureB64, signedPayloadUtf8) {
	const verify = createVerify('sha256');
	verify.update(signedPayloadUtf8);
	verify.end();
	try {
		return verify.verify(publicKeyPem, Buffer.from(signatureB64, 'base64'));
	} catch {
		return false;
	}
}

/**
 * @param {string} dumbname
 * @param {string} timestamp
 * @param {string} signatureB64
 * @param {string} [message]
 */
export async function verifyAgentRequest(dumbname, timestamp, signatureB64, message) {
	assertFreshIsoTimestamp(timestamp);
	const agent = await fetchMlAuthAgent(dumbname);
	if (!agent?.public_key) {
		throw Object.assign(new Error('agent_not_found'), { code: 'agent_not_found', status: 401 });
	}
	if (agent.key_status?.is_revoked === true) {
		throw Object.assign(new Error('agent_key_revoked'), { code: 'agent_key_revoked', status: 401 });
	}
	const payload = `${dumbname}${timestamp}${message ?? ''}`;
	if (!verifyEcdsaSha256(agent.public_key, signatureB64, payload)) {
		throw Object.assign(new Error('invalid_signature'), { code: 'invalid_signature', status: 401 });
	}
	return agent;
}
