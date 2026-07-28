<script>
	import { page } from '$app/state';

	let { children } = $props();

	const activeTab = $derived(
		page.url.pathname.includes('/trash/completed') ? 'completed' : 'deleted'
	);
</script>

<div class="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:pt-8">
	<div class="mb-6">
		<a
			href="/todo"
			class="mb-3 inline-flex text-sm text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
		>
			← Back to todos
		</a>
		<h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">Trash</h1>
		<p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
			Browse completed tasks or restore items you've deleted.
		</p>

		<div
			class="settings-appearance-toggle mt-4"
			role="tablist"
			aria-label="Trash views"
		>
			<a
				href="/trash/completed"
				role="tab"
				aria-selected={activeTab === 'completed'}
				class={`settings-theme-option ${
					activeTab === 'completed'
						? 'settings-theme-option-active'
						: 'settings-theme-option-inactive'
				}`}
			>
				Completed
			</a>
			<a
				href="/trash/deleted"
				role="tab"
				aria-selected={activeTab === 'deleted'}
				class={`settings-theme-option ${
					activeTab === 'deleted'
						? 'settings-theme-option-active'
						: 'settings-theme-option-inactive'
				}`}
			>
				Deleted
			</a>
		</div>
	</div>

	{@render children()}
</div>
