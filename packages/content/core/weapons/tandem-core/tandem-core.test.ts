import { describe, expect, it } from 'vitest';
import { blastLoss } from '../../../src/testing';

describe('weapon.tandem-core', () => {
  it('is a heavy blast on its own', () => {
    expect(blastLoss(null, null, 0, 'weapon.tandem-core')).toBeGreaterThan(70);
  });
});
