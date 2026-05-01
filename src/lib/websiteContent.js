export const articles = [];

export function getArticle(slug) {
	return articles.find((post) => post.slug === slug) ?? null;
}
