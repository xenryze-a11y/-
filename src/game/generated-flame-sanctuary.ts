/** 火焰特效和重像素圣域素材只覆盖 CPU 图集，统一上传、无运行时网络依赖。 */
import type { BuiltAtlas, AtlasFrame } from '../engine/art';
import flameURL from './assets/flame-vfx.png?inline';
import flameJSON from './assets/flame-vfx-frames.json?raw';
import sanctuaryURL from './assets/sanctuary-generated.png?inline';
import sanctuaryJSON from './assets/sanctuary-generated-frames.json?raw';
async function applySheet(
  atlas: BuiltAtlas,
  url: string,
  json: string,
  count: number,
  aliases: Record<string, string> = {},
): Promise<boolean> {
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const frames = JSON.parse(json) as Record<string, AtlasFrame>;
    if (Object.keys(frames).length !== count) return false;
    for (const [name, source] of Object.entries(aliases))
      frames[name] = frames[source];
    for (const [name, f] of Object.entries(frames)) {
      const target = atlas.frames[name];
      if (
        !target ||
        target.w !== f.w ||
        target.h !== f.h ||
        f.x < 0 ||
        f.y < 0 ||
        f.x + f.w > image.width ||
        f.y + f.h > image.height
      )
        return false;
    }
    const g = atlas.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const [name, f] of Object.entries(frames)) {
      const t = atlas.frames[name];
      g.clearRect(t.x, t.y, t.w, t.h);
      g.drawImage(image, f.x, f.y, f.w, f.h, t.x, t.y, t.w, t.h);
    }
    return true;
  } catch (error) {
    console.warn('[atlas] 火焰 / 圣域生成素材解码失败，保留程序后备', error);
    return false;
  }
}
export const applyGeneratedFlameArt = (atlas: BuiltAtlas) =>
  applySheet(atlas, flameURL, flameJSON, 12);
export const applyGeneratedSanctuaryArt = (atlas: BuiltAtlas) =>
  applySheet(atlas, sanctuaryURL, sanctuaryJSON, 10, {
    npcHerald: 'npcHerald_0',
    npcPriest: 'npcPriest_0',
  });
