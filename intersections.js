const { evaluate } = require('mathjs');

const EPS = 1e-9;
const DEDUPE_EPS = 1e-6;
const SAMPLE_COUNT = 240;
const ROOT_TOL = 1e-9;
const ROOT_ITERS = 50;

function computeIntersections(objects) {
  const out = [];
  for (let i = 0; i < objects.length; i += 1) {
    for (let j = i + 1; j < objects.length; j += 1) {
      collectPair(objects[i], objects[j], out);
    }
  }
  return dedupe(out);
}

function collectPair(a, b, out) {
  const segsA = linearSegments(a);
  const segsB = linearSegments(b);
  const ca = a.type === 'circle' ? a : null;
  const cb = b.type === 'circle' ? b : null;
  const fa = a.type === 'function' ? a : null;
  const fb = b.type === 'function' ? b : null;

  for (const sa of segsA) {
    for (const sb of segsB) {
      const point = segmentSegment(sa, sb);
      if (point) out.push(point);
    }
  }
  if (ca) for (const sb of segsB) for (const p of segmentCircle(sb, ca)) out.push(p);
  if (cb) for (const sa of segsA) for (const p of segmentCircle(sa, cb)) out.push(p);
  if (ca && cb) for (const p of circleCircle(ca, cb)) out.push(p);
  if (fa && !fb) {
    for (const sb of segsB) for (const p of functionSegment(fa.expression, sb)) out.push(p);
    if (cb) for (const p of functionCircle(fa.expression, cb)) out.push(p);
  }
  if (fb && !fa) {
    for (const sa of segsA) for (const p of functionSegment(fb.expression, sa)) out.push(p);
    if (ca) for (const p of functionCircle(fb.expression, ca)) out.push(p);
  }
}

function linearSegments(obj) {
  switch (obj.type) {
    case 'line':
      return [[[obj.x1, obj.y1], [obj.x2, obj.y2]]];
    case 'rectangle': {
      const x1 = obj.x;
      const y1 = obj.y;
      const x2 = obj.x + obj.w;
      const y2 = obj.y + obj.h;
      return [
        [[x1, y1], [x2, y1]],
        [[x2, y1], [x2, y2]],
        [[x2, y2], [x1, y2]],
        [[x1, y2], [x1, y1]],
      ];
    }
    case 'polygon': {
      const segs = [];
      for (let i = 0; i < obj.points.length; i += 1) {
        segs.push([obj.points[i], obj.points[(i + 1) % obj.points.length]]);
      }
      return segs;
    }
    default:
      return [];
  }
}

function segmentSegment(s1, s2) {
  const [[x1, y1], [x2, y2]] = s1;
  const [[x3, y3], [x4, y4]] = s2;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < EPS) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function segmentCircle(seg, c) {
  const [[x1, y1], [x2, y2]] = seg;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - c.cx;
  const fy = y1 - c.cy;
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A < EPS) return [];
  const sq = Math.sqrt(disc);
  const t1 = (-B - sq) / (2 * A);
  const t2 = (-B + sq) / (2 * A);
  const out = [];
  if (t1 >= -EPS && t1 <= 1 + EPS) out.push([x1 + t1 * dx, y1 + t1 * dy]);
  if (Math.abs(t1 - t2) > EPS && t2 >= -EPS && t2 <= 1 + EPS) {
    out.push([x1 + t2 * dx, y1 + t2 * dy]);
  }
  return out;
}

function circleCircle(c1, c2) {
  const dx = c2.cx - c1.cx;
  const dy = c2.cy - c1.cy;
  const d = Math.hypot(dx, dy);
  if (d < EPS) return [];
  if (d > c1.r + c2.r + EPS) return [];
  if (d < Math.abs(c1.r - c2.r) - EPS) return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const px = c1.cx + (a * dx) / d;
  const py = c1.cy + (a * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  const out = [[px + rx, py + ry]];
  if (h > EPS) out.push([px - rx, py - ry]);
  return out;
}

function functionSegment(expression, seg) {
  const [[ax, ay], [bx, by]] = seg;
  if (Math.abs(ax - bx) < EPS) {
    const y = evalAt(expression, ax);
    if (y === null) return [];
    const yLow = Math.min(ay, by) - EPS;
    const yHigh = Math.max(ay, by) + EPS;
    return y >= yLow && y <= yHigh ? [[ax, y]] : [];
  }
  const xLow = Math.min(ax, bx);
  const xHigh = Math.max(ax, bx);
  const lineY = (x) => ay + ((by - ay) * (x - ax)) / (bx - ax);
  return findRoots(expression, xLow, xHigh, (x, y) => y - lineY(x));
}

function functionCircle(expression, c) {
  return findRoots(
    expression,
    c.cx - c.r,
    c.cx + c.r,
    (x, y) => (x - c.cx) ** 2 + (y - c.cy) ** 2 - c.r * c.r,
  );
}

function findRoots(expression, xLow, xHigh, delta) {
  if (!(xHigh > xLow)) return [];
  const sample = (x) => {
    const y = evalAt(expression, x);
    if (y === null) return null;
    return delta(x, y);
  };
  const out = [];
  const step = (xHigh - xLow) / SAMPLE_COUNT;
  let prevX = xLow;
  let prevH = sample(prevX);
  for (let i = 1; i <= SAMPLE_COUNT; i += 1) {
    const x = xLow + step * i;
    const h = sample(x);
    if (prevH !== null && h !== null && Math.sign(prevH) !== Math.sign(h)) {
      const root = bisect(sample, prevX, x, prevH);
      if (root !== null) {
        const y = evalAt(expression, root);
        if (y !== null) out.push([root, y]);
      }
    }
    prevX = x;
    prevH = h;
  }
  return out;
}

function bisect(sample, loIn, hiIn, loValIn) {
  let lo = loIn;
  let hi = hiIn;
  let loVal = loValIn;
  for (let i = 0; i < ROOT_ITERS; i += 1) {
    const mid = (lo + hi) / 2;
    const value = sample(mid);
    if (value === null) return null;
    if (Math.abs(value) < ROOT_TOL || hi - lo < ROOT_TOL) return mid;
    if (Math.sign(value) === Math.sign(loVal)) {
      lo = mid;
      loVal = value;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function evalAt(expression, x) {
  try {
    const value = evaluate(expression, { x });
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    if (!out.some((q) => Math.abs(q[0] - p[0]) < DEDUPE_EPS && Math.abs(q[1] - p[1]) < DEDUPE_EPS)) {
      out.push(p);
    }
  }
  return out;
}

module.exports = { computeIntersections };
