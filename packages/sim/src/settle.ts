import { FP } from '@mudders/shared';
import type { DebrisPool } from './debris';
import { pushSurface, surfaceFlowStep } from './flow';
import type { Grid } from './grid';
import {
  AGE_MASK,
  SETTLE_FALL,
  SETTLE_FLOW,
  SETTLE_SLIDE,
  SETTLE_STATIC,
  type MaterialTable,
} from './materials';

/** Terminal fall speed in cells per tick. */
export const MAX_FALL_SPEED = 8;
/** How far a resting liquid looks sideways for a drop to run to. */
const DROP_LOOK = 32;

/** Liquid sideways speed is kept in 1/FLOW_Q cells per tick (`Grid.flowVel`). */
const FLOW_SHIFT = 3;
const FLOW_Q = 1 << FLOW_SHIFT;
/** Speed a liquid loses per cell its momentum carries it up (a bank, or the liquid ahead). */
const CLIMB_COST = 12;
/** Chance in 8 per tick that a slow liquid loses one more step of speed. */
const FLOW_DRAG = 4;
/** Speed a liquid gains per cell it runs downhill. */
const FLOW_FALL = 5;

/** Up to this many liquid cells moving in a tick are a trickle (a turn doesn't wait for it). */
const TRICKLE = 6;

/** Loosen steps a sliding grain of sand gives the dirt it drags at (see `repose`). */
const DRAG_STEPS = 10;

/** Chance in 8 that a grain sliding over different loose-able ground drags the cell under it along. */
const DRAG_CHANCE = 3;

/** How many cells deep a sliding grain can churn into different loose ground under it. */
const CHURN_DEPTH = 3;

/** `Grid.fallVel` holds a cell's motion: fall speed in the low nibble, slide speed and side above. */
const FALL_MASK = 15;
const SLIDE_SHIFT = 4;
/** Fastest a grain slides, in speed steps; it covers `1 + speed / 2` cells a tick. */
const SLIDE_MAX = 7;
/** Bit set when the slide heads left. */
const SLIDE_LEFT = 128;
/** Fall speed from which a landing counts as an impact (the grain and what it hits shake loose). */
const IMPACT_MIN = 5;
/** Fall speed from which a landing shakes the grain and the ground under it loose. */
const SHAKE_MIN = 6;
/** Loosen steps a hard landing leaves a grain with: enough to start it down a slope. */
const IMPACT_LOOSE = 3;
/** How far a grain inside a mass that lands hard looks sideways for open air to be pressed toward. */
const PRESS_LOOK = 24;
/** Fall speed from which a grain landing at the edge of a fall may bounce off as spray. */
const SPRAY_MIN = 6;

/**
 * Cells that moved up or sideways in the current pass, by pass number, so the scan (which has not
 * reached them yet) leaves them alone. Transient within one call: entries are cleared as they are
 * read and the pass number is never reused, so nothing carries over between ticks or worlds.
 */
let stamp = new Int32Array(0);
let pass = 0;

/**
 * One settle step (§4.3) over the grid's settle region only. Unsupported `fall`/`slide`/`flow`
 * cells accelerate downward (1 cell/tick² up to MAX_FALL_SPEED), `slide` cells also move one cell
 * diagonally when blocked, `flow` cells sideways. A `fall` cell with air on both sides (the top of a
 * one-cell spire) topples diagonally, so debris doesn't leave needles standing, and one a blast
 * shook loose slumps off any slope steeper than its material's `repose`. Scans bottom-up so a moved cell is never moved
 * twice in a tick. At most `maxCells` cells move per tick; the rest continue next tick.
 *
 * Materials with `glide` keep their momentum. A grain that slides gains speed down a slope and
 * runs on over level ground until friction or something in its way stops it; one
 * that runs off a ledge keeps drifting that way as it falls; one that lands hard is shaken loose
 * (as is the loose ground it hits) and its fall turns into a slide down the open side, so a
 * fallen mass spreads into a heap with a run-out instead of standing as the block it fell as. At
 * the edge of a hard landing some grains bounce off as debris. All of this needs the `debris`
 * pool: without one (map generation, which settles the land it builds) nothing keeps momentum.
 *
 * Returns the number of cells moved. Shrinks the settle region to what may still move.
 */
