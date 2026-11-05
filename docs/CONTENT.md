# Adding content

How to add a weapon, material, generator, terrain op or mode. The rules are REQUIREMENTS §2c; this
is the practical version.

## 1. Scaffold

```sh
pnpm content:new weapon sticky-bomb      # or material | gen | flight | explosion | terrainop | mode
```

This writes `packages/content/core/<folder>/<name>/manifest.json`, a test, a `behaviour.ts` for code
types (gen, flight, terrainop), a scenario stub at `scenarios/<id>.json`, and adds the id to
`core/pack.json` and `core/ids.lock.json`.

## 2. Reference and override, never copy

Point at existing building blocks and change only what differs:

```json
"impact": [{ "explosion": { "use": "explosion.standard", "radius": 12, "damage": 30 } }]
```

or inherit a whole item: `"extends": "weapon.missile"` (shallow merge: a top-level key you set
replaces the base's). `weapon.baby-missile` is the reference example. The loader resolves all of
this into flat manifests at startup; missing or cyclic references fail `content:validate`.

## 3. Code only when data can't say it

A `behaviour.ts` gets the `SimApi` (grid, material tables, match RNG, scratch buffers, tanks,
`launch`, `emit`) and nothing else: no `Math.random`, `Date`, DOM or transcendental `Math.*` (lint
enforces it). Use typed arrays and bounded loops (CLAUDE.md hard rule 7). Validate parameters with
a `z.strictObject` and bump `version` whenever results change.

## 4. Prove it

- Fill in the generated test (`pnpm test`).
- Make the scenario show the item, then `pnpm sim:preview <id>` and post the GIF/sheet.
- `pnpm content:docs` if you touched a weapon, then `pnpm content:validate`.
- If results of existing scenarios changed on purpose: `UPDATE_GOLDEN=1 pnpm test`.
- `pnpm verify` before pushing.
