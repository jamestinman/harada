<script>
	import { authStore } from '$stores/auth.svelte.js';
	import { store } from '$stores/store.svelte.js';

	let showMenu = $state(false);

	async function handleSignOut() {
		const result = await authStore.signOut();
		if (result.success) {
			showMenu = false;
			// Clear local data on sign out (optional)
			// localStorage.clear();
		}
	}

	function toggleMenu() {
		showMenu = !showMenu;
	}

	function closeMenu() {
		showMenu = false;
	}
</script>

<div class="relative">
	<button
		onclick={toggleMenu}
		class="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
	>
		<div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
			{authStore.user?.email?.charAt(0).toUpperCase() || 'U'}
		</div>
		<span class="text-sm font-medium hidden sm:inline">{authStore.user?.email}</span>
		<svg
			class="w-4 h-4 {showMenu ? 'rotate-180' : ''} transition-transform"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if showMenu}
		<div
			class="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50"
		>
			<div class="py-1">
				<div class="px-4 py-2 text-xs text-gray-500 border-b">Signed in as</div>
				<div class="px-4 py-2 text-sm font-medium border-b">{authStore.user?.email}</div>

			{#if store.saveStatus === 'saving'}
				<div class="px-4 py-2 text-xs text-blue-600 border-b">
					<span class="inline-flex items-center gap-1.5">
						<svg class="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
						</svg>
						Saving...
					</span>
				</div>
			{:else if store.saveStatus === 'idle'}
				<div class="px-4 py-2 text-xs text-gray-500 border-b">All changes saved</div>
			{/if}

			{#if store.syncError}
				<div class="px-4 py-2 text-xs text-red-600 border-b">
					Sync error: {store.syncError}
				</div>
			{/if}

				<button
					onclick={handleSignOut}
					class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none"
				>
					Sign out
				</button>
			</div>
		</div>

		<button onclick={closeMenu} class="fixed inset-0 z-40" aria-hidden="true"></button>
	{/if}
</div>