export function settleStep(
  grid: Grid,
  mats: MaterialTable,
  tick: number,
  maxCells: number,
  debris?: DebrisPool,
): number {
  surfaceFlowStep(grid, mats);
  if (!grid.settling) return 0;
  if (stamp.length < grid.size) stamp = new Int32Array(grid.size);
  pass = pass >= 0x7ffffff0 ? 1 : pass + 1;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const coat = grid.coating;
  const gas = grid.gas;
  const state = grid.cellState;
  const vel = grid.fallVel;
  // a liquid cell that momentum moved along or up a row is stamped, so the scan doesn't meet
  // and move it again this tick (1..128; a stale stamp costs a cell one tick at worst)
  const ts = (tick & 127) + 1;
  let wetLive = false;
  let wetMoved = 0;
  let seenMin = W;
  let seenMax = -1;
  const group = grid.group;
  const shade = grid.shade;
  const kind = mats.settle;
  const density = mats.density;
  const spread = mats.spread;
  const disperse = mats.disperse;
  const repose = mats.repose;
  const glide = mats.glide;
  // map generation settles without a pool, and without momentum: the land forms as it always did
  const live = debris !== undefined;
  const act = mats.active;
  const turns = mats.decayTurns;
  const x0 = grid.settleMinX;
  const x1 = grid.settleMaxX;
  const span = x1 - x0;
  let nMinX = W;
  let nMaxX = -1;
  let nMaxY = -1;
  let nMinY = H;
  let moved = 0;
  let capped = false;
  // grains held up behind moving ones keep the region alive without having moved
  let waiting = false;
  const ltr = (tick & 1) === 0;

  rows: for (let y = Math.min(grid.settleMaxY, H - 2); y >= 0; y--) {
    const row = y * W;
    for (let i = 0; i <= span; i++) {
      const x = ltr ? x0 + i : x1 - i;
      const idx = row + x;
      const m = mat[idx]!;
      if (m === 0) continue;
      const k = kind[m]!;
      // intact prop groups hold their cells in place whatever the material (§4c)
      if (k === SETTLE_STATIC || group[idx] !== 0) continue;
      if (k === SETTLE_FLOW && disperse[m]! > 1) {
        // runny liquids have their own rules (momentum), unless they sink into a lighter one
        if (x < seenMin) seenMin = x;
        if (x > seenMax) seenMax = x;
        const ml = mat[idx + W]!;
        if (ml === 0 || kind[ml] !== SETTLE_FLOW || density[ml]! >= density[m]!) {
          const r = liquidCell(grid, mats, idx, x, y, m, ml, tick, ts, ltr);
          if (r !== 0) {
            if (outMinX < nMinX) nMinX = outMinX;
            if (outMaxX > nMaxX) nMaxX = outMaxX;
            if (outMinY < nMinY) nMinY = outMinY;
            if (outMaxY > nMaxY) nMaxY = outMaxY;
            if (r === 1) wetLive = true;
            else if ((++wetMoved, ++moved >= maxCells)) {
              capped = true;
              break rows;
            }
          }
          continue;
        }
      }
      const below = idx + W;
      let dst = -1;
      let dy = 0;
      const mb = mat[below]!;
      if (mb !== 0 && kind[mb] === SETTLE_FLOW && density[mb]! < density[m]!) {
        // heavier cells sink through lighter liquids: swap with the cell below
        mat[idx] = mb;
        mat[below] = m;
        const cs = coat[idx]!;
        coat[idx] = coat[below]!;
        coat[below] = cs;
        const ss = state[idx]!;
        state[idx] = state[below]!;
        state[below] = ss;
        const sh = grid.shadeOf(idx);
        shade[idx] = grid.shadeOf(below);
        shade[below] = sh;
        vel[idx] = 0;
        vel[below] = 1;
        grid.flowVel[idx] = 0;
        grid.flowVel[below] = 0;
        grid.extendReact(x - 1, y - 1, x + 1, y + 2);
        if (x < nMinX) nMinX = x;
        if (x > nMaxX) nMaxX = x;
        if (y + 1 > nMaxY) nMaxY = y + 1;
        if (y < nMinY) nMinY = y;
        if (++moved >= maxCells) {
          capped = true;
          break rows;
        }
        continue;
      }
      const gl = live ? glide[m]! : 0;
      const pv = vel[idx]!;
      const fv = pv & FALL_MASK;
      let sv = gl !== 0 ? (pv >> SLIDE_SHIFT) & SLIDE_MAX : 0;
      let sd = (pv & SLIDE_LEFT) !== 0 ? -1 : 1;
      // motion the cell arrives with (the `fallVel` byte)
      let nv = 0;
      // moved on its own momentum rather than by giving way
      let coast = false;
      // set in motion this pass by the mass it landed in (the grains ahead have not moved yet)
      let pressed = false;
      if (gl !== 0 && stamp[idx] === pass) {
        // already moved up or sideways into this cell during this pass
        stamp[idx] = 0;
        continue;
      }
      if (mb === 0) {
        const v = Math.min(fv + 1, MAX_FALL_SPEED);
        dst = below;
        dy = 1;
        while (dy < v && y + dy < H - 1 && mat[dst + W] === 0) {
          dst += W;
          dy++;
        }
        if (sv > 0) {
          // it left the ground at speed: it keeps drifting that way as it falls, slowed by the air
          const nx = x + sd;
          if (nx >= 0 && nx < W && mat[idx + sd] === 0 && mat[dst + sd] === 0) {
            dst += sd;
            if ((((Math.imul(x, 40503) ^ Math.imul(y + tick, 69069)) >>> 9) & 7) >= gl) sv--;
          } else sv = 0;
        }
        nv = v | (sv << SLIDE_SHIFT) | (sv > 0 && sd < 0 ? SLIDE_LEFT : 0);
      } else {
        // only a mass has the weight for it: a lone grain (a snowflake, a trickle) just lands
        if (gl !== 0 && fv >= IMPACT_MIN && y > 0 && mat[idx - W] !== 0) {
          // A hard landing. The grain is shaken loose, and so is loose ground it lands on...
          const rp = repose[m]!;
          if (fv >= SHAKE_MIN) {
            if (rp !== 0 && state[idx]! < IMPACT_LOOSE) state[idx] = IMPACT_LOOSE;
            if (
              repose[mb] !== 0 &&
              group[below] === 0 &&
              state[below] === 0 &&
              ((x * 5 + y * 3 + tick) & 3) === 0
            )
              state[below] = 1;
          }
          // ...and its fall turns into a slide down whichever side is open.
          const openR = x < W - 1 && mat[idx + 1] === 0;
          const openL = x > 0 && mat[idx - 1] === 0;
          if (sv === 0 && (openL || openR)) {
            const downR = openR && mat[below + 1] === 0;
            const downL = openL && mat[below - 1] === 0;
            const flip = ((x * 7 + y * 13 + tick) & 2) === 0;
            if (downR !== downL) sd = downR ? 1 : -1;
            else if (openR !== openL) sd = openR ? 1 : -1;
            else sd = flip ? 1 : -1;
            sv = fv >> 1;
          } else if (sv === 0 && fv >= SHAKE_MIN) {
            // Inside a mass that lands hard: it is pressed out toward the nearer open side, and
            // follows the grains ahead of it as they clear the way.
            let r = 1;
            while (r <= PRESS_LOOK && x + r < W && mat[idx + r] !== 0) r++;
            let l = 1;
            while (l <= PRESS_LOOK && x - l >= 0 && mat[idx - l] !== 0) l++;
            if (l !== r && (l <= PRESS_LOOK || r <= PRESS_LOOK)) {
              sd = r < l ? 1 : -1;
              sv = fv >> 1;
              pressed = true;
            }
          }
          // At the edge of a fall some grains bounce off the ground as spray.
          if (debris && fv >= SPRAY_MIN && (openL || openR) && act[m] === 0 && turns[m] === 0) {
            const roll = (Math.imul(x, 2654435761) ^ Math.imul(y + tick, 40503)) >>> 8;
            if ((roll & 7) < 3) {
              const out = openR !== openL ? (openR ? 1 : -1) : (roll & 8) !== 0 ? 1 : -1;
              const vx = out * ((FP >> 2) + ((roll >> 4) & 7) * (FP >> 4));
              const vy = -Math.trunc((fv * FP) / 6) + ((roll >> 7) & 3) * (FP >> 3);
              if (
                debris.spawn(
                  x * FP + (FP >> 1),
                  y * FP + (FP >> 1),
                  vx,
                  vy,
                  m,
                  coat[idx]!,
                  state[idx]!,
                  grid.shadeOf(idx),
                )
              ) {
                mat[idx] = 0;
                coat[idx] = 0;
                state[idx] = 0;
                vel[idx] = 0;
                if (x < nMinX) nMinX = x;
                if (x > nMaxX) nMaxX = x;
                if (y > nMaxY) nMaxY = y;
                if (y < nMinY) nMinY = y;
                if (++moved >= maxCells) {
                  capped = true;
                  break rows;
                }
                continue;
              }
            }
          }
        }
        if (sv > 0) {
          // A grain in motion: it runs on the way it is heading, `1 + speed / 2` cells this pass,
          // faster down a steep slope, slowed by friction on the level, stopped by anything in
          // its way.
          let p = idx;
          let px = x;
          let held = false;
          for (let n = 1 + (sv >> 1); n > 0 && sv > 0; n--) {
            const nx = px + sd;
            if (nx < 0 || nx >= W) {
              sv = 0;
              break;
            }
            const roll = ((Math.imul(px, 668265263) ^ Math.imul(y + n + tick, 40503)) >>> 10) & 7;
            if (mat[p + sd] !== 0) {
              // Something in the way. Behind a grain that is itself moving on the same way it
              // waits, losing speed; anything else stops it.
              const ov = vel[p + sd]!;
              if (
                p === idx &&
                (pressed ||
                  (ov >> SLIDE_SHIFT !== 0 &&
                    (ov & SLIDE_LEFT) === (sd < 0 ? SLIDE_LEFT : 0) &&
                    glide[mat[p + sd]!] !== 0))
              ) {
                if (!pressed && roll >= 6) sv--;
                held = sv > 0;
              } else sv = 0;
              break;
            } else if (y + dy + 1 < H && mat[p + sd + W] === 0) {
              p += sd + W;
              dy++;
              // steeper than a 45 degree stair it gathers speed; on one it slowly loses it, so a
              // slide down a slope at rest dies out instead of feeding itself
              if (y + dy + 1 < H && mat[p + W] === 0) {
                if (sv < SLIDE_MAX && roll < gl) sv++;
              } else if (roll >= gl + ((8 - gl) >> 1)) sv--;
            } else {
              // level ground: a grain barely moving stops, a faster one runs on against friction
              if (sv < 2) {
                sv = 0;
                break;
              }
              p += sd;
              if (roll >= gl) sv--;
            }
            px = nx;
          }
          if (held) {
            // keeps its place and (most of) its speed for the next pass
            vel[idx] = (sv << SLIDE_SHIFT) | (sd < 0 ? SLIDE_LEFT : 0);
            if (x - 1 < nMinX) nMinX = x - 1;
            if (x + 1 > nMaxX) nMaxX = x + 1;
            if (y > nMaxY) nMaxY = y;
            if (y < nMinY) nMinY = y;
            waiting = true;
            continue;
          }
          if (p !== idx) {
            dst = p;
            coast = true;
            nv = (dy > 0 ? 1 : 0) | (sv << SLIDE_SHIFT) | (sv > 0 && sd < 0 ? SLIDE_LEFT : 0);
            if (dy <= 0) stamp[dst] = pass;
            // every pass on the move spends a loosen step, like a slump does
            if (state[idx] !== 0 && repose[m] !== 0) state[idx] = state[idx]! - 1;
          }
        }
      }
      if (dst >= 0) {
        // already on its way
      } else if (k === SETTLE_FALL) {
        // A one-cell-wide spire topples: no side support at all, so it slides like sand.
        if (x > 0 && x < W - 1 && mat[idx - 1] === 0 && mat[idx + 1] === 0) {
          const d = ((x * 7 + y * 13 + tick) & 2) === 0 ? 1 : -1;
          if (mat[below + d] === 0) dst = below + d;
          else if (mat[below - d] === 0) dst = below - d;
          if (dst >= 0) {
            dy = 1;
            // a topple is not a slide: it carries no speed on
            nv = 1;
          }
        }
        // Loosened ground (a blast's crater rim) slumps off a slope steeper than the material
        // holds: with open air beside it and a drop of at least `repose` cells below that, the
        // cell slides down there, spending one of its loosen steps (its state byte).
        const rp = repose[m]!;
        if (dst < 0 && rp !== 0 && state[idx] !== 0 && y + rp < H) {
          const dir = ((x * 7 + y * 13 + tick) & 2) === 0 ? 1 : -1;
          for (let s = 0; s < 2 && dst < 0; s++) {
            const d = s === 0 ? dir : -dir;
            const nx = x + d;
            if (nx < 0 || nx >= W || mat[idx + d] !== 0) continue;
            let p = below + d;
            let j = 0;
            while (j < rp && mat[p] === 0) {
              p += W;
              j++;
            }
            if (j === rp) {
              dst = below + d;
              dy = 1;
              sd = d;
              state[idx] = state[idx]! - 1;
            }
          }
        }
      } else if (k >= SETTLE_SLIDE) {
        const dir = ((x * 7 + y * 13 + tick) & 2) === 0 ? 1 : -1;
        for (let s = 0; s < 2 && dst < 0; s++) {
          const d = s === 0 ? dir : -dir;
          const nx = x + d;
          if (nx < 0 || nx >= W) continue;
          if (mat[idx + d] === 0 && mat[below + d] === 0) {
            dst = below + d;
            dy = 1;
            sd = d;
          } else if (
            k === SETTLE_FLOW &&
            mat[idx + d] === 0 &&
            (spread[m] === 0 ||
              (state[idx]! & AGE_MASK) < spread[m]! ||
              dropAhead(mat, idx, d, nx, W))
          ) {
            dst = idx + d;
            // a runny liquid keeps running along the surface, up to `disperse` cells, and stops
            // over a drop so it falls from there next tick
            for (let r = 1, nx2 = nx + d; r < disperse[m]!; r++, nx2 += d) {
              if (nx2 < 0 || nx2 >= W || mat[dst + d] !== 0 || mat[dst + W] === 0) break;
              dst += d;
            }
          }
        }
      }
      // a grain that starts to slide starts slowly, and gathers speed from there
      if (dst >= 0 && nv === 0) {
        nv = gl !== 0 && dy > 0 ? 1 | (1 << SLIDE_SHIFT) | (sd < 0 ? SLIDE_LEFT : 0) : 1;
      }
      vel[idx] = 0;
      if (dst < 0) continue;
      vel[dst] = nv;
      mat[dst] = m;
      mat[idx] = 0;
      coat[dst] = coat[idx]!;
      coat[idx] = 0;
      // falling into gas pushes the gas up into the cell it left (bubbles rise through water)
      if (gas[dst] !== 0) {
        gas[idx] = gas[dst]!;
        gas[dst] = 0;
        grid.extendGas(x, y);
      }
      shade[dst] = grid.shadeOf(idx);
      // moved reactive cells (lava, napalm, burning things) must be re-checked where they land
      if (act[m] !== 0 || turns[m] !== 0 || act[coat[dst]!] !== 0) {
        const dx0 = dst % W;
        const dy0 = (dst - dx0) / W;
        grid.extendReact(Math.min(x, dx0) - 1, y - 1, Math.max(x, dx0) + 1, dy0 + 1);
      }
      // a spreading liquid that falls starts spreading afresh
      state[dst] = dy > 0 && spread[m] !== 0 ? state[idx]! & ~AGE_MASK : state[idx]!;
      state[idx] = 0;
      const dx = (dst % W) - x;
      let low = y + dy;
      // Traction: a grain sliding off loose-able ground (dirt) drags at the cell it rode over.
      // Sand pulls it out bodily: the dirt cell is pushed down the slope in the grain's place and
      // the grain drops into the gap, so a sand slide carries some of the slope along (and its
      // turf with it) and ends up mixed with it. Loose dirt over firm dirt only shakes that cell
      // loose, for fewer steps than it has itself, so the slide dies out.
      let dragged = false;
      if (dx !== 0 && (k === SETTLE_FALL || k === SETTLE_SLIDE) && act[m] === 0) {
        const ub = mat[below]!;
        if (ub !== 0 && repose[ub] !== 0 && group[below] === 0) {
          const roll = ((Math.imul(x, 668265263) ^ Math.imul(y + tick, 374761393)) >>> 11) & 7;
          if (ub !== m && roll < DRAG_CHANCE) {
            mat[below] = m;
            mat[dst] = ub;
            const cs = coat[dst]!;
            coat[dst] = coat[below]!;
            coat[below] = cs;
            const ss = state[dst]!;
            state[dst] = state[below]! > DRAG_STEPS ? state[below]! : DRAG_STEPS;
            state[below] = ss;
            const sh = grid.shadeOf(dst);
            shade[dst] = grid.shadeOf(below);
            shade[below] = sh;
            dragged = true;
          } else if (!coast && ub === m && state[below] === 0 && roll < DRAG_CHANCE) {
            const pull = Math.min(DRAG_STEPS * 2, state[dst]! >> 1);
            if (pull > 0) state[below] = pull;
          }
        }
      }
      // A slump eats back into the slope: loose ground that slides away may shake the cell it
      // leaned on (behind it, upslope) loose too, for half its own steps, so the edge of a slump
      // is a ragged slope that fades into firm ground, not a sheer cut where the loosening ended.
      if (!coast && repose[m] !== 0 && act[m] === 0 && state[dst] !== 0) {
        const half = state[dst]! >> 1;
        const flip = ((Math.imul(x, 2246822519) ^ Math.imul(y + tick, 3266489917)) >>> 12) & 3;
        // sliding: the cell behind; falling: the wall it scrapes past on either side
        const away = dx > 0 ? -1 : 1;
        // (a cell only shaken by a landing has too few steps to pass any on, so a fall never
        // keeps eating at the wall it fell from)
        for (let bs = -1; bs <= 1 && half >= 1; bs += 2) {
          if (dx !== 0 ? bs !== away || (flip & 1) !== 0 : ((flip >> (bs + 1)) & 1) !== 0) continue;
          const bx = x + bs;
          const back = idx + bs;
          if (bx < 0 || bx >= W) continue;
          if (mat[back] === m && state[back] === 0 && group[back] === 0) state[back] = half;
        }
      }
      // Grains that slide over a different loose ground churn into it: the grain may swap with
      // the one under where it lands, up to CHURN_DEPTH deep, so sand running down a dirt slope
      // (or a slumping dirt rim under a sand drift) ends up mixed instead of lying on it as a strip.
      if (!dragged && dx !== 0 && (k === SETTLE_FALL || k === SETTLE_SLIDE) && act[m] === 0) {
        let at = dst;
        for (let c = 0; c < CHURN_DEPTH && low < H - 1; c++) {
          const un = at + W;
          const o = mat[un]!;
          const ko = kind[o]!;
          if (o === 0 || o === m || (ko !== SETTLE_FALL && ko !== SETTLE_SLIDE)) break;
          if (group[un] !== 0 || act[o] !== 0 || turns[o] !== 0) break;
          if (
            (((Math.imul(x + c * 31, 374761393) ^ Math.imul(low + tick, 668265263)) >>> 13) & 7) >=
            3
          )
            break;
          mat[un] = m;
          mat[at] = o;
          const cs = coat[at]!;
          coat[at] = coat[un]!;
          coat[un] = cs;
          const ss = state[at]!;
          state[at] = state[un]!;
          state[un] = ss;
          const sh = grid.shadeOf(at);
          shade[at] = grid.shadeOf(un);
          shade[un] = sh;
          at = un;
          low++;
        }
      }
      // a liquid that moved may have opened a drop for still liquid further along its surface
      // (the end of a terrace), so the next pass looks that far to either side
      const pad = dx !== 0 && spread[m] !== 0 ? DROP_LOOK : 0;
      const lo = (dx < 0 ? x + dx : x) - pad;
      const hi = (dx > 0 ? x + dx : x) + pad;
      if (lo < nMinX) nMinX = lo;
      if (hi > nMaxX) nMaxX = hi;
      if (low > nMaxY) nMaxY = low;
      if (y < nMinY) nMinY = y;
      if (++moved >= maxCells) {
        capped = true;
        break rows;
      }
    }
  }

  grid.surfSeenMinX = seenMin;
  grid.surfSeenMaxX = seenMax;
  // only open water rippling out and a trickle of liquid cells are left
  grid.ripple = !capped && moved === wetMoved && wetMoved <= TRICKLE && !grid.surfBusy;
  if (capped) {
    // Keep the old region and grow it by what moved; the rest continues next tick.
    grid.extendSettle(nMinX - 1, nMaxX + 1, nMaxY + 1);
  } else {
    grid.clearSettle();
    if (moved > 0 || waiting || wetLive) grid.extendSettle(nMinX - 1, nMaxX + 1, nMaxY + 1);
    if (grid.surfLive) grid.extendSettle(grid.surfMinX, grid.surfMaxX, grid.surfMaxY);
  }
  if (moved > 0) {
    grid.addRenderRect(nMinX, nMinY, nMaxX - nMinX + 1, nMaxY - nMinY + 1);
    grid.extendStruct(nMinX, nMinY, nMaxX, nMaxY);
  }
  return moved;
}

