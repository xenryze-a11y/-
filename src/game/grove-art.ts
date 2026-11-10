import type { BuiltAtlas, Spec, Painter } from '../engine/art';
import treesURL from './assets/grove-trees.png?inline';
import iconsURL from './assets/mage-icons.png?inline';
import { MAGE_IDS } from './mage-data';
export function drawElectricOrb(p: Painter, frame: number): void {
  const cy = 16;
  p.disc(16, cy, 12, '#173b4b');
  p.disc(16, cy, 9, '#286f84');
  p.disc(16, cy, 6, '#6ae2e8');
  p.disc(17, cy - 1, 3, '#e8fff0');
  for (let i = 0; i < 6; i++) {
    const a = ((i + frame / 8) / 6) * Math.PI * 2,
      x = 16 + Math.cos(a) * 11,
      y = 16 + Math.sin(a) * 11;
    p.line(
      x,
      y,
      x + Math.cos(a + 0.6) * 5,
      y + Math.sin(a + 0.6) * 5,
      '#b8ffff',
    );
  }
  p.line(11, 9, 18, 14, '#f1ffed', 2);
  p.line(18, 14, 12, 20, '#f1ffed', 2);
}
export function groveSpecs(): Spec[] {
  const specs: Spec[] = [
    {
      name: 'propAncientTree',
      w: 320,
      h: 352,
      draw: (p) => {
        p.disc(160, 114, 105, '#284a37');
        p.disc(100, 140, 78, '#35543b');
        p.disc(215, 130, 85, '#375e43');
        p.line(160, 170, 160, 345, '#574b32', 36);
        p.line(155, 180, 155, 335, '#83c3a3', 3);
      },
    },
    {
      name: 'propAltar',
      w: 128,
      h: 96,
      draw: (p) => {
        p.rect(10, 69, 108, 25, '#293b3b');
        p.rect(15, 66, 98, 23, '#657875');
        p.rect(19, 63, 90, 21, '#88958a');
        p.rect(24, 58, 80, 19, '#354c4d');
        p.rect(27, 56, 74, 16, '#a3aa8c');
        p.rect(30, 59, 68, 10, '#526c67');
        p.line(28, 74, 100, 74, '#c3be92', 2);
        p.line(20, 86, 108, 86, '#b8b19a', 2);
        p.rect(47, 35, 35, 24, '#394e4f');
        p.rect(45, 31, 39, 8, '#a7b5a2');
        p.rect(50, 33, 29, 3, '#5de9dc');
        p.line(63, 17, 57, 27, '#b7f9df', 3);
        p.line(57, 27, 69, 27, '#b7f9df', 3);
        p.line(69, 27, 62, 37, '#b7f9df', 3);
        for (const x of [14, 104]) {
          p.rect(x, 35, 10, 30, '#263f3d');
          p.rect(x + 2, 31, 6, 30, '#76897a');
          p.disc(x + 5, 24, 6, '#3e9890');
          p.disc(x + 5, 23, 3, '#bbffda');
        }
        p.rect(57, 67, 14, 3, '#e7cf8e');
        p.rect(62, 64, 3, 9, '#e7cf8e');
      },
    },
  ];
  for (const id of MAGE_IDS)
    specs.push({
      name: 'skill_' + id,
      w: 64,
      h: 64,
      draw: (p) => {
        p.rect(0, 0, 64, 64, '#142e38');
        p.ring(32, 32, 23, 2, '#73e4dc');
        p.line(30, 8, 20, 32, '#caffed', 4);
        p.line(20, 32, 42, 32, '#caffed', 4);
        p.line(42, 32, 27, 57, '#caffed', 4);
      },
    });
  for (let i = 0; i < 8; i++)
    specs.push({
      name: 'electricOrb_' + i,
      w: 32,
      h: 32,
      draw: (p) => drawElectricOrb(p, i),
    });
  return specs;
}
async function decode(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}
export async function applyGroveArt(atlas: BuiltAtlas): Promise<boolean> {
  try {
    const [trees, icons] = await Promise.all([
      decode(treesURL),
      decode(iconsURL),
    ]);
    const patches = [
      { name: 'propTree', image: trees, sx: 0, sy: 0, w: 96, h: 128 },
      { name: 'propAncientTree', image: trees, sx: 96, sy: 0, w: 320, h: 352 },
      ...MAGE_IDS.map((id, i) => ({
        name: 'skill_' + id,
        image: icons,
        sx: i * 64,
        sy: 0,
        w: 64,
        h: 64,
      })),
    ];
    for (const p of patches) {
      const f = atlas.frames[p.name];
      if (!f || f.w !== p.w || f.h !== p.h) throw Error('林地美术帧规格不符');
    }
    const g = atlas.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const p of patches) {
      const f = atlas.frames[p.name];
      g.clearRect(f.x, f.y, f.w, f.h);
      g.drawImage(p.image, p.sx, p.sy, p.w, p.h, f.x, f.y, f.w, f.h);
    }
    return true;
  } catch (error) {
    console.warn('[art] 林地美术解码失败，使用完整后备像素图', error);
    return false;
  }
}
