/**
 * @mudders/sim — the deterministic kernel (§2c.1): grid, tick loop, PRNG, registries, entity store,
 * content resolution and replay. Lint forbids Math.random, Date, DOM, React and content imports.
 */
export { TICK_RATE } from '@mudders/shared';
export { KERNEL_VERSION } from './version';
export * from './prng';
export * from './fixed';
export * from './hash';
export * from './grid';
export * from './materials';
export * from './settle';
export * from './debris';
export * from './scratch';
export * from './behaviours';
export * from './content/resolve';
export * from './world';
export * from './replay';
export * from './scenario';
export * from './reactions';
export * from './groups';
