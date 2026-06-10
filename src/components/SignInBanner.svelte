<script>
	let { onSignIn = () => {} } = $props();
</script>

<div
	class="sign-in-banner fixed left-0 right-0 z-50 flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-sm text-white shadow-md"
	style="top: env(safe-area-inset-top, 0px);"
	role="status"
>
	<span>Your session expired — changes won't sync.</span>
	<button
		type="button"
		onclick={() => onSignIn()}
		class="font-semibold underline underline-offset-2 hover:text-red-100"
	>
		Sign in
	</button>
</div>
