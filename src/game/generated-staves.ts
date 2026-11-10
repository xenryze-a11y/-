/** 生图原稿作为内嵌素材；启动时合入 CPU 图集，仍只上传一个 TextureSource。 */
import sheetURL from './assets/staves-generated.png?inline';
import type { BuiltAtlas } from '../engine/art';
import { SKILL_IDS } from './items';

export const STAFF_FRAME = { width: 40, height: 64, gripY: 48 };

/** 透明边缘落到整数像素并限制色阶，避免缩小后把生图的软边带进像素世界。 */
function crisp(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')!;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] < 100) image.data[i + 3] = 0;
    else {
      image.data[i + 3] = 255;
      for (let c = 0; c < 3; c++)
        image.data[i + c] = Math.round(image.data[i + c] / 17) * 17;
    }
  }
  context.putImageData(image, 0, 0);
}

export async function applyGeneratedStaves(
  atlas: BuiltAtlas,
): Promise<boolean> {
  try {
    const image = new Image();
    image.src = sheetURL;
    await image.decode();
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    const sourceContext = source.getContext('2d', {
      willReadFrequently: true,
    })!;
    sourceContext.drawImage(image, 0, 0);
    const pixels = sourceContext.getImageData(
      0,
      0,
      source.width,
      source.height,
    ).data;
    const patches: {
      canvas: HTMLCanvasElement;
      frame: BuiltAtlas['frames'][string];
    }[] = [];
    for (let index = 0; index < SKILL_IDS.length; index++) {
      const id = SKILL_IDS[index],
        x0 = Math.floor((index * image.width) / SKILL_IDS.length),
        x1 = Math.floor(((index + 1) * image.width) / SKILL_IDS.length);
      let left = x1,
        right = x0,
        top = image.height,
        bottom = 0;
      // 低透明度的生成噪点不参与裁切边界；每一列都独立归一化。
      for (let y = 0; y < image.height; y++)
        for (let x = x0; x < x1; x++) {
          if (pixels[(y * image.width + x) * 4 + 3] < 100) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      if (right <= left || bottom <= top)
        throw new Error(`生成法杖缺少第 ${index + 1} 列`);
      const canvas = document.createElement('canvas');
      canvas.width = STAFF_FRAME.width;
      canvas.height = STAFF_FRAME.height;
      const g = canvas.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      const sw = right - left + 1,
        sh = bottom - top + 1,
        width = Math.round(Math.min(29, (sw / sh) * 60)),
        x = Math.floor((canvas.width - width) / 2);
      const grip = Math.round(sh * 0.6);
      // 把握柄对齐统一锚点：华丽杖头保留辨识度，杖尾不穿到角色脚底之下。
      g.drawImage(
        source,
        left,
        top,
        sw,
        grip,
        x,
        2,
        width,
        STAFF_FRAME.gripY - 2,
      );
      g.drawImage(
        source,
        left,
        top + grip,
        sw,
        sh - grip,
        x,
        STAFF_FRAME.gripY,
        width,
        canvas.height - STAFF_FRAME.gripY - 2,
      );
      crisp(canvas);
      const frame = atlas.frames['staff_' + id];
      if (!frame || frame.w !== canvas.width || frame.h !== canvas.height)
        throw new Error(`法杖图集规格不匹配：${id}`);
      patches.push({ canvas, frame });
      const icon = document.createElement('canvas');
      icon.width = 40;
      icon.height = 40;
      const iconContext = icon.getContext('2d')!;
      iconContext.imageSmoothingEnabled = false;
      iconContext.translate(20, 20);
      iconContext.rotate(0.48);
      iconContext.scale(0.5, 0.5);
      iconContext.drawImage(canvas, -20, -32);
      crisp(icon);
      const item = atlas.frames['item_' + id];
      if (!item || item.w !== 40 || item.h !== 40)
        throw new Error(`物品图集规格不匹配：${id}`);
      patches.push({ canvas: icon, frame: item });
    }
    // 全部解码和验证成功再覆盖，任意一列失败都保留整套后备图。
    const atlasContext = atlas.canvas.getContext('2d')!;
    atlasContext.imageSmoothingEnabled = false;
    for (const { canvas, frame } of patches) {
      atlasContext.clearRect(frame.x, frame.y, frame.w, frame.h);
      atlasContext.drawImage(canvas, frame.x, frame.y);
    }
    return true;
  } catch (error) {
    console.warn('[art] 生图法杖解码失败，保留完整程序化后备美术', error);
    return false;
  }
}
