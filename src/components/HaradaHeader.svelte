<script>
	import { authStore } from '$stores/auth.svelte.js';
	import AuthModal from './AuthModal.svelte';
	import UserMenu from './UserMenu.svelte';

	let showAuthModal = $state(false);
</script>

<!-- Header -->
<div class="mb-4 flex items-center justify-between px-4">
	<div class="flex-1"></div>

	<h1
		class="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-xl font-bold tracking-tight text-transparent md:text-2xl text-center"
	>
		Haradato
	</h1>

	<div class="flex-1 flex justify-end">
		{#if authStore.user}
			<UserMenu />
		{:else if !authStore.loading}
			<button
				onclick={() => (showAuthModal = true)}
				class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
			>
				Sign In
			</button>
		{/if}
	</div>
</div>

<AuthModal bind:isOpen={showAuthModal} />
