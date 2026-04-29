import type {
  BatchEventInput,
  BatchLocationPatchInput,
  CreateEventInput,
  CreateLocationInput,
  CreatePinInput,
  CreateTaskInput,
  EventRecord,
  FieldUseInput,
  FieldUseRecord,
  LocationRecord,
  PhotoRef,
  PinRecord,
  PinStatus,
  TaskRecord,
  UpdateEventInput,
  UpdateFieldUseInput,
  UpdateLocationInput,
  UpdatePinInput,
  UpdateTaskInput
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
      ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      accept: 'application/json',
      ...(init.headers ?? {})
    }
  });
  if (res.status === 204) return undefined as unknown as T;
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
  // ---- Locations --------------------------------------------------------
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
  batchLocationsPatch(
    input: BatchLocationPatchInput
  ): Promise<{ items: LocationRecord[] }> {
    return doFetch('/api/locations/batch', { method: 'PATCH', body: JSON.stringify(input) });
  },

  // ---- Field uses -------------------------------------------------------
  listFieldUses(locationId: string): Promise<{ items: FieldUseRecord[] }> {
    return doFetch(`/api/locations/${locationId}/uses`);
  },
  startFieldUse(locationId: string, input: FieldUseInput): Promise<FieldUseRecord> {
    return doFetch(`/api/locations/${locationId}/uses`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updateFieldUse(id: string, input: UpdateFieldUseInput): Promise<FieldUseRecord> {
    return doFetch(`/api/field-uses/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  endFieldUse(id: string, endedAt?: string): Promise<FieldUseRecord> {
    return doFetch(`/api/field-uses/${id}/end`, {
      method: 'POST',
      body: JSON.stringify({ ended_at: endedAt })
    });
  },
  deleteFieldUse(id: string): Promise<{ ok: true }> {
    return doFetch(`/api/field-uses/${id}`, { method: 'DELETE' });
  },

  // ---- Events -----------------------------------------------------------
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
  createStandaloneEvent(input: CreateEventInput): Promise<EventRecord> {
    return doFetch(`/api/events`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  batchEvent(
    input: BatchEventInput
  ): Promise<{ batch_id: string; items: EventRecord[] }> {
    return doFetch('/api/events/batch', { method: 'POST', body: JSON.stringify(input) });
  },
  deleteBatch(batchId: string): Promise<void> {
    return doFetch(`/api/events/batch/${batchId}`, { method: 'DELETE' });
  },
  updateBatch(batchId: string, input: UpdateEventInput): Promise<{ items: EventRecord[] }> {
    return doFetch(`/api/events/batch/${batchId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
  },
  getBatch(batchId: string): Promise<{ items: EventRecord[] }> {
    return doFetch(`/api/events/batch/${batchId}`);
  },

  timeline(
    params: Partial<{
      type: string;
      from: string;
      to: string;
      location: string;
      batch_id: string;
      cursor: string;
      limit: number;
    }> = {}
  ): Promise<{ items: EventRecord[]; nextCursor: string | null }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    const qs = q.toString();
    return doFetch(`/api/timeline${qs ? `?${qs}` : ''}`);
  },

  // ---- Photos -----------------------------------------------------------
  uploadPhoto(file: File): Promise<PhotoRef> {
    const fd = new FormData();
    fd.append('file', file);
    return doFetch('/api/uploads', { method: 'POST', body: fd });
  },

  // ---- Tasks ------------------------------------------------------------
  listTasks(
    filter: 'open' | 'due' | 'overdue' | 'done' | 'all' = 'all',
    withCounts = false,
    locationId?: string
  ): Promise<{
    items: TaskRecord[];
    counts?: { overdue: number; dueToday: number; open: number };
  }> {
    const q = new URLSearchParams({ filter });
    if (withCounts) q.set('counts', '1');
    if (locationId) q.set('location_id', locationId);
    return doFetch(`/api/tasks?${q.toString()}`);
  },
  createTask(input: CreateTaskInput): Promise<TaskRecord> {
    return doFetch('/api/tasks', { method: 'POST', body: JSON.stringify(input) });
  },
  updateTask(id: string, input: UpdateTaskInput): Promise<TaskRecord> {
    return doFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  deleteTask(id: string): Promise<{ ok: true }> {
    return doFetch(`/api/tasks/${id}`, { method: 'DELETE' });
  },
  completeTask(
    id: string
  ): Promise<{ completed: TaskRecord; next: TaskRecord | null }> {
    return doFetch(`/api/tasks/${id}/complete`, { method: 'POST' });
  },

  // ---- Pins -------------------------------------------------------------
  listPins(
    params: Partial<{ status: PinStatus; category: string; location: string; counts: boolean }> = {}
  ): Promise<{
    items: PinRecord[];
    counts?: { todo: number; done: number; note: number };
  }> {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.category) q.set('category', params.category);
    if (params.location) q.set('location', params.location);
    if (params.counts) q.set('counts', '1');
    const qs = q.toString();
    return doFetch(`/api/pins${qs ? `?${qs}` : ''}`);
  },
  getPin(id: string): Promise<PinRecord> {
    return doFetch(`/api/pins/${id}`);
  },
  createPin(input: CreatePinInput): Promise<PinRecord> {
    return doFetch('/api/pins', { method: 'POST', body: JSON.stringify(input) });
  },
  updatePin(id: string, patch: UpdatePinInput): Promise<PinRecord> {
    return doFetch(`/api/pins/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deletePin(id: string): Promise<{ ok: true }> {
    return doFetch(`/api/pins/${id}`, { method: 'DELETE' });
  },

  // ---- Settings ---------------------------------------------------------
  getSettings(): Promise<import('$lib/schemas').UserSettings> {
    return doFetch('/api/settings');
  },
  updateSettings(
    patch: import('$lib/schemas').UpdateSettingsInput
  ): Promise<import('$lib/schemas').UserSettings> {
    return doFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  },
  rotateIcalToken(): Promise<{ token: string }> {
    return doFetch('/api/settings/ical-token', { method: 'POST' });
  },
  disableIcalToken(): Promise<{ ok: true }> {
    return doFetch('/api/settings/ical-token', { method: 'DELETE' });
  },

  exportAll(): Promise<Blob> {
    return fetch('/api/export', { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new ApiError(r.status, 'export_failed');
      return r.blob();
    });
  },
  importAll(payload: unknown): Promise<{
    ok: true;
    counts: {
      locations: number;
      events: number;
      field_uses: number;
      tasks: number;
      pins: number;
    };
  }> {
    return doFetch('/api/import', { method: 'POST', body: JSON.stringify(payload) });
  }
};
