import { DAMAGE_TYPES, z } from '@mudders/shared';
import {
  FP,
  NUM_DAMAGE_TYPES,
  STRENGTH_ONE,
  defineFlight,
  toFixed,
  type SimApi,
} from '@mudders/sim';
import { ballisticStep, cellX, cellY, withSpeed } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
  /** Cells per tick it drives on through solid ground, in the direction it hit. */
  speed: z.number().min(0.5).max(6),
  /**
   * How much it can punch through, in cells of dirt: each cell costs its material's kinetic
   * strength (rock 2.5, so about 2.5 dirt cells' worth).
   */
  pierce: z.number().int().min(1).max(400),
  /** Cells ahead of the nose it pays for (beyond what the bore pulse has already cleared). */
  lead: z.number().int().min(1).max(16),
  /** Solid cells it must pass before breaking into air sets it off (so thin crusts don't). */
  minDepth: z.number().int().min(0).max(40),
});
type Params = z.infer<typeof params>;

// data: [mode, dvx, dvy, budget (×STRENGTH_ONE), solid cells passed]; mode 0 = flying
const PIERCE = 1;
/** Through: broke out under a roof, now falls on and goes off on the next thing it touches. */
const THROUGH = 2;

const KINETIC = DAMAGE_TYPES.indexOf('kinetic');

/** Kinetic strength of the cell at (x, y) (STRENGTH_ONE = dirt-like), or 0 for air. */
function cost(api: SimApi, x: number, y: number): number {
  const g = api.grid;
  const m = g.material[y * g.width + x]!;
  if (m === 0) return 0;
  return Math.max(1, api.mats.strength[m * NUM_DAMAGE_TYPES + KINETIC]!);
}

/** Nothing solid from the nose out to `lead` cells ahead: it has broken through. */
function clearAhead(
  api: SimApi,
  px: number,
  py: number,
  dvx: number,
  dvy: number,
  speed: number,
  lead: number,
): boolean {
  for (let k = 0; k <= lead; k++) {
    const x = Math.floor((px + Math.trunc((dvx * k * FP) / speed)) / FP);
    const y = Math.floor((py + Math.trunc((dvy * k * FP) / speed)) / FP);
    if (x < 0 || x >= api.grid.width || y >= api.grid.height) return false;
    if (y >= 0 && cost(api, x, y) !== 0) return false;
  }
  return true;
}

/**
 * Penetrator (§5.1): a heavy, hardened shell. It flies a normal arc, but when it hits the ground it
 * doesn't go off: it keeps driving straight on in the direction it hit, through anything, dirt and
 * rock and ice alike, each cell spending some of its punch by how hard that cell is. Once it breaks
 * into open air below a roof (a cave, a cage, an overhang) it falls on into the room and goes off
 * on the next thing it touches, floor or tank; it also goes off when it hits a tank on the way, or
 * deep in the ground when the punch runs out. The weapon's `pulse` bores the shaft behind it; the flight
 * itself only moves, so the AI's predictor can run it.
 */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.penetrator',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.data[0] !== PIERCE) {
      // flying, or through a roof: a plain arc (a hit is an impact, see `contact`)
      ballisticStep(api, proj, p.gravityScale, p.windScale);
      return undefined;
    }
    const dvx = proj.data[1]!;
    const dvy = proj.data[2]!;
    // march the move one cell at a time, paying for every solid cell on the way
    const speed = toFixed(p.speed);
    const steps = Math.max(1, Math.ceil(p.speed));
    const sx = Math.trunc(dvx / steps);
    const sy = Math.trunc(dvy / steps);
    const lead = p.lead;
    for (let s = 0; s < steps; s++) {
      proj.x += sx;
      proj.y += sy;
      const x = cellX(proj);
      const y = cellY(proj);
      if (y < 0 || x < 0 || x >= api.grid.width || y >= api.grid.height) return 'impact';
      // pay for the face `lead` cells ahead (the bore has already cleared the cells nearer in)
      const ax = cellX(proj) + Math.trunc((dvx * lead) / speed);
      const ay = cellY(proj) + Math.trunc((dvy * lead) / speed);
      if (ay < 0 || ax < 0 || ax >= api.grid.width || ay >= api.grid.height) {
        return 'impact';
      }
      const c = cost(api, ax, ay);
      if (c === 0) {
        // open air ahead and here: broke out under a roof (a cave, a cage, an overhang); it
        // drops on into the room and goes off on whatever it touches next
        if (proj.data[4]! >= p.minDepth && clearAhead(api, proj.x, proj.y, dvx, dvy, speed, lead)) {
          proj.data[0] = THROUGH;
          proj.vx = dvx;
          proj.vy = dvy;
          return 'skip';
        }
        continue;
      }
      proj.data[4]!++;
      proj.data[3]! -= c;
      if (proj.data[3]! <= 0) return 'impact';
    }
    return 'pulse';
  },
  contact(_api, proj, p, hit) {
    if (hit.tank >= 0) return 'impact';
    if (proj.data[0] === PIERCE) return 'continue';
    if (proj.data[0] === THROUGH) return 'impact';
    // first touch: aim the drive along the way it was flying and keep the momentum's direction
    const [dvx, dvy] = withSpeed(proj.vx, proj.vy, toFixed(p.speed));
    proj.x = hit.freeX * FP + FP / 2;
    proj.y = hit.freeY * FP + FP / 2;
    proj.vx = dvx;
    proj.vy = dvy;
    proj.data.length = 0;
    proj.data.push(PIERCE, dvx, dvy, p.pierce * STRENGTH_ONE, 0);
    return 'pulse';
  },
});
