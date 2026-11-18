# Training mode

Endless target practice with a coach. Start screen → **Training** (`#training`; `#training/<seed>`
draws a set first range, for screenshots and tests). Client-only: no sim or protocol change.

## How it works

- `packages/client/src/game/training.ts`: `rangeFor(seed, wind)` draws a range as a solo
  challenge (`Challenge`) and `challengeOptions` turns it into ordinary `WorldOptions`: a small
  800x400 map from open generators (hills, village, badlands, lakeland, glacier, clay pits,
  marsh), you and one still target 260 to 560 cells apart, on either side, endless missiles.
  `trainingRange` skips seeds a plain missile can't hit from the start.
- Wind: Calm (0), Steady (one fixed wind per range) or Shifting (`perTurn`, a new wind each turn,
  no gusts inside a turn). Choice and the coach fold are kept in localStorage `mudders.training.v1`.
- `TrainingRun` watches the world like the challenge referee. When your shell leaves the barrel
  (first `resolve` tick of your turn) it reads the shot with `reportShot`, before the shell
  changes the ground. Once it is your turn again it asks `suggestAim` for an aim that hits from
  where you stand now, in the wind you face now, and builds the card with `coach`.
- `packages/client/src/game/coach.ts` uses only `World.predict` (the bots' read-only predictor,
  exact for the first impact in the base wind). The still-air comparison sets `windBase` to 0 for
  one prediction and puts it back in a `finally`; a test checks the world hash is unchanged.

## Tank grid and shot paths

- `ui/training-overlay.ts` (`TrainingOverlay`, a `FrameOverlay` that MatchView calls from its frame
  loop) draws on a 2D canvas over the map, redrawn only when the camera, the paths or the grid
  switch change. Nothing camera-linked goes through React state.
- **Tank grid** (toggle, saved in prefs): lines one tank width apart (`Tank.w`, 16 cells for the
  classic tank) counted out from your tank, every 5th brighter and numbered.
- **Shot paths**: `TrainingRun` follows the first shell of each of your shots through
  `World.projectiles` (read only) and keeps the last 3 flights as dotted paths with a cross where
  they came down, newest brightest. They stay until New range.
- The coach counts distances in tanks (`tanks()`: "less than a tank", "2½ tanks"), not cells.

## What the coach says

- Headline: Direct hit, Close (within 14 cells), N tanks short / long, Wrong way, Own goal.
- Why: how far the wind held the shell back or carried it on (compared with the same aim in
  still air), "in still air that was a direct hit", the high ground in front of the target, and
  how far 50 power moves the landing at this angle.
- Next: the nearest aim that hits, worded as one change where possible (keep the angle and add
  about N power; keep the power and go steeper/flatter), a bracket ("one short, one long: split
  the difference") and a note when the wind has changed.
- Tip: a rule of thumb for the case (into the wind go flatter and harder, lob over hills, change
  one thing at a time…). "Set it for me" sends the suggested aim as a normal `aim` input.

## Next ideas

- The coach in ordinary local matches against bots (a Settings switch).
- Drills: a set ladder of ranges (lob only, strong headwind, moving target).
