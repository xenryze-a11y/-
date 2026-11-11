/** 新地面 / 教堂 / 根床先预留完整后备帧，生成图仅原子覆盖 CPU 图集。 */
import type { BuiltAtlas, Spec } from '../engine/art';
import imageURL from './assets/sanctum-rebuilt.png?inline';
import framesJSON from './assets/sanctum-rebuilt-frames.json?raw';
import type { AtlasFrame } from '../engine/art';
export function sanctumGroundSpecs(): Spec[] {
  const out: Spec[] = [];
  for (const name of [
    'tileSanctumPave0',
    'tileSanctumPave1',
    'tileSanctumGrass',
    'tileSanctumPath',
  ])
    out.push({
      name,
      w: 32,
      h: 32,
      draw: (p) => {
        p.rect(
          0,
          0,
          32,
          32,
          name.includes('Grass')
            ? '#4e704c'
            : name.includes('Path')
              ? '#79653f'
              : '#6e8072',
        );
        if (name.includes('Pave')) {
          p.rect(2, 2, 13, 12, '#8d9b86');
          p.rect(17, 3, 13, 16, '#acb6a0');
          p.rect(3, 17, 11, 13, '#8d9b86');
          p.rect(17, 22, 12, 8, '#8d9b86');
        }
      },
    });
  out.push(
    {
      name: 'groundSacredRoots',
      w: 256,
      h: 128,
      draw: (p) => {
        p.ctx.globalAlpha = 0.8;
        p.disc(128, 64, 60, '#4e704c');
        p.ctx.globalAlpha = 1;
      },
    },
    {
      name: 'groundSacredGarden',
      w: 96,
      h: 48,
      draw: (p) => {
        for (let i = 0; i < 6; i++) {
          p.disc(12 + i * 13, 36 - (i % 3) * 5, 10, '#617d55');
          p.rect(10 + i * 13, 29 - (i % 3) * 5, 4, 4, '#ede4c1');
        }
      },
    },
    {
      name: 'groundSacredMosaic',
      w: 128,
      h: 128,
      draw: (p) => {
        p.disc(64, 64, 60, '#6e8072');
        p.ring(64, 64, 54, 4, '#c4ac68');
        p.disc(64, 64, 18, '#c4ac68');
      },
    },
  );
  return out;
}
export async function applyRebuiltSanctumArt(
  atlas: BuiltAtlas,
): Promise<boolean> {
  try {
    const im = new Image();
    im.src = imageURL;
    await im.decode();
    const frames = JSON.parse(framesJSON) as Record<string, AtlasFrame>;
    if (Object.keys(frames).length !== 15) return false;
    for (const [name, f] of Object.entries(frames)) {
      const t = atlas.frames[name];
      if (
        !t ||
        t.w !== f.w ||
        t.h !== f.h ||
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
      const t = atlas.frames[name];
      g.clearRect(t.x, t.y, t.w, t.h);
      g.drawImage(im, f.x, f.y, f.w, f.h, t.x, t.y, t.w, t.h);
    }
    return true;
  } catch (error) {
    console.warn('[atlas] 圣域翻新素材失败，保留完整后备', error);
    return false;
  }
}