let outHv = 0;
let outDy = 0;
let outLive = false;

/**
 * One runny liquid cell that stands on something (kept out of `settleStep`'s loop so that
 * stays small for the grains). Returns where the cell goes (-1 = nowhere); its sideways speed
 * afterwards, the rows it dropped, and whether it is still alive without having moved, are
 * left in `outHv`, `outDy` and `outLive`.
 */
function flowCell(
  grid: Grid,
  mats: MaterialTable,
  idx: number,
  x: number,
  y: number,
  m: number,
  mb: number,
  hv: number,
  tick: number,
  ts: number,
  ltr: boolean,
): number {
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const vel = grid.fallVel;
  const stamp = grid.flowTick;
  const group = grid.group;
  const state = grid.cellState;
  const disperse = mats.disperse;
  const spread = mats.spread;
  const below = idx + W;
  let dst = -1;
  let dy = 0;
  let live = false;
  // Momentum (speeds in 1/FLOW_Q cells per tick). A runny liquid that lands turns its
  // fall into sideways speed, and one with speed keeps running: along the ground, down a
  // slope (gaining), off a ledge, up a bank while the speed lasts, bouncing off a wall,
  // and handing its speed to the pool it runs into (see `surfaceFlowStep`).
  const cap = disperse[m]! * FLOW_Q;
  const v0 = vel[idx]!;
  if (v0 !== 0 && mb !== m && (hv !== 0 || v0 >= 3)) {
    // a real drop splays to either side; a one-cell step only feeds speed it has
    const s0 =
      hv !== 0 ? hv : ((Math.imul(x, 40503) ^ Math.imul(y + tick, 9973)) & 4) === 0 ? 1 : -1;
    hv += (s0 > 0 ? 1 : -1) * ((v0 + 1) >> 1) * FLOW_Q;
  } else if (v0 >= 3 && mb === m && hv !== 0) {
    // poured into a pool: the pool takes the push
    pushSurface(grid, x, hv > 0 ? 1 : -1, hv > 0 ? hv : -hv);
    hv = 0;
  }
  if (hv > cap) hv = cap;
  else if (hv < -cap) hv = -cap;
  const h8 = ((Math.imul(x, 668265263) ^ Math.imul(y + tick, 374761393)) >>> 11) & 7;
  // drag: a sixteenth of the speed a tick, and the last of it by chance
  if (hv !== 0) {
    const loss = hv >> 4;
    hv -= loss !== 0 && loss !== -1 ? loss : h8 < FLOW_DRAG ? (hv > 0 ? 1 : -1) : 0;
  }
  let mag = hv < 0 ? -hv : hv;
  let d = hv < 0 ? -1 : 1;
  let n = (mag >> FLOW_SHIFT) + (h8 < (mag & (FLOW_Q - 1)) ? 1 : 0);
  let at = idx;
  let cx = x;
  let cy = y;
  while (n > 0) {
    const nx = cx + d;
    if (nx < 0 || nx >= W) {
      mag = 0;
      break;
    }
    const a = mat[at + d]!;
    if (a === 0) {
      at += d;
      cx = nx;
      n--;
      // follow the ground down a slope, picking up speed; off anything steeper it flies
      let drop = 0;
      while (drop < 2 && cy < H - 2 && mat[at + W] === 0) {
        at += W;
        cy++;
        drop++;
      }
      if (mat[at + W] === 0) break;
      if (drop !== 0) {
        mag += drop * FLOW_FALL;
        if (mag > cap) mag = cap;
      }
      continue;
    }
    if (a === m && group[at + d] === 0) {
      pushSurface(grid, cx, d, mag);
      mag = 0;
    } else if (mag >= CLIMB_COST && cy > 0 && mat[at - W] === 0 && mat[at - W + d] === 0) {
      at += d - W;
      cx = nx;
      cy--;
      mag -= CLIMB_COST;
      n--;
      continue;
    } else {
      mag >>= 1;
      d = -d;
    }
    break;
  }
  hv = d * mag;
  if (at !== idx) {
    dst = at;
    dy = cy - y;
    vel[dst] = 0;
    if (dy < 0 || d === (ltr ? 1 : -1)) stamp[dst] = ts;
  } else if (hv !== 0) {
    live = true;
  }
  const st = grid.surfTop[x]!;
  const managed = st === y && mb === m;
  // the cells under the top of a column of open water don't spread on their own either
  const inColumn = st >= 0 && y >= st;
  if (dst < 0 && managed && hv !== 0) {
    // in a column of open water: the column step moves that, with the pool
    pushSurface(grid, x, hv > 0 ? 1 : -1, hv > 0 ? hv : -hv);
    hv = 0;
  }
  if (dst < 0) {
    // not carried anywhere: the standing rules (run off a step, pour out from under a
    // column, spread while young, run towards a drop)
    const cells = disperse[m]!;
    const dir = ((x * 7 + y * 13 + tick) & 2) === 0 ? 1 : -1;
    for (let s = 0; s < 2 && dst < 0; s++) {
      const dd = s === 0 ? dir : -dir;
      const nx = x + dd;
      if (nx < 0 || nx >= W) continue;
      if (managed) {
        // the top of a column of open water moves with its column, not on its own
      } else if (mat[idx + dd] === 0 && mat[below + dd] === 0) {
        dst = below + dd;
        dy = 1;
        vel[dst] = 1;
        if (hv === 0) hv = dd * FLOW_Q;
      } else if (stamp[idx + dd] === ts) {
        // the cell beside only just emptied: a gap in a liquid travels a cell a tick, it
        // doesn't run the length of the row in one
        live = true;
      } else if (mat[idx + dd] === 0 && y > 0 && mat[idx - W] === m && mat[idx - W + dd] !== 0) {
        // Pressure: a liquid under its own kind with a way out beside it, under a roof (a
        // tunnel mouth; an open face is the column step's business), is pushed out, faster
        // the deeper it sits (1, 2, 3, 4 cells/tick under 1, 2, 5, 10 cells of liquid),
        // so a lake holed below the waterline jets out.
        let h = 1;
        let p = idx - W - W;
        while (h < 10 && p >= 0 && mat[p] === m) {
          h++;
          p -= W;
        }
        let sp = h >= 10 ? 4 : h >= 5 ? 3 : h >= 2 ? 2 : 1;
        if (sp > cells) sp = cells;
        dst = idx + dd;
        let cx = nx;
        for (let r = 1; r < sp; r++) {
          cx += dd;
          if (cx < 0 || cx >= W || mat[dst + dd] !== 0 || mat[dst + W] === 0) break;
          dst += dd;
        }
        vel[dst] = 0;
        stamp[idx] = ts;
        hv = dd * sp * FLOW_Q;
        if (dd === (ltr ? 1 : -1)) stamp[dst] = ts;
      } else if (
        !inColumn &&
        mat[idx + dd] === 0 &&
        (spread[m] === 0 || (state[idx]! & AGE_MASK) < spread[m]! || dropAhead(mat, idx, dd, nx, W))
      ) {
        dst = idx + dd;
        for (let r = 1, nx2 = nx + dd; r < cells; r++, nx2 += dd) {
          if (nx2 < 0 || nx2 >= W || mat[dst + dd] !== 0 || mat[dst + W] === 0) break;
          dst += dd;
        }
        vel[dst] = 0;
      }
    }
  }
  outHv = hv;
  outDy = dy;
  outLive = live;
  return dst;
}

