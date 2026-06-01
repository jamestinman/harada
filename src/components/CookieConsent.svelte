<script>
	import { consentStore } from '$stores/consent.svelte.js';
	import { isWebsiteTrackingActive } from '$lib/websiteTracking.js';

	function accept() {
		consentStore.accept();
	}

	function reject() {
		consentStore.reject();
	}

	function close() {
		consentStore.closePreferences();
	}
</script>

{#if isWebsiteTrackingActive() && consentStore.bannerVisible}
	<div
		class="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 sm:p-5"
		role="dialog"
		aria-labelledby="cookie-consent-title"
		aria-describedby="cookie-consent-desc"
	>
		<div class="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
				<p id="cookie-consent-title" class="font-semibold text-slate-900 dark:text-slate-50">
					Cookies and advertising
				</p>
				<p id="cookie-consent-desc">
					We use Google tags on this website to measure ad performance. In the EU, UK, and
					Switzerland we only enable these after you consent. You can change your choice anytime.
					See our <a href="/privacy" class="font-medium text-emerald-600 underline dark:text-emerald-400"
						>Privacy Policy</a
					>.
				</p>
			</div>
			<div class="flex shrink-0 flex-wrap gap-2">
				{#if consentStore.preferencesOpen && consentStore.choice}
					<button
						type="button"
						class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
						onclick={close}
					>
						Close
					</button>
				{/if}
				<button
					type="button"
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
					onclick={reject}
				>
					Reject
				</button>
				<button
					type="button"
					class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
					onclick={accept}
				>
					Accept
				</button>
			</div>
		</div>
	</div>
{/if}
