<script>
	import { authStore } from '$stores/auth.svelte.js';
	import { goto } from '$app/navigation';

	let newPassword = $state('');
	let confirmPassword = $state('');
	let message = $state('');
	let messageType = $state(''); // 'error' | 'success'
	let isSubmitting = $state(false);
	let didReset = $state(false);

	function validate() {
		const password = newPassword.trim();
		const confirm = confirmPassword.trim();

		if (!password || !confirm) {
			message = 'Please fill in both password fields.';
			messageType = 'error';
			return false;
		}
		if (password.length < 6) {
			message = 'Password must be at least 6 characters.';
			messageType = 'error';
			return false;
		}
		if (password !== confirm) {
			message = 'Passwords do not match.';
			messageType = 'error';
			return false;
		}
		return true;
	}

	async function handleResetPassword() {
		if (!validate()) return;

		isSubmitting = true;
		message = '';
		messageType = '';

		const result = await authStore.updatePassword(newPassword.trim());
		if (result?.success) {
			didReset = true;
			message = result.message || 'Password updated successfully.';
			messageType = 'success';
		} else {
			message = result?.error || 'Unable to update password. Your reset link may be expired.';
			messageType = 'error';
		}

		isSubmitting = false;
	}

	function goToTodo() {
		goto('/todo');
	}
</script>

<svelte:head>
	<title>Reset Password - Haradato</title>
</svelte:head>

<div class="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-10">
	<div class="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
		<h1 class="mb-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">Reset password</h1>
		<p class="mb-6 text-sm text-slate-600 dark:text-slate-400">
			Enter your new password to complete recovery.
		</p>

		{#if message}
			<div
				class="mb-4 rounded-md p-3 text-sm {messageType === 'error'
					? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300'
					: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}"
			>
				{message}
			</div>
		{/if}

		{#if didReset}
			<button
				type="button"
				onclick={goToTodo}
				class="w-full rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
			>
				Continue to app
			</button>
		{:else}
			<div class="space-y-4">
				<div>
					<label for="new-password" class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
						New password
					</label>
					<input
						id="new-password"
						type="password"
						bind:value={newPassword}
						placeholder="At least 6 characters"
						autocomplete="new-password"
						class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
					/>
				</div>

				<div>
					<label
						for="confirm-password"
						class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
					>
						Confirm new password
					</label>
					<input
						id="confirm-password"
						type="password"
						bind:value={confirmPassword}
						placeholder="Re-enter your password"
						autocomplete="new-password"
						class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
					/>
				</div>

				<button
					type="button"
					onclick={handleResetPassword}
					disabled={isSubmitting || authStore.loading}
					class="w-full rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isSubmitting || authStore.loading ? 'Updating password...' : 'Update password'}
				</button>
			</div>
		{/if}
	</div>
</div>
