/** 沿用地图颗粒的程序像素地标，不引入外部图片或独立 GPU 纹理。 */
import type { Spec, Painter } from '../engine/art';
import { Tile } from '../engine/level';
import { regionAt } from './world-data';
const rune = (p: Painter, x: number, y: number, c: string) => {
  p.line(x, y - 13, x + 9, y, c, 3);
  p.line(x + 9, y, x, y + 13, c, 3);
  p.line(x, y + 13, x - 9, y, c, 3);
  p.line(x - 9, y, x, y - 13, c, 3);
  p.rect(x - 1, y - 17, 3, 34, c);
};
function landmark(p: Painter, kind: string, active = false): void {
  p.rect(8, p.h - 14, p.w - 16, 10, '#293b36');
  p.rect(5, p.h - 8, p.w - 10, 6, '#5d6856');
  if (kind === 'waypoint') {
    p.rect(19, 16, 26, 57, '#314b50');
    p.rect(22, 10, 20, 63, '#516e70');
    p.rect(24, 8, 16, 5, '#8fa89b');
    p.rect(23, 16, 3, 51, '#738d83');
    rune(p, 32, 40, active ? '#bdfff0' : '#6f9997');
    p.rect(15, 71, 34, 6, '#74846e');
  } else if (kind === 'camp') {
    p.line(13, 54, 48, 43, '#50372e', 5);
    p.line(17, 43, 48, 55, '#8c603e', 5);
    p.disc(32, 39, 13, '#a23e2d');
    p.disc(32, 36, 9, '#ee863b');
    p.rect(28, 20, 7, 22, '#f4b94d');
    p.rect(32, 29, 4, 14, '#fff2ad');
    p.rect(3, 13, 13, 28, '#4d6556');
    p.rect(6, 10, 7, 30, '#7b8061');
  } else if (kind === 'cache') {
    if (active) {
      p.rect(11, 19, 43, 10, '#5b432e');
      p.rect(11, 36, 43, 17, '#302b25');
    } else {
      p.rect(10, 26, 44, 29, '#513a28');
      p.rect(12, 21, 40, 14, '#986a3e');
      p.rect(15, 23, 34, 4, '#bd8b4c');
    }
    p.rect(12, 46, 40, 12, '#815934');
    p.rect(17, 25, 4, 32, '#b7a46a');
    p.rect(44, 25, 4, 32, '#b7a46a');
    p.rect(29, 36, 8, 11, '#d6bd73');
    p.rect(32, 39, 3, 5, '#493e2f');
  } else if (kind === 'vista') {
    p.rect(17, 24, 14, 42, '#54655d');
    p.rect(49, 12, 13, 54, '#455c53');
    p.rect(19, 18, 10, 13, '#82907b');
    p.rect(51, 8, 9, 8, '#8b977d');
    p.rect(29, 37, 22, 9, '#687a66');
    p.rect(34, 32, 13, 5, '#a1ab86');
    p.rect(36, 25, 9, 9, '#cfcca0');
    p.rect(10, 62, 59, 8, '#889277');
  } else {
    p.rect(13, 18, 9, 51, '#607368');
    p.rect(43, 18, 9, 51, '#607368');
    p.rect(17, 13, 32, 8, '#88937c');
    p.rect(20, 8, 25, 5, '#adb191');
    p.rect(25, 4, 15, 5, '#7f8c74');
    p.rect(9, 67, 48, 8, '#829078');
    rune(p, 32, 42, active ? '#f2dba0' : '#a97bce');
    p.rect(28, 70, 8, 6, active ? '#e5c788' : '#806095');
  }
}
export function explorationSpecs(): Spec[] {
  const specs: Spec[] = [];
  for (const [name, kind, w, h] of [
    ['Waystone', 'waypoint', 64, 88],
    ['Camp', 'camp', 64, 64],
    ['Chest', 'cache', 64, 64],
    ['Vista', 'vista', 80, 80],
    ['Shrine', 'shrine', 64, 88],
  ] as const)
    for (const active of [false, true])
      specs.push({
        name: `land${name}${active ? 'Active' : ''}`,
        w,
        h,
        draw: (p) => landmark(p, kind, active),
      });
  specs.push({
    name: 'propBlightTree',
    w: 96,
    h: 128,
    draw: (p) => {
      p.line(47, 120, 45, 41, '#332f36', 12);
      p.line(44, 75, 20, 48, '#4c454b', 7);
      p.line(49, 64, 75, 32, '#4c454b', 7);
      p.line(48, 93, 77, 70, '#37343b', 6);
      for (const [x, y, r] of [
        [22, 41, 18],
        [44, 25, 24],
        [69, 29, 20],
        [76, 60, 15],
        [28, 65, 17],
      ]) {
        p.disc(x, y, r, '#343d46');
        p.disc(x - 3, y - 5, r - 5, '#46534f');
        p.rect(x - 10, y - 6, 13, 4, '#657766');
      }
      p.rect(42, 80, 3, 36, '#7e715f');
      p.line(47, 111, 28, 125, '#575846', 6);
      p.line(48, 111, 68, 124, '#575846', 6);
      for (const [x, y] of [
        [21, 106],
        [60, 112],
        [72, 88],
      ]) {
        p.rect(x, y, 3, 10, '#9e9b79');
        p.rect(x - 5, y - 3, 13, 5, '#987394');
        p.rect(x - 2, y - 5, 6, 2, '#c0a1b0');
      }
    },
  });
  specs.push({
    name: 'propRuinArch',
    w: 80,
    h: 112,
    draw: (p) => {
      for (const x of [8, 58]) {
        p.rect(x, 35, 14, 70, '#53665f');
        p.rect(x + 2, 32, 8, 73, '#83917f');
        for (let y = 42; y < 99; y += 14) p.rect(x, y, 14, 2, '#3f534e');
        p.rect(x - 4, 102, 22, 6, '#68796a');
      }
      p.rect(18, 25, 44, 12, '#61796b');
      p.rect(26, 15, 29, 13, '#90a08b');
      p.rect(35, 8, 10, 10, '#a5af94');
      p.rect(7, 92, 10, 8, '#88957c');
      p.rect(62, 69, 10, 4, '#adb397');
      p.rect(21, 35, 6, 16, '#374e48');
      p.rect(50, 31, 6, 13, '#374e48');
    },
  });
  for (const [name, base, spot] of [
    ['Forest', '#344742', '#53584e'],
    ['Ruins', '#66726c', '#a3a78c'],
  ] as const)
    specs.push({
      name: 'tileExplore' + name,
      w: 32,
      h: 32,
      draw: (p) => {
        p.rect(0, 0, 32, 32, base);
        for (let i = 0; i < 20; i++) {
          const x = (i * 17 + 3) % 32,
            y = (i * 11 + 5) % 32;
          p.rect(x, y, 2 + (i % 3), 2, spot);
        }
        if (name === 'Ruins') {
          p.rect(0, 0, 32, 2, '#465b53');
          p.rect(0, 16, 32, 2, '#465b53');
          p.rect(15, 0, 2, 16, '#465b53');
        }
      },
    });
  return specs;
}
export function explorationGroundFrame(
  x: number,
  y: number,
  tile: number,
): string | undefined {
  if (
    tile === Tile.WALL ||
    tile === Tile.WATER ||
    tile === Tile.ROAD ||
    tile === Tile.FLOOR
  )
    return;
  const region = regionAt({ x: (x + 0.5) * 32, y: (y + 0.5) * 32 });
  return region === 'forest'
    ? 'tileExploreForest'
    : region === 'sanctum' && x >= 96
      ? 'tileExploreRuins'
      : undefined;
}
