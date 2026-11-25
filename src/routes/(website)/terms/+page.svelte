<script>
	import { store } from '$stores/store.svelte.js';

	const link = 'text-emerald-600 dark:text-emerald-400 hover:underline font-medium';
</script>

<svelte:head>
	<title>Terms of Service – Haradato</title>
	<meta
		name="description"
		content="The terms that apply when you use Haradato, the goal-planning, task and notes app."
	/>
</svelte:head>

<div class="max-w-3xl mx-auto px-4 pt-10 pb-16 space-y-8">
	<header class="space-y-3 text-center">
		<h1 class="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-50">
			Terms of Service
		</h1>
		<p class="text-xs text-slate-500 dark:text-slate-400">Last updated: 20 November 2026</p>
	</header>

	<section class="space-y-4 text-sm sm:text-base text-slate-700 dark:text-slate-200">
		<p>
			These terms apply when you use Haradato, including the website at haradato.com, the web app,
			the iOS, Android and desktop apps, and the agent API (together, “the service”). By using the
			service you agree to these terms. If you do not agree, please do not use it.
		</p>
		<p>
			How we handle your data is explained in our
			<a href="/privacy" class={link}>Privacy Policy</a>, which forms part of these terms.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">Using Haradato</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			You can use Haradato without an account, in which case your goals, tasks and notes are stored
			only on your device. If you create an account, your data is synced to our servers so it is
			available on your other devices.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			If you create an account, you must give a valid email address and keep your sign-in details
			secure. You are responsible for what happens under your account, including actions taken by
			any AI agent you have approved. Tell us promptly if you think someone has accessed your
			account without your permission.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			You must be at least 13 years old to use the service, or older if the law in your country
			sets a higher age for using online services without a parent’s consent.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">Your content</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			The goals, tasks, notes and anything else you add to Haradato remain yours. You give us
			permission to store, copy, process and display that content only as far as we need to run
			the service for you: for example, to sync it between your devices, back it up, or show it to
			an agent you have approved.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			If you publish a note or other content with a public link, anyone with that link can see it.
			You are responsible for anything you choose to make public, and you can withdraw it at any
			time.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">AI agents</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			You can let an AI agent read and update your goals, tasks and notes. An agent only gets
			access once you approve it in Settings, and you can remove that access at any time.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			Agents are provided by third parties, not by us. We are not responsible for what an agent
			does with the access you give it, or for any content it creates, changes or deletes on your
			behalf. Check what an agent has done if accuracy matters to you.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			An agent may create an account for you, but the account belongs to you and is only connected
			once you confirm it with your email address.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">Acceptable use</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">You must not use Haradato to:</p>
		<ul class="list-disc pl-6 space-y-1 text-sm text-slate-700 dark:text-slate-200">
			<li>break the law or encourage others to do so</li>
			<li>
				publish content that is unlawful, harassing, defamatory, or that infringes someone else’s
				rights
			</li>
			<li>
				access other people’s accounts or data, or try to get round security or access controls
			</li>
			<li>
				overload or disrupt the service, including through excessive automated requests to the API
			</li>
			<li>distribute malware, spam or other harmful material</li>
		</ul>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			These rules also apply to any agent acting on your behalf.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">Paid plans</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			Haradato’s core features are free. We may offer optional paid add-ons, as described on our
			<a href="/pricing" class={link}>pricing page</a>. Before you buy one, we will tell you the
			price, how often you will be billed and how to cancel. Any extra terms for a paid plan will be
			shown to you at the point of purchase.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			Nothing in these terms affects your statutory rights as a consumer, including any right to
			cancel or get a refund under the law where you live.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">Changes to the service</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			We are always improving Haradato, so features may change, be added or be removed. If we plan
			to shut down the service, we will give account holders reasonable notice and a way to export
			their data before we do.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
			Suspending or closing accounts
		</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			You can stop using Haradato and
			<a href="https://s0c13ty.com/account-deletion" class={link}>delete your account</a> at any
			time.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			We may suspend or close an account, or remove published content, if it breaks these terms or
			puts other users or the service at risk. Where we reasonably can, we will tell you why first
			and give you a chance to put things right.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
			Our responsibility to you
		</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			We work hard to keep Haradato reliable and your data safe, but we provide the service “as
			is”. We cannot promise it will always be available or free of errors, and we recommend
			keeping your own copy of anything you cannot afford to lose.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			As far as the law allows, we are not liable for indirect or unforeseeable losses, or for loss
			of data, profits or business opportunities. If you have paid us, our total liability to you is
			limited to the amount you paid in the 12 months before the claim. If you have not paid us, it
			is limited to £50.
		</p>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			Nothing in these terms limits our liability for death or personal injury caused by our
			negligence, for fraud, or for anything else that cannot be limited by law.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">Changes to these terms</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			We may update these terms from time to time and will change the date at the top of this page
			when we do. If a change significantly affects you, we will let account holders know before it
			takes effect. If you keep using Haradato after a change, you accept the updated terms.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">Governing law</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			These terms are governed by the law of England and Wales, and the courts of England and Wales
			can hear any dispute about them. If you live elsewhere in the UK or in the European Union, you
			can also bring a claim in the courts where you live, and you keep the protection of any
			mandatory consumer law that applies there.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">Contact</h2>
		<p class="text-sm text-slate-700 dark:text-slate-200">
			If you have questions about these terms, please contact us via the information provided on
			<a href="https://www.haradato.com" class={link}>haradato.com</a>.
		</p>
	</section>

	<footer
		class="pt-6 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400"
	>
		Version {store.version}
	</footer>
</div>
