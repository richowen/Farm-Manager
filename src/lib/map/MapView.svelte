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
    colorMode,
    pins,
    pinsLoaded,
    selectedPinId,
    selectedPin,
    upsertPin,
    removePin
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
  import IAmHereChooser from '$lib/components/IAmHereChooser.svelte';
  import PinDropModal from '$lib/components/PinDropModal.svelte';
  import PinDetailSheet from '$lib/components/PinDetailSheet.svelte';
  import SelectionChip from '$lib/components/SelectionChip.svelte';
  import UseLegend from '$lib/components/UseLegend.svelte';
  import BatchEventForm from '$lib/components/BatchEventForm.svelte';
  import BatchPropertyForm from '$lib/components/BatchPropertyForm.svelte';
  import TaskBanner from '$lib/components/TaskBanner.svelte';
  import type {
    FieldGeometry,
    LineGeometry,
    LineStringGeometry,
    LineType,
    LocationRecord,
    PinRecord,
    PointGeometry
  } from '$lib/schemas';
  import { DEFAULT_PIN_CATEGORY_COLORS, PIN_STATUS_COLORS } from '$lib/schemas';

  let mapEl: HTMLDivElement;
  let map: import('leaflet').Map | null = null;
  let L: typeof import('leaflet');
  let layerById = new Map<string, import('leaflet').Layer>();
  let pinLayerById = new Map<string, import('leaflet').Marker>();
  let labelsVisible = true;
  let baseLayerChoice: 'esri' | 'osm' = 'esri';
  let esriBase: import('leaflet').TileLayer;
  let esriRef: import('leaflet').TileLayer;
  let osmBase: import('leaflet').TileLayer;
  let herePulse: import('leaflet').Marker | null = null;

  let pendingGeometry:
    | { kind: 'field'; geometry: FieldGeometry; tempLayer: import('leaflet').Layer }
    | { kind: 'shed'; geometry: PointGeometry; tempLayer: import('leaflet').Layer }
    | { kind: 'line'; geometry: LineGeometry; lineType: LineType | null; tempLayer: import('leaflet').Layer | null }
    | null = null;
  let showNewLocation = false;
  let showBatchEvent = false;
  let showBatchEdit = false;
  let hereBusy = false;

  // ---- Branching line-draft state -----------------------------------------
  /** Non-null while we're composing a pipe / drain. */
  let lineDraftType: 'pipe' | 'drain' | null = null;
  /** Each element is the coords array of one finished branch. */
  let lineDraftBranches: Array<Array<[number, number] | [number, number, number]>> = [];
  /** Persistent preview layers so the user sees what they've drawn. */
  let lineDraftPreviewLayers: import('leaflet').Polyline[] = [];
  let iAmHerePreset: {
    location_id: string | null;
    coords: [number, number];
    accuracy: number | null;
  } | null = null;

  /** State for the post-GPS-lock chooser sheet ("Log event" / "Drop pin"). */
  let iAmHereChooserState: {
    coords: [number, number];
    accuracy: number | null;
    containingField: LocationRecord | null;
  } | null = null;

  /** State for the pin drop/create modal. When set, the modal renders. */
  let pinDropState: {
    coords: [number, number];
    accuracy_m: number | null;
    containingField: LocationRecord | null;
  } | null = null;
  let pinSaving = false;

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

    // Pins load independently of locations — failure here shouldn't block
    // the map boot. The pin layer re-renders reactively once the store fills.
    try {
      const res = await api.listPins();
      pins.set(res.items);
      pinsLoaded.set(true);
      renderAllPins();
    } catch (err) {
      console.warn('pins load failed', err);
    }

    map.on('pm:create', handlePmCreate);

    // Long-press listeners for drop-a-pin. We attach to the container rather
    // than the map instance so we can decide based on the DOM target (don't
    // long-press markers/features).
    mapEl.addEventListener('pointerdown', onMapPointerDown);
    mapEl.addEventListener('pointermove', onMapPointerMove);
    mapEl.addEventListener('pointerup', onMapPointerUpOrCancel);
    mapEl.addEventListener('pointercancel', onMapPointerUpOrCancel);
    mapEl.addEventListener('pointerleave', onMapPointerUpOrCancel);
    // If the map starts dragging, cancel any pending press so a pan doesn't
    // accidentally become a pin drop.
    map.on('movestart dragstart zoomstart', () => cancelLongPress());

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
    cancelLongPress();
    if (mapEl) {
      mapEl.removeEventListener('pointerdown', onMapPointerDown);
      mapEl.removeEventListener('pointermove', onMapPointerMove);
      mapEl.removeEventListener('pointerup', onMapPointerUpOrCancel);
      mapEl.removeEventListener('pointercancel', onMapPointerUpOrCancel);
      mapEl.removeEventListener('pointerleave', onMapPointerUpOrCancel);
    }
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

  function renderAllLocations(opts?: { showLinesOverride?: boolean }): void {
    if (!map) return;
    layerById.forEach((layer) => map!.removeLayer(layer));
    layerById.clear();
    const showLines = opts?.showLinesOverride ?? ($settings?.showLines ?? false);
    for (const loc of $locations) {
      if (loc.kind === 'line' && !showLines) continue;
      addLocationLayer(loc);
    }
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

  // ---- Pins ----------------------------------------------------------------
  function pinCategoryColor(p: PinRecord): string {
    if (!p.category) return '#9ca3af';
    const override = $settings?.pinCategoryColors?.[p.category];
    return override ?? DEFAULT_PIN_CATEGORY_COLORS[p.category] ?? '#9ca3af';
  }

  function pinMarkerHtml(p: PinRecord): string {
    const statusColor = PIN_STATUS_COLORS[p.status] ?? '#64748b';
    const catColor = pinCategoryColor(p);
    const opacity = p.status === 'done' ? 0.6 : 1;
    // Teardrop: outer shape is the status colour; inner dot is the category
    // colour so both facets are readable at a glance.
    return `
      <div style="position:relative;width:28px;height:36px;opacity:${opacity};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
        <svg viewBox="0 0 28 36" width="28" height="36" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 1 C6 1 1 6 1 13 C1 22 14 35 14 35 C14 35 27 22 27 13 C27 6 22 1 14 1 Z"
                fill="${statusColor}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
          <circle cx="14" cy="13" r="5" fill="${catColor}" stroke="#fff" stroke-width="1"/>
        </svg>
      </div>
    `;
  }

  function pinDivIcon(p: PinRecord): import('leaflet').DivIcon {
    return L.divIcon({
      className: 'pin-marker',
      html: pinMarkerHtml(p),
      iconSize: [28, 36],
      iconAnchor: [14, 34]
    });
  }

  function shouldRenderPin(p: PinRecord): boolean {
    if (!($settings?.showPins ?? true)) return false;
    if (p.status === 'done' && !($settings?.showDonePins ?? true)) return false;
    return true;
  }

  function addPinLayer(p: PinRecord): void {
    if (!map) return;
    const [lng, lat] = p.coords;
    const marker = L.marker([lat, lng], {
      icon: pinDivIcon(p),
      title: p.title ?? p.category ?? 'Pin',
      // Pins should float above locations but not get in the way of drawing.
      zIndexOffset: 500
    });
    marker.on('click', () => {
      if ($drawMode !== 'idle') return;
      selectedPinId.set(p.id);
    });
    marker.addTo(map);
    pinLayerById.set(p.id, marker);
  }

  function renderAllPins(): void {
    if (!map) return;
    pinLayerById.forEach((m) => map!.removeLayer(m));
    pinLayerById.clear();
    if (!($settings?.showPins ?? true)) return;
    for (const p of $pins) {
      if (!shouldRenderPin(p)) continue;
      addPinLayer(p);
    }
  }

  // When a pin becomes selected via a deep link (`?pin=<id>`) we want the
  // map to pan to it so the detail sheet isn't pointing at empty space.
  // Track the previously-selected id so we only pan on change, not on every
  // tick.
  let lastPannedPinId: string | null = null;
  $: if (map && $selectedPin && $selectedPin.id !== lastPannedPinId) {
    lastPannedPinId = $selectedPin.id;
    const [lng, lat] = $selectedPin.coords;
    map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
  }
  $: if (!$selectedPin) lastPannedPinId = null;

  // Mutual exclusion: opening a field/location panel closes any open pin sheet, and vice versa.
  $: if ($selectedLocationId) selectedPinId.set(null);
  $: if ($selectedPinId) selectedLocationId.set(null);

  // Reactive pin re-render: mirror the locations pattern but on the pin store
  // and the two pin-visibility settings.
  $: if (map && L && $pinsLoaded) {
    void $settings; // re-run when settings change (category colours, toggles)
    const showPins = $settings?.showPins ?? true;
    if (!showPins) {
      for (const [id, marker] of pinLayerById) {
        map.removeLayer(marker);
        pinLayerById.delete(id);
      }
    } else {
      const live = new Set($pins.map((p) => p.id));
      // Remove stale or now-hidden pins.
      for (const [id, marker] of pinLayerById) {
        const p = $pins.find((x) => x.id === id);
        if (!live.has(id) || !p || !shouldRenderPin(p)) {
          map.removeLayer(marker);
          pinLayerById.delete(id);
        }
      }
      // Add newly-visible pins and refresh icons for existing ones so status
      // / category / colour changes take effect.
      for (const p of $pins) {
        if (!shouldRenderPin(p)) continue;
        const existing = pinLayerById.get(p.id);
        if (!existing) {
          addPinLayer(p);
        } else {
          existing.setIcon(pinDivIcon(p));
          const [lng, lat] = p.coords;
          const cur = existing.getLatLng();
          if (Math.abs(cur.lng - lng) > 1e-9 || Math.abs(cur.lat - lat) > 1e-9) {
            existing.setLatLng([lat, lng]);
          }
        }
      }
    }
  }

  // Re-render when locations list / selection / colourMode changes.
  $: if (map && $locationsLoaded) {
    const showLines = $settings?.showLines ?? false;
    const storedIds = new Set($locations.map((l) => l.id));
    for (const [id, layer] of layerById) {
      const loc = $locations.find((l) => l.id === id);
      const shouldBeShown = !!loc && (loc.kind !== 'line' || showLines);
      if (!storedIds.has(id) || !shouldBeShown) {
        map.removeLayer(layer);
        layerById.delete(id);
      }
    }
    for (const loc of $locations) {
      if (loc.kind === 'line' && !showLines) continue;
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

  function lineDrawOptions(type: 'pipe' | 'drain'): Record<string, unknown> {
    const color = type === 'drain' ? '#92400e' : '#3b82f6';
    const dash = type === 'drain' ? [8, 4] : undefined;
    return {
      snappable: true,
      snapDistance: 20,
      templineStyle: { color, weight: 3, ...(dash ? { dashArray: dash } : {}) },
      hintlineStyle: { color, weight: 2, dashArray: [4, 6] },
      pathOptions: { color, weight: 4, ...(dash ? { dashArray: dash } : {}) }
    };
  }

  function startDrawPipe(): void {
    if (!map) return;
    cancelLineDraft(); // clear any stale draft
    lineDraftType = 'pipe';
    lineDraftBranches = [];
    lineDraftPreviewLayers = [];
    drawMode.set('line');
    map.pm.enableDraw('Line', lineDrawOptions('pipe'));
  }

  function startDrawDrain(): void {
    if (!map) return;
    cancelLineDraft();
    lineDraftType = 'drain';
    lineDraftBranches = [];
    lineDraftPreviewLayers = [];
    drawMode.set('line');
    map.pm.enableDraw('Line', lineDrawOptions('drain'));
  }

  function addAnotherBranch(): void {
    if (!map || !lineDraftType) return;
    drawMode.set('line');
    map.pm.enableDraw('Line', lineDrawOptions(lineDraftType));
  }

  function finishLineDraft(): void {
    if (!map || !lineDraftType || lineDraftBranches.length === 0) return;
    map.pm.disableDraw();
    const branches = lineDraftBranches;
    const geometry: LineGeometry =
      branches.length === 1
        ? { type: 'LineString', coordinates: branches[0] }
        : { type: 'MultiLineString', coordinates: branches };
    pendingGeometry = {
      kind: 'line',
      geometry,
      lineType: lineDraftType,
      tempLayer: null
    };
    showNewLocation = true;
    // Preview layers remain visible until save/cancel so the user sees what
    // will be saved — cleaned up in handleNewLocationSave / cancel.
  }

  function cancelLineDraft(): void {
    if (map) {
      map.pm.disableDraw();
      for (const l of lineDraftPreviewLayers) {
        if (map.hasLayer(l)) map.removeLayer(l);
      }
    }
    lineDraftPreviewLayers = [];
    lineDraftBranches = [];
    lineDraftType = null;
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
    if (lineDraftType) cancelLineDraft();
    if ($drawMode === 'pin') cancelPinDrop();
    drawMode.set('idle');
  }

  // ---- Pin drop mode -------------------------------------------------------
  /** Handler bound to the map click event while drawMode === 'pin'. */
  let pinDropClickHandler: ((e: import('leaflet').LeafletMouseEvent) => void) | null = null;

  function startDrawPin(): void {
    if (!map) return;
    cancelLineDraft();
    map.pm.disableDraw();
    drawMode.set('pin');
    // Change the cursor so users know the next click is consumed.
    mapEl.style.cursor = 'crosshair';
    pinDropClickHandler = (e: import('leaflet').LeafletMouseEvent) => {
      // First click wins — tear down before opening the modal so a stray
      // double-tap can't drop two pins.
      const coords: [number, number] = [e.latlng.lng, e.latlng.lat];
      const containing = findContainingLocation($locations, e.latlng.lat, e.latlng.lng);
      cancelPinDrop();
      drawMode.set('idle');
      pinDropState = {
        coords,
        accuracy_m: null,
        containingField: containing
      };
    };
    map.on('click', pinDropClickHandler);
  }

  function cancelPinDrop(): void {
    if (map && pinDropClickHandler) {
      map.off('click', pinDropClickHandler);
    }
    pinDropClickHandler = null;
    if (mapEl) mapEl.style.cursor = '';
  }

  // ---- Long-press to drop a pin -------------------------------------------
  /**
   * Long-press detection: ~600 ms hold on the map container without moving
   * more than 10 px and without hitting an existing marker/feature. Works on
   * both touch and mouse. When triggered, switches into pin-drop state
   * directly — no toolbar bounce.
   */
  const LONG_PRESS_MS = 600;
  const LONG_PRESS_TOL_PX = 10;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressStart: { x: number; y: number } | null = null;

  function cancelLongPress(): void {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressStart = null;
  }

  function onMapPointerDown(ev: PointerEvent): void {
    // Ignore if we're already in an active draw / edit / pin flow, or the
    // press started on an existing map feature (SVG / marker), not the
    // empty map container.
    if (!map) return;
    if ($drawMode !== 'idle') return;
    const target = ev.target as Element | null;
    if (!target) return;
    if (target.closest('.leaflet-marker-icon') || target.closest('path, circle, polygon')) return;
    if (ev.button !== undefined && ev.button !== 0) return;

    longPressStart = { x: ev.clientX, y: ev.clientY };
    cancelLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!map || !longPressStart) return;
      const rect = mapEl.getBoundingClientRect();
      const x = longPressStart.x - rect.left;
      const y = longPressStart.y - rect.top;
      const ll = map.containerPointToLatLng([x, y]);
      const containing = findContainingLocation($locations, ll.lat, ll.lng);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
      pinDropState = {
        coords: [ll.lng, ll.lat],
        accuracy_m: null,
        containingField: containing
      };
      longPressStart = null;
    }, LONG_PRESS_MS);
  }

  function onMapPointerMove(ev: PointerEvent): void {
    if (!longPressStart || !longPressTimer) return;
    const dx = ev.clientX - longPressStart.x;
    const dy = ev.clientY - longPressStart.y;
    if (dx * dx + dy * dy > LONG_PRESS_TOL_PX * LONG_PRESS_TOL_PX) {
      cancelLongPress();
    }
  }

  function onMapPointerUpOrCancel(): void {
    cancelLongPress();
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
          let geometry: GeoJSON.Geometry | null = null;
          if (loc.kind === 'line') {
            // A MultiLineString round-trips through Leaflet as one
            // LineString feature per branch — re-combine so the server
            // still sees a single MultiLineString.
            const lineFeats = newGeo.features.filter(
              (f) => f.geometry?.type === 'LineString'
            );
            if (lineFeats.length === 1) {
              geometry = lineFeats[0].geometry;
            } else if (lineFeats.length > 1) {
              geometry = {
                type: 'MultiLineString',
                coordinates: lineFeats.map(
                  (f) => (f.geometry as GeoJSON.LineString).coordinates
                )
              };
            }
          } else {
            const first = newGeo.features[0];
            geometry = first?.geometry ?? null;
          }
          if (geometry) {
            updates.push(
              api
                .updateLocation(id, { geometry: geometry as FieldGeometry })
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
      map.pm.disableDraw();
      drawMode.set('idle');
    } else if (e.shape === 'Line') {
      const gj = (e.layer as L.GeoJSON).toGeoJSON?.() ?? (e.layer as unknown as { toGeoJSON(): GeoJSON.Feature }).toGeoJSON();
      const feature = gj as GeoJSON.Feature;
      const geom = feature.geometry as LineStringGeometry;
      if (lineDraftType) {
        // Accumulate this branch as part of the current pipe/drain draft,
        // keep a persistent preview on the map, and return to 'line' mode so
        // the toolbar shows Add-another-branch / Finish.
        lineDraftBranches = [...lineDraftBranches, geom.coordinates as Array<[number, number]>];
        const color = lineDraftType === 'drain' ? '#92400e' : '#3b82f6';
        const style: import('leaflet').PolylineOptions = {
          color,
          weight: 4,
          opacity: 0.9,
          ...(lineDraftType === 'drain' ? { dashArray: '8 4' } : {})
        };
        const latlngs = geom.coordinates.map((c) => [c[1], c[0]] as [number, number]);
        const preview = L.polyline(latlngs, style).addTo(map);
        lineDraftPreviewLayers = [...lineDraftPreviewLayers, preview];
        // Remove the Geoman-drawn temp layer; preview replaces it.
        if (map.hasLayer(e.layer)) map.removeLayer(e.layer);
        map.pm.disableDraw();
        drawMode.set('line');
      } else {
        // Legacy path — generic line, no subtype. Open the modal immediately.
        pendingGeometry = { kind: 'line', geometry: geom, lineType: null, tempLayer: e.layer };
        showNewLocation = true;
        map.pm.disableDraw();
        drawMode.set('idle');
      }
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
      map.pm.disableDraw();
      drawMode.set('idle');
    } else if (e.shape === 'Marker') {
      const ll = (e.layer as L.Marker).getLatLng();
      const geom: PointGeometry = { type: 'Point', coordinates: [ll.lng, ll.lat] };
      pendingGeometry = { kind: 'shed', geometry: geom, tempLayer: e.layer };
      showNewLocation = true;
      map.pm.disableDraw();
      drawMode.set('idle');
    }
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
          ? await api.createLocation({
              kind: 'line',
              ...common,
              line_type: pendingGeometry.lineType ?? undefined,
              geometry: pendingGeometry.geometry
            })
          : await api.createLocation({ kind: 'shed', ...common, geometry: pendingGeometry.geometry });
      upsertLocation(created);
      // If the user just created a line while they had `showLines` off we
      // want to make sure it's visible — flip the setting on persistently.
      // Pass the new value into renderAllLocations explicitly rather than
      // relying on subscription tick-order.
      if (created.kind === 'line' && !($settings?.showLines ?? false)) {
        settings.update((s) => (s ? { ...s, showLines: true } : s));
        renderAllLocations({ showLinesOverride: true });
        api.updateSettings({ showLines: true }).catch(() => {});
      }
      selectedLocationId.set(created.id);
      toast(
        'success',
        created.kind === 'field'
          ? 'Field created.'
          : created.kind === 'line'
          ? created.line_type === 'drain'
            ? 'Drain created.'
            : created.line_type === 'pipe'
            ? 'Pipe created.'
            : 'Line created.'
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
      if (pendingGeometry?.tempLayer && map) map.removeLayer(pendingGeometry.tempLayer);
      // Clear line draft preview layers — the real rendered location takes over.
      if (pendingGeometry?.kind === 'line') cancelLineDraft();
      pendingGeometry = null;
      showNewLocation = false;
    }
  }

  function handleNewLocationCancel(): void {
    if (pendingGeometry?.tempLayer && map) map.removeLayer(pendingGeometry.tempLayer);
    if (pendingGeometry?.kind === 'line') cancelLineDraft();
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
        // Stash state for both the chooser (next step) and the potential
        // event-creation flow. The old auto-open behaviour is replaced by
        // the chooser sheet, which lets the user pick event-vs-pin.
        iAmHereChooserState = {
          coords: [lng, lat],
          accuracy,
          containingField: containing
        };
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

  function handleChooserLogEvent(): void {
    if (!iAmHereChooserState) return;
    const { coords, accuracy, containingField } = iAmHereChooserState;
    iAmHereChooserState = null;
    if (!containingField) {
      toast('info', 'No field here — drop a pin instead.');
      return;
    }
    // Delegate to the existing DetailPanel preset flow.
    iAmHerePreset = {
      location_id: containingField.id,
      coords,
      accuracy
    };
    selectedLocationId.set(containingField.id);
  }

  function handleChooserDropPin(): void {
    if (!iAmHereChooserState) return;
    pinDropState = {
      coords: iAmHereChooserState.coords,
      accuracy_m: iAmHereChooserState.accuracy,
      containingField: iAmHereChooserState.containingField
    };
    iAmHereChooserState = null;
  }

  function handleChooserCancel(): void {
    iAmHereChooserState = null;
    if (herePulse && map?.hasLayer(herePulse)) {
      map.removeLayer(herePulse);
      herePulse = null;
    }
  }

  async function handlePinDropSave(detail: {
    title: string | null;
    notes: string | null;
    category: string | null;
    status: import('$lib/schemas').PinStatus;
    photos: import('$lib/schemas').PhotoRef[];
  }): Promise<void> {
    if (!pinDropState) return;
    pinSaving = true;
    try {
      const created = await api.createPin({
        coords: pinDropState.coords,
        accuracy_m: pinDropState.accuracy_m ?? null,
        title: detail.title,
        notes: detail.notes,
        category: detail.category,
        status: detail.status,
        photos: detail.photos,
        location_id: pinDropState.containingField?.id ?? null
      });
      upsertPin(created);
      pinDropState = null;
      // Clear the pulse once the pin is planted — the marker replaces it.
      if (herePulse && map?.hasLayer(herePulse)) {
        map.removeLayer(herePulse);
        herePulse = null;
      }
      toast('success', 'Pin dropped.');
    } catch (err) {
      console.error(err);
      if (!$online) {
        toast('warning', "You're offline — cannot save.");
      } else {
        toast('error', 'Could not save pin.');
      }
    } finally {
      pinSaving = false;
    }
  }

  function handlePinDropCancel(): void {
    pinDropState = null;
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

  function toggleLines(): void {
    const next = !($settings?.showLines ?? false);
    settings.update((s) => (s ? { ...s, showLines: next } : s));
    renderAllLocations({ showLinesOverride: next });
    api.updateSettings({ showLines: next }).catch(() => {});
  }

  function togglePins(): void {
    const next = !($settings?.showPins ?? true);
    settings.update((s) => (s ? { ...s, showPins: next } : s));
    // The reactive pin block handles visibility; persist the flag.
    api.updateSettings({ showPins: next }).catch(() => {});
  }

  function toggleDonePins(): void {
    const next = !($settings?.showDonePins ?? true);
    settings.update((s) => (s ? { ...s, showDonePins: next } : s));
    api.updateSettings({ showDonePins: next }).catch(() => {});
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

<div class="relative h-[100dvh] w-screen overflow-hidden">
  <div
    bind:this={mapEl}
    class="absolute inset-0"
    aria-label="Farm map"
    role="application"
  ></div>

  <TopBar
    labelsVisible={labelsVisible}
    baseLayerChoice={baseLayerChoice}
    showLines={$settings?.showLines ?? false}
    showPins={$settings?.showPins ?? true}
    showDonePins={$settings?.showDonePins ?? true}
    on:toggleLabels={toggleLabels}
    on:toggleBase={toggleBaseLayer}
    on:toggleLines={toggleLines}
    on:togglePins={togglePins}
    on:toggleDonePins={toggleDonePins}
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
    lineDraftType={lineDraftType}
    lineDraftBranchCount={lineDraftBranches.length}
    on:drawField={startDrawField}
    on:drawShed={startPlaceShed}
    on:drawPipe={startDrawPipe}
    on:drawDrain={startDrawDrain}
    on:drawPin={startDrawPin}
    on:addBranch={addAnotherBranch}
    on:finishLine={finishLineDraft}
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
      lineType={pendingGeometry.kind === 'line' ? pendingGeometry.lineType : null}
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

  {#if iAmHereChooserState}
    <IAmHereChooser
      coords={iAmHereChooserState.coords}
      accuracy={iAmHereChooserState.accuracy}
      containingField={iAmHereChooserState.containingField}
      on:logEvent={handleChooserLogEvent}
      on:dropPin={handleChooserDropPin}
      on:cancel={handleChooserCancel}
    />
  {/if}

  {#if pinDropState}
    <PinDropModal
      mode="create"
      coords={pinDropState.coords}
      accuracy_m={pinDropState.accuracy_m}
      containingField={pinDropState.containingField}
      saving={pinSaving}
      on:save={(e) => handlePinDropSave(e.detail)}
      on:cancel={handlePinDropCancel}
    />
  {/if}

  <PinDetailSheet />

  {#if !$online}
    <div
      class="pointer-events-none absolute left-1/2 z-[9000] -translate-x-1/2 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg"
      style="top: 4.5rem;"
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
  :global(.pin-marker) {
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
