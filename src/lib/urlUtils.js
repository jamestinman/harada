/** Characters allowed while typing a URL in the composer URL tab. */
const URL_INPUT_CHARS = /[^\w:/?#%&=.\-+~@]/g;

export function sanitizeUrlInput(value) {
	return String(value ?? '').replace(URL_INPUT_CHARS, '');
}

export function normalizeUrl(input) {
	const trimmed = String(input ?? '').trim();
	if (!trimmed) return null;

	let candidate = trimmed;
	if (!/^https?:\/\//i.test(candidate)) {
		candidate = `https://${candidate}`;
	}

	try {
		const parsed = new URL(candidate);
		if (!parsed.hostname || !parsed.protocol.startsWith('http')) return null;
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
