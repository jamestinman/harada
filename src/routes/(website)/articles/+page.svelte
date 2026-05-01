<script>
	import { articles } from '$lib/websiteContent.js';
</script>

<svelte:head>
	<title>Articles - Haradato</title>
	<meta name="description" content="Haradato updates, product thinking and deep dives." />
</svelte:head>

<section class="content-page space-y-4">
	<h1 class="text-3xl font-semibold">Articles</h1>

	{#if articles.length === 0}
		<div class="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
			No articles yet.
		</div>
	{:else}
		<div class="space-y-3">
			{#each articles as article}
				<a
					href={`/articles/${article.slug}`}
					class="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900"
				>
					<h2 class="text-xl font-semibold">{article.title}</h2>
					{#if article.description}
						<p class="mt-2 text-slate-600 dark:text-slate-300">{article.description}</p>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</section>
