<script>
  import HaradaChart from '$components/HaradaChart.svelte';
</script>

<svelte:head>
	<title>Haradato - Harada Chart + To-Do List</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<HaradaChart />

<style>
	textarea::placeholder {
		font-size: 9px;
	}

	@media (min-width: 768px) {
		textarea::placeholder {
			font-size: 10px;
		}
	}

	/* Hide scrollbar for textareas */
	textarea {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	textarea::-webkit-scrollbar {
		display: none;
	}
</style>
