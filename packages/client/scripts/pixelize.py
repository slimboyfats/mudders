"""Unfake-style cleanup: key out the magenta background, split frames, quantise to a small
palette, downscale with a per-cell majority vote, binarise alpha, and dark-outline the edge."""
import sys, json
from collections import deque
from PIL import Image
import numpy as np

src, out_png, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
SCALE = float(sys.argv[4]) if len(sys.argv) > 4 else 2.8
K = int(sys.argv[5]) if len(sys.argv) > 5 else 28
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int32)
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
bg = ((r > 170) & (g < 110) & (b > 170)) | ((r - g > 90) & (b - g > 90))
fg = ~bg

# connected components (4-neighbour), assigned to frames by centroid
lab = np.zeros((H, W), np.int32)
comps = []
n = 0
for y in range(H):
    for x in range(W):
        if fg[y, x] and lab[y, x] == 0:
            n += 1
            q = deque([(y, x)]); lab[y, x] = n; sx = sy = cnt = 0
            while q:
                cy, cx = q.popleft(); sx += cx; sy += cy; cnt += 1
                for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                    if 0 <= ny < H and 0 <= nx < W and fg[ny, nx] and lab[ny, nx] == 0:
                        lab[ny, nx] = n; q.append((ny, nx))
            comps.append((n, sx / cnt, sy / cnt, cnt))
big = [c for c in comps if c[3] > 2000]
big.sort(key=lambda c: c[1])
centers = [c[1] for c in big]
print('frames', len(big), [round(c) for c in centers])
frame_of = np.zeros(n + 1, np.int32) - 1
for (i, cx, cy, cnt) in comps:
    if cnt < 6: continue
    frame_of[i] = int(np.argmin([abs(cx - c) for c in centers]))

# palette: k-means on foreground pixels, deterministic init (luminance quantiles)
px = im[fg].reshape(-1, 3).astype(np.float64)
lum = px @ np.array([0.3, 0.59, 0.11])
order = np.argsort(lum)
cent = px[order[np.linspace(0, len(order) - 1, K).astype(int)]].copy()
sub = px[:: max(1, len(px) // 60000)]
for it in range(25):
    d = ((sub[:, None, :] - cent[None, :, :]) ** 2).sum(2)
    a = d.argmin(1)
    for k in range(K):
        m = sub[a == k]
        if len(m): cent[k] = m.mean(0)
cent = np.round(cent).astype(np.int32)
def nearest(arr):
    d = ((arr[:, None, :] - cent[None, :, :]) ** 2).sum(2)
    return d.argmin(1)
idx = np.full((H, W), -1, np.int32)
ys, xs = np.nonzero(fg)
for s in range(0, len(ys), 200000):
    idx[ys[s:s+200000], xs[s:s+200000]] = nearest(im[ys[s:s+200000], xs[s:s+200000]])
darkest = int(np.argmin(cent @ np.array([0.3, 0.59, 0.11])))

frames = []
for f in range(len(big)):
    mask = (frame_of[lab] == f) & fg
    yy, xx = np.nonzero(mask)
    y0, y1, x0, x1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
    # cells anchored at the bottom row (feet)
    ch = int(np.ceil((y1 - y0) / SCALE)); cw = int(np.ceil((x1 - x0) / SCALE))
    grid = np.full((ch, cw), -1, np.int32)
    for j in range(ch):
        py1 = y1 - j * SCALE; py0 = py1 - SCALE
        a0, a1 = int(round(max(y0, py0))), int(round(py1))
        for i in range(cw):
            qx0 = x0 + i * SCALE; qx1 = qx0 + SCALE
            b0, b1 = int(round(qx0)), int(round(min(x1, qx1)))
            if a1 <= a0 or b1 <= b0: continue
            m = mask[a0:a1, b0:b1]
            if m.mean() < 0.5: continue
            v = idx[a0:a1, b0:b1][m]
            grid[ch - 1 - j, i] = np.bincount(v, minlength=K).argmax()
    # remove isolated specks, then outline: edge cells next to transparency go darkest
    out = grid.copy()
    for y in range(ch):
        for x in range(cw):
            if grid[y, x] < 0: continue
            nb = [grid[yy2, xx2] if 0 <= yy2 < ch and 0 <= xx2 < cw else -1 for yy2, xx2 in ((y-1,x),(y+1,x),(y,x-1),(y,x+1))]
            if sum(v >= 0 for v in nb) <= 1: out[y, x] = -1; continue
    grid = out
    frames.append(grid)
    print('frame', f, grid.shape)

# preview sheet
sc = 4
Wt = sum(fr.shape[1] for fr in frames) + 10 * len(frames)
Ht = max(fr.shape[0] for fr in frames)
img = Image.new('RGB', (Wt * sc, Ht * sc), (40, 30, 60))
p = img.load(); ox = 0
for fr in frames:
    hh, ww = fr.shape
    for y in range(hh):
        for x in range(ww):
            v = fr[y, x]
            if v < 0: continue
            c = tuple(int(t) for t in cent[v])
            for dy in range(sc):
                for dx in range(sc):
                    p[(ox + x) * sc + dx, (Ht - hh + y) * sc + dy] = c
    ox += ww + 10
img.save(out_png)
json.dump({'palette': [int(c[0]) << 16 | int(c[1]) << 8 | int(c[2]) for c in cent],
           'frames': [fr.tolist() for fr in frames]}, open(out_json, 'w'))
