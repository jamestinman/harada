<svelte:head>
	<title>Pricing – Haradato</title>
	<meta
		name="description"
		content="Haradato is free with no limits. Optional add-ons for AI assistant and publishing coming soon."
	/>
</svelte:head>

<section class="content-page space-y-10">
	<!-- Hero -->
	<div class="text-center">
		<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need is free. No strings attached.</h1>
    <p class="mx-auto max-w-lg text-base text-slate-500 dark:text-slate-400">Add-ons for AI and publishing coming soon.</p>
		<p class="mx-auto mt-3 max-w-lg text-sm text-slate-500 dark:text-slate-400">
			<a href="/free-todoist-alternative" class="font-semibold text-emerald-600 underline-offset-4 hover:underline dark:text-emerald-400">Compare as a free Todoist alternative →</a>
		</p>
	</div>

	<!-- Tier cards -->
	<div class="grid gap-6 lg:grid-cols-3">

		<!-- Free -->
		<div class="relative flex flex-col rounded-2xl border-2 border-emerald-500 bg-white p-7 shadow-sm dark:bg-slate-900">
			<div class="absolute -top-3 left-1/2 -translate-x-1/2">
				<span class="rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-semibold text-white">Current plan</span>
			</div>
			<div class="mb-5">
				<p class="text-sm font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Free</p>
				<p class="mt-1 text-4xl font-bold text-slate-900 dark:text-white">$0</p>
				<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">forever</p>
			</div>

			<ul class="flex-1 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
				{#each [
					'Unlimited tasks and to-do lists',
					'Unlimited markdown notes',
					'Harada life-goal charts',
					'Sync across all your devices',
					'Offline mode - works without internet',
				] as feature}
					<li class="flex items-start gap-2.5">
						<svg class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path fill-rule="evenodd" d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.29a1 1 0 011.408 0z" clip-rule="evenodd"/>
						</svg>
						{feature}
					</li>
				{/each}
			</ul>

			<div class="mt-7 space-y-2 text-center text-sm text-slate-600 dark:text-slate-400">
				<p class="font-semibold text-slate-800 dark:text-slate-200">Free without limits.</p>
				<p>No sign-up required.</p>
				<p>No strings attached.</p>
			</div>

			<a href="/harada" class="salesBtn mt-6 block w-full text-center">Get started free</a>
		</div>

		<!-- Assistant -->
		<div class="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
			<div class="mb-5">
				<p class="text-sm font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">Assistant</p>
				<div class="mt-1 flex items-end gap-2">
					<p class="text-4xl font-bold text-slate-900 dark:text-white">$4</p>
					<p class="mb-1 text-sm text-slate-500 dark:text-slate-400">/month, billed annually</p>
				</div>
			</div>

			<ul class="flex-1 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
				{#each [
					'AI audio playback and playlists',
					'Text Haradato on +447878 ... to update tasks or ask questions',
					'MLAuth access for your own agent',
				] as feature}
					<li class="flex items-start gap-2.5">
						<svg class="mt-0.5 h-4 w-4 shrink-0 text-violet-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path fill-rule="evenodd" d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.29a1 1 0 011.408 0z" clip-rule="evenodd"/>
						</svg>
						{feature}
					</li>
				{/each}
			</ul>

			<div class="mt-6 rounded-xl border border-dashed border-violet-200 bg-violet-50 px-4 py-3 text-center dark:border-violet-900/60 dark:bg-violet-950/20">
				<p class="text-xs font-semibold uppercase tracking-widest text-violet-500 dark:text-violet-400">Coming soon</p>
				<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Join the waitlist to be first to know.</p>
			</div>

			<button disabled class="salesBtn mt-4 block w-full cursor-not-allowed text-center opacity-40">Join waitlist</button>
		</div>

		<!-- Publish -->
		<div class="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
			<div class="mb-5">
				<p class="text-sm font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-400">Publish</p>
				<div class="mt-1 flex items-end gap-2">
					<p class="text-4xl font-bold text-slate-900 dark:text-white">$8</p>
					<p class="mb-1 text-sm text-slate-500 dark:text-slate-400">/month, billed annually</p>
				</div>
			</div>

			<ul class="flex-1 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
				{#each [
					'Publishable notes with a public URL',
					'Image and video support in notes and tasks',
					'API access via REST or MLAuth',
				] as feature}
					<li class="flex items-start gap-2.5">
						<svg class="mt-0.5 h-4 w-4 shrink-0 text-sky-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
							<path fill-rule="evenodd" d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.29a1 1 0 011.408 0z" clip-rule="evenodd"/>
						</svg>
						{feature}
					</li>
				{/each}
			</ul>

			<div class="mt-6 rounded-xl border border-dashed border-sky-200 bg-sky-50 px-4 py-3 text-center dark:border-sky-900/60 dark:bg-sky-950/20">
				<p class="text-xs font-semibold uppercase tracking-widest text-sky-500 dark:text-sky-400">Coming soon</p>
				<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Join the waitlist to be first to know.</p>
			</div>

			<button disabled class="salesBtn mt-4 block w-full cursor-not-allowed text-center opacity-40">Join waitlist</button>
		</div>

	</div>

</section>
