import { z } from 'zod';

// ---- Event types ------------------------------------------------------------
export const EVENT_TYPES = [
  'fertilizer',
  'slurry',
  'lime',
  'spray',
  'worming',
  'vet_treatment',
  'cattle_in',
  'cattle_out',
  'turn_out_to_grass',
  'housed',
  'grazing_start',
  'grazing_end',
  'topping',
  'harvest_silage',
  'harvest_hay',
  'reseed',
  'fencing',
  'inspection',
  'other'
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export const eventTypeSchema = z.enum(EVENT_TYPES);

// ---- Geometry (GeoJSON subset) ---------------------------------------------
// We keep the server accepting/returning GeoJSON; the client always works in it.
const position = z
  .tuple([z.number(), z.number()])
  .or(z.tuple([z.number(), z.number(), z.number()]));

const linearRing = z.array(position).min(4);

export const pointGeometrySchema = z.object({
  type: z.literal('Point'),
  coordinates: position
});

export const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(linearRing).min(1)
});

export const multiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(linearRing).min(1)).min(1)
});

export const lineStringGeometrySchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(position).min(2)
});

export const multiLineStringGeometrySchema = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(position).min(2)).min(1)
});

export const fieldGeometrySchema = z.union([polygonGeometrySchema, multiPolygonGeometrySchema]);
export const shedGeometrySchema = pointGeometrySchema;
// Line features may be a single branch or a branching network (MultiLineString).
export const lineGeometrySchema = z.union([
  lineStringGeometrySchema,
  multiLineStringGeometrySchema
]);

export type PointGeometry = z.infer<typeof pointGeometrySchema>;
export type PolygonGeometry = z.infer<typeof polygonGeometrySchema>;
export type MultiPolygonGeometry = z.infer<typeof multiPolygonGeometrySchema>;
export type LineStringGeometry = z.infer<typeof lineStringGeometrySchema>;
export type MultiLineStringGeometry = z.infer<typeof multiLineStringGeometrySchema>;
export type LineGeometry = z.infer<typeof lineGeometrySchema>;
export type FieldGeometry = z.infer<typeof fieldGeometrySchema>;

// User-pickable subtypes for line locations. Legacy v0.2.0 rows store NULL.
export const lineTypeSchema = z.enum(['pipe', 'drain']);
export type LineType = z.infer<typeof lineTypeSchema>;

// ---- Locations --------------------------------------------------------------
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #RRGGBB hex string')
  .optional()
  .nullable();

export const locationKindSchema = z.enum(['field', 'shed', 'line']);
export type LocationKind = z.infer<typeof locationKindSchema>;

// Tags: short, lowercase-ish, no commas/newlines/leading-whitespace.
// Deliberately permissive on the rest; the UI commits a tag on comma or Enter.
const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[^\s,\n][^,\n]*$/, 'tags cannot contain commas or newlines');
export const tagsSchema = z.array(tagSchema).max(50).default([]);

export const createLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('field'),
    name: z.string().min(1).max(200),
    color: hexColor,
    notes: z.string().max(5000).optional().nullable(),
    tags: tagsSchema.optional(),
    geometry: fieldGeometrySchema
  }),
  z.object({
    kind: z.literal('shed'),
    name: z.string().min(1).max(200),
    color: hexColor,
    notes: z.string().max(5000).optional().nullable(),
    tags: tagsSchema.optional(),
    geometry: shedGeometrySchema
  }),
  z.object({
    kind: z.literal('line'),
    name: z.string().min(1).max(200),
    color: hexColor,
    notes: z.string().max(5000).optional().nullable(),
    tags: tagsSchema.optional(),
    line_type: lineTypeSchema.optional(),
    geometry: lineGeometrySchema
  })
]);

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: hexColor,
  notes: z.string().max(5000).optional().nullable(),
  tags: tagsSchema.optional(),
  line_type: lineTypeSchema.nullable().optional(),
  geometry: z.union([fieldGeometrySchema, shedGeometrySchema, lineGeometrySchema]).optional()
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

