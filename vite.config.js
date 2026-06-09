import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const isStaticAppBuild = process.env.BUILD_TARGET === 'static';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 5026,
		allowedHosts: ['haradato.test'],
		hmr: {
			host: 'haradato.test',
			protocol: 'wss',
			clientPort: 443
		}
	},
	define: {
		__STATIC_APP_BUILD__: JSON.stringify(isStaticAppBuild)
	},
	resolve: {
		alias: isStaticAppBuild
			? {
					'$lib/websiteTracking.js': path.resolve(root, 'src/lib/websiteTracking.stub.js'),
					'$lib/googleTag.js': path.resolve(root, 'src/lib/googleTag.stub.js'),
					'$lib/consent.js': path.resolve(root, 'src/lib/consent.stub.js'),
					'$components/GoogleTag.svelte': path.resolve(root, 'src/components/GoogleTag.stub.svelte'),
					'$components/CookieConsent.svelte': path.resolve(
						root,
						'src/components/CookieConsent.stub.svelte'
					)
				}
			: {}
	}
});
