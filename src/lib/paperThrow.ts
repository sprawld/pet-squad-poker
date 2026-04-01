/** One paper projectile in viewport pixel space (fixed positioning). */
export type PaperParticle = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: 'fly' | 'fall';
  /** Avatar center (from getBoundingClientRect). */
  targetX: number;
  targetY: number;
  /** Inscribed circle radius = min(w,h)/2 for square avatars. */
  targetRadius: number;
  rotation: number;
  opacity: number;
};

const GRAVITY = 1680;
const AIR = 0.987;
const FLY_SPEED_MIN = 720;
const FLY_SPEED_RANGE = 280;

function randomEdgePoint(): { sx: number; sy: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pad = 72;
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) return { sx: Math.random() * w, sy: -pad };
  if (edge === 1) return { sx: w + pad, sy: Math.random() * h };
  if (edge === 2) return { sx: Math.random() * w, sy: h + pad };
  return { sx: -pad, sy: Math.random() * h };
}

export function createPaperParticle(targetRect: DOMRect): PaperParticle {
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  const targetRadius = Math.min(targetRect.width, targetRect.height) / 2;
  const { sx, sy } = randomEdgePoint();
  const dx = targetX - sx;
  const dy = targetY - sy;
  const len = Math.hypot(dx, dy) || 1;
  const speed = FLY_SPEED_MIN + Math.random() * FLY_SPEED_RANGE;
  return {
    id: crypto.randomUUID(),
    x: sx,
    y: sy,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    phase: 'fly',
    targetX,
    targetY,
    targetRadius,
    rotation: (Math.random() - 0.5) * 28,
    opacity: 1,
  };
}

/** First intersection of segment A→B with circle (cx,cy), radius r; t ∈ [0,1]. */
function segmentCircleFirstHit(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): { t: number; ix: number; iy: number } | null {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sd = Math.sqrt(disc);
  const t1 = (-b - sd) / (2 * a);
  const t2 = (-b + sd) / (2 * a);
  const hits: number[] = [];
  if (t1 >= 0 && t1 <= 1) hits.push(t1);
  if (t2 >= 0 && t2 <= 1) hits.push(t2);
  if (hits.length === 0) return null;
  const t = Math.min(...hits);
  return {
    t,
    ix: ax + t * dx,
    iy: ay + t * dy,
  };
}

/** Reflect velocity off circular edge; outward normal from center to impact. */
function bounceOffAvatar(
  p: PaperParticle,
  impactX: number,
  impactY: number,
): PaperParticle {
  const { vx, vy } = p;
  const ox = impactX - p.targetX;
  const oy = impactY - p.targetY;
  const len = Math.hypot(ox, oy) || 1;
  const nx = ox / len;
  const ny = oy / len;
  const dot = vx * nx + vy * ny;
  let rx = vx - 2 * dot * nx;
  let ry = vy - 2 * dot * ny;
  const damp = 0.48 + Math.random() * 0.12;
  rx *= damp;
  ry *= damp;
  rx += (Math.random() - 0.5) * 380;
  ry = Math.max(180, ry * 0.65 + 140 + Math.random() * 180);
  return {
    ...p,
    x: impactX,
    y: impactY,
    phase: 'fall',
    vx: rx,
    vy: ry,
    rotation: p.rotation + (Math.random() - 0.5) * 70,
    opacity: 1,
  };
}

/** If point is inside circle, project onto boundary along radial from center. */
function projectToCircleEdge(
  px: number,
  py: number,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number } {
  const ox = px - cx;
  const oy = py - cy;
  const d = Math.hypot(ox, oy);
  if (d < 1e-6) return { x: cx + r, y: cy };
  const s = r / d;
  return { x: cx + ox * s, y: cy + oy * s };
}

export function stepPaper(p: PaperParticle, dt: number): PaperParticle | null {
  if (p.phase === 'fly') {
    const nx = p.x + p.vx * dt;
    const ny = p.y + p.vy * dt;
    const R = p.targetRadius;
    const hit = segmentCircleFirstHit(p.x, p.y, nx, ny, p.targetX, p.targetY, R);
    if (hit) {
      return bounceOffAvatar(p, hit.ix, hit.iy);
    }
    const distEnd = Math.hypot(nx - p.targetX, ny - p.targetY);
    if (distEnd < R - 1e-3) {
      const { x: ix, y: iy } = projectToCircleEdge(nx, ny, p.targetX, p.targetY, R);
      return bounceOffAvatar(p, ix, iy);
    }
    return {
      ...p,
      x: nx,
      y: ny,
      rotation: p.rotation + p.vx * 0.011 * dt,
    };
  }

  const vy = p.vy + GRAVITY * dt;
  const vx = p.vx * AIR;
  const x = p.x + vx * dt;
  const y = p.y + vy * dt;
  const rotation = p.rotation + vx * 0.015 * dt;
  const fallen = y - p.targetY;
  let opacity = p.opacity;
  if (fallen > 28) {
    opacity = Math.max(0, 1 - (fallen - 28) / 540);
  }
  if (y > window.innerHeight + 120 || opacity < 0.02) {
    return null;
  }
  return { ...p, x, y, vx, vy, rotation, opacity };
}
