/** Shape of `packages/content/golden.json`, also what each browser reports back. */
export interface GoldenHashes {
  contentHash: string;
  scenarios: Record<string, { ticks: number; hash: string }>;
}

/** What the determinism page POSTs to `/result`. */
export type BrowserRun =
  | { userAgent: string; ms: number; result: GoldenHashes; repeatMatches: boolean }
  | { userAgent: string; error: string };
