/** 生成特效仅替换图集帧，命中 / 预兆 / 消退仍由纯模拟状态控制。 */
import type { BuiltAtlas, AtlasFrame } from '../engine/art';
import effectsURL from './assets/scythe-vfx.png?inline';
import frameJSON from './assets/scythe-vfx-frames.json?raw';
export async function applyGeneratedScytheVfx(
  atlas: BuiltAtlas,
): Promise<boolean> {
  try {
    const im = new Image();
    im.src = effectsURL;
    await im.decode();
    const frames = JSON.parse(frameJSON) as Record<string, AtlasFrame>;
    if (Object.keys(frames).length !== 15) return false;
    for (const [name, f] of Object.entries(frames)) {
      const target = atlas.frames[name];
      if (
        !target ||
        target.w !== f.w ||
        target.h !== f.h ||
        f.x < 0 ||
        f.y < 0 ||
        f.x + f.w > im.width ||
        f.y + f.h > im.height
      )
        return false;
    }
    const g = atlas.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const [name, f] of Object.entries(frames)) {
      const target = atlas.frames[name];
      g.clearRect(target.x, target.y, target.w, target.h);
      g.drawImage(
        im,
        f.x,
        f.y,
        f.w,
        f.h,
        target.x,
        target.y,
        target.w,
        target.h,
      );
    }
    return true;
  } catch (error) {
    console.warn('[atlas] 魔镰生成特效解码失败，保留程序后备', error);
    return false;
  }
}
