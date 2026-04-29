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

export const fieldGeometrySchema = z.union([polygonGeometrySchema, multiPolygonGeometrySchema]);
export const shedGeometrySchema = pointGeometrySchema;

export type PointGeometry = z.infer<typeof pointGeometrySchema>;
export type PolygonGeometry = z.infer<typeof polygonGeometrySchema>;
export type MultiPolygonGeometry = z.infer<typeof multiPolygonGeometrySchema>;
export type FieldGeometry = z.infer<typeof fieldGeometrySchema>;

// ---- Locations --------------------------------------------------------------
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #RRGGBB hex string')
  .optional()
  .nullable();

export const locationKindSchema = z.enum(['field', 'shed']);
export type LocationKind = z.infer<typeof locationKindSchema>;

export const createLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('field'),
    name: z.string().min(1).max(200),
    color: hexColor,
    notes: z.string().max(5000).optional().nullable(),
    geometry: fieldGeometrySchema
  }),
  z.object({
    kind: z.literal('shed'),
    name: z.string().min(1).max(200),
    color: hexColor,
    notes: z.string().max(5000).optional().nullable(),
    geometry: shedGeometrySchema
  })
]);

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: hexColor,
  notes: z.string().max(5000).optional().nullable(),
  geometry: z.union([fieldGeometrySchema, shedGeometrySchema]).optional()
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export interface LocationRecord {
  id: string;
  kind: LocationKind;
  name: string;
  color: string | null;
  notes: string | null;
  geometry: PointGeometry | PolygonGeometry | MultiPolygonGeometry;
  area_ha: number | null;
  created_at: string;
  updated_at: string;
}

// ---- Events -----------------------------------------------------------------
export const createEventSchema = z.object({
  occurred_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime()),
  event_type: eventTypeSchema,
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional()
});

export const updateEventSchema = z.object({
  occurred_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().datetime())
    .optional(),
  event_type: eventTypeSchema.optional(),
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional()
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export interface EventRecord {
  id: string;
  location_id: string;
  occurred_at: string;
  event_type: EventType;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---- Timeline query ---------------------------------------------------------
export const timelineQuerySchema = z.object({
  type: z.string().optional(), // comma-separated
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  location: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

// ---- Settings ---------------------------------------------------------------
export const userSettingsSchema = z.object({
  defaultCenter: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
  defaultZoom: z.number().int().min(0).max(22).optional(),
  unitsPrimary: z.enum(['ha', 'ac']).default('ha'),
  baseLayer: z.enum(['esri', 'osm']).default('esri')
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateSettingsSchema = userSettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const changePasswordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(8).max(256)
});
