/**
 * @mudders/sim — the deterministic kernel (§2c.1). Milestone 1 adds the grid, tick loop, PRNG,
 * registries, entity store and replay. Lint forbids Math.random, Date, DOM, React and content
 * imports in this package.
 */
export { TICK_RATE } from '@mudders/shared';

/** Bumped whenever kernel behaviour changes in a way that alters simulation results. */
export const KERNEL_VERSION = '0.0.0';
