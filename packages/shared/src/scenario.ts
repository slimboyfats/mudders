import { z } from 'zod';
import { ContentIdSchema } from './content/manifests';
import { TimedInputSchema } from './input';

/**
 * Data-driven scenario (§2d). Every content item ships a stub in `scenarios/<id>.json`; the
 * milestone-1 frame dump (`pnpm sim:preview`) and the milestone-2 capture CLI both run these.
 */
export const ScenarioSchema = z.strictObject({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  description: z.string().min(1),
  /** Content item the scenario showcases, if any. */
  subject: ContentIdSchema.optional(),
  mode: ContentIdSchema,
  /** Theme the capture renders with (`theme.*`; cosmetic, the sim ignores it). */
  theme: ContentIdSchema.optional(),
  seed: z.number().int().min(0).max(0xffffffff),
  players: z.number().int().min(1).max(8),
  map: z
    .strictObject({
      generator: ContentIdSchema.optional(),
      width: z.number().int().min(64).optional(),
      height: z.number().int().min(64).optional(),
    })
    .optional(),
  /** Force tank columns instead of the generator's placement. */
  tanks: z
    .array(
      z.strictObject({
        x: z.number().int().min(0),
        /** Starting health instead of the mode's. */
        health: z.number().int().min(1).optional(),
        /** Inventory overrides by weapon id (-1 = unlimited, 0 = none); others keep the loadout. */
        inventory: z.record(ContentIdSchema, z.number().int().min(-1)).optional(),
      }),
    )
    .optional(),
  /** Props placed at fixed columns (showcases), on top of whatever the generator places. */
  props: z.array(z.strictObject({ prop: ContentIdSchema, x: z.number().int().min(0) })).optional(),
  /** Force the turn order instead of the mode's (e.g. so player 0 shoots first). */
  turnOrder: z.array(z.number().int().min(0)).optional(),
  /** Force wind (cells/tick²) for the whole scenario. */
  wind: z.number().optional(),
  /** Team per player (milestone 7); omit for a free-for-all. */
  teams: z.array(z.number().int().min(0).max(7)).optional(),
  /** AI personality per player (`ai.*`, null = scripted by `inputs`). */
  bots: z.array(ContentIdSchema.nullable()).optional(),
  /** Match-rule overrides (rounds, timers…), as the setup screen would set them. */
  rules: z
    .strictObject({
      rounds: z.number().int().min(1).optional(),
      turnTimer: z.number().min(0).optional(),
      shopTimer: z.number().min(1).optional(),
      suddenDeath: z.boolean().optional(),
      windType: z.enum(['none', 'constant', 'perTurn']).optional(),
      startingCash: z.number().int().min(0).optional(),
      turnCap: z.number().int().min(1).optional(),
    })
    .optional(),
  inputs: z.array(TimedInputSchema),
  capture: z.strictObject({
    /** Hard stop. */
    maxTicks: z.number().int().min(1),
    /** Stop once the world is quiet (no projectiles, ops, settling or falling tanks)… */
    untilSettled: z.boolean(),
    /** …plus this many ticks. */
    extraTicks: z.number().int().min(0),
  }),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
