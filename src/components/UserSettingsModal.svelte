<script>
	import { authStore } from '$stores/auth.svelte.js';
	import { store } from '$stores/store.svelte.js';

	let { isOpen = $bindable(false) } = $props();

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
		return user.user_metadata?.full_name || 
		       user.user_metadata?.name || 
		       user.email?.split('@')[0] || 
		       'User';
	});

	const userEmail = $derived(authStore.user?.email);
	const userAvatar = $derived(authStore.user?.user_metadata?.avatar_url);
	const userInitial = $derived.by(() => {
		const name = userName;
		if (!name) return 'U';
		return name.charAt(0).toUpperCase();
	});
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
				<div class="text-center">
					<div class="settings-name">{userName}</div>
					{#if userEmail}
						<div class="settings-email">{userEmail}</div>
					{/if}
				</div>
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
