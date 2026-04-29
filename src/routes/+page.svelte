<script lang="ts">
  import MapView from '$lib/map/MapView.svelte';
  import { page } from '$app/stores';
  import {
    selectedLocationId,
    locationsLoaded,
    locations,
    pins,
    pinsLoaded,
    selectedPinId,
    upsertPin
  } from '$lib/stores';
  import { api } from '$lib/client/api';
  import { onMount } from 'svelte';

  // If the URL includes ?location=<id>, select it once locations load.
  let pending: string | null = $page.url.searchParams.get('location');

  $: if (pending && $locationsLoaded) {
    if ($locations.some((l) => l.id === pending)) {
      selectedLocationId.set(pending);
    }
    pending = null;
  }

  // ?pin=<id> — open the pin detail sheet once pins load, or fetch it
  // directly if it's not in the list yet (shared URL from /pins page).
  let pendingPin: string | null = $page.url.searchParams.get('pin');
  let pinFetchStarted = false;

  $: if (pendingPin && $pinsLoaded) {
    const inStore = $pins.some((p) => p.id === pendingPin);
    if (inStore) {
      selectedPinId.set(pendingPin);
      pendingPin = null;
    } else if (!pinFetchStarted) {
      pinFetchStarted = true;
      const id = pendingPin;
      api
        .getPin(id)
        .then((p) => {
          upsertPin(p);
          selectedPinId.set(p.id);
        })
        .catch(() => {
          /* 404 — silently drop */
        })
        .finally(() => {
          pendingPin = null;
        });
    }
  }

  onMount(() => {
    // no-op
  });
</script>

<MapView />
