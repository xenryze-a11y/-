/**
 * 走路动画 = 连续相位，不是序列帧。对应 goengine 的 game/scene/humanoid.go + scene.go。
 *
 * 最关键的一条（Go 版 D51/D52 之后才定下来）：
 *   phase 跟「实际位移」推进，不跟时间；blend 由实际速度平滑得到。
 * 好处：走快走慢脚不打滑、被墙挡住脚会停、联机客户端不跑模拟也画得对。
 * 所以表现层绝不读输入向量，只比较这一帧和上一帧的位置。
 */
import { clamp, norm, vec, type Vec2 } from './math';
import type { View } from './facing';

/** 每走这么多个世界像素，相位推进 π（一个步幅）。Go 版是 26。 */
export const WALK_STRIDE_WORLD = 26;

/**
 * 骨架参数数据化。Go 版放在 game/assets/sprites/rig/humanoid.json 并支持热重载；
 * demo 里收成常量，朋友要外置成 JSON 直接把这些字段搬过去即可（见 docs/ART.md）。
 */
export interface Rig {
  soleY: number;
  strideLen: number;
  liftMax: number;
  footScale: number;
  handAlong: number;
  handLift: number;
  bodyBob: number;
}

/**
 * 鞋底相对锚点的位置。静态贴图现在只画裤腿（Go D43），所以鞋要正好落在裤脚下方。
 * 贴图锚点在 y=30，裤腿到 y=41 → 鞋心约在 y=42，即相对坐标 12。
 */
export const RIG: Record<string, Rig> = {
  hero: {
    soleY: 12,
    strideLen: 2.8,
    liftMax: 1.6,
    footScale: 1,
    handAlong: 1.8,
    handLift: 0.7,
    bodyBob: 0.8,
  },
  // 行尸蹭着走：步幅小、抬脚低（Go 版 builtinZombieAnim 同款思路）。
  zombie: {
    soleY: 12,
    strideLen: 1.8,
    liftMax: 0.8,
    footScale: 1,
    handAlong: 1.1,
    handLift: 0.5,
    bodyBob: 0.6,
  },
  caster: {
    soleY: 12,
    strideLen: 2.2,
    liftMax: 1.2,
    footScale: 1,
    handAlong: 1.5,
    handLift: 0.6,
    bodyBob: 1,
  },
};

export interface LimbPose {
  phase: number;
  /** 0 = 站定，1 = 全速。平滑过渡，不能瞬切。 */
  blend: number;
  /** 实际位移方向（不是输入方向）。 */
  dir: Vec2;
  last: Vec2;
  hasLast: boolean;
  speed: number;
}

export function newLimbPose(): LimbPose {
  return {
    phase: 0,
    blend: 0,
    dir: vec(0, 1),
    last: vec(),
    hasLast: false,
    speed: 0,
  };
}

export function updateWalk(
  pose: LimbPose,
  x: number,
  y: number,
  dt: number,
): void {
  if (!pose.hasLast) {
    pose.last.x = x;
    pose.last.y = y;
    pose.hasLast = true;
    return;
  }
  const dx = x - pose.last.x;
  const dy = y - pose.last.y;
  const moved = Math.hypot(dx, dy);
  pose.last.x = x;
  pose.last.y = y;
  pose.speed = moved / Math.max(dt, 1e-4);
  if (moved > 1e-4) pose.dir = norm(vec(dx, dy));

  const target = clamp(pose.speed / 50, 0, 1);
  pose.blend += (target - pose.blend) * Math.min(1, 14 * dt);
  pose.phase += (moved / WALK_STRIDE_WORLD) * Math.PI;
}

