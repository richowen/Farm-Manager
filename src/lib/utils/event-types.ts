import type { EventType } from '$lib/schemas';

export interface EventTypeMeta {
  id: EventType;
  label: string;
  group: 'inputs' | 'livestock' | 'harvest' | 'maintenance' | 'other';
  color: string;
  /** Heroicons-style outline SVG path data, 24x24. Single path for simplicity. */
  icon: string;
}

// Using simple monochrome iconography we can recolour per type.
const ICONS = {
  droplet:
    'M12 3s-6.5 7.5-6.5 12a6.5 6.5 0 0 0 13 0C18.5 10.5 12 3 12 3z',
  flask: 'M9 3h6v4l4 8a4 4 0 0 1-3.6 5.95L15 21H9l-.4-.05A4 4 0 0 1 5 15l4-8V3z',
  sparkles:
    'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  bug: 'M12 3v3M9 6l-2-2M15 6l2-2M8 10H5M19 10h-3M12 6a5 5 0 0 0-5 5v4a5 5 0 0 0 10 0v-4a5 5 0 0 0-5-5zM6 15H4m16 0h-2M7 20l-2 2m14 0-2-2',
  stethoscope:
    'M8 3v7a4 4 0 0 0 8 0V3M6 14v2a6 6 0 0 0 12 0v-2M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  arrowDownLeft: 'M17 7 7 17M7 17V9M7 17h8',
  arrowUpRight: 'M7 17 17 7M17 7v8M17 7H9',
  sun: 'M12 4v2M12 18v2M4 12h2M18 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  home: 'M3 11 12 4l9 7M5 10v9h14v-9',
  scissors: 'M6 4 20 18M6 20 20 6M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  wheat: 'M12 22V4M12 6c-2 0-4 1-4 3 0-2 2-3 4-3s4 1 4 3c0-2-2-3-4-3zm0 5c-2 0-4 1-4 3 0-2 2-3 4-3s4 1 4 3c0-2-2-3-4-3zm0 5c-2 0-4 1-4 3 0-2 2-3 4-3s4 1 4 3c0-2-2-3-4-3z',
  seedling: 'M12 21v-8M12 13c-2 0-5-1-5-5 0 0 3-1 5 1 2-2 5-1 5-1 0 4-3 5-5 5z',
  fence: 'M3 8h18M3 14h18M6 4v16M12 4v16M18 4v16',
  magnifier: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4.35-4.35',
  dot: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'
};

export const EVENT_META: Record<EventType, EventTypeMeta> = {
  fertilizer: {
    id: 'fertilizer',
    label: 'Fertilizer',
    group: 'inputs',
    color: '#10b981',
    icon: ICONS.droplet
  },
  slurry: { id: 'slurry', label: 'Slurry', group: 'inputs', color: '#78350f', icon: ICONS.droplet },
  lime: { id: 'lime', label: 'Lime', group: 'inputs', color: '#a3a3a3', icon: ICONS.sparkles },
  spray: { id: 'spray', label: 'Spray', group: 'inputs', color: '#eab308', icon: ICONS.flask },
  worming: {
    id: 'worming',
    label: 'Worming',
    group: 'livestock',
    color: '#9333ea',
    icon: ICONS.bug
  },
  vet_treatment: {
    id: 'vet_treatment',
    label: 'Vet / Treatment',
    group: 'livestock',
    color: '#e11d48',
    icon: ICONS.stethoscope
  },
  cattle_in: {
    id: 'cattle_in',
    label: 'Cattle in',
    group: 'livestock',
    color: '#059669',
    icon: ICONS.arrowDownLeft
  },
  cattle_out: {
    id: 'cattle_out',
    label: 'Cattle out',
    group: 'livestock',
    color: '#dc2626',
    icon: ICONS.arrowUpRight
  },
  turn_out_to_grass: {
    id: 'turn_out_to_grass',
    label: 'Turn out to grass',
    group: 'livestock',
    color: '#22c55e',
    icon: ICONS.sun
  },
  housed: {
    id: 'housed',
    label: 'Housed',
    group: 'livestock',
    color: '#6366f1',
    icon: ICONS.home
  },
  grazing_start: {
    id: 'grazing_start',
    label: 'Grazing — start',
    group: 'livestock',
    color: '#16a34a',
    icon: ICONS.arrowDownLeft
  },
  grazing_end: {
    id: 'grazing_end',
    label: 'Grazing — end',
    group: 'livestock',
    color: '#92400e',
    icon: ICONS.arrowUpRight
  },
  topping: {
    id: 'topping',
    label: 'Topping',
    group: 'maintenance',
    color: '#64748b',
    icon: ICONS.scissors
  },
  harvest_silage: {
    id: 'harvest_silage',
    label: 'Silage',
    group: 'harvest',
    color: '#65a30d',
    icon: ICONS.wheat
  },
  harvest_hay: {
    id: 'harvest_hay',
    label: 'Hay',
    group: 'harvest',
    color: '#ca8a04',
    icon: ICONS.wheat
  },
  reseed: {
    id: 'reseed',
    label: 'Reseed',
    group: 'maintenance',
    color: '#84cc16',
    icon: ICONS.seedling
  },
  fencing: {
    id: 'fencing',
    label: 'Fencing',
    group: 'maintenance',
    color: '#475569',
    icon: ICONS.fence
  },
  inspection: {
    id: 'inspection',
    label: 'Inspection',
    group: 'maintenance',
    color: '#2563eb',
    icon: ICONS.magnifier
  },
  other: { id: 'other', label: 'Other', group: 'other', color: '#6b7280', icon: ICONS.dot }
};

export const EVENT_TYPE_GROUPS: Array<{ id: EventTypeMeta['group']; label: string }> = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'livestock', label: 'Livestock' },
  { id: 'harvest', label: 'Harvest' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'other', label: 'Other' }
];
