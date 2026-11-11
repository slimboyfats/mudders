import { describe, expect, it } from 'vitest';
import { blastLoss } from '../../../src/testing';

describe('weapon.frag-shell', () => {
  it('hits harder than a Missile dead on', () => {
    expect(blastLoss(null, null, 0, 'weapon.frag-shell')).toBeGreaterThan(
      blastLoss(null, null, 0, 'weapon.missile') + 15,
    );
  });

  it('still hurts a tank 25 cells off, where a Missile barely scratches it', () => {
    const frag = blastLoss(null, null, 25, 'weapon.frag-shell');
    expect(frag).toBeGreaterThan(25);
    expect(frag).toBeGreaterThan(blastLoss(null, null, 25, 'weapon.missile') * 2);
  });
});
