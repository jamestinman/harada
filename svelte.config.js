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
