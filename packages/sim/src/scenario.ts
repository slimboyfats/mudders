import type { Scenario, TimedInput } from '@mudders/shared';
import type { ResolvedContent } from './content/resolve';
import { World } from './world';

/**
 * Runs a scenario (§2d) deterministically. Each input is held until `tick ≥ t` **and** it is that
 * player's turn to aim, so multi-shot scenarios don't need to know how long a shot takes to
 * resolve. Used by the milestone-1 frame dump and, later, the capture CLI.
 */
export class ScenarioDriver {
  readonly world: World;
  private readonly queue: TimedInput[];
  private quietSince = -1;

  constructor(
    content: ResolvedContent,
    readonly scenario: Scenario,
  ) {
    this.world = new World(content, {
      seed: scenario.seed,
      mode: scenario.mode,
      players: scenario.players,
      map: scenario.map,
      tankColumns: scenario.tanks?.map((t) => t.x),
      tanks: scenario.tanks?.map((t) => t.tank),
      tankSetup: scenario.tanks?.map((t) => ({ health: t.health, inventory: t.inventory })),
      wind: scenario.wind,
      weather: scenario.weather,
      turnOrder: scenario.turnOrder,
      bots: scenario.bots,
      teams: scenario.teams,
      rules: scenario.rules,
      props: scenario.props,
    });
    this.queue = [...scenario.inputs].sort((a, b) => a.t - b.t);
  }

  /** True once the capture window is over. */
  get done(): boolean {
    const w = this.world;
    const c = this.scenario.capture;
    if (w.tick >= c.maxTicks) return true;
    if (!c.untilSettled || this.queue.length > 0) return false;
    return this.quietSince >= 0 && w.tick - this.quietSince >= c.extraTicks;
  }

  step(): void {
    const w = this.world;
    // Apply, in log order, every input whose time has come and whose player is up. Inputs for
    // other players stay queued (a later player's input never blocks an earlier one).
    for (let i = 0; i < this.queue.length;) {
      const next = this.queue[i]!;
      if (next.t > w.tick) break;
      const shopInput = next.action.type === 'buy' || next.action.type === 'ready';
      const ready =
        w.phase === 'over' ||
        (shopInput ? w.phase === 'shop' : w.phase === 'aim' && w.activePlayer === next.player);
      if (!ready) {
        i++;
        continue;
      }
      this.queue.splice(i, 1);
      w.applyInput(next.player, next.action);
      if (next.action.type === 'fire') break;
    }
    w.step();
    const botUp = w.phase === 'aim' && (w.tanks[w.activePlayer]?.bot ?? -1) >= 0;
    const settled =
      ((w.phase !== 'resolve' && w.quiet) || w.phase === 'over' || w.phase === 'shop') && !botUp;
    if (settled && this.queue.length === 0) {
      if (this.quietSince < 0) this.quietSince = w.tick;
    } else {
      this.quietSince = -1;
    }
  }
}
