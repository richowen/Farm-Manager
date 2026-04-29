<script lang="ts">
  import MapView from '$lib/map/MapView.svelte';
  import { page } from '$app/stores';
  import { selectedLocationId, locationsLoaded, locations } from '$lib/stores';
  import { onMount } from 'svelte';

  // If the URL includes ?location=<id>, select it once locations load.
  let pending: string | null = $page.url.searchParams.get('location');

  $: if (pending && $locationsLoaded) {
    if ($locations.some((l) => l.id === pending)) {
      selectedLocationId.set(pending);
    }
    pending = null;
  }

  onMount(() => {
    // no-op
  });
</script>

<MapView />
