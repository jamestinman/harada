import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { extractText as extractPdfText, getDocumentProxy, getMeta } from 'unpdf';
import { GOOGLE_API_KEY } from '$env/static/private';
import { doFetchRaw } from '$lib/server/fetch.server.mjs';
import {
	BlockedUrlError,
	fetchGuardedRedirects,
	readCappedBytes
} from '$lib/server/urlGuard.server.mjs';

const knownNonContentTags = [
	'header',
	'script',
	'style',
	'noscript',
	'iframe',
	'svg',
	'canvas',
	'video',
	'audio',
	'embed',
	'object'
];

const knownNonContentClasses = [
	'.navigation',
	'.nav',
	'.navbar',
	'.menu',
	'.menubar',
	'.header-nav',
	'.main-nav',
	'.site-nav',
	'.breadcrumb',
	'.breadcrumbs',
	'.sidebar',
	'.side-nav',
	'.side-menu',
	'.footer-nav',
	'.footer-menu',
	'.fusion-header-wrapper',
	'.fusion-header',
	'.fusion-nav',
	'.avada-header',
	'.avada-nav',
	'.elementor-header',
	'.elementor-nav',
	'.divi-header',
	'.divi-nav',
	'.wpb-header',
	'.wpb-nav',
	'.vc-header',
	'.vc-nav',
	'.bootstrap-header',
	'.bootstrap-nav',
	'.foundation-header',
	'.foundation-nav',
	'.wp-header',
	'.wp-nav',
	'.wp-menu',
	'.wordpress-header',
	'.wordpress-nav',
	'.genesis-header',
	'.genesis-nav',
	'.woocommerce-header',
	'.woocommerce-nav',
	'.social',
	'.share',
	'.sharing',
	'.social-media',
	'.social-links',
	'.social-icons',
	'.social-buttons',
	'.follow-us',
	'.follow-me',
	'.comments',
	'.comment-section',
	'.comment-area',
	'.related',
	'.related-posts',
	'.related-articles',
	'.recommended',
	'.suggested',
	'.more-posts',
	'.similar-posts',
	'.ad',
	'.advertisement',
	'.ads',
	'.promo',
	'.advertising',
	'.widget',
	'.widgets',
	'.sidebar-widget',
	'.footer-widget',
	'.newsletter',
	'.subscribe',
	'.subscription',
	'.cookie-notice',
	'.cookie-banner',
	'.cookie-policy',
	'.popup',
	'.modal',
	'.overlay',
	'.lightbox',
	'.notification',
	'.alert',
	'.banner',
	'.skip-link',
	'.sr-only',
	'.visually-hidden',
	'.screen-reader',
	'.accessibility',
	'.site-header',
	'.site-footer',
	'.main-header',
	'.main-footer',
	'.top-bar',
	'.bottom-bar',
	'.utility-bar',
	'.utility-nav',
	'.cart',
	'.shopping-cart',
	'.mini-cart',
	'.checkout',
	'.account',
	'.my-account',
	'.product-nav',
	'.category-nav',
	'.search',
	'.search-box',
	'.search-form',
	'.utility',
	'.utilities',
	'.tools',
	'.language-switcher',
	'.currency-switcher',
	'.mobile-menu',
	'.mobile-nav',
	'.hamburger',
	'.menu-toggle',
	'.responsive-menu',
	'.mobile-header',
	'.analytics',
	'.tracking',
	'.pixel',
	'.gtag',
	'.facebook-pixel',
	'.header-wrapper',
	'.footer-wrapper',
	'.nav-wrapper',
	'.menu-wrapper',
	'.banner-wrapper',
	'.promo-wrapper'
];

export async function extractContentServer(url) {
	if (!url) return { ok: 0, status: 400, message: 'Missing url' };

	const urlObj = new URL(url);
	if (urlObj.hostname.includes('youtube') && GOOGLE_API_KEY) {
		const videoId = urlObj.searchParams.get('v');
		return extractYoutubeMetadata(videoId);
	}

	return extractHtmlText(url);
}

