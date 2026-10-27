import { z } from 'zod';

/**
 * Field models: things found on foot (a yam, a soak, a stand of trees) or
 * caught fishing, and the models fitted from them. Shared by the API routes
 * and the field app, which queues observations on the phone while out of range.
 */

export const targetIdPattern = /^[a-z0-9][a-z0-9-]{1,47}$/;

/** 'gather': found on foot. 'fish': an animal caught in a river or waterhole. */
export const activitySchema = z.enum(['gather', 'fish']);
export type Activity = z.infer<typeof activitySchema>;

const targetFields = {
  name: z.string().trim().min(1).max(80),
  scientificNames: z.array(z.string().trim().min(2).max(120)).max(20),
  notes: z.string().trim().max(2000),
  activity: activitySchema,
};

export const newTargetSchema = z.object({
  name: targetFields.name,
  scientificNames: targetFields.scientificNames.default([]),
  notes: targetFields.notes.optional(),
  activity: targetFields.activity.default('gather'),
});

/** No defaults here: a field left out of a PATCH stays as it is. */
export const targetUpdateSchema = z.object({
  name: targetFields.name.optional(),
  scientificNames: targetFields.scientificNames.optional(),
  notes: targetFields.notes.nullable().optional(),
});

/**
 * The group of living things a target belongs to. Its model's continental
 * background is drawn mostly from places where people recorded that group,
 * so the map follows the target rather than the roads.
 */
export const samplingGroups = ['plants', 'reptiles', 'mammals', 'fish', 'crustaceans'] as const;
export type SamplingGroup = (typeof samplingGroups)[number];

const groupOfClass: Record<string, SamplingGroup> = {
  Reptilia: 'reptiles',
  Mammalia: 'mammals',
  Actinopterygii: 'fish',
  Malacostraca: 'crustaceans',
};

/** The group most of a target's public records fall in, from their kingdom and class. */
export function samplingGroupOf(records: { kingdom?: string | null; className?: string | null }[]): SamplingGroup | null {
  const counts = new Map<SamplingGroup, number>();
  for (const r of records) {
    const group = r.kingdom === 'Plantae' ? 'plants' : r.className ? groupOfClass[r.className] : undefined;
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  let best: SamplingGroup | null = null;
  for (const [group, count] of counts) if (best === null || count > counts.get(best)!) best = group;
  return best && counts.get(best)! * 2 > records.length ? best : null;
}

export const fishingMethods = ['handline', 'rod', 'spear', 'net', 'trap', 'hand'] as const;
export type FishingMethod = (typeof fishingMethods)[number];
export const fishingMethodLabels: Record<FishingMethod, string> = {
  handline: 'Handline',
  rod: 'Rod',
  spear: 'Spear',
  net: 'Net',
  trap: 'Trap or pot',
  hand: 'By hand',
};
/** Methods that take bait; the others leave the bait out. */
export const baitedMethods: readonly FishingMethod[] = ['handline', 'rod', 'trap'];

export const observationInputSchema = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  targetId: z.string().regex(targetIdPattern),
  kind: z.enum(['presence', 'absence']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable().optional(),
  altitudeM: z.number().min(-1000).max(10_000).nullable().optional(),
  observedAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable().optional(),
  loggedByName: z.string().trim().min(1).max(80).nullable().optional(),
  // Fishing only.
  bait: z.string().trim().min(1).max(80).nullable().optional(),
  method: z.enum(fishingMethods).nullable().optional(),
  catchCount: z.number().int().min(1).max(500).nullable().optional(),
  sizeCm: z.number().gt(0).lt(1000).nullable().optional(),
  kept: z.boolean().nullable().optional(),
});

export const observationBatchSchema = z.object({
  observations: z.array(observationInputSchema).min(1).max(500),
});

export type ObservationInput = z.infer<typeof observationInputSchema>;

export type FieldTarget = {
  id: string;
  name: string;
  scientificNames: string[];
  notes: string | null;
  activity: Activity;
  samplingGroup: SamplingGroup | null;
  presences: number;
  absences: number;
  publicRecords: number;
  latestModelId: string | null;
  latestModelAt: string | null;
};

export type FieldObservation = {
  id: string;
  clientId: string;
  targetId: string;
  kind: 'presence' | 'absence';
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  altitudeM: number | null;
  observedAt: string;
  notes: string | null;
  loggedByName: string | null;
  hasPhoto: boolean;
  bait: string | null;
  method: FishingMethod | null;
  catchCount: number | null;
  sizeCm: number | null;
  kept: boolean | null;
};

export type FieldModelSummary = {
  id: string;
  targetId: string;
  createdAt: string;
  fieldPresences: number;
  fieldAbsences: number;
  publicRecords: number;
  card: ModelCard;
};

export type Importance = { featureId: string; aucDrop: number };

export type Validation = {
  folds: number;
  spatialBlockAuc: number | null;
  fieldFindAuc: number | null;
  heldOutFieldPercentiles: number[];
  heldOutAbsencePercentiles: number[];
  /** Held-out records against places people recorded the same group: finding the target, not the roads. */
  effortAuc?: number | null;
};

export type ScaleCard = {
  presencesField: number;
  presencesPublic: number;
  absences: number;
  background: number;
  windows: number;
  validation: Validation;
  importance: Importance[];
  features: string[];
  l2?: number;
  effortBackground?: number;
  effortGroup?: SamplingGroup | null;
};

export type ModelCard = {
  modelId: string;
  targetId: string;
  createdAtUnix: number;
  registryId: string;
  regional: ScaleCard | null;
  local: ScaleCard | null;
  notes: string[];
};

export type Bounds = { west: number; south: number; east: number; north: number };

/** A ranked place to search, kept on the phone for offline use. */
export type AreaSpot = { lon: number; lat: number; percentile: number };

export type EngineJob = {
  id: string;
  kind: string;
  state: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  message: string;
  error: string | null;
};

export function slugifyTarget(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug.length >= 2 ? slug : `target-${slug || 'x'}`;
}
