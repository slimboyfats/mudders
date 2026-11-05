/** A plain RGB24 framebuffer with the few primitives the debug preview needs. */
export class Frame {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 3);
  }

  blend(x: number, y: number, rgb: number, a = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    const d = this.data;
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    if (a >= 1) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    } else {
      d[i] = d[i]! + (r - d[i]!) * a;
      d[i + 1] = d[i + 1]! + (g - d[i + 1]!) * a;
      d[i + 2] = d[i + 2]! + (b - d[i + 2]!) * a;
    }
  }

  rect(x: number, y: number, w: number, h: number, rgb: number, a = 1): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.blend(xx, yy, rgb, a);
  }

  disc(cx: number, cy: number, r: number, rgb: number, a = 1): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.blend(x, y, rgb, a);
      }
    }
  }

  ring(cx: number, cy: number, r: number, thickness: number, rgb: number, a = 1): void {
    const ro = (r + thickness / 2) ** 2;
    const ri = Math.max(0, r - thickness / 2) ** 2;
    for (let y = Math.floor(cy - r - thickness); y <= cy + r + thickness; y++) {
      for (let x = Math.floor(cx - r - thickness); x <= cx + r + thickness; x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d <= ro && d >= ri) this.blend(x, y, rgb, a);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, rgb: number, a = 1): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++)
      this.blend(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, rgb, a);
  }

  copy(): Frame {
    const f = new Frame(this.width, this.height);
    f.data.set(this.data);
    return f;
  }
}

export function hexColor(hex: string | undefined, fallback: number): number {
  return hex ? parseInt(hex.slice(1), 16) : fallback;
}
