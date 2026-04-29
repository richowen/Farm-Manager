<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
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
    removeLocation,
    multiSelectMode,
    selectedIds,
    clearSelection,
    toggleSelection,
    addSelection,
    colorMode
  } from '$lib/stores';
  import {
    findContainingLocation,
    geometryToHectares,
    lineLengthMeters,
    locationsIntersecting
  } from '$lib/utils/geometry';
  import {
    colorFor,
    fieldStyle,
    fieldStyleSelected,
    lineStyle,
    lineStyleSelected
  } from '$lib/map/style';
  import { ESRI_IMAGERY, ESRI_REFERENCE, OSM } from '$lib/map/layers';
  import DetailPanel from '$lib/components/DetailPanel.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import DrawToolbar from '$lib/components/DrawToolbar.svelte';
  import NewLocationModal from '$lib/components/NewLocationModal.svelte';
  import Toaster from '$lib/components/Toaster.svelte';
  import IAmHereFab from '$lib/components/IAmHereFab.svelte';
  import SelectionChip from '$lib/components/SelectionChip.svelte';
  import UseLegend from '$lib/components/UseLegend.svelte';
  import BatchEventForm from '$lib/components/BatchEventForm.svelte';
  import BatchPropertyForm from '$lib/components/BatchPropertyForm.svelte';
  import TaskBanner from '$lib/components/TaskBanner.svelte';
  import type {
    FieldGeometry,
    LineStringGeometry,
    LocationRecord,
    PointGeometry
  } from '$lib/schemas';

  let mapEl: HTMLDivElement;
  let map: import('leaflet').Map | null = null;
  let L: typeof import('leaflet');
  let layerById = new Map<string, import('leaflet').Layer>();
  let labelsVisible = true;
  let baseLayerChoice: 'esri' | 'osm' = 'esri';
  let esriBase: import('leaflet').TileLayer;
  let esriRef: import('leaflet').TileLayer;
  let osmBase: import('leaflet').TileLayer;
  let herePulse: import('leaflet').Marker | null = null;

  let pendingGeometry:
    | { kind: 'field'; geometry: FieldGeometry; tempLayer: import('leaflet').Layer }
    | { kind: 'shed'; geometry: PointGeometry; tempLayer: import('leaflet').Layer }
    | { kind: 'line'; geometry: LineStringGeometry; tempLayer: import('leaflet').Layer }
    | null = null;
  let showNewLocation = false;
  let showBatchEvent = false;
  let showBatchEdit = false;
  let hereBusy = false;
  let iAmHerePreset: {
    location_id: string | null;
    coords: [number, number];
    accuracy: number | null;
  } | null = null;

  // ---- Init ----------------------------------------------------------------
  onMount(async () => {
    if (!browser) return;

    L = (await import('leaflet')).default ?? (await import('leaflet'));
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

    esriBase = L.tileLayer(ESRI_IMAGERY.url, ESRI_IMAGERY.options);
    esriRef = L.tileLayer(ESRI_REFERENCE.url, ESRI_REFERENCE.options);
    osmBase = L.tileLayer(OSM.url, OSM.options);

    let startCenter: [number, number] = [54.5, -2.5];
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

    try {
      const { items } = await api.listLocations();
      locations.set(items);
      locationsLoaded.set(true);
      renderAllLocations();
      if (items.length > 0 && !$settings?.defaultCenter) fitToAll();
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        window.location.href = '/login';
        return;
      }
      console.error(err);
      toast('error', 'Failed to load map data.');
    }

    map.on('pm:create', handlePmCreate);

    // Viewport persistence.
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
          .catch(() => {});
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

  function styleFor(loc: LocationRecord): import('leaflet').PathOptions {
    const isSelected = loc.id === $selectedLocationId || $selectedIds.has(loc.id);
    const opts = { colorMode: $colorMode, settings: $settings };
    if (loc.kind === 'field') {
      return isSelected ? fieldStyleSelected(loc, opts) : fieldStyle(loc, opts);
    }
    if (loc.kind === 'line') {
      return isSelected ? lineStyleSelected(loc) : lineStyle(loc, opts);
    }
    return fieldStyle(loc, opts);
  }

  function onFeatureClick(loc: LocationRecord): void {
    if ($multiSelectMode) {
      toggleSelection(loc.id);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    } else {
      selectedLocationId.set(loc.id);
    }
  }

  function addLocationLayer(loc: LocationRecord): void {
    if (!map) return;
    let layer: import('leaflet').Layer;
    if (loc.kind === 'field') {
      const gj = L.geoJSON(loc.geometry as GeoJSON.Geometry, {
        style: () => styleFor(loc)
      });
      gj.eachLayer((l) => {
        (l as import('leaflet').Layer).on('click', () => onFeatureClick(loc));
      });
      layer = gj;
    } else if (loc.kind === 'line') {
      const gj = L.geoJSON(loc.geometry as GeoJSON.Geometry, {
        style: () => styleFor(loc)
      });
      gj.eachLayer((l) => {
        (l as import('leaflet').Layer).on('click', () => onFeatureClick(loc));
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
      layer.on('click', () => onFeatureClick(loc));
    }

    if (labelsVisible && (loc.kind === 'field' || loc.kind === 'line')) {
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

  // Re-render when locations list / selection / colourMode changes.
  $: if (map && $locationsLoaded) {
    const storedIds = new Set($locations.map((l) => l.id));
    for (const [id, layer] of layerById) {
      if (!storedIds.has(id)) {
        map.removeLayer(layer);
        layerById.delete(id);
      }
    }
    for (const loc of $locations) {
      if (!layerById.has(loc.id)) addLocationLayer(loc);
    }
  }

  // Re-apply styles whenever the selection sets, colour mode, or settings
  // change — any of these can alter what `styleFor` returns.
  $: if (map && L) {
    // Referencing these stores here ensures the reactive block re-runs.
    void $selectedIds;
    void $selectedLocationId;
    void $colorMode;
    void $settings;
    for (const loc of $locations) {
      const layer = layerById.get(loc.id);
      if (!layer) continue;
      if ((loc.kind === 'field' || loc.kind === 'line') && layer instanceof L.GeoJSON) {
        layer.setStyle(styleFor(loc));
      }
    }
  }

  function fitToAll(): void {
    if (!map || $locations.length === 0) return;
    const group = L.featureGroup(Array.from(layerById.values()));
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

  function startDrawLine(): void {
    if (!map) return;
    drawMode.set('line');
    map.pm.enableDraw('Line', {
      snappable: true,
      snapDistance: 20,
      templineStyle: { color: '#3b82f6', weight: 3 },
      hintlineStyle: { color: '#3b82f6', weight: 2, dashArray: [4, 6] },
      pathOptions: { color: '#3b82f6', weight: 4 }
    });
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
    const updates: Promise<unknown>[] = [];
    for (const [id, layer] of layerById) {
      const loc = $locations.find((l) => l.id === id);
      if (!loc) continue;
      try {
        if ((loc.kind === 'field' || loc.kind === 'line') && layer instanceof L.GeoJSON) {
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
      if ($drawMode === 'field') {
        pendingGeometry = { kind: 'field', geometry: geom, tempLayer: e.layer };
        showNewLocation = true;
      }
    } else if (e.shape === 'Line') {
      const gj = (e.layer as L.GeoJSON).toGeoJSON?.() ?? (e.layer as unknown as { toGeoJSON(): GeoJSON.Feature }).toGeoJSON();
      const feature = gj as GeoJSON.Feature;
      const geom = feature.geometry as LineStringGeometry;
      pendingGeometry = { kind: 'line', geometry: geom, tempLayer: e.layer };
      showNewLocation = true;
    } else if (e.shape === 'Rectangle') {
      // Lasso-select path.
      const feature = (e.layer as L.GeoJSON).toGeoJSON?.() as GeoJSON.Feature | undefined;
      if (feature?.geometry && feature.geometry.type === 'Polygon') {
        const hits = locationsIntersecting($locations, feature.geometry as FieldGeometry);
        addSelection(hits);
        if (hits.length > 0) {
          toast('success', `Added ${hits.length} to selection`);
        }
      }
      map.removeLayer(e.layer);
    } else if (e.shape === 'Marker') {
      const ll = (e.layer as L.Marker).getLatLng();
      const geom: PointGeometry = { type: 'Point', coordinates: [ll.lng, ll.lat] };
      pendingGeometry = { kind: 'shed', geometry: geom, tempLayer: e.layer };
      showNewLocation = true;
    }
    map.pm.disableDraw();
    drawMode.set('idle');
  }

  async function handleNewLocationSave(detail: {
    name: string;
    color: string;
    notes: string;
    tags: string[];
  }): Promise<void> {
    if (!pendingGeometry) return;
    try {
      const common = {
        name: detail.name,
        color: detail.color || null,
        notes: detail.notes || null,
        tags: detail.tags ?? []
      };
      const created =
        pendingGeometry.kind === 'field'
          ? await api.createLocation({ kind: 'field', ...common, geometry: pendingGeometry.geometry })
          : pendingGeometry.kind === 'line'
          ? await api.createLocation({ kind: 'line', ...common, geometry: pendingGeometry.geometry })
          : await api.createLocation({ kind: 'shed', ...common, geometry: pendingGeometry.geometry });
      upsertLocation(created);
      selectedLocationId.set(created.id);
      toast(
        'success',
        created.kind === 'field'
          ? 'Field created.'
          : created.kind === 'line'
          ? 'Line created.'
          : 'Shed created.'
      );
    } catch (err) {
      console.error(err);
      if ((err as { status?: number }).status === undefined && !$online) {
        toast('warning', "You're offline — cannot save.");
      } else {
        toast('error', 'Save failed. Please try again.');
      }
    } finally {
      if (pendingGeometry && map) map.removeLayer(pendingGeometry.tempLayer);
      pendingGeometry = null;
      showNewLocation = false;
    }
  }

  function handleNewLocationCancel(): void {
    if (pendingGeometry && map) map.removeLayer(pendingGeometry.tempLayer);
    pendingGeometry = null;
    showNewLocation = false;
  }

  // ---- Multi-select --------------------------------------------------------
  function toggleSelectMode(): void {
    const next = !$multiSelectMode;
    multiSelectMode.set(next);
    if (!next) clearSelection();
    else toast('info', 'Tap features to select. Tap again to deselect.');
  }

  function startLasso(): void {
    if (!map) return;
    map.pm.enableDraw('Rectangle', {
      pathOptions: { color: '#ec4899', weight: 2, fillColor: '#ec4899', fillOpacity: 0.15 }
    });
  }

  function toggleColorMode(): void {
    colorMode.set($colorMode === 'use' ? 'location' : 'use');
  }

  // ---- "I am here" FAB -----------------------------------------------------
  async function iAmHere(): Promise<void> {
    if (!map) return;
    if (!navigator.geolocation) {
      toast('error', 'Geolocation not supported on this browser.');
      return;
    }
    hereBusy = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        hereBusy = false;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy ?? null;
        map!.setView([lat, lng], Math.max(map!.getZoom(), 17), { animate: true });

        // Remove any existing pulse.
        if (herePulse && map!.hasLayer(herePulse)) map!.removeLayer(herePulse);
        const icon = L.divIcon({
          className: 'here-pulse',
          html: '<div class="pulse"></div>',
          iconSize: [20, 20]
        });
        herePulse = L.marker([lat, lng], { icon, interactive: false }).addTo(map!);

        const containing = findContainingLocation($locations, lat, lng);
        iAmHerePreset = {
          location_id: containing?.id ?? null,
          coords: [lng, lat],
          accuracy
        };
        if (containing) {
          selectedLocationId.set(containing.id);
          toast('success', `You're in ${containing.name}${accuracy ? ` (±${Math.round(accuracy)} m)` : ''}`);
        } else {
          toast('info', 'Logging standalone GPS point (not inside a known field).');
        }
      },
      (err) => {
        hereBusy = false;
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied.'
            : err.code === err.TIMEOUT
            ? 'Location lookup timed out.'
            : 'Could not get your location.';
        toast('error', msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
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

  // Live measurement while drawing.
  let liveAreaHa: number | null = null;
  let liveLineM: number | null = null;
  onMount(() => {
    if (!browser) return;
    const listen = () => {
      if (!map || !L) return;
      map.on('pm:vertexadded pm:vertexremoved pm:markerdragend', () => {
        const polyWorking = (
          map as L.Map & { pm?: { Draw?: { Polygon?: { _layer?: L.Polygon } } } }
        ).pm?.Draw?.Polygon?._layer;
        const lineWorking = (
          map as L.Map & { pm?: { Draw?: { Line?: { _layer?: L.Polyline } } } }
        ).pm?.Draw?.Line?._layer;
        if ($drawMode === 'field' && polyWorking) {
          try {
            const gj = (polyWorking as L.Polygon).toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
            if (gj.geometry.coordinates?.[0]?.length >= 3) {
              liveAreaHa = geometryToHectares(gj.geometry as FieldGeometry);
            }
          } catch {
            liveAreaHa = null;
          }
        } else {
          liveAreaHa = null;
        }
        if ($drawMode === 'line' && lineWorking) {
          try {
            const gj = (lineWorking as L.Polyline).toGeoJSON() as GeoJSON.Feature<GeoJSON.LineString>;
            if (gj.geometry.coordinates?.length >= 2) {
              liveLineM = lineLengthMeters(gj.geometry as LineStringGeometry);
            }
          } catch {
            liveLineM = null;
          }
        } else {
          liveLineM = null;
        }
      });
    };
    setTimeout(listen, 0);
  });

  // Batch event success handler: support 10-second undo.
  async function handleBatchEventSuccess(detail: { batchId: string; count: number }) {
    showBatchEvent = false;
    clearSelection();
    let toastId = 0;
    const undo = async () => {
      try {
        await api.deleteBatch(detail.batchId);
        toast('success', 'Undone.');
      } catch (err) {
        console.error(err);
        toast('error', 'Undo failed.');
      }
    };
    toastId = toast('success', `Event logged on ${detail.count} locations`, 10000, {
      label: 'Undo',
      onClick: undo
    });
    void toastId;
  }

  async function handleBatchPropertySuccess(detail: { count: number }) {
    showBatchEdit = false;
    clearSelection();
    // Re-fetch all locations so the current_use join reflects the new state.
    try {
      const { items } = await api.listLocations();
      locations.set(items);
    } catch {
      /* non-fatal */
    }
    toast('success', `Updated ${detail.count} locations`);
  }

  async function handleIAmHereEventCreated(ev: { location_id: string | null }) {
    iAmHerePreset = null;
    if (herePulse && map?.hasLayer(herePulse)) {
      map.removeLayer(herePulse);
      herePulse = null;
    }
    // If it was attached to a location, open that panel to confirm.
    if (ev.location_id) selectedLocationId.set(ev.location_id);
    await tick();
  }
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

  <TaskBanner />

  {#if $colorMode === 'use'}
    <UseLegend settings={$settings} />
  {/if}

  <DrawToolbar
    mode={$drawMode}
    liveAreaHa={liveAreaHa}
    liveLineM={liveLineM}
    selectModeActive={$multiSelectMode}
    colorMode={$colorMode}
    on:drawField={startDrawField}
    on:drawShed={startPlaceShed}
    on:drawLine={startDrawLine}
    on:edit={toggleEdit}
    on:save={saveEdits}
    on:cancel={cancelDraw}
    on:toggleSelect={toggleSelectMode}
    on:lassoSelect={startLasso}
    on:toggleColorMode={toggleColorMode}
  />

  <SelectionChip
    on:batchEvent={() => (showBatchEvent = true)}
    on:batchEdit={() => (showBatchEdit = true)}
    on:clear={clearSelection}
  />

  <DetailPanel
    iAmHerePreset={iAmHerePreset}
    on:iAmHereEventCreated={(e) => handleIAmHereEventCreated(e.detail)}
    on:locationDeleted={(e) => {
      if (e.detail?.id) {
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
      lengthM={pendingGeometry.kind === 'line' ? lineLengthMeters(pendingGeometry.geometry) : null}
      on:save={(e) => handleNewLocationSave(e.detail)}
      on:cancel={handleNewLocationCancel}
    />
  {/if}

  {#if showBatchEvent}
    <BatchEventForm
      ids={Array.from($selectedIds)}
      on:saved={(e) => handleBatchEventSuccess(e.detail)}
      on:cancel={() => (showBatchEvent = false)}
    />
  {/if}

  {#if showBatchEdit}
    <BatchPropertyForm
      ids={Array.from($selectedIds)}
      on:saved={(e) => handleBatchPropertySuccess(e.detail)}
      on:cancel={() => (showBatchEdit = false)}
    />
  {/if}

  <IAmHereFab busy={hereBusy} on:click={iAmHere} />

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
  :global(.here-pulse) {
    background: transparent !important;
    border: none !important;
  }
  :global(.here-pulse .pulse) {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #3b82f6;
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6);
    animation: here-pulse-anim 1.6s infinite;
  }
  @keyframes here-pulse-anim {
    0% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6);
    }
    100% {
      box-shadow: 0 0 0 18px rgba(59, 130, 246, 0);
    }
  }
</style>
