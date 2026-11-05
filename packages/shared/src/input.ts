import { z } from 'zod';
import { ContentIdSchema } from './content/manifests';

/**
 * Player inputs (§6.3). Game state advances only through `applyInput(player, input)` and `tick()`,
 * so these are also what peers exchange in lockstep and what replays record.
 */
export const InputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('aim'),
    /** Degrees, 0 = right, 90 = straight up, 180 = left. */
    angle: z.number().int().min(0).max(180),
    power: z.number().int().min(0).max(1000),
  }),
  z.strictObject({ type: z.literal('selectWeapon'), weapon: ContentIdSchema }),
  z.strictObject({ type: z.literal('fire') }),
]);
export type Input = z.infer<typeof InputSchema>;

export const TimedInputSchema = z.strictObject({
  /** Tick at which the input is applied (before that tick is simulated). */
  t: z.number().int().min(0),
  player: z.number().int().min(0),
  action: InputSchema,
});
export type TimedInput = z.infer<typeof TimedInputSchema>;

/** A replay is the seed, content hash and input log; the sim reproduces everything else. */
export const ReplaySchema = z.strictObject({
  replayVersion: z.literal(1),
  kernelVersion: z.string(),
  contentHash: z.string(),
  seed: z.number().int().min(0).max(0xffffffff),
  mode: ContentIdSchema,
  players: z.number().int().min(1),
  inputs: z.array(TimedInputSchema),
});
export type Replay = z.infer<typeof ReplaySchema>;
