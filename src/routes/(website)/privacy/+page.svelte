<script>
	import { store } from '$stores/store.svelte.js';
</script>

<div class="max-w-3xl mx-auto px-4 pt-10 pb-16 space-y-8">
	<header class="space-y-3 text-center">
		<h1 class="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-50">
			Privacy Policy
		</h1>
		<p class="text-xs text-slate-500 dark:text-slate-400">
			Last updated: March 16, 2026
		</p>
	</header>

	<section class="space-y-4 text-sm sm:text-base text-slate-700 dark:text-slate-200">
		<p>
			Haradato is a focused goal-planning and todo app. We collect and store only the minimum
			information necessary to provide the service, sync your data, and keep your account secure.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
			Account and authentication
		</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			We use Supabase Authentication to handle sign-up, sign-in and password reset. When you create
			an account, Supabase processes your email address, password and (optionally) profile
			information such as your name or avatar. Authentication sessions are stored using Supabase’s
			built-in session persistence so you can stay signed in across app launches.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			Your Haradato goals and todos are associated with your Supabase user account. We do not sell
			or share your account information with third parties for advertising.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
			Local storage and on-device data
		</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			Haradato is designed to be local-first. We use your device’s local storage to keep an offline copy of your goals and todos, and to remember things like:
		</p>
		<ul class="list-disc pl-6 space-y-1 text-sm text-slate-700 dark:text-slate-200">
			<li>Your theme preference (light or dark)</li>
			<li>
				Onboarding and help state (for example whether you have already seen the “How it works”
				introduction)
			</li>
			<li>Other small UI preferences needed to make the app feel consistent and fast</li>
		</ul>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			This information stays on your device unless it is part of your synced account data. You can
			clear this local data at any time using your system settings or by removing the app.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
			Analytics, advertising, and cookies
		</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			On our public website (not in the iOS or Android apps), we use Google Ads conversion
			measurement via Google Tag. This may set cookies or use similar technologies to understand
			whether an ad led you to visit Haradato. We use Google Consent Mode: in the European
			Economic Area, United Kingdom, and Switzerland, advertising storage stays off until you
			accept cookies on the banner. Elsewhere, tags may run with a granted default unless you
			reject them via Cookie settings in the site footer.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			Your choice is stored in your browser (local storage) so we can remember it on later visits.
			You can withdraw consent at any time using Cookie settings. For more about Google’s
			processing, see
			<a
				href="https://policies.google.com/privacy"
				class="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
				rel="noopener noreferrer"
				target="_blank">Google’s Privacy Policy</a
			>.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
			Data retention and deletion
		</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			Your Haradato data is kept for as long as your account exists or as long as it is stored
			locally on your device. If you <a href="https://s0c13ty.com/account-deletion" class="underline">delete your account</a>, your
			account-linked data will be removed from our backend within a reasonable period, subject to
			any legal obligations we may have to keep certain records.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
			Your choices
		</h2>
		<ul class="list-disc pl-6 space-y-1 text-sm text-slate-700 dark:text-slate-200">
			<li>You can sign out at any time from the Settings panel in the app.</li>
			<li>
				You can use Haradato in local-only mode if Supabase credentials are not configured; in this
				case, data remains on your device.
			</li>
			<li>
				You can clear on-device storage (local storage and Preferences) using your system settings
				or by uninstalling the app.
			</li>
			<li>
				On the website, use Cookie settings in the footer to accept or reject advertising cookies,
				or clear site data in your browser to reset that choice.
			</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
			Contact
		</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			If you have questions about this Privacy Policy or how Haradato handles your data, please
			contact us via the information provided on
			<a
				href="https://www.haradato.com"
				class="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
				>haradato.com</a
			>.
		</p>
	</section>

	<footer class="pt-6 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400">
		Version {store.version}
	</footer>
</div>

