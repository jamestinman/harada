<script>
	import { page } from '$app/state';
	import { getArticle } from '$lib/websiteContent.js';

	const article = $derived(getArticle(page.params.slug));
</script>

<svelte:head>
	<title>{article?.title || 'Article'} - Haradato</title>
	<meta name="description" content={article?.description || 'Haradato article'} />
</svelte:head>

{#if article}
	<article class="content-page rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
		<h1 class="mb-2 text-3xl font-semibold">{article.title}</h1>
		{#if article.description}
			<p class="mb-6 text-slate-600 dark:text-slate-300">{article.description}</p>
		{/if}
		<div class="space-y-4 text-slate-700 dark:text-slate-200">
			{#each article.content as paragraph}
				<p>{paragraph}</p>
			{/each}
		</div>
	</article>
{:else}
	<section class="content-page rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
		<h1 class="text-2xl font-semibold">Article not found</h1>
		<p class="mt-2 text-slate-600 dark:text-slate-300">This article does not exist yet.</p>
	</section>
{/if}
