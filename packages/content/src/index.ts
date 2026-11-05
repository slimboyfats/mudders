import { resolveContent, type ResolvedContent } from '@mudders/sim';
import { discoverContent } from './glob';

export { discoverContent, behaviourPaths } from './glob';

let cached: ResolvedContent | undefined;

/** Resolve every shipped pack once (throws ContentError listing every problem). */
export function loadContent(): ResolvedContent {
  cached ??= resolveContent(discoverContent());
  return cached;
}
