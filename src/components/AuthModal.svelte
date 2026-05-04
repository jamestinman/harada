<script>
	import { goto } from '$app/navigation';
	import { authStore } from '$stores/auth.svelte.js';

	let { isOpen = $bindable(false), redirectOnSignIn = null } = $props();

	let mode = $state('signin'); // 'signin' | 'signup' | 'reset'
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let message = $state('');
	let messageType = $state(''); // 'error' | 'success'

	async function handleSignIn() {
		if (!email || !password) {
			message = 'Please fill in all fields';
			messageType = 'error';
			return;
		}

		const result = await authStore.signIn(email, password);
		if (result.success) {
			isOpen = false;
			resetForm();
			if (redirectOnSignIn) {
				goto(redirectOnSignIn);
			}
		} else {
			message = result.error || 'Sign in failed';
			messageType = 'error';
		}
	}

	async function handleSignUp() {
		if (!email || !password) {
			message = 'Please fill in all fields';
			messageType = 'error';
			return;
		}

		if (password !== confirmPassword) {
			message = 'Passwords do not match';
			messageType = 'error';
			return;
		}

		if (password.length < 6) {
			message = 'Password must be at least 6 characters';
			messageType = 'error';
			return;
		}

		const result = await authStore.signUp(email, password);
		if (result.success) {
			if (result.requiresConfirmation) {
				message = result.message;
				messageType = 'success';
			} else {
				isOpen = false;
				resetForm();
			}
		} else {
			message = result.error || 'Sign up failed';
			messageType = 'error';
		}
	}

	async function handleResetPassword() {
		if (!email) {
			message = 'Please enter your email';
			messageType = 'error';
			return;
		}

		const result = await authStore.resetPassword(email);
		if (result.success) {
			message = result.message;
			messageType = 'success';
		} else {
			message = result.error || 'Password reset failed';
			messageType = 'error';
		}
	}

	function resetForm() {
		email = '';
		password = '';
		confirmPassword = '';
		message = '';
		messageType = '';
	}

	function switchMode(newMode) {
		mode = newMode;
		resetForm();
	}

	function handleBackdropClick(e) {
		if (e.target === e.currentTarget) {
			isOpen = false;
		}
	}

	function handleBackdropKeydown(e) {
		if (e.key === 'Escape') {
			isOpen = false;
		}
	}

	function handleSubmit(e) {
		e.preventDefault();
		if (mode === 'signin') {
			handleSignIn();
		} else if (mode === 'signup') {
			handleSignUp();
		} else if (mode === 'reset') {
			handleResetPassword();
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeydown}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
			<div class="flex justify-between items-center mb-6">
				<h2 class="text-2xl font-bold">
					{#if mode === 'signin'}
						Sign In
					{:else if mode === 'signup'}
						Sign Up
					{:else}
						Reset Password
					{/if}
				</h2>
				<button
					onclick={() => (isOpen = false)}
					class="text-gray-400 hover:text-gray-600 text-2xl leading-none"
				>
					&times;
				</button>
			</div>

			{#if message}
				<div
					class="mb-4 p-3 rounded {messageType === 'error'
						? 'bg-red-100 text-red-700'
						: 'bg-green-100 text-green-700'}"
				>
					{message}
				</div>
			{/if}

			<form onsubmit={handleSubmit}>
				<div class="mb-4">
					<label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="you@example.com"
						required
					/>
				</div>

				{#if mode !== 'reset'}
					<div class="mb-4">
						<label for="password" class="block text-sm font-medium text-gray-700 mb-1"
							>Password</label
						>
						<input
							type="password"
							id="password"
							bind:value={password}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="••••••••"
							required
						/>
					</div>
				{/if}

				{#if mode === 'signup'}
					<div class="mb-4">
						<label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1"
							>Confirm Password</label
						>
						<input
							type="password"
							id="confirmPassword"
							bind:value={confirmPassword}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="••••••••"
							required
						/>
					</div>
				{/if}

				<button
					type="submit"
					disabled={authStore.loading}
					class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if authStore.loading}
						Loading...
					{:else if mode === 'signin'}
						Sign In
					{:else if mode === 'signup'}
						Sign Up
					{:else}
						Send Reset Link
					{/if}
				</button>
			</form>

			<div class="mt-4 text-center text-sm">
				{#if mode === 'signin'}
					<p class="text-gray-600">
						Don't have an account?
						<button onclick={() => switchMode('signup')} class="text-blue-600 hover:underline">
							Sign up
						</button>
					</p>
					<button onclick={() => switchMode('reset')} class="text-blue-600 hover:underline mt-2">
						Forgot password?
					</button>
				{:else if mode === 'signup'}
					<p class="text-gray-600">
						Already have an account?
						<button onclick={() => switchMode('signin')} class="text-blue-600 hover:underline">
							Sign in
						</button>
					</p>
				{:else}
					<button onclick={() => switchMode('signin')} class="text-blue-600 hover:underline">
						Back to sign in
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
