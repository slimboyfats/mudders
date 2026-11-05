import type { Replay, TimedInput } from '@mudders/shared';
import type { ResolvedContent } from './content/resolve';
import { KERNEL_VERSION } from './version';
import { World, type WorldOptions } from './world';

/** Feed timed inputs into a world for `ticks` ticks. Inputs are applied in log order. */
export function runInputs(world: World, inputs: readonly TimedInput[], ticks: number): void {
  let next = 0;
  const sorted = [...inputs].sort((a, b) => a.t - b.t);
  for (let i = 0; i < ticks; i++) {
    while (next < sorted.length && sorted[next]!.t <= world.tick) {
      const inp = sorted[next++]!;
      world.applyInput(inp.player, inp.action);
    }
    world.step();
  }
}

export function makeReplay(
  content: ResolvedContent,
  opts: WorldOptions,
  inputs: TimedInput[],
): Replay {
  return {
    replayVersion: 1,
    kernelVersion: KERNEL_VERSION,
    contentHash: content.hash,
    seed: opts.seed,
    mode: opts.mode,
    players: opts.players,
    inputs,
  };
}

/** Re-simulate a replay. Refuses a content hash mismatch (§2c.4). */
export function playReplay(content: ResolvedContent, replay: Replay, ticks: number): World {
  if (replay.contentHash !== content.hash) {
    throw new Error(
      `replay content hash ${replay.contentHash} does not match loaded content ${content.hash}`,
    );
  }
  const world = new World(content, {
    seed: replay.seed,
    mode: replay.mode,
    players: replay.players,
  });
  runInputs(world, replay.inputs, ticks);
  return world;
}
