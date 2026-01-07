import adapterVercel from '@sveltejs/adapter-vercel';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: process.env.BUILD_TARGET === 'static' 
			? adapterStatic({ fallback: 'index.html' }) 
			: adapterVercel(),
		alias: {
			$components: './src/components',
			$config: './src/config',
			$data: './src/data',
			$db: './src/db',
      $lib: './src/lib',
			$stores: './src/stores',
			$modules: './src/modules',
			$services: './src/services'
		}
	}
};

export default config;
