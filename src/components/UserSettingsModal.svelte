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
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		onclick={(e) => e.target === e.currentTarget && closeModal()}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="button"
		tabindex="-1"
		aria-label="Close settings modal"
	>
		<div
			class="w-full max-w-md rounded-lg bg-slate-900 p-6 shadow-xl border border-slate-700"
		>
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-xl font-semibold text-slate-100">Settings</h2>
				<button
					type="button"
					onclick={closeModal}
					class="text-slate-400 hover:text-slate-200 transition-colors"
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
						class="h-20 w-20 rounded-full border-2 border-slate-700"
					/>
				{:else}
					<div class="flex h-20 w-20 items-center justify-center rounded-full border-2 border-slate-700 bg-violet-600 text-2xl font-bold text-white">
						{userInitial}
					</div>
				{/if}
				<div class="text-center">
					<div class="text-lg font-semibold text-slate-100">{userName}</div>
					{#if userEmail}
						<div class="text-sm text-slate-400">{userEmail}</div>
					{/if}
				</div>
			</div>

			<div class="mb-6 border-t border-slate-700 pt-4">
				<button
					type="button"
					onclick={handleLogout}
					class="w-full rounded-md border border-red-600/70 bg-red-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
				>
					Logout
				</button>
			</div>

			<div class="border-t border-slate-700 pt-4 text-center">
				<div class="text-xs text-slate-500">Version {store.version}</div>
			</div>
		</div>
	</div>
{/if}
