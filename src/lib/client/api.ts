import type {
  CreateEventInput,
  CreateLocationInput,
  EventRecord,
  LocationRecord,
  UpdateEventInput,
  UpdateLocationInput
} from '$lib/schemas';

/**
 * Thin typed wrapper around fetch for our own API. Throws ApiError on non-2xx.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

async function doFetch<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      accept: 'application/json',
      ...(init.headers ?? {})
    }
  });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const extracted =
      body && typeof body === 'object' && 'message' in body
        ? String((body as Record<string, unknown>).message)
        : '';
    const msg = extracted || res.statusText || 'request_failed';
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  listLocations(): Promise<{ items: LocationRecord[] }> {
    return doFetch('/api/locations');
  },
  getLocation(id: string): Promise<LocationRecord> {
    return doFetch(`/api/locations/${id}`);
  },
  createLocation(input: CreateLocationInput): Promise<LocationRecord> {
    return doFetch('/api/locations', { method: 'POST', body: JSON.stringify(input) });
  },
  updateLocation(id: string, input: UpdateLocationInput): Promise<LocationRecord> {
    return doFetch(`/api/locations/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  deleteLocation(id: string): Promise<{ ok: true }> {
    return doFetch(`/api/locations/${id}`, { method: 'DELETE' });
  },

  listEvents(
    locationId: string,
    params: Partial<{ type: string; from: string; to: string; cursor: string; limit: number }> = {}
  ): Promise<{ items: EventRecord[]; nextCursor: string | null }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    const qs = q.toString();
    return doFetch(`/api/locations/${locationId}/events${qs ? `?${qs}` : ''}`);
  },
  createEvent(locationId: string, input: CreateEventInput): Promise<EventRecord> {
    return doFetch(`/api/locations/${locationId}/events`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updateEvent(id: string, input: UpdateEventInput): Promise<EventRecord> {
    return doFetch(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  deleteEvent(id: string): Promise<{ ok: true }> {
    return doFetch(`/api/events/${id}`, { method: 'DELETE' });
  },

  timeline(
    params: Partial<{ type: string; from: string; to: string; location: string; cursor: string; limit: number }> = {}
  ): Promise<{ items: EventRecord[]; nextCursor: string | null }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    const qs = q.toString();
    return doFetch(`/api/timeline${qs ? `?${qs}` : ''}`);
  },

  getSettings(): Promise<import('$lib/schemas').UserSettings> {
    return doFetch('/api/settings');
  },
  updateSettings(
    patch: import('$lib/schemas').UpdateSettingsInput
  ): Promise<import('$lib/schemas').UserSettings> {
    return doFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  },

  exportAll(): Promise<Blob> {
    return fetch('/api/export', { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new ApiError(r.status, 'export_failed');
      return r.blob();
    });
  },
  importAll(payload: unknown): Promise<{ ok: true; counts: { locations: number; events: number } }> {
    return doFetch('/api/import', { method: 'POST', body: JSON.stringify(payload) });
  }
};