let outMinX = 0;
let outMaxX = 0;
let outMinY = 0;
let outMaxY = 0;

/**
 * One runny liquid cell (kept out of `settleStep`'s loop, which stays as small as the grains
 * need). Returns 0 if nothing happened, 1 if the cell stays but is still alive, 2 if it moved;
 * for 1 and 2 the region to look at next tick is left in `outMinX..outMaxY`.
 */
function liquidCell(
  grid: Grid,
  mats: MaterialTable,
  idx: number,
  x: number,
  y: number,
  m: number,
  mb: number,
  tick: number,
  ts: number,
  ltr: boolean,
): number {
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const vel = grid.fallVel;
  const flow = grid.flowVel;
  if (grid.flowTick[idx] === ts) {
    outMinX = outMaxX = x;
    outMinY = outMaxY = y;
    return 1;
  }
  let hv = flow[idx]!;
  let dst: number;
  let dy = 0;
  let live = false;
  if (mb === 0) {
    const v = Math.min(vel[idx]! + 1, MAX_FALL_SPEED);
    // a liquid in the air keeps its sideways speed, so it leaves a ledge in an arc
    let from = idx;
    if (hv !== 0) {
      const d = hv > 0 ? 1 : -1;
      let cx = x;
      for (let n = (hv * d) >> FLOW_SHIFT; n > 0; n--) {
        cx += d;
        if (cx < 0 || cx >= W || mat[from + d] !== 0) {
          hv = 0;
          break;
        }
        from += d;
        if (mat[from + W] !== 0) break;
      }
    }
    if (from !== idx && mat[from + W] !== 0) {
      // flew onto a ledge
      dst = from;
      vel[dst] = 0;
    } else {
      dst = from + W;
      dy = 1;
      while (dy < v && y + dy < H - 1 && mat[dst + W] === 0) {
        dst += W;
        dy++;
      }
      vel[dst] = v;
    }
  } else {
    dst = flowCell(grid, mats, idx, x, y, m, mb, hv, tick, ts, ltr);
    hv = outHv;
    dy = outDy;
    live = outLive;
  }
  if (dst !== idx) vel[idx] = 0;
  flow[idx] = 0;
  flow[dst < 0 ? idx : dst] = hv;
  if (dst < 0 || dst === idx) {
    if (!live) return 0;
    outMinX = outMaxX = x;
    outMinY = outMaxY = y;
    return 1;
  }
  const coat = grid.coating;
  const gas = grid.gas;
  const state = grid.cellState;
  mat[dst] = m;
  mat[idx] = 0;
  coat[dst] = coat[idx]!;
  coat[idx] = 0;
  // falling into gas pushes the gas up into the cell it left (bubbles rise through water)
  if (gas[dst] !== 0) {
    gas[idx] = gas[dst]!;
    gas[dst] = 0;
    grid.extendGas(x, y);
  }
  grid.shade[dst] = grid.shadeOf(idx);
  const dx = (dst % W) - x;
  // moved reactive cells must be re-checked where they land
  if (mats.active[m] !== 0 || mats.decayTurns[m] !== 0 || mats.active[coat[dst]!] !== 0) {
    grid.extendReact(Math.min(x, x + dx) - 1, y - 1, Math.max(x, x + dx) + 1, y + dy + 1);
  }
  // a spreading liquid that falls starts spreading afresh
  state[dst] = dy > 0 && mats.spread[m] !== 0 ? state[idx]! & ~AGE_MASK : state[idx]!;
  state[idx] = 0;
  // a liquid that moved may have opened a drop for still liquid further along its surface
  // (the end of a terrace), so the next pass looks that far to either side
  const pad = dx !== 0 && mats.spread[m] !== 0 ? DROP_LOOK : 0;
  outMinX = (dx < 0 ? x + dx : x) - pad;
  outMaxX = (dx > 0 ? x + dx : x) + pad;
  outMinY = dy < 0 ? y + dy : y;
  outMaxY = dy > 0 ? y + dy : y;
  return 2;
}

/**
 * Whether a liquid at `idx` running sideways in direction `d` reaches a drop (air below the row)
 * within DROP_LOOK cells before anything blocks it. A liquid whose spreading time is up still runs
 * towards a drop, so a lake whose side is blasted open pours into the hole instead of standing
 * as a slope, while a flat film or a ripple on a level lake stays put and the world goes quiet.
 */
function dropAhead(mat: Uint8Array, idx: number, d: number, nx: number, W: number): boolean {
  for (let r = 0, p = idx + d, x = nx; r < DROP_LOOK; r++, p += d, x += d) {
    if (x < 0 || x >= W || mat[p] !== 0) return false;
    if (mat[p + W] === 0) return true;
  }
  return false;
}