// ---- Field uses -------------------------------------------------------------
export interface FieldUseRecord {
  id: string;
  location_id: string;
  use_type: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const fieldUseInputSchema = z.object({
  use_type: z.string().trim().min(1).max(64),
  started_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional(),
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional()
});
export type FieldUseInput = z.infer<typeof fieldUseInputSchema>;

export const updateFieldUseSchema = z.object({
  use_type: z.string().trim().min(1).max(64).optional(),
  started_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional(),
  ended_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .nullable()
    .optional(),
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional()
});
export type UpdateFieldUseInput = z.infer<typeof updateFieldUseSchema>;

export const endFieldUseSchema = z.object({
  ended_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional()
});

export interface LocationRecord {
  id: string;
  kind: LocationKind;
  name: string;
  color: string | null;
  notes: string | null;
  tags: string[];
  line_type: LineType | null;
  geometry:
    | PointGeometry
    | PolygonGeometry
    | MultiPolygonGeometry
    | LineStringGeometry
    | MultiLineStringGeometry;
  area_ha: number | null;
  length_m: number | null;
  current_use: FieldUseRecord | null;
  created_at: string;
  updated_at: string;
}

// ---- Batch location patch ---------------------------------------------------
export const batchLocationPatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  patch: z
    .object({
      tags: tagsSchema.optional(),
      tagsMode: z.enum(['replace', 'add', 'remove']).optional(),
      color: hexColor,
      line_type: lineTypeSchema.nullable().optional()
    })
    .optional(),
  use: fieldUseInputSchema.optional()
});
export type BatchLocationPatchInput = z.infer<typeof batchLocationPatchSchema>;

// ---- Photos -----------------------------------------------------------------
export const photoRefSchema = z.object({
  path: z.string().regex(/^[0-9]{4}\/[0-9]{2}\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i, 'invalid photo path'),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  size: z.number().int().positive()
});
export type PhotoRef = z.infer<typeof photoRefSchema>;

// ---- Events -----------------------------------------------------------------
export const createEventSchema = z.object({
  occurred_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime()),
  event_type: eventTypeSchema,
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  photos: z.array(photoRefSchema).max(20).optional()
});

export const updateEventSchema = z.object({
  occurred_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional(),
  event_type: eventTypeSchema.optional(),
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  photos: z.array(photoRefSchema).max(20).optional()
});

export const batchEventInputSchema = z.object({
  location_ids: z.array(z.string().uuid()).min(1).max(500),
  event: createEventSchema
});

export const batchEventUpdateSchema = updateEventSchema;

