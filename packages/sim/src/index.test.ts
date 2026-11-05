import { describe, expect, it } from 'vitest';
import { KERNEL_VERSION, TICK_RATE } from './index';

describe('sim kernel scaffold', () => {
  it('exposes a kernel version and the fixed tick rate', () => {
    expect(KERNEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(TICK_RATE).toBe(60);
  });
});
