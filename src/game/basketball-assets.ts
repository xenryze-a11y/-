/** 视频序列与生图字粒子都在 CPU 图集合成，运行时不请求外部素材。 */
import danceURL from './assets/summon-dance.png?inline';
import glyphURL from './assets/kun-generated.png?inline';
import type { BuiltAtlas } from '../engine/art';
import { SUMMON_ANIMATION } from './basketball-content';

async function decode(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}
export async function applyBasketballAssets(
  atlas: BuiltAtlas,
): Promise<boolean> {
  try {
    const [dance, glyph] = await Promise.all([
      decode(danceURL),
      decode(glyphURL),
    ]);
    const patches: { name: string; canvas: HTMLCanvasElement }[] = [];
    for (let i = 0; i < SUMMON_ANIMATION.durations.length; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      canvas
        .getContext('2d')!
        .drawImage(dance, i * 48, 0, 48, 48, 0, 0, 48, 48);
      patches.push({ name: 'summon_' + i, canvas });
    }
    const source = document.createElement('canvas');
    source.width = glyph.width;
    source.height = glyph.height;
    const g = source.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(glyph, 0, 0);
    const rgba = g.getImageData(0, 0, source.width, source.height).data;
    let left = source.width,
      top = source.height,
      right = 0,
      bottom = 0;
    for (let y = 0; y < source.height; y++)
      for (let x = 0; x < source.width; x++)
        if (rgba[(y * source.width + x) * 4 + 3] >= 100) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    if (right <= left || bottom <= top) throw Error('坤字素材为空');
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      source,
      left,
      top,
      right - left + 1,
      bottom - top + 1,
      1,
      1,
      30,
      30,
    );
    const pixels = context.getImageData(0, 0, 32, 32);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i + 3] = pixels.data[i + 3] < 100 ? 0 : 255;
      for (let c = 0; c < 3; c++)
        pixels.data[i + c] = Math.round(pixels.data[i + c] / 17) * 17;
    }
    context.putImageData(pixels, 0, 0);
    patches.push({ name: 'kunGlyph', canvas });
    for (const patch of patches) {
      const f = atlas.frames[patch.name];
      if (!f || f.w !== patch.canvas.width || f.h !== patch.canvas.height)
        throw Error('篮球帧规格不匹配');
    }
    const target = atlas.canvas.getContext('2d')!;
    for (const patch of patches) {
      const f = atlas.frames[patch.name];
      target.clearRect(f.x, f.y, f.w, f.h);
      target.drawImage(patch.canvas, f.x, f.y);
    }
    return true;
  } catch (error) {
    console.warn('[art] 篮球素材解码失败，使用程序化后备帧', error);
    return false;
  }
}
