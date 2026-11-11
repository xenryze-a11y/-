/** 按材质和视角生成可替换部件。正/背/侧各独立画法，左向由骨架镜像。 */
import type { Painter, Spec } from '../engine/art';
import type { View } from '../engine/facing';
import { ARMOR_COLORS, ARMOR_MATS, type ArmorMat } from './armor';
import { blockFrame } from './block-rig';
const skin = '#d8b58e',
  skinShade = '#ab825f',
  ink = '#263b3c';
function head(p: Painter, mat: ArmorMat, view: View): void {
  const side = view === 'side',
    c = ARMOR_COLORS[mat],
    x = side ? 5 : 3,
    w = side ? 14 : 18;
  p.rect(x - 1, 4, w + 2, 20, ink);
  p.rect(x, 5, w, 18, skin);
  p.rect(x, 5, side ? 4 : 3, 18, skinShade);
  if (view === 'back') {
    p.rect(x, 4, w, 18, '#544536');
    p.rect(x + 3, 7, w - 3, 12, '#775d42');
    p.rect(x + 2, 20, w - 4, 3, skinShade);
  } else {
    p.rect(x, 4, w, 6, '#574635');
    p.rect(x, 9, side ? 4 : 3, 7, '#6b5239');
    p.rect(x + 5, 5, w - 6, 2, '#967447');
    if (side) {
      p.rect(15, 12, 3, 2, '#f1e2b6');
      p.rect(17, 12, 2, 2, '#304b4d');
      p.rect(18, 15, 2, 4, skin);
      p.rect(15, 20, 3, 1, '#926b50');
    } else {
      for (const xx of [7, 15]) {
        p.rect(xx, 12, 3, 2, '#f1e2b6');
        p.rect(xx + 1, 12, 2, 2, '#304b4d');
      }
      p.rect(10, 18, 4, 1, skinShade);
      p.rect(9, 21, 6, 1, '#996e55');
    }
  }
  if (mat !== 'none') {
    p.rect(x - 1, 3, w + 2, 7, c.dark);
    p.rect(x, 3, w, 5, c.mid);
    p.rect(x + 1, 3, w - 2, 2, c.light);
    p.rect(x - 1, 10, 3, 10, c.mid);
    if (!side) p.rect(x + w - 2, 10, 3, 10, c.dark);
    p.rect(x - 1, 8, w + 2, 2, c.trim);
    if (view === 'back') p.rect(x, 11, w, 10, c.mid);
    if (mat === 'sanctum') {
      p.rect(11, 0, 3, 5, c.trim);
      p.rect(8, 2, 9, 2, c.light);
    }
  }
}
function body(p: Painter, mat: ArmorMat, view: View): void {
  const c = ARMOR_COLORS[mat],
    side = view === 'side',
    x = side ? 6 : 3,
    w = side ? 12 : 18;
  p.rect(x - 1, 1, w + 2, 19, ink);
  p.rect(x, 1, w, 18, c.mid);
  p.rect(x, 2, side ? 4 : 3, 17, c.dark);
  p.rect(x + 3, 2, w - 4, 2, c.light);
  p.rect(x, 16, w, 3, '#4c4033');
  p.rect(side ? 12 : 11, 16, 3, 3, c.trim);
  if (view !== 'back') {
    p.rect(side ? 14 : 11, 3, 3, 11, c.trim);
    if (mat === 'sanctum') {
      p.rect(8, 6, 9, 2, c.light);
      p.rect(11, 4, 3, 8, c.light);
    } else if (mat === 'none') p.rect(8, 5, 8, 2, '#a5b9ad');
  } else {
    p.rect(x + 3, 5, w - 6, 1, c.light);
    p.rect(x + 4, 11, w - 7, 3, c.dark);
  }
}
function limb(p: Painter, part: string, mat: ArmorMat, view: View): void {
  const c = ARMOR_COLORS[mat],
    side = view === 'side';
  if (part === 'hand') {
    p.rect(
      0,
      0,
      6,
      6,
      mat === 'iron' || mat === 'sanctum' ? c.dark : skinShade,
    );
    p.rect(1, 0, 5, 5, mat === 'iron' || mat === 'sanctum' ? c.light : skin);
    return;
  }
  const w = part === 'leg' ? 7 : 6;
  p.rect(0, 0, w, p.h, ink);
  p.rect(
    1,
    0,
    w - 1,
    p.h - 1,
    part === 'leg' && mat === 'none' ? '#3f4d57' : c.mid,
  );
  p.rect(side ? 1 : 2, 1, 2, p.h - 2, c.light);
  p.rect(w - 2, 2, 2, p.h - 3, c.dark);
  if (mat !== 'none') {
    p.rect(1, part === 'leg' ? 8 : 3, w - 1, 2, c.trim);
    if (part === 'arm') p.rect(0, 0, w, 3, c.light);
  }
}
function boot(p: Painter, mat: string, view: View): void {
  const c = ARMOR_COLORS[mat as ArmorMat] || ARMOR_COLORS.none,
    bare = mat === 'bare',
    side = view === 'side';
  p.rect(1, 0, side ? 7 : 8, 8, bare ? skinShade : c.dark);
  p.rect(2, 0, side ? 5 : 6, 6, bare ? skin : c.mid);
  p.rect(side ? 2 : 1, 5, side ? 8 : 8, 3, bare ? skin : c.light);
  p.rect(1, 8, 9, 1, ink);
  if (!bare) p.rect(3, 1, 4, 1, c.trim);
}
export function drawArmorIcon(p: Painter, mat: ArmorMat, slot: string): void {
  const c = ARMOR_COLORS[mat];
  if (slot === 'head') {
    p.rect(7, 7, 26, 22, c.dark);
    p.rect(9, 6, 22, 9, c.mid);
    p.rect(10, 7, 20, 3, c.light);
    p.rect(8, 14, 6, 17, c.mid);
    p.rect(27, 14, 6, 17, c.mid);
    p.rect(12, 12, 16, 3, c.trim);
  } else if (slot === 'chest') {
    p.rect(9, 7, 22, 27, c.dark);
    p.rect(4, 8, 10, 13, c.mid);
    p.rect(27, 8, 10, 13, c.mid);
    p.rect(11, 9, 18, 22, c.mid);
    p.rect(13, 9, 14, 4, c.light);
    p.rect(18, 13, 5, 13, c.trim);
    p.rect(12, 29, 17, 3, c.trim);
  } else {
    p.rect(8, 6, 25, 11, c.mid);
    p.rect(8, 14, 11, 22, c.mid);
    p.rect(23, 14, 10, 22, c.mid);
    p.rect(10, 17, 3, 14, c.light);
    p.rect(25, 17, 3, 14, c.light);
    p.rect(8, 6, 25, 3, c.trim);
    p.rect(9, 26, 9, 3, c.trim);
    p.rect(24, 26, 8, 3, c.trim);
  }
}
export function blockSpecs(): Spec[] {
  const out: Spec[] = [];
  for (const view of ['front', 'back', 'side'] as View[])
    for (const mat of ARMOR_MATS) {
      out.push(
        {
          name: blockFrame('head', mat, view),
          w: 24,
          h: 24,
          draw: (p) => head(p, mat, view),
        },
        {
          name: blockFrame('body', mat, view),
          w: 24,
          h: 20,
          draw: (p) => body(p, mat, view),
        },
      );
      for (const part of ['arm', 'hand', 'leg'])
        out.push({
          name: blockFrame(part, mat, view),
          w: part === 'leg' ? 8 : 6,
          h: part === 'hand' ? 6 : part === 'arm' ? 17 : 14,
          draw: (p) => limb(p, part, mat, view),
        });
    }
  for (const view of ['front', 'back', 'side'] as View[])
    for (const mat of [
      'bare',
      'cloth',
      'leather',
      'iron',
      'sanctum',
      'zombieBare',
    ])
      out.push({
        name: blockFrame('boot', mat, view),
        w: 10,
        h: 9,
        draw: (p) => boot(p, mat, view),
      });
  return out;
}
