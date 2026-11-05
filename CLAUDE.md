# CLAUDE.md — Mudders

Mudders is a browser-based, turn-based artillery game on fully destructible terrain: an original
spiritual successor to the 1991 DOS game, not a copy. _Set the mud on fire._

- **Spec**: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) is the source of truth. Milestones are in §11.
- **Architecture**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data flow, determinism rules, net protocol.
- When this file and the requirements disagree, the requirements win; fix this file.

## Commands

Run from the repo root. Everything works in a GPU-less, display-less cloud container after `pnpm install`.

One command per line, and no column-aligned tables in shared docs: parallel threads add lines here, and
an aligned table reflows every row when one cell grows, which turns two additions into a conflict.

- `pnpm dev`: Client (Vite, :5173) + signalling server (:8787) together
- `pnpm test`: Vitest across all packages, with the sim coverage gate (≥ 80%)
- `pnpm lint` / `pnpm format`: ESLint (incl. determinism rules) / Prettier write
- `pnpm typecheck`: `tsc` in every package
- `pnpm check`: lint + format check + typecheck + content:validate + test (run before calling anything done)
- `pnpm build`: Build all packages; client to `packages/client/dist`
- `pnpm smoke`: Headless Chromium + SwiftShader renders a WebGL2 triangle, writes `captures/smoke-webgl2.{png,gif}`
- `pnpm check:ffmpeg`: Verifies ffmpeg is installed, with install instructions if not
- `pnpm determinism:browsers`: golden hashes in headless Chromium, Firefox and WebKit must equal `golden.json` (~10 s)
- `pnpm setup:browsers`: installs headless Firefox + WebKitGTK from the Ubuntu archive (idempotent; run by the above)
- `pnpm bench`: §9 sim benchmarks vs `packages/content/bench/baseline.json` (`-- --update` to rebaseline)
- `pnpm content:validate`: Schemas, `use`/`extends` resolution, tests + scenario stubs per item, id lock, docs up to date
- `pnpm content:new <t> <n>`: Scaffold a content item (manifest, test, scenario stub, behaviour for code types)
- `pnpm content:docs`: Regenerate `docs/WEAPONS.md` from manifests
- `pnpm capture <scenario>`: Scenario → real pixel renderer in headless Chromium → `captures/<id>-<time>.mp4` + sheet + JSON
- `pnpm capture weapon-showcase <weapon-id>`: Preset: fire the weapon at three ranges on the standard map (`--help` for options)
- `pnpm play:smoke`: Built client on emulated iPhone 14 / S23+ / laptop: slingshot aim, fire, turn passes; PWA manifest + offline reload; screenshots
- `pnpm play:net`: Built client + real signal server, two headless browsers: P2P, relay, copy-paste and public (browse, hidden host, AI takeover, rejoin) matches, reconnect, reload, 0 desyncs; screenshots (`PLAY_NET_RUNS=public` runs one)
- `pnpm sim:preview [ids]`: CPU debug render of scenarios (sim-only sanity check; not the game's look)
- `pnpm verify`: check + bench + build + smoke + play:smoke + play:net + determinism:browsers: **run before every push** (no CI on GitHub)

`pnpm capture` writes MP4 only by default (about 5× smaller than GIF); add `--gif` when a GIF fits
better. `--diff` compares the sheet with `captures/reference/` (update with `--update-reference` and
commit). Identical inputs give byte-identical frames and hit the capture cache.

Golden determinism hashes live in `packages/content/golden.json`. If a change is _meant_ to alter
sim results, regenerate with `UPDATE_GOLDEN=1 pnpm test` and bump the behaviour/pack version.

## Packages

| Package            | Role                                                                              | May import  |
| ------------------ | --------------------------------------------------------------------------------- | ----------- |
| `@mudders/shared`  | Types, Zod schemas (manifests, protocol), constants, effect-event types           | zod         |
| `@mudders/sim`     | Deterministic **kernel**: grid, tick loop, PRNG, registries, entity store, replay | shared      |
| `@mudders/content` | Content packs, one folder per item (`packages/content/core/...`)                  | shared, sim |
| `@mudders/client`  | Vite + React 19 UI, renderer(s), HUD, WebRTC, audio                               | anything    |
| `@mudders/capture` | Headless capture CLI (Playwright + SwiftShader + ffmpeg)                          | anything    |
| `@mudders/signal`  | Hono WebSocket signalling + lobby server                                          | shared      |

## Hard rules

1. **TypeScript strict, no `any`.** `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
2. **Determinism.** `sim` and `content` must stay free of `Math.random`, `Date`/`performance`, timers,
   DOM, React and the renderer. Use the match PRNG and the tick counter. No transcendental `Math.*`
   (`sin/cos/atan2/pow/...`) in the sim: prefer integer/fixed-point, especially for anything that
   touches the grid. No iteration over `Map`/`Set`/object keys where order matters. ESLint enforces
   most of this; review enforces the rest.
3. **The kernel never imports content.** New behaviour is a content module under a new id, never a
   special case in the kernel. If a change needs the sim to know which renderer is mounted, it's wrong.
4. **Reference + override, never copy.** Content items `use`/`extends` reusable items (explosions,
   flights, trails, effect and audio profiles) and override only what differs.
5. **Content ids are permanent.** Never change what an existing id does within a released pack version;
   add a new id or bump the pack version.
6. **Every content item** ships with a manifest, a test, a scenario stub, and passes `pnpm content:validate`.
7. **Hot paths use typed arrays.** Grid and secondary layers are `Uint8Array`s; flood fills use
   preallocated `Int32Array` queues and `Uint8Array` masks. No objects per cell, no `Set`/`Map`,
   closures or `forEach` in hot loops, every op bounded by its dirty region (§9).
8. **Browser target is Baseline 2026** (root `browserslist`). Use any Baseline 2026 feature with no
   polyfill or feature check. Anything newer (WebGPU, etc.) goes behind a runtime check with a
   Baseline fallback. WebGL2 is the floor, and shaders must run on SwiftShader.
9. **Audio is chiptune only** (§8b): tracker modules via a module player (e.g. `chiptune3`) and/or Web
   Audio synth SFX. No sampled real-world audio, no ripped modules; record each asset's licence.
10. **Original content only.** No names, art, text or audio from the original game or anything else.
11. **No GitHub Actions.** To save build minutes nothing runs on GitHub. Run `pnpm verify` locally
    before every push and before claiming a task done, and say what you ran. If something fails after
    pushing, fix it in the session; don't add workflows.

## Visual review (mandatory)

For any change to a weapon, explosion, terrain op, effect, theme or the renderer: run `pnpm capture`
on the relevant scenario (or `pnpm capture weapon-showcase <weapon-id>`), attach the MP4 and the
`-sheet.png`, and ask a one-line "approve / refuse?" before calling the task done. For HUD/layout
changes attach `pnpm play:smoke` screenshots. Post media in the thread as soon as something visible
works, marked work in progress, before the full verify (Joel's preference); still verify before
pushing. Effects stay on the pixel grid: snap to map cells, hard bands or dither, no smooth glows.

## Things a cloud agent cannot verify

Real-device fps, touch feel, iOS Safari quirks and WebRTC over real NATs. Never claim these. Tag the
task `needs-device`, give the deploy preview URL, and list what to check by hand.

## Workflow notes

- Captures go to `captures/` (gitignored). Only `captures/reference/` (regression baselines) is committed.
- Deploy previews are not wired up yet. When they are, use the static host's own Git integration
  (e.g. Cloudflare Pages builds on its side), not GitHub Actions.
- TypeScript is pinned to 6.x because typescript-eslint does not support TS 7 yet.
- Playwright is pinned to the version preinstalled in cloud sessions (`PLAYWRIGHT_BROWSERS_PATH`);
  do not run `playwright install` there.
