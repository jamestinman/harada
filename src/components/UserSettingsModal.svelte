<script>
	import { authStore } from '$stores/auth.svelte.js';
	import { store } from '$stores/store.svelte.js';
	import { supabase } from '$lib/supabaseClient.js';

	let { isOpen = $bindable(false) } = $props();

let displayName = $state('');
let saveError = $state(null);
let isSaving = $state(false);
let isEditingName = $state(false);

let agentEnabled = $state(false);
/** @type {Array<{ id: string; agent_dumbname: string; status: string; created_at?: string }>} */
let agentRequests = $state([]);
let agentLoadError = $state(/** @type {string | null} */ (null));
let agentBusy = $state(false);

	const userId = $derived(authStore.user?.id);
	const agentPending = $derived(agentRequests.filter((r) => r.status === 'pending'));
	const agentApproved = $derived(agentRequests.filter((r) => r.status === 'approved'));

	async function refreshAgentAccess() {
		agentLoadError = null;
		if (!supabase || !userId) {
			agentRequests = [];
			return;
		}
		const { data: st, error: e1 } = await supabase
			.from('user_agent_api_settings')
			.select('enabled')
			.eq('user_id', userId)
			.maybeSingle();
		if (e1) {
			agentLoadError = e1.message;
			return;
		}
		agentEnabled = st?.enabled ?? false;

		const { data: rows, error: e2 } = await supabase
			.from('agent_access_requests')
			.select('id, agent_dumbname, status, created_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: true });
		if (e2) {
			agentLoadError = e2.message;
			return;
		}
		agentRequests = rows ?? [];
	}

	async function toggleAgentApi() {
		if (!supabase || !userId) return;
		agentBusy = true;
		agentLoadError = null;
		const next = !agentEnabled;
		const { error } = await supabase.from('user_agent_api_settings').upsert(
			{ user_id: userId, enabled: next, updated_at: new Date().toISOString() },
			{ onConflict: 'user_id' }
		);
		agentBusy = false;
		if (error) {
			agentLoadError = error.message;
			return;
		}
		agentEnabled = next;
	}

	async function approveAgentRequest(row) {
		if (!supabase) return;
		agentBusy = true;
		agentLoadError = null;
		const { error } = await supabase
			.from('agent_access_requests')
			.update({ status: 'approved', updated_at: new Date().toISOString() })
			.eq('id', row.id);
		agentBusy = false;
		if (error) {
			agentLoadError = error.message;
			return;
		}
		await refreshAgentAccess();
	}

	async function denyAgentRequest(row) {
		if (!supabase) return;
		agentBusy = true;
		agentLoadError = null;
		const { error } = await supabase
			.from('agent_access_requests')
			.update({ status: 'denied', updated_at: new Date().toISOString() })
			.eq('id', row.id);
		agentBusy = false;
		if (error) {
			agentLoadError = error.message;
			return;
		}
		await refreshAgentAccess();
	}

	async function cancelApprovedAgent(row) {
		if (!supabase) return;
		agentBusy = true;
		agentLoadError = null;
		const { error } = await supabase.from('agent_access_requests').delete().eq('id', row.id);
		agentBusy = false;
		if (error) {
			agentLoadError = error.message;
			return;
		}
		await refreshAgentAccess();
	}

	$effect(() => {
		if (isOpen && userId && supabase) {
			refreshAgentAccess();
		}
	});

	function closeModal() {
		isOpen = false;
	}

	async function handleLogout() {
		const result = await authStore.signOut();
		if (result.success) {
			isOpen = false;
			// Wipe local data so the next user starts fresh (and the setup wizard
			// runs again when they open the chart with empty goals). Runs after sign-out, so the
			// empty chart is only persisted locally, never synced to the cloud.
			store.clearAll();
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
		<div class="settings-modal bg-white">
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
						<div class="settings-appearance-help">Light, auto, dark modes</div>
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
							onclick={() => store.setTheme('auto')}
							class={`settings-theme-option ${
								store.theme == 'auto'
									? 'settings-theme-option-active'
									: 'settings-theme-option-inactive'
							}`}
						>
							Auto
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
			</div>

			<div class="settings-section-divider">
				<div class="flex items-center justify-between gap-3">
					<div>
						<div class="settings-appearance-label">Recently completed / deleted</div>
						<div class="settings-appearance-help">
							Recover a task you completed or deleted by mistake
						</div>
					</div>
					<a
						href="/trash/completed"
						onclick={closeModal}
						class="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
					>
						Open trash
					</a>
				</div>
			</div>

			{#if supabase && userId}
				<div class="settings-section-divider mb-4 text-left">
					<div class="mb-2">
						<div class="settings-appearance-label">AI agent access (MLAuth)</div>
						<p class="settings-appearance-help mb-2">
							Let verified MLAuth agents call Haradato APIs on your behalf after you approve each identity.
						</p>
						<button
							type="button"
							disabled={agentBusy}
							onclick={toggleAgentApi}
							class={`inline-flex rounded-md px-3 py-2 text-sm font-semibold transition ${
								agentEnabled
									? 'border border-violet-600 bg-violet-600 text-white hover:bg-violet-500'
									: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
							} disabled:opacity-50`}
						>
							{#if agentEnabled}
								Allow AI agent access: on
							{:else}
								Allow AI agent access: off
							{/if}
						</button>
						{#if agentLoadError}
							<p class="mt-2 text-xs text-red-500">{agentLoadError}</p>
						{/if}
						<details class="my-3 text-sm text-slate-600 dark:text-slate-400">
							<summary
								class="cursor-pointer select-none text-violet-600 dark:text-violet-400"
							>
								How this works
							</summary>
							<ul class="mt-2 list-disc space-y-1 pl-5">
								<li>
									Point your AI agent at <a href="https://www.haradato.com/skill.md" target="_blank" rel="noopener noreferrer">haradato.com/skill.md</a>
								</li>
                <li>Your agent creates an identity tied to your email to request access (access requests appear here)</li>
								<li>Works with Cursor, Hermes, Claude, etc.</li>
							</ul>
						</details>
					</div>

					{#if agentPending.length > 0}
						<div class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
							Pending requests
						</div>
						<ul class="mb-3 space-y-2">
							{#each agentPending as row (row.id)}
								<li
									class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40"
								>
									<span class="font-mono text-sm text-slate-800 dark:text-slate-200">
										{row.agent_dumbname}
									</span>
									<div class="flex gap-2">
										<button
											type="button"
											disabled={agentBusy || !agentEnabled}
											onclick={() => approveAgentRequest(row)}
											class="rounded-md bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
										>
											Approve
										</button>
										<button
											type="button"
											disabled={agentBusy}
											onclick={() => denyAgentRequest(row)}
											class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
										>
											Deny
										</button>
									</div>
								</li>
							{/each}
						</ul>
						{#if !agentEnabled}
							<p class="mb-3 text-xs text-amber-600 dark:text-amber-400">
								Turn on “Allow AI agent access” before you can approve.
							</p>
						{/if}
					{/if}

					{#if agentApproved.length > 0}
						<div class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
							Approved agents
						</div>
						<ul class="space-y-2">
							{#each agentApproved as row (row.id)}
								<li
									class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700"
								>
									<span class="font-mono text-sm text-slate-800 dark:text-slate-200">
										{row.agent_dumbname}
									</span>
									<button
										type="button"
										disabled={agentBusy}
										onclick={() => cancelApprovedAgent(row)}
										class="text-xs font-semibold text-red-600 hover:text-red-500 dark:text-red-400"
									>
										Cancel access
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

      <div class="settings-logout-section">
        <button
          type="button"
          onclick={handleLogout}
          class="settings-logout-button"
        >
          Logout
        </button>
      </div>

			<div class="settings-footer">
        <a href="/about" class="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline-offset-2 hover:underline">
          About
        </a>
				<a
					href="/privacy"
					class="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline-offset-2 hover:underline"
				>
					Privacy Policy
				</a>
			</div>
      <p class="italic text-xs text-slate-500 dark:text-slate-400 text-right">Version {store.version}</p>
		</div>
	</div>
{/if}
