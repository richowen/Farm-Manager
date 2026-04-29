<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { api } from '$lib/client/api';
  import {
    locations,
    locationsLoaded,
    selectedLocationId,
    drawMode,
    online,
    settings,
    toast,
    upsertLocation,
    removeLocation
  } from '$lib/stores';
  import { geometryToHectares } from '$lib/utils/geometry';
  import { colorFor, fieldStyle, fieldStyleSelected } from '$lib/map/style';
  import { esriImageryLayer, esriReferenceLayer, osmLayer } from '$lib/map/layers';
  import DetailPanel from '$lib/components/DetailPanel.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import DrawToolbar from '$lib/components/DrawToolbar.svelte';
  import NewLocationModal from '$lib/components/NewLocationModal.svelte';
  import Toaster from '$lib/components/Toaster.svelte';
  import type { LocationRecord, FieldGeometry, PointGeometry } from '$lib/schemas';

  let mapEl: HTMLDivElement;
  let map: import('leaflet').Map | null = null;
  let L: typeof import('leaflet');
  let layerById = new Map<string, import('leaflet').Layer>();
  let labelsVisible = true;
  let baseLayerChoice: 'esri' | 'osm' = 'esri';
  let esriBase: import('leaflet').TileLayer;
  let esriRef: import('leaflet').TileLayer;
  let osmBase: import('leaflet').TileLayer;

  let pendingGeometry:
    | { kind: 'field'; geometry: FieldGeometry; tempLayer: import('leaflet').Layer }
    | { kind: 'shed'; geometry: PointGeometry; tempLayer: import('leaflet').Layer }
    | null = null;
  let showNewLocation = false;

  // ---- Init ----------------------------------------------------------------
  onMount(async () => {
    if (!browser) return;

    // Dynamic import so Leaflet doesn't run on the server.
    L = (await import('leaflet')).default ?? (await import('leaflet'));
    // Leaflet's default marker icons are resolved via internal paths that don't
    // survive bundling. Import the URLs directly from the package and override.
    const markerIconUrl = (await import('leaflet/dist/images/marker-icon.png?url'))
      .default as string;
    const markerIcon2xUrl = (await import('leaflet/dist/images/marker-icon-2x.png?url'))
      .default as string;
    const markerShadowUrl = (await import('leaflet/dist/images/marker-shadow.png?url'))
      .default as string;
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: markerIconUrl,
      iconRetinaUrl: markerIcon2xUrl,
      shadowUrl: markerShadowUrl
    });
    await import('leaflet/dist/leaflet.css');
    await import('@geoman-io/leaflet-geoman-free');
    await import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css');

    esriBase = esriImageryLayer();
    esriRef = esriReferenceLayer();
    osmBase = osmLayer();

    // Load user settings (default viewport).
    let startCenter: [number, number] = [54.5, -2.5]; // UK centre fallback
    let startZoom = 6;
    try {
      const s = await api.getSettings();
      settings.set(s);
      if (s.defaultCenter) startCenter = [s.defaultCenter.lat, s.defaultCenter.lng];
      if (typeof s.defaultZoom === 'number') startZoom = s.defaultZoom;
      baseLayerChoice = s.baseLayer ?? 'esri';
    } catch (err) {
      console.warn('settings load failed', err);
    }

    map = L.map(mapEl, {
      center: startCenter,
      zoom: startZoom,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: false
    });

    applyBaseLayer();

    // Load locations.
    try {
      const { items } = await api.listLocations();
      locations.set(items);
      locationsLoaded.set(true);
      renderAllLocations();
      if (items.length > 0 && !$settings?.defaultCenter) {
        fitToAll();
      }
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        window.location.href = '/login';
        return;
      }
      console.error(err);
      toast('error', 'Failed to load map data.');
    }

    // Wire Geoman events.
    map.on('pm:create', handlePmCreate);
    map.on('pm:drawstart', () => {
      // Nothing yet — reserved.
    });

    // Remember viewport on moveend (debounced; write to settings).
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    map.on('moveend', () => {
      if (!map) return;
      const c = map.getCenter();
      const z = map.getZoom();
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        if (!$online) return;
        api
          .updateSettings({
            defaultCenter: { lat: c.lat, lng: c.lng },
            defaultZoom: z
          })
          .catch(() => {
            /* non-fatal */
          });
      }, 2000);
    });
  });

  onDestroy(() => {
    if (map) map.remove();
    map = null;
  });

  // ---- Rendering -----------------------------------------------------------
  function applyBaseLayer(): void {
    if (!map) return;
    if (esriBase && map.hasLayer(esriBase)) map.removeLayer(esriBase);
    if (esriRef && map.hasLayer(esriRef)) map.removeLayer(esriRef);
    if (osmBase && map.hasLayer(osmBase)) map.removeLayer(osmBase);
    if (baseLayerChoice === 'esri') {
      esriBase.addTo(map);
      if (labelsVisible) esriRef.addTo(map);
    } else {
      osmBase.addTo(map);
    }
  }

  function renderAllLocations(): void {
    if (!map) return;
    layerById.forEach((layer) => map!.removeLayer(layer));
    layerById.clear();
    for (const loc of $locations) addLocationLayer(loc);
  }

  function addLocationLayer(loc: LocationRecord): void {
    if (!map) return;
    let layer: import('leaflet').Layer;
    if (loc.kind === 'field') {
      const gj = L.geoJSON(loc.geometry as GeoJSON.Geometry, {
        style: () =>
          loc.id === $selectedLocationId ? fieldStyleSelected(loc) : fieldStyle(loc)
      });
      gj.eachLayer((l) => {
        (l as import('leaflet').Layer).on('click', () => selectedLocationId.set(loc.id));
      });
      layer = gj;
    } else {
      const g = loc.geometry as PointGeometry;
      const [lng, lat] = g.coordinates as [number, number];
      const icon = L.divIcon({
        className: 'shed-marker',
        html: shedMarkerHtml(colorFor(loc)),
        iconSize: [32, 32],
        iconAnchor: [16, 28]
      });
      layer = L.marker([lat, lng], { icon, title: loc.name });
      layer.on('click', () => selectedLocationId.set(loc.id));
    }

    if (labelsVisible && loc.kind === 'field') {
      (layer as L.GeoJSON).bindTooltip(loc.name, {
        permanent: true,
        direction: 'center',
        className: 'field-label'
      });
    } else if (labelsVisible && loc.kind === 'shed') {
      (layer as L.Marker).bindTooltip(loc.name, {
        permanent: true,
        direction: 'bottom',
        offset: [0, 4],
        className: 'shed-label'
      });
    }

    layer.addTo(map);
    layerById.set(loc.id, layer);
  }

  function shedMarkerHtml(color: string): string {
    return `
      <div style="position:relative;width:32px;height:32px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
        <svg viewBox="0 0 32 32" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 1 L30 8 L30 12 L26 12 L26 28 L6 28 L6 12 L2 12 L2 8 Z"
                fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
          <rect x="12" y="18" width="8" height="10" fill="#1f2937" opacity="0.7"/>
        </svg>
      </div>
    `;
  }

  // Re-render when locations change.
  $: if (map && $locationsLoaded) {
    // Keep layers in sync with stored list.
    const storedIds = new Set($locations.map((l) => l.id));
    for (const [id, layer] of layerById) {
      if (!storedIds.has(id)) {
        map.removeLayer(layer);
        layerById.delete(id);
      }
    }
    for (const loc of $locations) {
      if (!layerById.has(loc.id)) addLocationLayer(loc);
      else {
        // Style update for selection change etc.
        const existing = layerById.get(loc.id);
        if (existing && loc.kind === 'field' && existing instanceof L.GeoJSON) {
          existing.setStyle(
            loc.id === $selectedLocationId ? fieldStyleSelected(loc) : fieldStyle(loc)
          );
        }
      }
    }
  }

  $: if (map && L) {
    // Re-apply selection style (cheap).
    for (const loc of $locations) {
      const layer = layerById.get(loc.id);
      if (!layer) continue;
      if (loc.kind === 'field' && layer instanceof L.GeoJSON) {
        layer.setStyle(
          loc.id === $selectedLocationId ? fieldStyleSelected(loc) : fieldStyle(loc)
        );
      }
    }
  }

  function fitToAll(): void {
    if (!map || $locations.length === 0) return;
    const group = L.featureGroup(
      Array.from(layerById.values()).filter((l) => l instanceof L.GeoJSON || l instanceof L.Marker) as L.Layer[]
    );
    const bounds = group.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
  }

  // ---- Draw handlers -------------------------------------------------------
  function startDrawField(): void {
    if (!map) return;
    drawMode.set('field');
    map.pm.enableDraw('Polygon', {
      snappable: true,
      snapDistance: 20,
      allowSelfIntersection: false,
      templineStyle: { color: '#22c55e', weight: 3 },
      hintlineStyle: { color: '#22c55e', weight: 2, dashArray: [4, 6] },
      pathOptions: { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.25 }
    });
  }

  function startPlaceShed(): void {
    if (!map) return;
    drawMode.set('shed');
    map.pm.enableDraw('Marker', { snappable: false });
  }

  function toggleEdit(): void {
    if (!map) return;
    if ($drawMode === 'edit') {
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalDragMode();
      drawMode.set('idle');
    } else {
      map.pm.enableGlobalEditMode();
      drawMode.set('edit');
      toast('info', 'Drag vertices or markers to reshape. Tap Done to save.');
    }
  }

  function cancelDraw(): void {
    if (!map) return;
    map.pm.disableDraw();
    map.pm.disableGlobalEditMode();
    drawMode.set('idle');
  }

  async function saveEdits(): Promise<void> {
    if (!map) return;
    // For each layer we know about, check if geoman modified it and push updates.
    const updates: Promise<unknown>[] = [];
    for (const [id, layer] of layerById) {
      const loc = $locations.find((l) => l.id === id);
      if (!loc) continue;
      try {
        if (loc.kind === 'field' && layer instanceof L.GeoJSON) {
          const newGeo = layer.toGeoJSON() as GeoJSON.FeatureCollection;
          const first = newGeo.features[0];
          if (first && first.geometry) {
            updates.push(
              api
                .updateLocation(id, { geometry: first.geometry as FieldGeometry })
                .then((u) => upsertLocation(u))
                .catch((err) => {
                  console.error(err);
                  toast('error', `Failed to save ${loc.name}`);
                })
            );
          }
        } else if (loc.kind === 'shed' && layer instanceof L.Marker) {
          const ll = layer.getLatLng();
          const origCoords = (loc.geometry as PointGeometry).coordinates as [number, number];
          if (Math.abs(origCoords[0] - ll.lng) > 1e-9 || Math.abs(origCoords[1] - ll.lat) > 1e-9) {
            const newGeo: PointGeometry = { type: 'Point', coordinates: [ll.lng, ll.lat] };
            updates.push(
              api
                .updateLocation(id, { geometry: newGeo })
                .then((u) => upsertLocation(u))
                .catch((err) => {
                  console.error(err);
                  toast('error', `Failed to save ${loc.name}`);
                })
            );
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    await Promise.all(updates);
    map.pm.disableGlobalEditMode();
    drawMode.set('idle');
    if (updates.length > 0) toast('success', 'Changes saved.');
  }

  function handlePmCreate(e: { shape: string; layer: import('leaflet').Layer }): void {
    if (!map) return;
    if (e.shape === 'Polygon') {
      const gj = (e.layer as L.GeoJSON).toGeoJSON?.() ?? (e.layer as unknown as { toGeoJSON(): GeoJSON.Feature }).toGeoJSON();
      const feature = gj as GeoJSON.Feature;
      const geom = feature.geometry as FieldGeometry;
      pendingGeometry = { kind: 'field', geometry: geom, tempLayer: e.layer };
      showNewLocation = true;
    } else if (e.shape === 'Marker') {
      const ll = (e.layer as L.Marker).getLatLng();
      const geom: PointGeometry = { type: 'Point', coordinates: [ll.lng, ll.lat] };
      pendingGeometry = { kind: 'shed', geometry: geom, tempLayer: e.layer };
      showNewLocation = true;
    }
    map.pm.disableDraw();
    drawMode.set('idle');
  }

  async function handleNewLocationSave(detail: { name: string; color: string; notes: string }): Promise<void> {
    if (!pendingGeometry) return;
    try {
      const created =
        pendingGeometry.kind === 'field'
          ? await api.createLocation({
              kind: 'field',
              name: detail.name,
              color: detail.color || null,
              notes: detail.notes || null,
              geometry: pendingGeometry.geometry
            })
          : await api.createLocation({
              kind: 'shed',
              name: detail.name,
              color: detail.color || null,
              notes: detail.notes || null,
              geometry: pendingGeometry.geometry
            });
      upsertLocation(created);
      selectedLocationId.set(created.id);
      toast('success', `${created.kind === 'field' ? 'Field' : 'Shed'} created.`);
    } catch (err) {
      console.error(err);
      if ((err as { status?: number }).status === undefined && !$online) {
        toast('warning', "You're offline — cannot save.");
      } else {
        toast('error', 'Save failed. Please try again.');
      }
    } finally {
      // Remove the temp draw layer (the real location will be rendered from
      // the locations store).
      if (pendingGeometry && map) {
        map.removeLayer(pendingGeometry.tempLayer);
      }
      pendingGeometry = null;
      showNewLocation = false;
    }
  }

  function handleNewLocationCancel(): void {
    if (pendingGeometry && map) map.removeLayer(pendingGeometry.tempLayer);
    pendingGeometry = null;
    showNewLocation = false;
  }

  function toggleLabels(): void {
    labelsVisible = !labelsVisible;
    renderAllLocations();
  }

  function toggleBaseLayer(): void {
    baseLayerChoice = baseLayerChoice === 'esri' ? 'osm' : 'esri';
    applyBaseLayer();
    api.updateSettings({ baseLayer: baseLayerChoice }).catch(() => {});
  }

  // Live area while drawing a field.
  let liveAreaHa: number | null = null;
  $: {
    // expose liveAreaHa via the DrawToolbar when the user is drawing.
    // Geoman fires pm:vertexadded; we compute area from the current working polygon.
    if (browser && map && L && $drawMode === 'field') {
      // handled via event listeners below
    } else {
      liveAreaHa = null;
    }
  }

  onMount(() => {
    if (!browser) return;
    const listen = () => {
      if (!map || !L) return;
      map.on('pm:vertexadded pm:vertexremoved pm:markerdragend', () => {
        const working = (map as L.Map & { pm?: { Draw?: { Polygon?: { _layer?: L.Polygon } } } })
          .pm?.Draw?.Polygon?._layer;
        if (working) {
          const gj = (working as L.Polygon).toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
          if (gj.geometry.coordinates?.[0]?.length >= 3) {
            try {
              liveAreaHa = geometryToHectares(gj.geometry as FieldGeometry);
            } catch {
              liveAreaHa = null;
            }
          }
        }
      });
    };
    // Slight delay so map is ready.
    setTimeout(listen, 0);
  });
</script>

<div class="relative h-screen w-screen overflow-hidden">
  <div
    bind:this={mapEl}
    class="absolute inset-0"
    aria-label="Farm map"
    role="application"
  ></div>

  <TopBar
    labelsVisible={labelsVisible}
    baseLayerChoice={baseLayerChoice}
    on:toggleLabels={toggleLabels}
    on:toggleBase={toggleBaseLayer}
    on:fitAll={fitToAll}
  />

  <DrawToolbar
    mode={$drawMode}
    liveAreaHa={liveAreaHa}
    on:drawField={startDrawField}
    on:drawShed={startPlaceShed}
    on:edit={toggleEdit}
    on:save={saveEdits}
    on:cancel={cancelDraw}
  />

  <DetailPanel
    on:locationDeleted={(e) => {
      if (e.detail?.id) {
        // Remove the map layer that was tied to this location.
        const layer = layerById.get(e.detail.id);
        if (layer && map) map.removeLayer(layer);
        layerById.delete(e.detail.id);
        removeLocation(e.detail.id);
        selectedLocationId.set(null);
      }
    }}
  />

  {#if showNewLocation && pendingGeometry}
    <NewLocationModal
      kind={pendingGeometry.kind}
      areaHa={pendingGeometry.kind === 'field' ? geometryToHectares(pendingGeometry.geometry) : null}
      on:save={(e) => handleNewLocationSave(e.detail)}
      on:cancel={handleNewLocationCancel}
    />
  {/if}

  {#if !$online}
    <div
      class="pointer-events-none fixed bottom-3 left-1/2 z-[9000] -translate-x-1/2 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg"
    >
      Offline — viewing cached data. Changes cannot be saved.
    </div>
  {/if}

  <Toaster />
</div>

<style>
  :global(.field-label) {
    background: transparent;
    border: none;
    color: #fff;
    font-weight: 600;
    text-shadow:
      0 0 3px rgba(0, 0, 0, 0.95),
      0 0 2px rgba(0, 0, 0, 0.9);
    box-shadow: none;
  }
  :global(.field-label::before) {
    display: none;
  }
  :global(.shed-label) {
    background: rgba(15, 23, 42, 0.85);
    border: none;
    color: #fff;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  :global(.shed-label::before) {
    display: none;
  }
  :global(.shed-marker) {
    background: transparent !important;
    border: none !important;
  }
</style>
