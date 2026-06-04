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
		class="settings-backdrop"
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeydown}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<div class="auth-modal" role="dialog" aria-modal="true">
			<div class="mb-6 flex items-center justify-between">
				<h2 class="auth-modal-title">
					{#if mode === 'signin'}
						Sign In
					{:else if mode === 'signup'}
						Sign Up
					{:else}
						Reset Password
					{/if}
				</h2>
				<button
					type="button"
					onclick={() => (isOpen = false)}
					class="settings-close-button text-2xl leading-none"
					aria-label="Close"
				>
					&times;
				</button>
			</div>

			{#if message}
				<div
					class={messageType === 'error' ? 'auth-modal-alert-error' : 'auth-modal-alert-success'}
				>
					{message}
				</div>
			{/if}

			<form onsubmit={handleSubmit}>
				<div class="mb-4">
					<label for="auth-email" class="auth-modal-label">Email</label>
					<input
						type="email"
						id="auth-email"
						bind:value={email}
						placeholder="you@example.com"
						required
					/>
				</div>

				{#if mode !== 'reset'}
					<div class="mb-4">
						<label for="auth-password" class="auth-modal-label">Password</label>
						<input
							type="password"
							id="auth-password"
							bind:value={password}
							placeholder="••••••••"
							required
						/>
					</div>
				{/if}

				{#if mode === 'signup'}
					<div class="mb-4">
						<label for="auth-confirm-password" class="auth-modal-label">Confirm Password</label>
						<input
							type="password"
							id="auth-confirm-password"
							bind:value={confirmPassword}
							placeholder="••••••••"
							required
						/>
					</div>
				{/if}

				<button
					type="submit"
					disabled={authStore.loading}
					class="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-900"
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

			<div class="mt-4 text-center">
				{#if mode === 'signin'}
					<p class="auth-modal-footer">
						Don't have an account?
						<button type="button" onclick={() => switchMode('signup')} class="auth-modal-link">
							Sign up
						</button>
					</p>
					<button type="button" onclick={() => switchMode('reset')} class="auth-modal-link mt-2">
						Forgot password?
					</button>
				{:else if mode === 'signup'}
					<p class="auth-modal-footer">
						Already have an account?
						<button type="button" onclick={() => switchMode('signin')} class="auth-modal-link">
							Sign in
						</button>
					</p>
				{:else}
					<button type="button" onclick={() => switchMode('signin')} class="auth-modal-link">
						Back to sign in
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
