/**
 * Slingshot aiming (§8a, mouse): drag anywhere; the pull vector sets angle (pointing away from the pull,
 * like a slingshot) and length sets power. Pure so it can be unit-tested.
 */
export interface Aim {
  angle: number;
  power: number;
}

/** `dx, dy` = current − start in CSS px (y down). `fullPx` = drag length for full power. */
export function slingshotAim(dx: number, dy: number, fullPx: number): Aim | null {
  const len = Math.hypot(dx, dy);
  if (len < 6) return null;
  // shoot opposite to the pull; screen y is down, angles are counter-clockwise from +x
  const vx = -dx;
  const vy = dy; // up is positive
  let angle = Math.round((Math.atan2(vy, vx) * 180) / Math.PI);
  if (angle < 0) angle = vx >= 0 ? 0 : 180; // pulled upward: clamp to the horizon
  angle = Math.max(0, Math.min(180, angle));
  const power = Math.max(0, Math.min(1000, Math.round((len / fullPx) * 1000)));
  return { angle, power };
}

export function clampAim(a: Aim): Aim {
  return {
    angle: Math.max(0, Math.min(180, Math.round(a.angle))),
    power: Math.max(0, Math.min(1000, Math.round(a.power))),
  };
}
