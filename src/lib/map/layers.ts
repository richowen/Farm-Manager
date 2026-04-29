import L from 'leaflet';

/** Esri World Imagery — free, no API key, aerial imagery worldwide. */
export function esriImageryLayer(): L.TileLayer {
  return L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      // Attribution per Esri terms of use.
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    }
  );
}

/** Esri reference labels (roads + placenames) that overlay on Imagery. */
export function esriReferenceLayer(): L.TileLayer {
  return L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: ''
    }
  );
}

/** OpenStreetMap fallback — useful when Esri is cloudy/outdated for an area. */
export function osmLayer(): L.TileLayer {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
}