/** 静态裤脚的实际中心：面向改变不应把脚转到裤腿外。 */
export const FOOT_ANCHORS: Record<View, [Vec2, Vec2]> = {
  front: [
    { x: -3, y: 0 },
    { x: 4, y: 0 },
  ],
  back: [
    { x: -3, y: 0 },
    { x: 4, y: 0 },
  ],
  side: [
    { x: -3.5, y: 0 },
    { x: 2, y: 0 },
  ],
};
export function footRest(view: View, i: number, flip: boolean): Vec2 {
  const at = FOOT_ANCHORS[view][i];
  return { x: flip ? -at.x : at.x, y: at.y };
}
/** 小幅步态叠在裤脚锚点上；相位仍只跟实际位移。 */
export function footPos(
  pose: LimbPose,
  rig: Rig,
  i: number,
  view: View = 'front',
  flip = false,
): Vec2 {
  const rest = footRest(view, i, flip),
    ph = pose.phase + i * Math.PI;
  const along = Math.sin(ph) * rig.strideLen * pose.blend;
  const up = Math.max(0, Math.cos(ph)) * rig.liftMax * pose.blend;
  return {
    x: rest.x + pose.dir.x * along,
    y: rest.y + pose.dir.y * along * 0.45 - up,
  };
}

/**
 * 手的待机位置：**三档视角锚点**，不是连续角度插值。
 * 这是 goengine D52 之前的做法（`handAnchors[3][2]`）：front/back/side 各一组固定值，
 * 过对角线时手直接跳过去。D52 之后 Go 才换成 360° 连续插值，这里按用户要求回退到旧版。
 * 数值按 demo 的 32×48 贴图尺度缩过（Go 原表是 64×96 那套）。
 */
export const HAND_ANCHORS: Record<View, [Vec2, Vec2]> = {
  front: [
    { x: -8, y: -2 },
    { x: 8, y: -2 },
  ],
  back: [
    { x: -8, y: -4 },
    { x: 8, y: -4 },
  ],
  side: [
    { x: -2.5, y: -6 },
    { x: 5, y: -2 },
  ],
};

export function handRest(view: View, i: number, flip: boolean): Vec2 {
  const a = HAND_ANCHORS[view][i];
  return { x: flip ? -a.x : a.x, y: a.y };
}

/** 走路时手只做前后交替摆动；静止位置由 handRest 决定，不再跟着移动方向旋转。 */
export function handBob(pose: LimbPose, rig: Rig, i: number): Vec2 {
  const d = pose.dir;
  const ph = pose.phase + i * Math.PI;
  const along = Math.sin(ph) * rig.handAlong * pose.blend;
  const lift = Math.sin(ph + 0.7) * rig.handLift * pose.blend;
  return { x: d.x * along, y: d.y * along - lift };
}

/** 身体轻微上下起伏，纯粹让静止→行走的过渡更可信。 */
export function bodyBob(pose: LimbPose, rig: Rig): number {
  return Math.abs(Math.sin(pose.phase)) * rig.bodyBob * pose.blend;
}

export const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * 序列帧只用于特效（走路不用帧）。对应 goengine 的 game/art/fxanim.go。
 * frames 是显式帧序，不扫目录；缺帧直接报错，否则动画「看着正常但会跳」。
 */
export interface FxAnim {
  frames: string[];
  fps: number;
  loop: boolean;
  scale: number;
}

export function fxFrameIndex(anim: FxAnim, t: number): number {
  const n = anim.frames.length;
  const i = Math.floor(t * anim.fps);
  if (anim.loop) return i % n;
  return Math.min(i, n - 1);
}

export function fxDuration(anim: FxAnim): number {
  return anim.frames.length / anim.fps;
}

export function fxFinished(anim: FxAnim, t: number): boolean {
  return !anim.loop && t >= fxDuration(anim);
}

export function fxFrame(
  anim: FxAnim,
  t: number,
  atlas: { has(name: string): boolean },
): string {
  const name = anim.frames[fxFrameIndex(anim, t)];
  if (!atlas.has(name)) throw new Error(`FxAnim 缺帧：${name}`);
  return name;
}
