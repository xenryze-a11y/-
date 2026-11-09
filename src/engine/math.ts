/** 纯数学。不依赖任何上层，对应 goengine 的 engine/core/vec.go。 */

export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });

export const len2 = (v: Vec2): number => v.x * v.x + v.y * v.y;
export const len = (v: Vec2): number => Math.hypot(v.x, v.y);
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

/** 零向量归一化会得到零向量，不会炸成 NaN。 */
export function norm(v: Vec2): Vec2 {
  const l = len(v);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : vec();
}

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const angle = (v: Vec2): number => Math.atan2(v.y, v.x);
export const fromAngle = (a: number, l = 1): Vec2 => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 帧率无关的指数平滑：smooth = 1 - e^(-k·dt)。Go 引擎的 Camera.Follow 同款。 */
export const smooth = (k: number, dt: number): number => 1 - Math.exp(-k * dt);

/** 角度差，结果落在 [-π, π]。近战扇形判定靠它。 */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 确定性随机（种子可复现），对应 Go 引擎的 seed RNG。 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
