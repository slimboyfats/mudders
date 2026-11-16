import { describe, expect, it } from 'vitest';
import type { RenderSnapshot, TankView } from '@mudders/shared';
import { MAX_BUBBLES, SpeechTracker, lineFor, speechHash } from './speech';
import { textWidth } from './callouts';

interface T {
  player: number;
  health?: number;
  alive?: boolean;
  active?: boolean;
  bot?: string;
}

function snap(tick: number, tanks: T[], turn = 1): RenderSnapshot {
  const entities = tanks.map(
    (t) =>
      ({
        kind: 'tank',
        player: t.player,
        x: 100 * (t.player + 1),
        y: 200,
        health: t.health ?? 100,
        maxHealth: 100,
        alive: t.alive ?? (t.health ?? 100) > 0,
        active: t.active ?? false,
        ...(t.bot ? { bot: t.bot } : {}),
      }) as unknown as TankView,
  );
  return { tick, turn, entities } as unknown as RenderSnapshot;
}

const BOTS = ['ai.moron', 'ai.cyborg', 'ai.poolshark', 'ai.tosser', 'ai.shooter', 'ai.unknown'];
const KINDS = ['turn', 'miss', 'hurt', 'phew', 'dying', 'gloat', 'oops', 'dodge'] as const;

describe('SpeechTracker', () => {
  it('gives a dying bot last words and its killer a gloat (both sure or likely)', () => {
    let gloats = 0;
    for (let k = 0; k < 40; k++) {
      const s = new SpeechTracker();
      const t0 = k * 1000;
      s.ingest(
        snap(t0, [
          { player: 0, active: true, bot: 'ai.cyborg' },
          { player: 1, bot: 'ai.moron' },
        ]),
      );
      s.ingest(
        snap(t0 + 1, [
          { player: 0, bot: 'ai.cyborg' },
          { player: 1, bot: 'ai.moron' },
        ]),
      );
      s.ingest(
        snap(t0 + 2, [
          { player: 0, bot: 'ai.cyborg' },
          { player: 1, health: 0, bot: 'ai.moron' },
        ]),
      );
      expect(s.bubbles.some((b) => b.player === 1 && b.kind === 'dying')).toBe(true);
      if (s.bubbles.some((b) => b.player === 0 && b.kind === 'gloat')) gloats++;
    }
    expect(gloats).toBeGreaterThan(20);
  });

  it('never makes humans talk', () => {
    const s = new SpeechTracker();
    for (let i = 0; i < 50; i++) {
      s.ingest(
        snap(i * 3, [
          { player: 0, active: i % 2 === 0 },
          { player: 1, health: 100 - i },
        ]),
      );
    }
    expect(s.bubbles).toHaveLength(0);
  });

  it('keeps at most a couple of bubbles up and drops them once read', () => {
    const s = new SpeechTracker();
    const bots = [0, 1, 2, 3].map((p) => ({ player: p, bot: 'ai.moron' }));
    s.ingest(
      snap(
        0,
        bots.map((b) => ({ ...b, active: b.player === 0 })),
      ),
    );
    s.ingest(snap(1, bots));
    s.ingest(
      snap(
        2,
        bots.map((b) => ({ ...b, health: b.player === 0 ? 100 : 0 })),
      ),
    );
    expect(s.bubbles.length).toBeLessThanOrEqual(MAX_BUBBLES);
    s.ingest(
      snap(
        2000,
        bots.map((b) => ({ ...b, health: b.player === 0 ? 100 : 0 })),
      ),
    );
    expect(s.bubbles).toHaveLength(0);
  });

  it('picks the same line for the same moment (online clients agree)', () => {
    expect(speechHash(120, 2, 3)).toBe(speechHash(120, 2, 3));
    expect(speechHash(120, 2, 3)).not.toBe(speechHash(121, 2, 3));
  });

  it('only uses letters the pixel font has, in lines that fit a phone', () => {
    for (const bot of BOTS)
      for (const kind of KINDS)
        for (let r = 0; r < 64; r++) {
          const line = lineFor(bot, kind, r);
          expect(line).toMatch(/^[A-Z0-9 !?.,':-]+$/);
          expect(textWidth(line)).toBeLessThanOrEqual(72);
        }
  });
});
