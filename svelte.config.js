import 'dotenv/config';
import adapterVercel from '@sveltejs/adapter-vercel';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isStaticAppBuild = process.env.BUILD_TARGET === 'static';

/** Stubs keep Google Tag / cookie consent out of iOS & Android bundles. */
const nativeAppStubs = isStaticAppBuild
	? {
			'$lib/websiteTracking.js': './src/lib/websiteTracking.stub.js',
			'$lib/googleTag.js': './src/lib/googleTag.stub.js',
			'$lib/consent.js': './src/lib/consent.stub.js',
			'$components/GoogleTag.svelte': './src/components/GoogleTag.stub.svelte',
			'$components/CookieConsent.svelte': './src/components/CookieConsent.stub.svelte'
		}
	: {};

/**
 * Content-Security-Policy.
 *
 * Only applied to builds - the dev server needs Vite's own inline/eval machinery,
 * so `vite dev` is left alone. Verify with `npm run preview`.
 *
 * The rule that matters: every backend the client talks to must appear in
 * connect-src, or fetch/websocket calls fail silently with a console error.
 */
const isBuild = process.argv.includes('build');
/** Escape hatch: `DISABLE_CSP=1 npm run build` ships without a policy. */
const cspEnabled = isBuild && process.env.DISABLE_CSP !== '1';

/** Supabase REST, auth and realtime. Realtime needs the wss:// origin too. */
function supabaseOrigins() {
	const raw = process.env.PUBLIC_SUPABASE_URL;
	if (!raw) {
		// Not available at build time - fall back to the hosted Supabase wildcard
		// so REST/auth/realtime still work rather than being blocked.
		console.warn(
			'[csp] PUBLIC_SUPABASE_URL not set at build time; falling back to *.supabase.co'
		);
		return ['https://*.supabase.co', 'wss://*.supabase.co'];
	}
	try {
		const url = new URL(raw);
		return [url.origin, `wss://${url.host}`];
	} catch {
		console.warn(`[csp] PUBLIC_SUPABASE_URL is not a valid URL: ${raw}`);
		return ['https://*.supabase.co', 'wss://*.supabase.co'];
	}
}

/** Native builds call the hosted API instead of a same-origin one. */
const HOSTED_API = ['https://haradato.com', 'https://www.haradato.com'];

/** Google Tag / Analytics / Ads - compile-time stubbed out of native builds. */
const GOOGLE_SCRIPT = [
	'https://www.googletagmanager.com',
	'https://www.googleadservices.com',
	'https://googleads.g.doubleclick.net'
];
const GOOGLE_CONNECT = [
	'https://www.googletagmanager.com',
	'https://*.googletagmanager.com',
	'https://www.google-analytics.com',
	'https://*.google-analytics.com',
	'https://*.analytics.google.com',
	'https://www.googleadservices.com',
	'https://www.google.com',
	// The AW- conversion tag beacons across several doubleclick/syndication
	// subdomains (ad., td., googleads.g., stats.g., pagead2.), so scope the
	// wildcard to those two domains rather than listing each one.
	'https://*.doubleclick.net',
	'https://*.googlesyndication.com'
];
/** Conversion tracking drops an iframe; without this default-src blocks it. */
const GOOGLE_FRAME = [
	'https://*.doubleclick.net',
	'https://*.googlesyndication.com',
	'https://www.googletagmanager.com'
];

function cspDirectives() {
	const connectSrc = ["'self'", ...supabaseOrigins(), ...HOSTED_API];
	const scriptSrc = ["'self'"];
	const styleSrc = ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'];
	const frameSrc = ["'self'"];

	if (isStaticAppBuild) {
		// Capacitor serves the app from capacitor://localhost (iOS) and
		// http://localhost (Android), so those must be reachable as well as 'self'.
		connectSrc.push('capacitor://localhost', 'http://localhost', 'https://localhost');
	} else {
		scriptSrc.push(...GOOGLE_SCRIPT);
		connectSrc.push(...GOOGLE_CONNECT);
		frameSrc.push(...GOOGLE_FRAME);
	}

	return {
		'default-src': ["'self'"],
		'script-src': scriptSrc,
		// 'unsafe-inline' is required: KaTeX, Tailwind and Svelte `style:` directives
		// all emit style attributes, which CSP treats as inline styles.
		'style-src': styleSrc,
		'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
		// Markdown can embed any image, and OAuth avatars come from Google's CDN.
		'img-src': ["'self'", 'data:', 'blob:', 'https:'],
		// TTS audio is played back from an object URL.
		'media-src': ["'self'", 'data:', 'blob:', ...HOSTED_API],
		'connect-src': connectSrc,
		'frame-src': frameSrc,
		'worker-src': ["'self'", 'blob:'],
		'object-src': ["'none'"],
		'base-uri': ["'self'"],
		'form-action': ["'self'"]
	};
}

const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: isStaticAppBuild
			? adapterStatic({
					pages: 'build',
					assets: 'build',
					fallback: 'index.html'
				})
			: adapterVercel({ runtime: 'nodejs24.x' }),
		...(cspEnabled ? { csp: { mode: 'auto', directives: cspDirectives() } } : {}),
		alias: {
			$components: './src/components',
			$config: './src/config',
			$data: './src/data',
			$db: './src/db',
			$lib: './src/lib',
			$stores: './src/stores',
			$modules: './src/modules',
			$services: './src/services',
			...nativeAppStubs
		}
	}
};

export default config;
