/** Sentence-aware text chunking for TTS (ported from Echowalk). */

export function chunkText(text, maxChunkSize = 850) {
	const chunks = [];
	if (!text) return chunks;
	let currentChunk = '';

	const addChunk = () => {
		currentChunk = currentChunk.trim();
		if (currentChunk) {
			chunks.push(currentChunk.trim());
			currentChunk = '';
		}
	};

	text = text.replace('<br>', '. ');
	text = text.replace('<br/>', '. ');
	text = text.replace('<br />', '. ');

	const words = text.split(/\s+/);

	for (const word of words) {
		if (currentChunk.length + word.length > maxChunkSize) {
			addChunk();
		}
		currentChunk += word + ' ';
		if (word.match(/[.?!:;]$/)) {
			addChunk();
		}
	}

	addChunk();
	return chunks;
}

export function groupChunks(chunks, idealChunkSize = 750) {
	const groupedChunks = [];
	let curChunk = '';
	for (const chunk of chunks) {
		if (curChunk.length + chunk.length > idealChunkSize) {
			if (curChunk) {
				groupedChunks.push(curChunk);
				curChunk = '';
			}
			if (chunk.length >= idealChunkSize) {
				groupedChunks.push(chunk);
			} else {
				curChunk = chunk;
			}
		} else {
			curChunk += ' ' + chunk;
		}
	}
	if (curChunk) {
		groupedChunks.push(curChunk);
	}
	return groupedChunks;
}