async function extractYoutubeMetadata(videoId) {
	if (!videoId) {
		return { ok: 0, status: 400, message: 'Video id not found' };
	}

	const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${GOOGLE_API_KEY}`;
	let response;
	try {
		response = await doFetchRaw(detailsUrl);
	} catch (e) {
		const msg = e.message || e?.body?.message || e.statusText || 'Network error';
		return { ok: 0, status: 500, message: msg };
	}

	const data = await response.json();
	const snippet = data?.items?.[0]?.snippet;
	if (!snippet?.title) {
		return { ok: 0, status: 404, message: 'No title returned for YouTube video' };
	}

	return {
		ok: 1,
		videoId,
		title: snippet.title,
		excerpt: snippet.description,
		text: snippet.description
	};
}

async function extractHtmlText(url) {
	let response;

	try {
		response = await fetchGuardedRedirects(url, (target) =>
			doFetchRaw(target, { followRedirects: false })
		);
		if (!response.ok) {
			const status = response?.status ?? 502;
			const msg = response?.statusText ?? 'Bad Gateway';
			return { ok: 0, status, message: msg };
		}
	} catch (e) {
		if (e instanceof BlockedUrlError) {
			return { ok: 0, status: e.status, message: e.message };
		}
		const msg = e.message || e?.body?.message || e.statusText || 'Network error';
		return { ok: 0, status: 500, message: msg };
	}

	const contentType = response.headers.get('content-type') || '';
	const urlLower = url.toLowerCase();
	const shouldTryPdf =
		urlLower.endsWith('.pdf') ||
		contentType.includes('application/pdf') ||
		contentType.includes('application/x-pdf');

	let dataBytes;
	try {
		dataBytes = await readCappedBytes(response);
	} catch (e) {
		if (e instanceof BlockedUrlError) {
			return { ok: 0, status: e.status, message: e.message };
		}
		return { ok: 0, status: 500, message: e?.message || 'Could not read remote content' };
	}
	const isPdfSignature =
		dataBytes.length >= 4 &&
		dataBytes[0] === 0x25 &&
		dataBytes[1] === 0x50 &&
		dataBytes[2] === 0x44 &&
		dataBytes[3] === 0x46;

	if (shouldTryPdf && isPdfSignature) {
		try {
			const pdf = await getDocumentProxy(dataBytes);
			const metadata = await getMeta(pdf);
			const { text } = await extractPdfText(pdf, { mergePages: true });
			return {
				ok: 1,
				status: 200,
				title: metadata.info?.Title || metadata.info?.title || '',
				text: text || '',
				imgUrl: ''
			};
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			return {
				ok: 0,
				status: 500,
				message: `Failed to parse PDF: ${errorMessage || 'Unknown error'}`
			};
		}
	}

	const html = new TextDecoder().decode(dataBytes);
	if (!html) {
		return { ok: 0, status: 500, message: 'No content could be extracted' };
	}

	const sanitizedHtml = html.replace(/<style[\s\S]*?<\/style>/gi, '');
	const fullDom = new JSDOM(sanitizedHtml);
	const fullDocument = fullDom.window.document;

	let imgUrl = '';
	const ogImage = fullDocument.querySelector('meta[property="og:image"]');
	if (ogImage) {
		imgUrl = ogImage.getAttribute('content');
	} else {
		const twitterImage = fullDocument.querySelector('meta[name="twitter:image"]');
		if (twitterImage) {
			imgUrl = twitterImage.getAttribute('content');
		}
	}

	trimDom(fullDocument.documentElement);

	const separated = new Readability(fullDocument, { disableJSONLD: true }).parse();
	if (!separated?.content) {
		return { ok: 0, status: 500, message: 'Readability could not extract article content' };
	}

	const virtualDom = new JSDOM(separated.content);
	const text = extractText(virtualDom.window.document, virtualDom);

	return {
		ok: 1,
		status: 200,
		title: separated.title,
		excerpt: separated.excerpt,
		text,
		imgUrl
	};
}

function trimSentence(s) {
	const trimmed = s.trim();
	if (!trimmed) return '';
	const endsWithPunctuation = /[.?!:;]$/.test(trimmed);
	return endsWithPunctuation ? `${trimmed} ` : `${trimmed}. `;
}

function extractText(node, dom) {
	let text = '';
	for (const childNode of node.childNodes) {
		if (childNode.nodeType === dom.window.Node.TEXT_NODE) {
			const tagName = childNode.parentNode.tagName.toLowerCase();
			if (['span', 'a', 'b', 'i', 'u', 'strong', 'li'].includes(tagName)) {
				text += trimSentence(childNode.nodeValue);
			} else {
				text += trimSentence(childNode.nodeValue.trim());
			}
		} else if (childNode.nodeType === dom.window.Node.ELEMENT_NODE) {
			text += extractText(childNode, dom);
		}
	}
	return text;
}

function trimDom(node) {
	if (node?.tagName && knownNonContentTags.includes(node.tagName.toLowerCase())) {
		node.remove();
		return true;
	}

	if (node?.classList) {
		for (const entry of node.classList.values()) {
			if (knownNonContentClasses.includes(`.${entry}`)) {
				node.remove();
				return true;
			}
		}
	}

	for (const childNode of node.childNodes) {
		trimDom(childNode);
	}
	return false;
}
