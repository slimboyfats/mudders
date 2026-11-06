import { describe, expect, it } from 'vitest';
import { MUSHROOM_AFTER, drawMushroom, makeMushroom } from './mushroom';
import type { QuadBatch } from './batch';

/** Records pushes instead of drawing. */
function recorder(): { batch: QuadBatch; calls: number[][] } {
  const calls: number[][] = [];
  const batch = { push: (...a: number[]) => void calls.push(a) } as unknown as QuadBatch;
  return { batch, calls };
}

describe('mushroom cloud', () => {
  it('is deterministic and ends after its life', () => {
    const a = recorder();
    const b = recorder();
    const n1 = recorder();
    const m = makeMushroom(200, 220, 72, 10, 1234, 90);
    expect(drawMushroom(m, a.batch, n1.batch, 80)).toBe(true);
    expect(drawMushroom(makeMushroom(200, 220, 72, 10, 1234, 90), b.batch, n1.batch, 80)).toBe(
      true,
    );
    expect(a.calls.length).toBeGreaterThan(100);
    expect(a.calls).toEqual(b.calls);
    // the cap stays on the map
    for (const c of a.calls) expect(c[1]!).toBeGreaterThan(0);
    expect(drawMushroom(m, a.batch, n1.batch, 10 + 90 + MUSHROOM_AFTER + 1)).toBe(false);
  });
});
