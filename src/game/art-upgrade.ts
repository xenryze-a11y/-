/** 程序化增强美术：只是画图，不读写模拟，不动态生成 GPU 贴图。 */
import type { Painter, Spec, Skin } from '../engine/art';
import type { View } from '../engine/facing';
import { makeRng } from '../engine/math';
import { basketballSpecs, drawBasketball } from './basketball-art';
import { drawSpellMissile } from './spell-art';
import { PIXEL_FX } from './spell-visuals';
import { ITEMS, SKILL_IDS, type ItemId } from './items';

export function detailTile(p: Painter, type: string, seed: number): void {
  const rng = makeRng(seed ^ 0x13572);
  if (type === 'grass') {
    p.rect(0, 0, 32, 32, '#3e5541');
    for (let i = 0; i < 110; i++) {
      const x = rng() * 32,
        y = rng() * 32;
      p.rect(
        x,
        y,
        1 + rng() * 2,
        1,
        ['#465d43', '#354b3c', '#4b6247', '#526c4b'][i % 4],
      );
    }
    for (let i = 0; i < 9; i++) {
      const x = rng() * 30,
        y = 3 + rng() * 28;
      p.line(x, y, x - 1, y - 3, '#618154');
      p.line(x + 1, y, x + 2, y - 2, '#536c48');
    }
    for (let i = 0; i < 3; i++) p.rect(rng() * 32, rng() * 32, 1, 1, '#a89e68');
  }
  if (type === 'dirt' || type === 'road') {
    p.rect(0, 0, 32, 32, type === 'road' ? '#80715a' : '#665c48');
    for (let i = 0; i < 95; i++) {
      let x = rng() * 32,
        y = rng() * 32;
      p.rect(x, y, 1 + rng() * 2, 1, i % 3 ? '#736951' : '#978568');
    }
    for (let i = 0; i < 6; i++) {
      let x = rng() * 29,
        y = rng() * 30;
      p.rect(x, y, 2, 2, '#5f5c4d');
      p.rect(x, y, 2, 1, '#a4997c');
    }
  }
  if (type === 'floor') {
    p.rect(0, 0, 32, 32, '#65513c');
    for (let y = 0; y < 32; y += 8) {
      p.rect(0, y, 32, 1, '#302f29');
      p.rect(0, y + 1, 32, 1, '#92764e');
      p.rect(y % 16 ? 7 : 23, y, 1, 8, '#3e382c');
    }
    for (let i = 0; i < 20; i++)
      p.rect(rng() * 32, rng() * 32, 3, 1, i % 2 ? '#735a40' : '#584832');
  }
  if (type === 'stone') {
    p.rect(0, 0, 32, 32, '#656e66');
    for (let y = 0; y < 32; y += 8)
      for (let x = -8; x < 32; x += 16) {
        let xx = x + (y % 16 ? 8 : 0);
        p.rect(xx, y, 15, 7, '#747b6f');
        p.rect(xx, y, 15, 1, '#8d9481');
        p.rect(xx, y + 7, 16, 1, '#4d5850');
      }
    for (let i = 0; i < 18; i++)
      p.rect(rng() * 32, rng() * 32, 2, 1, '#5c6859');
  }
  if (type === 'water') {
    p.rect(0, 0, 32, 32, '#294e55');
    for (let i = 0; i < 14; i++) {
      const x = rng() * 30,
        y = rng() * 31;
      p.rect(x, y, 3 + rng() * 7, 1, i % 3 ? '#32636a' : '#528082');
    }
  }
}
export function detailBody(
  p: Painter,
  view: View,
  palette: Skin,
  zombie: boolean,
): void {
  const side = view === 'side',
    x = side ? 11 : 10,
    w = side ? 8 : 12;
  p.rect(x + 1, 17, 1, 10, palette.trim);
  p.rect(x + w - 2, 18, 1, 9, palette.clothDark);
  p.rect(x + 2, 30, w - 3, 1, palette.trim);
  if (!zombie) {
    if (view === 'back') {
      p.rect(10, 17, 12, 13, palette.clothDark);
      p.line(11, 18, 13, 28, palette.cloth);
      p.line(20, 18, 19, 29, palette.trim);
      p.rect(14, 21, 4, 1, palette.trim);
      p.rect(15, 20, 2, 3, palette.trim);
    } else {
      p.rect(side ? 11 : 9, 17, side ? 3 : 5, 3, '#87949b');
      p.rect(side ? 11 : 9, 17, side ? 3 : 5, 1, '#c0c4af');
      if (!side) {
        p.rect(19, 17, 4, 3, '#87949b');
        p.rect(19, 17, 4, 1, '#c0c4af');
      }
    }
  } else {
    p.rect(x + 1, 24, 2, 3, '#394237');
    p.line(x + 4, 18, x + 5, 25, '#786e56');
    p.rect(x + 2, 29, 2, 3, '#33372c');
  }
}
export function detailHead(
  p: Painter,
  view: View,
  palette: Skin,
  hood: boolean,
  zombie: boolean,
): void {
  if (hood) {
    p.rect(10, 3, 12, 1, palette.cloth);
    p.line(10, 4, 10, 9, palette.trim);
    if (view === 'front') {
      p.rect(12, 10, 8, 1, palette.skinDark);
      p.rect(14, 11, 1, 1, '#fff0c0');
      p.rect(19, 11, 1, 1, '#fff0c0');
      p.rect(14, 15, 5, 1, palette.skinDark);
    }
    if (view === 'side') {
      p.rect(22, 10, 1, 2, palette.skin);
      p.rect(19, 11, 1, 1, '#fff0c0');
    }
  } else if (zombie && view !== 'back') {
    p.rect(view === 'side' ? 19 : 13, 11, 2, 1, '#f5b47a');
    p.rect(16, 15, 2, 1, '#ddd1a0');
    p.rect(11, 5, 2, 2, '#546d53');
  }
}
export function detailProp(p: Painter, type: string, seed: number): void {
  const rng = makeRng(seed ^ 756);
  if (type === 'tree') {
    p.rect(20, 36, 8, 25, '#302e25');
    p.rect(22, 36, 3, 24, '#746044');
    p.rect(23, 43, 1, 15, '#ac8955');
    p.line(21, 53, 17, 60, '#393e2c', 2);
    p.line(26, 53, 31, 60, '#393e2c', 2);
    for (let i = 0; i < 100; i++) {
      let x = 9 + rng() * 30,
        y = 5 + rng() * 33;
      if (Math.hypot((x - 24) * 0.85, y - 21) < 17)
        p.rect(
          x,
          y,
          2 + rng() * 3,
          1,
          i % 5 === 0 ? '#7b9257' : i % 3 ? '#506c46' : '#314f3c',
        );
    }
    p.rect(18, 10, 5, 1, '#93a467');
    p.rect(15, 15, 3, 1, '#8d9e61');
  }
  if (type === 'grave') {
    p.line(6, 6, 8, 23, '#adb0a0');
    p.rect(6, 27, 14, 2, '#5f7554');
    p.line(18, 5, 15, 11, '#535e56');
    p.rect(5, 4, 13, 1, '#c1beaa');
  }
  if (type === 'crate') {
    for (let i = 7; i < 28; i += 6) {
      p.rect(i, 9, 1, 15, '#443e30');
      p.rect(i + 1, 9, 1, 15, '#9f8051');
    }
    p.rect(4, 6, 24, 1, '#ccaa6b');
    for (let x of [5, 25]) for (let y of [8, 25]) p.rect(x, y, 2, 2, '#c3b88e');
  }
  if (type === 'rock') {
    p.line(7, 10, 12, 7, '#a3ae99', 2);
    p.line(11, 16, 17, 13, '#8e9c8b');
    p.line(8, 21, 18, 21, '#3d4f43');
    p.rect(5, 22, 6, 1, '#72875a');
  }
}
function drawWall(p: Painter, seed: number, topOpen: boolean): void {
  const rng = makeRng(seed);
  p.rect(0, 0, 32, 32, '#747e72');
  for (let i = 0; i < 65; i++)
    p.rect(rng() * 32, rng() * 31, 2, 1, i % 2 ? '#818b7a' : '#657461');
  p.rect(0, 0, 32, 2, '#a2a58b');
  p.rect(0, 0, 1, 32, '#919a83');
  p.rect(31, 0, 1, 64, '#303d37');
  p.rect(0, 32, 32, 32, '#4e5b53');
  for (let y = 32; y < 64; y += 8)
    for (let x = -16; x < 32; x += 16) {
      const xx = x + (y % 16 ? 8 : 0);
      p.rect(xx, y, 15, 7, '#687367');
      p.rect(xx + 1, y, 13, 1, '#87907a');
      p.rect(xx, y + 7, 16, 1, '#36473f');
    }
  p.rect(0, 31, 32, 3, '#aaa78b');
  p.rect(0, 34, 32, 2, '#454f43');
  for (let i = 0; i < 22; i++) {
    const x = rng() * 32,
      y = 36 + rng() * 26;
    p.rect(x, y, 1, 2, '#536b4b');
  }
  if (topOpen) {
    p.rect(1, 2, 30, 1, '#b7b597');
    p.rect(2, 4, 3, 1, '#96a079');
  }
}

