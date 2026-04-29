/**
 * Tile layer configuration — plain URL + options objects with NO Leaflet
 * import. Leaflet is loaded dynamically in MapView.svelte (browser-only inside
 * onMount) so anything statically imported by MapView must not import Leaflet
 * at the module level, otherwise SSR crashes with "window is not defined".
 */

export interface TileLayerConfig {
  url: string;
  options: {
    maxZoom: number;
    attribution: string;
    subdomains?: string;
  };
}

/** Esri World Imagery — free, no API key, aerial imagery worldwide. */
export const ESRI_IMAGERY: TileLayerConfig = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  options: {
    maxZoom: 19,
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  }
};

/** Esri reference labels (roads + placenames) to overlay on Imagery. */
export const ESRI_REFERENCE: TileLayerConfig = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  options: { maxZoom: 19, attribution: '' }
};

/** OpenStreetMap fallback — useful when Esri imagery is cloudy/outdated. */
export const OSM: TileLayerConfig = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc'
  }
};
