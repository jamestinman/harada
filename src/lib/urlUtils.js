/** Characters allowed while typing a URL in the composer URL tab. */
const URL_INPUT_CHARS = /[^\w:/?#%&=.\-+~@]/g;
const EXPLICIT_HTTP_RE = /^https?:\/\//i;

export function sanitizeUrlInput(value) {
	return String(value ?? '').replace(URL_INPUT_CHARS, '');
}

/** Hostname must look like a real web address unless the user typed http(s):// explicitly. */
function hostnameLooksLikeUrl(hostname, hadExplicitScheme) {
	if (!hostname) return false;
	if (hadExplicitScheme) return true;
	const lower = hostname.toLowerCase();
	if (lower === 'localhost') return true;
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
	if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
	return hostname.includes('.');
}

export function normalizeUrl(input) {
	const trimmed = String(input ?? '').trim();
	if (!trimmed) return null;

	const hadExplicitScheme = EXPLICIT_HTTP_RE.test(trimmed);
	let candidate = trimmed;
	if (!hadExplicitScheme) {
		candidate = `https://${candidate}`;
	}

	try {
		const parsed = new URL(candidate);
		if (!parsed.hostname || !parsed.protocol.startsWith('http')) return null;
		if (!hostnameLooksLikeUrl(parsed.hostname, hadExplicitScheme)) return null;
		return parsed.href;
	} catch {
		return null;
	}
}

/** True when the entire string is a single URL (no other text). */
export function parseStandaloneUrl(text) {
	const trimmed = String(text ?? '').trim();
	if (!trimmed || /\s/.test(trimmed)) return null;
	return normalizeUrl(trimmed);
}

export function enqueueTodoUrlEnrichment(store, todoId, title) {
	if (!todoId || !parseStandaloneUrl(title)) return;
	void store.enrichTodoFromUrl(todoId, title);
}
