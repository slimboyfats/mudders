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
  /** Shop (§3.6): buy `packs` packs of a weapon at this round's price. */
  z.strictObject({
    type: z.literal('buy'),
    item: ContentIdSchema,
    packs: z.number().int().min(1).max(99),
  }),
  /** Shop: done shopping. The next round starts when every human is ready or the timer runs out. */
  z.strictObject({ type: z.literal('ready') }),
  /**
   * AI takeover (§6.1): an `ai.*` personality plays this player's tank (a disconnected human), or
   * `null` hands it back. Only the host issues it; it is stamped and logged like any other input.
   */
  z.strictObject({ type: z.literal('takeover'), bot: ContentIdSchema.nullable() }),
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