export function upgradeSpecs(
  drawProp: (p: Painter, kind: string, seed: number) => void,
  drawWeapon: (p: Painter, kind: string) => void,
): Spec[] {
  const specs: Spec[] = basketballSpecs();
  for (const element of SKILL_IDS) {
    specs.push({
      name: 'staff_' + element,
      w: 40,
      h: 64,
      draw: (p) => {
        p.ctx.translate(4, 10);
        drawWeapon(p, 'staff');
        p.disc(16, 6, 5, '#27302a');
        p.disc(16, 6, 4, ITEMS[element].color);
        p.disc(15, 5, 1, '#fff7d7');
        p.rect(13, 12, 6, 1, '#c0a473');
        p.rect(15, 16, 1, 26, '#a38759');
      },
    });
    for (let frame = 0; frame < PIXEL_FX.projectileFrames; frame++)
      specs.push({
        name: `missile_${element}_${frame}`,
        w: 32,
        h: 24,
        draw: (p) => drawSpellMissile(p, element, frame),
      });
  }
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    const item = ITEMS[id];
    specs.push({
      name: 'item_' + id,
      w: 40,
      h: 40,
      draw: (p) => {
        if (item.kind === 'staff') {
          p.line(12, 33, 25, 10, '#232a25', 5);
          p.line(13, 33, 25, 10, '#a08a5e', 2);
          p.line(16, 28, 18, 28, '#d2ba7d', 3);
          p.disc(26, 9, 7, '#24312b');
          p.disc(26, 9, 5, item.color);
          p.disc(25, 7, 2, '#f7f6d9');
          p.line(19, 12, 22, 16, '#ddc68a', 2);
          p.line(29, 14, 32, 9, '#ddc68a', 2);
          if (id === 'frost') {
            p.line(26, 2, 26, 16, '#d3faff');
            p.line(20, 7, 31, 11, '#d3faff');
          }
          if (id === 'storm') {
            p.line(26, 3, 23, 9, '#fcf7d7', 2);
            p.line(23, 9, 29, 9, '#fcf7d7', 2);
            p.line(29, 9, 25, 15, '#fcf7d7', 2);
          }
          if (id === 'ward') p.ring(26, 9, 7, 1, '#d8efbb');
          if (id === 'blink') p.disc(26, 9, 2, '#534579');
        } else if (id === 'basketball') {
          drawBasketball(p, 20, 20, 16);
        } else if (id === 'sword') {
          p.line(11, 33, 30, 5, '#1c2d27', 6);
          p.line(13, 30, 30, 6, '#9aadaa', 4);
          p.line(15, 29, 31, 5, '#e1e7cf', 1);
          p.line(9, 24, 20, 31, '#c4ab6b', 3);
          p.line(9, 34, 14, 28, '#795e43', 3);
          p.disc(9, 35, 2, '#d0bc7e');
        } else if (id === 'health' || id === 'mana') {
          p.ctx.save();
          p.ctx.translate(5, 3);
          p.ctx.scale(30 / 16, 30 / 16);
          drawProp(p, id, 0);
          p.ctx.restore();
          p.rect(16, 28, 9, 1, item.color);
        } else if (id === 'wood') {
          p.rect(11, 9, 20, 24, '#342e24');
          p.rect(13, 9, 16, 23, '#76563a');
          p.rect(16, 10, 2, 21, '#b18a55');
          p.rect(24, 10, 2, 21, '#4f412c');
          p.disc(21, 10, 9, '#c6a772');
          p.ring(21, 10, 6, 1, '#87673f');
          p.ring(21, 10, 3, 1, '#87673f');
        } else if (id === 'planks') {
          for (let i = 0; i < 3; i++) {
            p.rect(6, 9 + i * 8, 28, 7, '#a58453');
            p.rect(7, 9 + i * 8, 26, 1, '#debd80');
            p.rect(9, 13 + i * 8, 16, 1, '#7c603a');
            p.rect(8, 11 + i * 8, 1, 1, '#3d3928');
          }
        } else if (id === 'stone') {
          p.disc(21, 23, 12, '#394e41');
          p.disc(19, 19, 11, '#82917c');
          p.line(10, 15, 21, 11, '#c0c5a3', 2);
          p.line(20, 27, 30, 20, '#576e5b', 2);
          p.rect(9, 27, 6, 2, '#677f4b');
        } else if (id === 'crystal') {
          p.line(20, 6, 11, 21, '#54416e', 5);
          p.line(20, 6, 28, 21, '#b99be0', 4);
          p.line(12, 21, 20, 34, '#8d6bb0', 5);
          p.line(28, 21, 20, 34, '#77559a', 4);
          p.line(20, 8, 20, 31, '#dfc9fa', 3);
          p.rect(12, 20, 16, 1, '#d3b8ed');
        } else if (id === 'herb') {
          p.line(18, 33, 22, 9, '#6f9657', 2);
          p.line(20, 26, 10, 20, '#b0cc82', 3);
          p.line(22, 20, 30, 13, '#87b46d', 4);
          p.line(20, 17, 14, 11, '#b1d092', 4);
          p.disc(23, 8, 3, '#d1df9a');
          p.rect(10, 32, 20, 2, '#546f42');
        } else if (id === 'crate') {
          p.ctx.save();
          p.ctx.translate(3, 3);
          p.ctx.scale(34 / 32, 34 / 32);
          drawProp(p, 'crate', 0);
          p.ctx.restore();
          p.rect(17, 13, 7, 2, '#d9d09c');
          p.rect(19, 11, 2, 7, '#d9d09c');
        } else if (item.kind === 'boots') {
          const dark = id === 'iron' ? '#61757a' : '#775739',
            light = id === 'iron' ? '#c1d2ca' : '#bf9c66';
          for (let x of [7, 22]) {
            p.rect(x, 9, 10, 19, '#28382e');
            p.rect(x + 1, 10, 8, 15, dark);
            p.rect(x + 1, 25, 12, 6, light);
            p.rect(x, 31, 14, 2, '#27352b');
            p.rect(x + 2, 12, 6, 2, light);
          }
        }
      },
    });
  }
  for (let i = 0; i < 4; i++)
    specs.push({
      name: 'tileWallRaised' + i,
      w: 32,
      h: 64,
      draw: (p) => drawWall(p, i * 1721 + 44, i % 2 === 0),
    });
  specs.push({
    name: 'partPropShadow',
    w: 64,
    h: 24,
    draw: (p) => {
      const g = p.ctx;
      g.scale(2.7, 1);
      const gradient = g.createRadialGradient(12, 12, 0, 12, 12, 12);
      gradient.addColorStop(0, 'rgba(5,19,14,.38)');
      gradient.addColorStop(1, 'rgba(5,19,14,0)');
      g.fillStyle = gradient;
      g.fillRect(0, 0, 24, 24);
    },
  });
  specs.push({
    name: 'partGlow',
    w: 128,
    h: 128,
    draw: (p) => {
      const g = p.ctx,
        gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,185,91,.32)');
      gradient.addColorStop(0.2, 'rgba(241,159,71,.14)');
      gradient.addColorStop(1, 'rgba(255,134,35,0)');
      g.fillStyle = gradient;
      g.fillRect(0, 0, 128, 128);
    },
  });
  return specs;
}
