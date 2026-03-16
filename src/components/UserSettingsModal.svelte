<script>
	import { authStore } from '$stores/auth.svelte.js';
	import { store } from '$stores/store.svelte.js';

	let { isOpen = $bindable(false) } = $props();

let displayName = $state('');
let saveError = $state(null);
let isSaving = $state(false);
let isEditingName = $state(false);

	function closeModal() {
		isOpen = false;
	}

	async function handleLogout() {
		const result = await authStore.signOut();
		if (result.success) {
			isOpen = false;
		}
	}

	// Get user display name and avatar
	const userName = $derived.by(() => {
		const user = authStore.user;
		if (!user) return null;
		return (
			user.user_metadata?.full_name ||
			user.user_metadata?.name ||
			user.email?.split('@')[0] ||
			'User'
		);
	});

	const userEmail = $derived(authStore.user?.email);
	const userAvatar = $derived(authStore.user?.user_metadata?.avatar_url);
	const userInitial = $derived.by(() => {
		const name = userName;
		if (!name) return 'U';
		return name.charAt(0).toUpperCase();
	});

	$effect(() => {
	if (isOpen) {
		displayName = userName || '';
		saveError = null;
		isEditingName = false;
	}
	});

	async function handleSaveProfile() {
		const trimmed = displayName.trim();
		if (!trimmed) {
			saveError = 'Name cannot be empty';
			return;
		}

		isSaving = true;
		saveError = null;

		const result = await authStore.updateProfile({ fullName: trimmed });

		if (!result?.success) {
			saveError = result?.error || 'Failed to update name';
		} else {
		isEditingName = false;
		}

		isSaving = false;
	}

function startEditingName() {
	isEditingName = true;
	saveError = null;
}
</script>

{#if isOpen}
	<div
		class="settings-backdrop"
		onclick={(e) => e.target === e.currentTarget && closeModal()}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="button"
		tabindex="-1"
		aria-label="Close settings modal"
	>
		<div class="settings-modal">
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-xl font-semibold">Settings</h2>
				<button
					type="button"
					onclick={closeModal}
					class="settings-close-button"
					aria-label="Close modal"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="mb-6 flex flex-col items-center gap-4">
				{#if userAvatar}
					<img
						src={userAvatar}
						alt={userName || 'User avatar'}
						class="settings-avatar"
					/>
				{:else}
					<div class="settings-avatar-placeholder">
						{userInitial}
					</div>
				{/if}

				{#if isEditingName}
					<div class="flex w-full max-w-xs items-center gap-2">
						<input
							type="text"
							class="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
							placeholder="Your name"
							bind:value={displayName}
						/>
						<button
							type="button"
							onclick={handleSaveProfile}
							disabled={isSaving || !displayName.trim()}
							class="inline-flex items-center rounded-md border border-violet-600/80 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
						>
							{#if isSaving}
								Saving…
							{:else}
								Save
							{/if}
						</button>
					</div>
					{#if saveError}
						<p class="mt-1 text-xs text-red-500 text-center">{saveError}</p>
					{/if}
				{:else}
					<button
						type="button"
						onclick={startEditingName}
						class="text-center"
					>
						<div class="settings-name">{userName}</div>
						{#if userEmail}
							<div class="settings-email">{userEmail}</div>
						{/if}
					</button>
				{/if}
			</div>

			<div class="settings-section-divider">
				<div class="flex items-center justify-between">
					<div>
						<div class="settings-appearance-label">Appearance</div>
						<div class="settings-appearance-help">Light or dark mode for this account</div>
					</div>
					<div class="settings-appearance-toggle">
						<button
							type="button"
							onclick={() => store.setTheme('light')}
							class={`settings-theme-option ${
								store.theme == 'light'
									? 'settings-theme-option-active'
									: 'settings-theme-option-inactive'
							}`}
						>
							Light
						</button>
						<button
							type="button"
							onclick={() => store.setTheme('dark')}
							class={`settings-theme-option ${
								store.theme == 'dark'
									? 'settings-theme-option-active'
									: 'settings-theme-option-inactive'
							}`}
						>
							Dark
						</button>
					</div>
				</div>

				<div class="settings-logout-section">
					<button
						type="button"
						onclick={handleLogout}
						class="settings-logout-button"
					>
						Logout
					</button>
				</div>
			</div>

			<div class="settings-footer">
				<div class="settings-footer-text">Version {store.version}</div>
			</div>
		</div>
	</div>
{/if}
