/** 程序化神树、哥特建筑与 NPC。全部先画入同一像素图集。 */
import type { Painter, Spec } from '../engine/art';
import { makeRng } from '../engine/math';
const C = {
  ink: '#233733',
  deep: '#274c43',
  leaf: '#426d54',
  mint: '#8cba8b',
  gold: '#d3c38a',
  ivory: '#eee6c1',
  stone: '#8a9085',
  shade: '#4b5a59',
  dark: '#303e44',
  roof: '#34414c',
  roofLight: '#53626a',
};
function poly(p: Painter, points: number[][], color: string): void {
  const g = p.ctx;
  g.fillStyle = color;
  g.beginPath();
  points.forEach(([x, y], i) =>
    i
      ? g.lineTo(Math.round(x), Math.round(y))
      : g.moveTo(Math.round(x), Math.round(y)),
  );
  g.closePath();
  g.fill();
}
function arch(
  p: Painter,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  p.rect(x, y + w * 0.45, w, h - w * 0.45, color);
  poly(
    p,
    [
      [x, y + w * 0.48],
      [x + w * 0.15, y + w * 0.2],
      [x + w * 0.5, y],
      [x + w * 0.85, y + w * 0.2],
      [x + w, y + w * 0.48],
    ],
    color,
  );
}
function window(p: Painter, x: number, y: number, w: number, h: number): void {
  arch(p, x - 3, y - 4, w + 6, h + 5, C.shade);
  arch(p, x, y, w, h, C.gold);
  arch(p, x + 3, y + 4, w - 6, h - 6, '#29454b');
  for (let i = 0; i < 3; i++)
    arch(
      p,
      x + 5 + (i * (w - 10)) / 3,
      y + 8,
      (w - 13) / 3,
      h - 15,
      ['#528e96', '#bbab77', '#7da77c'][i],
    );
  p.rect(x + w / 2 - 1, y + 7, 2, h - 8, C.ivory);
  p.rect(x + 3, y + h * 0.58, w - 6, 2, C.gold);
}
function cross(p: Painter, x: number, y: number, size: number): void {
  p.rect(x - 1, y - size, 3, size * 2, C.gold);
  p.rect(x - size * 0.6, y - size * 0.35, size * 1.2, 3, C.ivory);
}
function masonry(
  p: Painter,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
): void {
  p.rect(x, y, w, h, C.stone);
  const rng = makeRng(seed);
  for (let yy = y; yy < y + h; yy += 12) {
    p.rect(x, yy, w, 1, '#63706a');
    for (
      let xx = x + (Math.floor((yy - y) / 12) % 2 ? 12 : 0);
      xx < x + w;
      xx += 24
    ) {
      p.rect(xx, yy, 1, 12, '#69776d');
      if (rng() < 0.4) p.rect(xx + 3, yy + 3, 14, 1, '#a6ac98');
    }
  }
}
function foliage(
  p: Painter,
  x: number,
  y: number,
  r: number,
  seed: number,
  sacred: boolean,
): void {
  const rng = makeRng(seed);
  const shades = sacred
    ? ['#2e5047', '#567d61', '#82a780', '#b7c99b', '#e8dfaf']
    : ['#233f35', '#35583e', '#4b7048', '#6b8953', '#8d9d66'];
  for (let yy = -r; yy <= r; yy += 4)
    for (let xx = -r; xx <= r; xx += 4) {
      const d = Math.hypot(xx, yy * 1.13);
      if (d > r - 2 + rng() * 5) continue;
      const light = (-xx * 0.18 - yy * 0.55) / r,
        index = Math.min(
          4,
          Math.max(0, Math.floor(1.5 + light * 2 + rng() * 1.2)),
        );
      p.rect(x + xx, y + yy, 5, 5, shades[index]);
      if (rng() < 0.11)
        p.rect(x + xx, y + yy, 3, 1, shades[Math.min(4, index + 1)]);
    }
}
export function drawSacredTree(p: Painter): void {
  p.ring(160, 125, 113, 2, '#697f65');
  p.ring(160, 125, 108, 1, '#bdbb78');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2,
      x = 160 + Math.cos(a) * 116,
      y = 125 + Math.sin(a) * 116;
    p.rect(x - 1, y - 4, 2, 9, C.gold);
    p.rect(x - 4, y - 1, 9, 2, C.gold);
  }
  // 分叉、根系和明暗树皮，轮廓保持阶梯像素。
  for (const [dx, dy] of [
    [-80, 10],
    [-55, -4],
    [75, 12],
    [55, -8],
  ]) {
    p.line(160, 330, 160 + dx, 340 + dy, '#454c3c', 14);
    p.line(160, 330, 160 + dx, 340 + dy, '#b5b296', 6);
  }
  poly(
    p,
    [
      [139, 337],
      [150, 250],
      [129, 206],
      [105, 174],
      [117, 168],
      [157, 202],
      [174, 181],
      [195, 134],
      [208, 139],
      [194, 202],
      [179, 240],
      [184, 337],
    ],
    '#5b6651',
  );
  poly(
    p,
    [
      [146, 337],
      [158, 252],
      [148, 210],
      [155, 194],
      [164, 226],
      [177, 198],
      [169, 256],
      [176, 337],
    ],
    '#bdbba0',
  );
  p.line(161, 322, 165, 250, '#f1e5b6', 4);
  for (const [x, y, r, seed] of [
    [84, 154, 60, 14],
    [228, 150, 62, 24],
    [127, 102, 73, 35],
    [196, 85, 65, 44],
    [158, 53, 46, 56],
    [66, 111, 39, 78],
    [263, 112, 36, 92],
  ])
    foliage(p, x, y, r, seed, true);
  p.line(161, 324, 161, 278, '#7bbfa3', 3);
  p.line(161, 278, 151, 287, '#d3f0c5', 2);
  p.line(151, 287, 171, 299, '#d3f0c5', 2);
  p.line(171, 299, 160, 309, '#d3f0c5', 2);
  for (let i = 0; i < 22; i++) {
    const a = i * 2.399,
      r = 35 + (i % 5) * 18,
      x = 160 + Math.cos(a) * r,
      y = 135 + Math.sin(a) * r * 0.75;
    p.rect(x, y, 2, 4, i % 3 ? C.gold : C.ivory);
  }
}
export function drawForestTree(p: Painter): void {
  p.line(47, 120, 47, 61, '#3b3b2d', 13);
  p.line(46, 120, 46, 66, '#8c7750', 7);
  p.line(43, 117, 26, 125, '#796a47', 6);
  p.line(49, 117, 69, 124, '#6c6144', 5);
  for (const [x, y, r, seed] of [
    [30, 49, 25, 1],
    [65, 48, 27, 2],
    [45, 29, 28, 3],
    [48, 66, 23, 4],
  ])
    foliage(p, x, y, r, seed, false);
  p.line(47, 88, 31, 67, '#7e7049', 4);
}
function roof(p: Painter): void {
  // 不透明的建筑占地封面：在外部无论从哪边观察都不能透见室内。
  p.rect(32, 160, 480, 704, '#434b4c');
  masonry(p, 32, 162, 480, 702, 14);
  p.rect(45, 172, 454, 642, C.dark);
  // 侧廊屋面及飞扶壁。
  for (const side of [0, 1]) {
    const x = side ? 419 : 47;
    poly(
      p,
      [
        [x, 206],
        [x + 78, 222],
        [x + 78, 773],
        [x, 798],
      ],
      '#46535a',
    );
    for (let y = 235; y < 770; y += 94) {
      p.rect(side ? 479 : 32, y, 33, 15, C.shade);
      p.rect(side ? 479 : 32, y - 3, 33, 4, '#b0b39c');
      poly(
        p,
        side
          ? [
              [446, y + 18],
              [498, y - 21],
              [511, y - 21],
              [457, y + 31],
            ]
          : [
              [35, y - 21],
              [47, y - 21],
              [100, y + 18],
              [88, y + 31],
            ],
        '#a6aa98',
      );
      p.rect(side ? 500 : 32, y - 28, 12, 24, '#d0cbb0');
    }
  }
  // 中殿陡峭石板屋顶，沿脊线向两侧铺片。
  poly(
    p,
    [
      [102, 224],
      [272, 168],
      [442, 224],
      [442, 762],
      [272, 820],
      [102, 762],
    ],
    C.roof,
  );
  for (let y = 232; y < 766; y += 12) {
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < 8; i++) {
        const x = side ? 274 + i * 20 : 110 + i * 20;
        p.rect(
          x + (Math.floor(y / 12) % 2 ? 6 : 0),
          y,
          17,
          2,
          side ? '#3f4d59' : '#65736f',
        );
      }
    p.rect(268, y - 2, 7, 12, '#899180');
  }
  p.line(271, 174, 271, 810, '#c5ba90', 4);
  p.line(106, 225, 106, 758, '#8d998c', 3);
  p.line(439, 225, 439, 758, '#697c74', 3);
  // 横翼、天窗与中央灯塔把中殿组织成哥特十字结构，避免只有一整块长屋面。
  poly(
    p,
    [
      [39, 410],
      [102, 379],
      [442, 379],
      [505, 410],
      [505, 488],
      [442, 515],
      [102, 515],
      [39, 488],
    ],
    '#3b4b53',
  );
  for (let x = 54; x < 500; x += 18) {
    p.line(x, 411, x + 10, 439, '#6c7d7a', 2);
    p.line(x + 10, 446, x, 487, '#4c6066', 2);
  }
  p.line(43, 442, 500, 442, C.gold, 3);
  for (const y of [292, 564])
    for (const x of [119, 379]) {
      masonry(p, x, y + 25, 45, 43, x + y);
      poly(
        p,
        [
          [x - 6, y + 27],
          [x + 22, y - 5],
          [x + 51, y + 27],
        ],
        '#71867b',
      );
      poly(
        p,
        [
          [x, y + 25],
          [x + 22, y + 2],
          [x + 45, y + 25],
        ],
        '#344951',
      );
      window(p, x + 11, y + 27, 24, 35);
    }
  masonry(p, 235, 361, 74, 119, 19);
  p.rect(228, 470, 88, 9, C.gold);
  window(p, 247, 379, 23, 61);
  window(p, 277, 379, 21, 61);
  p.rect(230, 354, 84, 10, '#c6c8ac');
  poly(
    p,
    [
      [222, 357],
      [272, 246],
      [322, 357],
    ],
    '#293e48',
  );
  poly(
    p,
    [
      [272, 246],
      [322, 357],
      [279, 357],
    ],
    '#526c70',
  );
  p.line(272, 250, 272, 354, C.gold, 3);
  cross(p, 272, 233, 12);
  for (const x of [232, 305]) {
    p.rect(x, 342, 7, 21, '#d6d4af');
    poly(
      p,
      [
        [x - 3, 343],
        [x + 4, 326],
        [x + 11, 343],
      ],
      '#6d8a7a',
    );
  }
  // 北侧后殿与可通行北门，面向神树的朝圣入口。
  arch(p, 214, 151, 116, 72, '#788778');
  window(p, 247, 162, 50, 49);
  p.rect(247, 216, 50, 11, '#202d30');
  p.rect(244, 226, 56, 3, C.gold);
  // 南侧双塔和主立面，尖拱、玫瑰窗与层叠门廊。
  masonry(p, 84, 748, 376, 116, 6);
  poly(
    p,
    [
      [164, 750],
      [272, 671],
      [380, 750],
    ],
    '#a7aa96',
  );
  poly(
    p,
    [
      [178, 748],
      [272, 683],
      [366, 748],
    ],
    '#68786f',
  );
  p.ring(272, 739, 32, 5, C.gold);
  p.disc(272, 739, 26, '#29474f');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.line(
      272,
      739,
      272 + Math.cos(a) * 25,
      739 + Math.sin(a) * 25,
      '#a5c0a5',
      2,
    );
    p.disc(
      272 + Math.cos(a) * 16,
      739 + Math.sin(a) * 16,
      3,
      i % 2 ? '#6eb5bd' : '#d6bf81',
    );
  }
  p.ring(272, 739, 10, 2, C.ivory);
  arch(p, 229, 782, 86, 82, C.shade);
  arch(p, 237, 789, 70, 75, C.gold);
  arch(p, 244, 798, 56, 66, '#17282c');
  p.rect(272, 815, 2, 49, '#b5a575');
  p.line(248, 831, 269, 818, '#615b43', 2);
  p.line(277, 818, 297, 831, '#615b43', 2);
  for (const x of [147, 367]) window(p, x, 783, 30, 64);
  for (const x of [53, 415]) {
    masonry(p, x, 670, 76, 194, x);
    p.rect(x - 7, 688, 90, 8, '#b1b39c');
    p.rect(x - 5, 765, 86, 8, C.gold);
    window(p, x + 21, 698, 34, 55);
    window(p, x + 22, 795, 32, 53);
    poly(
      p,
      [
        [x - 7, 673],
        [x + 38, 568],
        [x + 83, 673],
      ],
      '#293b43',
    );
    poly(
      p,
      [
        [x + 38, 568],
        [x + 83, 673],
        [x + 43, 673],
      ],
      '#46565b',
    );
    p.line(x + 38, 569, x + 38, 668, C.gold, 2);
    cross(p, x + 38, 558, 10);
    for (const dx of [-2, 69]) {
      p.rect(x + dx, 650, 9, 38, '#babda4');
      poly(
        p,
        [
          [x + dx - 3, 651],
          [x + dx + 4, 630],
          [x + dx + 12, 651],
        ],
        '#63776d',
      );
    }
  }
  p.rect(79, 858, 386, 5, C.gold);
  cross(p, 272, 676, 9);
  for (const x of [195, 333]) {
    arch(p, x - 10, 788, 20, 56, C.shade);
    p.disc(x, 801, 5, '#c6c9ab');
    poly(
      p,
      [
        [x - 5, 809],
        [x + 5, 809],
        [x + 8, 838],
        [x - 8, 838],
      ],
      '#b8bea5',
    );
    p.line(x - 9, 815, x + 9, 815, C.gold, 2);
    p.rect(x - 10, 839, 20, 4, '#d2cdb0');
  }
}
function interior(p: Painter): void {
  p.rect(0, 0, 480, 704, '#343d3d');
  for (let y = 0; y < 704; y += 16)
    for (let x = 0; x < 480; x += 16) {
      p.rect(
        x + 1,
        y + 1,
        15,
        15,
        (x / 16 + y / 16) % 2 ? '#647068' : '#737c70',
      );
      p.rect(x + 2, y + 2, 13, 1, '#839084');
    }
  p.rect(179, 16, 122, 669, '#837247');
  p.rect(183, 16, 114, 669, '#423e48');
  p.rect(188, 16, 104, 669, '#693e45');
  p.rect(192, 16, 2, 669, '#ba9c64');
  p.rect(286, 16, 2, 669, '#ba9c64');
  for (let y = 72; y < 650; y += 48) {
    p.ring(240, y, 12, 1, '#a2875d');
    p.line(232, y, 248, y, '#bda46c');
    p.line(240, y - 8, 240, y + 8, '#bda46c');
  }
  // 侧墙旗帜与礼拜龛。
  for (const y of [150, 286, 422, 558])
    for (const x of [14, 440]) {
      p.rect(x, y, 26, 3, '#b5aa74');
      p.rect(x + 3, y + 3, 20, 43, '#775054');
      poly(
        p,
        [
          [x + 3, y + 46],
          [x + 13, y + 54],
          [x + 23, y + 46],
        ],
        '#775054',
      );
      cross(p, x + 12, y + 24, 8);
    }
  // 彩窗在地上的块状光斑与横向肋拱投影。
  for (let y = 100; y < 650; y += 128) {
    for (let i = 0; i < 5; i++) {
      p.rect(
        34 + i * 17,
        y + i * 4,
        17,
        34,
        ['#779283', '#6d8e91', '#a29c72', '#768e94', '#8c9372'][i],
      );
      p.rect(
        358 + i * 17,
        y - i * 4,
        17,
        34,
        ['#748a80', '#8d8b6a', '#778d91', '#9e976e', '#7e8f78'][i],
      );
    }
    p.rect(20, y + 49, 440, 3, '#566159');
  }
  p.rect(150, 604, 180, 76, '#919886');
  p.rect(155, 599, 170, 70, '#a8ac92');
  p.rect(160, 595, 160, 65, '#7a877c');
  p.rect(170, 598, 140, 2, C.gold);
}
function herald(p: Painter): void {
  // 分层羽翼与光环，身形仍用方块轮廓，与新版旅人协调。
  p.ring(48, 24, 17, 2, C.gold);
  p.ring(48, 24, 14, 1, C.ivory);
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const x = 48 + side * (18 + i * 3),
        y = 52 - i * 5;
      poly(
        p,
        [
          [x, y],
          [48 + side * 43, 24 + i * 4],
          [48 + side * (39 - i * 2), 59 + i * 4],
          [48 + side * 14, 75],
        ],
        i % 2 ? '#c6d3b3' : '#9eaf9e',
      );
      p.line(x, y, 48 + side * (39 - i * 2), 59 + i * 4, '#e3e5c6', 2);
    }
  p.rect(37, 47, 22, 44, '#d9ddbd');
  p.rect(38, 48, 7, 42, '#acbca6');
  p.rect(46, 48, 5, 43, C.ivory);
  p.rect(34, 48, 7, 23, C.gold);
  p.rect(56, 48, 7, 23, C.gold);
  p.rect(39, 72, 18, 3, C.gold);
  p.rect(39, 28, 18, 19, '#e1c5a0');
  p.rect(38, 25, 20, 7, '#e7e0be');
  p.rect(39, 29, 4, 11, '#c4bd9c');
  p.rect(43, 36, 2, 2, '#475c57');
  p.rect(53, 36, 2, 2, '#475c57');
  p.rect(46, 43, 6, 1, '#b68e70');
  p.rect(60, 65, 5, 7, '#e4c8a4');
  p.line(65, 62, 65, 92, C.gold, 3);
  cross(p, 65, 56, 5);
  p.rect(42, 91, 13, 2, C.ivory);
}
function priest(p: Painter): void {
  p.rect(13, 28, 24, 27, '#e0d5b0');
  p.rect(14, 32, 7, 23, '#a2a48e');
  p.rect(24, 30, 5, 25, '#c6af74');
  p.rect(12, 32, 6, 17, '#d1d4b6');
  p.rect(34, 32, 6, 17, '#d1d4b6');
  p.rect(12, 47, 5, 6, '#d7b38b');
  p.rect(35, 47, 5, 6, '#d7b38b');
  p.rect(16, 10, 18, 20, '#d7b38b');
  p.rect(15, 8, 20, 8, '#b8b3a0');
  p.rect(16, 16, 3, 11, '#aba694');
  p.rect(20, 19, 2, 2, '#334741');
  p.rect(28, 19, 2, 2, '#334741');
  p.rect(21, 25, 9, 5, '#d2c7ad');
  p.rect(19, 54, 8, 6, '#3b4341');
  p.rect(28, 54, 8, 6, '#3b4341');
  cross(p, 26, 39, 4);
}
export function sanctuarySpecs(): Spec[] {
  return [
    { name: 'cathedralRoof', w: 544, h: 864, draw: roof },
    { name: 'cathedralInterior', w: 480, h: 704, draw: interior },
    ...Array.from({ length: 4 }, (_, i) => ({
      name: 'npcHerald_' + i,
      w: 96,
      h: 112,
      draw: herald,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      name: 'npcPriest_' + i,
      w: 48,
      h: 64,
      draw: priest,
    })),
    { name: 'npcHerald', w: 96, h: 112, draw: herald },
    { name: 'npcPriest', w: 48, h: 64, draw: priest },
    {
      name: 'propChurchPew',
      w: 88,
      h: 44,
      draw: (p) => {
        p.rect(3, 22, 82, 15, '#332d2c');
        p.rect(5, 7, 78, 22, '#665344');
        p.rect(7, 8, 74, 3, '#a58c5e');
        p.rect(4, 29, 80, 7, '#97744d');
        for (const x of [7, 77]) {
          p.rect(x, 31, 5, 11, '#463b30');
          p.rect(x, 5, 4, 26, '#bc9b64');
        }
        p.rect(11, 16, 64, 2, '#806848');
      },
    },
    {
      name: 'propChurchColumn',
      w: 40,
      h: 104,
      draw: (p) => {
        p.rect(3, 91, 34, 11, '#53635a');
        p.rect(6, 86, 28, 10, '#a4aa92');
        p.rect(10, 16, 20, 73, '#818e7d');
        p.rect(13, 18, 5, 68, '#b9bca0');
        p.rect(25, 18, 4, 68, '#5e7268');
        p.rect(5, 10, 30, 9, '#bcc0a2');
        p.rect(8, 5, 24, 6, C.gold);
      },
    },
    {
      name: 'propChurchCandles',
      w: 32,
      h: 48,
      draw: (p) => {
        p.rect(9, 43, 15, 3, '#a99b6e');
        p.line(16, 19, 16, 43, '#c5ad73', 3);
        p.line(6, 26, 26, 26, '#9e9167', 2);
        for (const x of [5, 15, 25]) {
          p.rect(x, 13, 3, 14, '#eee0b3');
          p.rect(x - 1, 10, 5, 5, '#dca759');
          p.rect(x, 9, 3, 4, '#fff1b7');
        }
      },
    },
    {
      name: 'propChurchAltar',
      w: 112,
      h: 72,
      draw: (p) => {
        p.rect(8, 44, 96, 26, C.shade);
        p.rect(13, 40, 86, 26, '#abae91');
        p.rect(6, 35, 100, 8, '#e7dfb6');
        p.rect(38, 40, 38, 28, '#e5d8a6');
        p.rect(44, 44, 26, 21, '#667c68');
        cross(p, 57, 54, 7);
        for (const x of [17, 88]) {
          p.rect(x, 19, 3, 15, C.ivory);
          p.disc(x + 1, 16, 3, '#f3cf79');
        }
        p.rect(46, 22, 25, 10, '#67464b');
        p.rect(48, 22, 21, 2, C.ivory);
      },
    },
  ];
}
