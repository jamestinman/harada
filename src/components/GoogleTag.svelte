<script>
	import { initGoogleTag } from '$lib/googleTag.js';
	import { isWebsiteTrackingActive } from '$lib/websiteTracking.js';

	$effect(() => {
		if (!isWebsiteTrackingActive()) return;
		initGoogleTag();
	});
</script>
