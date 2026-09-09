import { z } from 'zod';

/**
 * Content packs are data, not code. Every pack is validated against a schema at
 * load time so a malformed or truncated source file fails loudly in tests and
 * CI instead of rendering as an empty screen.
 *
 * Every pack carries provenance. See docs/SOURCE_MAP.md for what each licence
 * value permits.
 */
export const sourceLicenseSchema = z.enum([
  'user-authored-personal',
  'public-domain',
  'third-party-permission-required',
  'third-party-no-redistribution',
]);

export const resetDaySchema = z.object({
  day: z.int().min(1),
  wake: z.string().regex(/^\d{2}:\d{2}$/),
  waterLiters: z.number().positive(),
  workout: z.string().nullable(),
  pushUps: z.int().nullable(),
  runKm: z.number().nullable(),
  meditationMinutes: z.int().nullable(),
  readingPages: z.int().nullable(),
  studyHours: z.number().nullable(),
  coldShower: z.boolean(),
  socialMediaMinutes: z.int().nullable(),
});

export const resetProgramSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceTitle: z.string(),
  source: z.string(),
  sourceLicense: sourceLicenseSchema,
  provenanceNote: z.string(),
  editable: z.literal(true),
  optInModules: z.array(z.string()),
  days: z.array(resetDaySchema).min(1),
});

export type ResetDay = z.infer<typeof resetDaySchema>;
export type ResetProgram = z.infer<typeof resetProgramSchema>;