export const standaloneEventSchema = createEventSchema.extend({
  metadata: z.record(z.unknown()).optional()
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type BatchEventInput = z.infer<typeof batchEventInputSchema>;

export interface EventRecord {
  id: string;
  location_id: string | null;
  occurred_at: string;
  event_type: EventType;
  notes: string | null;
  metadata: Record<string, unknown>;
  photos: PhotoRef[];
  batch_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Timeline query ---------------------------------------------------------
export const timelineQuerySchema = z.object({
  type: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  location: z.string().uuid().optional(),
  batch_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

// ---- Tasks ------------------------------------------------------------------
export const RECURRENCE_VALUES = ['none', 'weekly', 'monthly', 'yearly'] as const;
export type Recurrence = (typeof RECURRENCE_VALUES)[number];
export const recurrenceSchema = z.enum(RECURRENCE_VALUES);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(5000).optional().nullable(),
  due_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime()),
  location_id: z.string().uuid().nullable().optional(),
  recurrence: recurrenceSchema.default('none')
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  notes: z.string().max(5000).optional().nullable(),
  due_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional(),
  location_id: z.string().uuid().nullable().optional(),
  recurrence: recurrenceSchema.optional(),
  done_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .nullable()
    .optional()
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export interface TaskRecord {
  id: string;
  title: string;
  notes: string | null;
  due_at: string;
  location_id: string | null;
  done_at: string | null;
  recurrence: Recurrence;
  created_at: string;
  updated_at: string;
}

// ---- Pins -------------------------------------------------------------------
export const PIN_STATUSES = ['todo', 'done', 'note'] as const;
export type PinStatus = (typeof PIN_STATUSES)[number];
export const pinStatusSchema = z.enum(PIN_STATUSES);

/** Bare `[lng, lat]` pair used for pin coordinates (no z, no GeoJSON wrapper). */
const lngLat = z.tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)]);

export const createPinSchema = z.object({
  coords: lngLat,
  accuracy_m: z.number().nonnegative().optional().nullable(),
  title: z.string().trim().min(1).max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  category: z.string().trim().min(1).max(64).optional().nullable(),
  status: pinStatusSchema.default('todo'),
  photos: z.array(photoRefSchema).max(20).optional(),
  // Client-derived; server re-validates via ST_Covers when omitted.
  location_id: z.string().uuid().nullable().optional()
});

export const updatePinSchema = z.object({
  title: z.string().trim().min(1).max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  category: z.string().trim().min(1).max(64).nullable().optional(),
  status: pinStatusSchema.optional(),
  photos: z.array(photoRefSchema).max(20).optional(),
  coords: lngLat.optional(),
  location_id: z.string().uuid().nullable().optional()
});

export type CreatePinInput = z.infer<typeof createPinSchema>;
export type UpdatePinInput = z.infer<typeof updatePinSchema>;

export interface PinRecord {
  id: string;
  location_id: string | null;
  coords: [number, number]; // [lng, lat]
  accuracy_m: number | null;
  title: string | null;
  notes: string | null;
  category: string | null;
  status: PinStatus;
  photos: PhotoRef[];
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_PIN_CATEGORIES = [
  'repair',
  'restock',
  'check',
  'observation',
  'hazard',
  'livestock-health',
  'crop-issue',
  'general'
] as const;

export const DEFAULT_PIN_CATEGORY_COLORS: Record<string, string> = {
  repair: '#f97316',
  restock: '#3b82f6',
  check: '#eab308',
  observation: '#22c55e',
  hazard: '#ef4444',
  'livestock-health': '#ec4899',
  'crop-issue': '#8b5cf6',
  general: '#6b7280'
};

/** Status colours used for pin markers and chips across the UI. */
export const PIN_STATUS_COLORS: Record<PinStatus, string> = {
  todo: '#f97316', // orange
  done: '#22c55e', // green
  note: '#64748b' // slate
};

// ---- Settings ---------------------------------------------------------------
export const DEFAULT_USE_TYPES = ['grazing', 'mowing', 'hay'] as const;
export const DEFAULT_USE_COLORS: Record<string, string> = {
  grazing: '#4ade80',
  mowing: '#f59e0b',
  hay: '#ca8a04',
  none: '#9ca3af'
};

export const userSettingsSchema = z.object({
  defaultCenter: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
  defaultZoom: z.number().int().min(0).max(22).optional(),
  unitsPrimary: z.enum(['ha', 'ac']).default('ha'),
  baseLayer: z.enum(['esri', 'osm']).default('esri'),
  useTypes: z.array(z.string().trim().min(1).max(64)).default([...DEFAULT_USE_TYPES]),
  useColors: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)).default({}),
  icalFeedToken: z.string().min(16).max(128).nullable().default(null),
  /** Whether pipe/drain lines are rendered on the map. Hidden by default so
   *  they don't clutter the satellite imagery for non-line-focused use. */
  showLines: z.boolean().default(false),
  /** Set to `true` once the one-off legacy-line classification dialog has been
   *  shown in Settings so it doesn't come back after the user dismisses it. */
  legacyLinesPrompted: z.boolean().default(false),
  /** Pin category whitelist — free strings, but the UI only offers these as
   *  chips. Editing in Settings writes both `pinCategories` and
   *  `pinCategoryColors` together. */
  pinCategories: z
    .array(z.string().trim().min(1).max(64))
    .default([...DEFAULT_PIN_CATEGORIES]),
  pinCategoryColors: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)).default({}),
  /** Master pin-visibility toggle. Default on so new pins are immediately
   *  discoverable after a fresh install. */
  showPins: z.boolean().default(true),
  /** Whether completed pins should render on the map when `showPins` is on. */
  showDonePins: z.boolean().default(true)
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateSettingsSchema = userSettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const changePasswordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(8).max(256)
});
