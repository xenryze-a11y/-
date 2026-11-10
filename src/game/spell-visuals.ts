/** 像素特效内容表。只描述表现，不参与伤害或冷却。 */
import type { SkillId } from './items';

export const PIXEL_FX = {
  grid: 2,
  fps: 15,
  projectileFrames: 8,
  maxParticles: 480,
  maxBursts: 48,
  maxBolts: 32,
  trailSpacing: 5,
};
export const SPELL_COLORS: Record<
  SkillId,
  { dark: number; mid: number; light: number; core: number }
> = {
  ember: { dark: 0x7e302c, mid: 0xe26736, light: 0xffb95f, core: 0xffedbd },
  frost: { dark: 0x314d7f, mid: 0x63b7db, light: 0xa5e7f1, core: 0xf0fbf0 },
  storm: { dark: 0x22465e, mid: 0x55b4cf, light: 0x9cece9, core: 0xeefff0 },
  ward: { dark: 0x35654e, mid: 0x79b18c, light: 0xc8e1a5, core: 0xfff0ca },
  blink: { dark: 0x433663, mid: 0x8b6dc4, light: 0xbca3ee, core: 0xcff3ef },
};
export interface VisualKeyframe {
  frame: number;
  scale: number;
  alpha: number;
  tween?: boolean;
}

/**
 * 迁自 demo/gh-pages native-rig.js 的 nativeSample：保留区间定位和禁用补间语义，
 * 去掉骨骼/图片依赖。原文件 02856f0；本项目按自身尺寸播放，不写回模拟。
 */
export function sampleVisualTrack(
  frames: readonly VisualKeyframe[],
  time: number,
): { scale: number; alpha: number } {
  if (!frames.length) return { scale: 1, alpha: 0 };
  let a = frames[0],
    b = a;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].frame <= time) {
      a = frames[i];
      b = frames[i + 1] || a;
    } else break;
  }
  const progress =
    a.tween === false || b.frame === a.frame
      ? 0
      : Math.max(0, Math.min(1, (time - a.frame) / (b.frame - a.frame)));
  return {
    scale: a.scale + (b.scale - a.scale) * progress,
    alpha: a.alpha + (b.alpha - a.alpha) * progress,
  };
}
/** skill20101_add / sgskill_h 原有 26 帧的 0.8→1.1 呼吸光环。 */
export const LEGACY_HALO: readonly VisualKeyframe[] = [
  { frame: 0, scale: 0.8, alpha: 1 },
  { frame: 25, scale: 1.1, alpha: 0 },
];
export const CAST_ENVELOPE: readonly VisualKeyframe[] = [
  { frame: 0, scale: 0.45, alpha: 0 },
  { frame: 3, scale: 0.75, alpha: 1 },
  { frame: 8, scale: 1.18, alpha: 0.95 },
  { frame: 13, scale: 1, alpha: 0.65 },
  { frame: 19, scale: 1.08, alpha: 0.25 },
  { frame: 26, scale: 1.15, alpha: 0 },
];
