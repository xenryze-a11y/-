/** 清楚的大色块与三档明暗；只在启动时画进原图集，不增加每帧绘制。 */
import { Painter, type BuiltAtlas } from '../engine/art';
import { Tile, type Level } from '../engine/level';

const INK = '#294b48';
const STONE = ['#506c74', '#8ca6a4', '#c8d6bc', '#647f83'];
const polygon = (p: Painter, pts: number[][], color: string): void => {
  // 逐行填充多边形，避免 canvas 抗锯齿产生半透明糊边。
  const min = Math.ceil(Math.min(...pts.map((v) => v[1])));
  const max = Math.floor(Math.max(...pts.map((v) => v[1])));
  for (let y = min; y <= max; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2)
      p.rect(
        Math.ceil(xs[i]),
        y,
        Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1,
        1,
        color,
      );
  }
};
function slab(p: Painter, x: number, y: number, w: number, h: number): void {
  p.rect(x, y, w, h, INK);
  p.rect(x + 2, y + 2, w - 4, h - 4, STONE[1]);
  p.rect(x + 2, y + 2, w - 4, 3, STONE[2]);
  p.rect(x + 2, y + h - 6, w - 4, 4, STONE[0]);
}
function crystal(p: Painter, x: number, y: number, active = false): void {
  polygon(
    p,
    [
      [x, y - 18],
      [x + 11, y],
      [x, y + 15],
      [x - 11, y],
    ],
    INK,
  );
  polygon(
    p,
    [
      [x, y - 14],
      [x + 7, y],
      [x, y + 11],
      [x - 7, y],
    ],
    active ? '#b6fff0' : '#53c9cf',
  );
  polygon(
    p,
    [
      [x, y - 14],
      [x, y + 8],
      [x - 7, y],
    ],
    '#a4f3db',
  );
  p.rect(x - 3, y - 5, 3, 8, '#efffda');
}
function tree(p: Painter, blight = false, dead = false): void {
  const greens = blight
    ? ['#293f48', '#3f6466', '#5d8580', '#89ad8e']
    : ['#294f43', '#397d55', '#61a65c', '#a2cb6e'];
  polygon(
    p,
    [
      [31, 123],
      [39, 104],
      [38, 48],
      [53, 46],
      [56, 104],
      [68, 123],
      [53, 119],
      [47, 125],
      [40, 119],
    ],
    '#493c36',
  );
  polygon(
    p,
    [
      [40, 115],
      [43, 56],
      [49, 57],
      [50, 111],
      [57, 119],
      [47, 116],
    ],
    '#b58650',
  );
  p.line(43, 93, 19, 64, '#493c36', 8);
  p.line(47, 79, 75, 44, '#493c36', 8);
  p.line(43, 89, 22, 63, '#b58650', 3);
  p.line(49, 75, 74, 44, '#b58650', 3);
  if (dead) {
    p.line(26, 72, 25, 49, '#493c36', 5);
    p.line(66, 56, 84, 58, '#493c36', 5);
    p.line(46, 60, 38, 23, '#493c36', 7);
    p.rect(42, 101, 3, 14, '#e2ba78');
    return;
  }
  for (const [x, y, r] of [
    [26, 63, 24],
    [69, 59, 24],
    [47, 34, 29],
    [24, 38, 20],
    [71, 32, 20],
  ]) {
    p.disc(x, y, r, greens[0]);
    p.disc(x, y - 3, r - 3, greens[1]);
    p.disc(x - 3, y - 8, r - 7, greens[2]);
    p.line(x - r / 3, y - r / 2, x + 4, y - r / 2, greens[3], 3);
  }
  p.rect(42, 91, 3, 21, '#d4aa68');
}
function ground(p: Painter, kind: string): void {
  const forest = kind === 'Forest' || kind === 'Blight';
  const grass = ['Meadow', 'Flowers', 'Forest', 'Blight', 'Terrace'].includes(
    kind,
  );
  if (grass) {
    const base = forest
      ? kind === 'Blight'
        ? '#487568'
        : '#4f855a'
      : '#79ad69';
    p.rect(0, 0, 128, 128, base);
    for (let i = 0; i < 13; i++) {
      const x = 7 + ((i * 41) % 112),
        y = 7 + ((i * 29) % 112);
      p.line(x - 2, y + 2, x - 4, y - 1, forest ? '#629365' : '#91bc74', 2);
      p.line(x, y + 2, x + 2, y - 3, forest ? '#629365' : '#91bc74', 2);
      if (kind === 'Flowers' && i % 3 === 0) {
        p.rect(x + 5, y - 2, 2, 5, '#588554');
        p.rect(x + 3, y - 4, 6, 3, i % 2 ? '#fff0b2' : '#f9c2a4');
        p.rect(x + 5, y - 5, 2, 5, '#fff0cc');
      }
    }
    return;
  }
  if (kind === 'Water') {
    p.rect(0, 0, 128, 128, '#4c9eaf');
    for (let i = 0; i < 9; i++) {
      const x = 8 + ((i * 37) % 98),
        y = 10 + ((i * 19) % 106);
      p.rect(x, y, 14, 2, '#80c5c7');
      p.rect(x + 4, y + 3, 17, 2, '#5aafba');
    }
    return;
  }
  if (['Earth', 'Roots', 'Mud'].includes(kind)) {
    const dark = kind !== 'Earth';
    p.rect(0, 0, 128, 128, dark ? '#9a8c6a' : '#d3b77e');
    for (let i = 0; i < 10; i++) {
      const x = 8 + ((i * 43) % 108),
        y = 8 + ((i * 31) % 108);
      p.rect(x, y, 5 + (i % 4), 2, dark ? '#a89b75' : '#e4ca94');
      if (i % 3 === 0) p.rect(x + 3, y + 2, 4, 1, dark ? '#877f60' : '#bda36d');
    }
    return;
  }
  if (kind === 'Stairs') {
    p.rect(0, 0, 128, 128, STONE[0]);
    for (let y = 0; y < 128; y += 8) {
      p.rect(0, y, 128, 2, STONE[2]);
      p.rect(0, y + 2, 128, 4, STONE[1]);
      p.rect(0, y + 6, 128, 2, '#4c686b');
    }
    return;
  }
  p.rect(0, 0, 128, 128, kind === 'CliffDark' ? '#4f666c' : '#6f8788');
  const cliff = kind.startsWith('Cliff');
  for (let y = 0; y < 128; y += cliff ? 32 : 16) {
    const h = cliff ? 32 : 16;
    for (let x = -32; x < 128; x += 32) {
      const px = x + ((y / h) % 2) * 16;
      p.rect(px + 1, y + 1, 30, h - 2, cliff ? '#80958f' : '#a1b7ad');
      p.rect(px + 2, y + 1, 28, 2, cliff ? '#a0b0a0' : '#ccdac0');
      p.rect(px + 2, y + h - 4, 28, 2, cliff ? '#657c7c' : '#8b9f9a');
    }
  }
}

/** 显式覆盖清单：教堂、祭坛、神树及其根床/马赛克从未进入这里。 */
export function applyCartoonSceneArt(atlas: BuiltAtlas): void {
  const draw = (name: string, fn: (p: Painter) => void): void => {
    const f = atlas.frames[name];
    if (!f) throw new Error('Cartoon frame missing: ' + name);
    const g = atlas.canvas.getContext('2d')!;
    g.save();
    g.beginPath();
    g.rect(f.x, f.y, f.w, f.h);
    g.clip();
    g.clearRect(f.x, f.y, f.w, f.h);
    g.translate(f.x, f.y);
    fn(new Painter(g, f.w, f.h));
    g.restore();
  };
  for (const kind of [
    'Meadow',
    'Earth',
    'Flowers',
    'Water',
    'Forest',
    'Roots',
    'Blight',
    'Mud',
    'Ruin',
    'Sacred',
    'Rubble',
    'Trail',
    'Cliff',
    'CliffDark',
    'Stairs',
    'Terrace',
  ])
    draw('terrain' + kind, (p) => ground(p, kind));
  // 圣域室外石板也去除碎纹，建筑与祭坛的独立贴图仍保持原样。
  for (const name of [
    'tileSanctumPave0',
    'tileSanctumPave1',
    'tileSanctumGrass',
    'tileSanctumPath',
  ])
    draw(name, (p) => {
      if (name.endsWith('Grass')) {
        p.rect(0, 0, 32, 32, '#79ad69');
        return;
      }
      if (name.endsWith('Path')) {
        p.rect(0, 0, 32, 32, '#d3b77e');
        p.rect(5, 9, 5, 2, '#e4ca94');
        p.rect(23, 24, 3, 2, '#e4ca94');
        return;
      }
      p.rect(0, 0, 32, 32, '#718b83');
      for (const [x, y, w, h] of name.endsWith('0')
        ? [
            [1, 1, 18, 14],
            [21, 1, 10, 14],
            [1, 17, 11, 14],
            [14, 17, 17, 14],
          ]
        : [
            [1, 1, 12, 14],
            [15, 1, 16, 14],
            [1, 17, 20, 14],
            [23, 17, 8, 14],
          ]) {
        p.rect(x, y, w, h, '#abbca6');
        p.rect(x, y, w, 2, '#d3dcc1');
        p.rect(x, y + h - 2, w, 2, '#90a493');
      }
    });
  for (const [name, base, light, dark] of [
    ['Marsh', '#628e7e', '#8ab39a', '#426d68'],
    ['Highland', '#94a58a', '#bfcc9e', '#758b80'],
    ['Waste', '#ad8564', '#d0aa75', '#8b6557'],
    ['DungeonMine', '#7b725f', '#aa9874', '#5a574c'],
    ['DungeonRoots', '#5b7063', '#81997c', '#405950'],
    ['DungeonJail', '#768581', '#a2b3a0', '#526862'],
    ['DungeonVoid', '#253d3c', '#354f4a', '#1b302f'],
  ])
    draw('terrain' + name, (p) => {
      p.rect(0, 0, 128, 128, base);
      for (let i = 0; i < 12; i++) {
        const x = 7 + ((i * 41) % 112),
          y = 7 + ((i * 29) % 112);
        p.rect(x, y, 8 + (i % 5), 2, light);
        if (i % 3 === 0) p.line(x + 3, y + 4, x + 7, y + 8, dark, 2);
      }
      if (name.startsWith('Dungeon') && name !== 'DungeonVoid')
        for (let y = 0; y < 128; y += 32) {
          p.rect(0, y, 128, 2, dark);
          for (let x = y % 64 ? 16 : 0; x < 128; x += 32)
            p.rect(x, y, 2, 32, dark);
        }
    });
  draw('terrainBoardwalk', (p) => {
    p.rect(0, 0, 128, 128, '#725a43');
    for (let y = 0; y < 128; y += 8) {
      p.rect(0, y + 1, 128, 6, '#b2996b');
      p.rect(0, y + 1, 128, 2, '#d3bd83');
      for (let x = 8; x < 128; x += 32) p.rect(x, y + 3, 2, 2, '#5b5544');
    }
  });
  draw('propDungeonPortal', (p) => {
    for (const x of [11, 65]) {
      slab(p, x, 33, 20, 70);
      slab(p, x - 4, 99, 28, 10);
    }
    slab(p, 17, 22, 62, 17);
    slab(p, 26, 11, 44, 15);
    slab(p, 37, 4, 22, 12);
    polygon(
      p,
      [
        [34, 43],
        [61, 43],
        [61, 98],
        [34, 98],
      ],
      '#182f37',
    );
    polygon(
      p,
      [
        [41, 46],
        [54, 46],
        [60, 72],
        [53, 96],
        [40, 96],
        [35, 72],
      ],
      '#376579',
    );
    p.line(48, 44, 43, 66, '#8edaca', 3);
    p.line(43, 66, 52, 77, '#8edaca', 3);
    p.line(52, 77, 45, 97, '#8edaca', 3);
    for (const x of [20, 74]) {
      p.rect(x, 43, 3, 14, '#e6ba6d');
      p.rect(x - 2, 40, 7, 5, '#ffdfa0');
    }
  });
  draw('tileCliffRaised', (p) => {
    p.rect(0, 0, 32, 64, '#435e60');
    p.rect(2, 6, 28, 54, '#879a8d');
    p.rect(3, 8, 4, 48, '#a6b19a');
    p.rect(25, 8, 5, 51, '#647e76');
    p.rect(2, 30, 28, 2, '#607970');
    p.rect(8, 49, 21, 2, '#607970');
    p.rect(0, 0, 32, 4, '#a5cc7d');
    p.rect(0, 4, 32, 4, '#5f9259');
  });
  for (let i = 0; i < 4; i++)
    draw('tileCartoonWallRaised' + i, (p) => {
      p.rect(0, 0, 32, 64, '#435e60');
      for (let y = 13; y < 64; y += 12) {
        p.rect(1, y, 30, 10, '#879c92');
        p.rect(2, y, 28, 2, '#b4c5aa');
        p.rect((Math.floor(y / 12) + i) % 2 ? 9 : 23, y, 2, 10, '#59766d');
      }
      p.rect(0, 0, 32, 11, '#b8c7ae');
      p.rect(0, 0, 32, 2, '#d9e0c2');
      p.rect(0, 9, 32, 3, '#526f64');
      p.rect(0, 61, 32, 3, '#3f5d54');
    });
  draw('propTree', (p) => tree(p));
  draw('propBlightTree', (p) => tree(p, true));
  draw('propDeadTree', (p) => tree(p, true, true));
  draw('propFungus', (p) => {
    for (const [x, y, r] of [
      [16, 27, 12],
      [40, 22, 17],
      [52, 33, 10],
    ]) {
      p.rect(x - 4, y, 8, 43 - y, INK);
      p.rect(x - 2, y, 4, 40 - y, '#eddfb4');
      for (let dy = -r; dy <= 2; dy++) {
        const half = Math.floor(Math.sqrt(r * r - dy * dy));
        p.rect(x - half, y + dy, half * 2 + 1, 1, INK);
        if (dy < 0 && dy > -r + 2)
          p.rect(x - half + 2, y + dy, Math.max(0, half * 2 - 3), 1, '#a77ba8');
      }
      p.rect(x - 6, y - 5, 5, 3, '#efd4c9');
    }
  });
  for (const name of [
    'propRuinPillar',
    'propRuinArch',
    'landVista',
    'landVistaActive',
  ])
    draw(name, (p) => {
      const xs = name === 'propRuinPillar' ? [p.w / 2 - 11] : [9, p.w - 28];
      for (const x of xs) {
        slab(p, x, 29, 19, p.h - 37);
        slab(p, x - 4, p.h - 13, 27, 10);
        slab(p, x - 3, 23, 25, 10);
        p.rect(x + 4, 39, 3, p.h - 62, '#c4d3b5');
      }
      if (name === 'propRuinArch') {
        slab(p, 16, 15, p.w - 32, 17);
        slab(p, 28, 6, p.w - 56, 12);
      }
      if (name.startsWith('landVista')) {
        slab(p, 23, p.h - 20, 34, 12);
        crystal(p, p.w / 2, p.h - 39, name.endsWith('Active'));
      }
    });
  for (const active of [false, true]) {
    const suffix = active ? 'Active' : '';
    draw('landWaystone' + suffix, (p) => {
      slab(p, 9, 77, 46, 9);
      slab(p, 14, 69, 36, 10);
      polygon(
        p,
        [
          [20, 68],
          [18, 24],
          [25, 13],
          [41, 13],
          [47, 24],
          [44, 68],
        ],
        INK,
      );
      polygon(
        p,
        [
          [23, 65],
          [21, 25],
          [27, 17],
          [39, 17],
          [43, 25],
          [41, 65],
        ],
        '#75968b',
      );
      p.rect(24, 27, 3, 30, '#b4cbb1');
      crystal(p, 33, 41, active);
    });
    draw('landChest' + suffix, (p) => {
      p.rect(8, 28, 48, 32, INK);
      p.rect(11, 31, 42, 26, '#a66c3d');
      slab(p, 8, active ? 12 : 23, 48, 14);
      p.rect(11, active ? 15 : 26, 42, 8, '#d9a353');
      p.rect(11, 47, 42, 3, '#754b32');
      for (const x of [16, 44]) p.rect(x, 29, 4, 28, '#e9c977');
      p.rect(28, 35, 10, 12, INK);
      p.rect(30, 36, 6, 8, '#f4d783');
      if (active) p.rect(12, 30, 40, 8, '#3c4039');
    });
    draw('landCamp' + suffix, (p) => {
      p.line(14, 55, 48, 46, '#493c36', 7);
      p.line(16, 46, 47, 56, '#a57847', 6);
      polygon(
        p,
        [
          [18, 48],
          [24, 32],
          [30, 37],
          [35, 16],
          [46, 40],
          [44, 50],
        ],
        '#ac543c',
      );
      polygon(
        p,
        [
          [23, 47],
          [29, 33],
          [33, 39],
          [36, 26],
          [42, 43],
          [39, 51],
        ],
        '#f6b95d',
      );
      polygon(
        p,
        [
          [29, 47],
          [33, 36],
          [38, 46],
          [35, 52],
        ],
        '#fff0ac',
      );
      p.rect(2, 26, 13, 21, INK);
      p.rect(4, 28, 9, 15, '#6b9b92');
      p.rect(4, 28, 9, 4, '#b9d5b0');
    });
  }
  draw('propRock', (p) => {
    polygon(
      p,
      [
        [2, 19],
        [3, 10],
        [10, 4],
        [18, 5],
        [23, 14],
        [21, 21],
        [5, 23],
      ],
      INK,
    );
    polygon(
      p,
      [
        [5, 18],
        [6, 11],
        [11, 7],
        [17, 8],
        [20, 15],
        [18, 19],
      ],
      '#95aaa2',
    );
    polygon(
      p,
      [
        [6, 11],
        [11, 7],
        [17, 8],
        [13, 13],
      ],
      '#d0d9bd',
    );
  });
  draw('propCrate', (p) => {
    p.rect(2, 3, 28, 28, INK);
    p.rect(4, 5, 24, 24, '#b48451');
    p.rect(5, 6, 22, 3, '#e0b575');
    p.rect(6, 11, 20, 2, '#805f40');
    p.rect(6, 21, 20, 2, '#805f40');
    p.line(6, 26, 25, 10, '#e0b575', 3);
  });
  draw('propGrave', (p) => {
    slab(p, 2, 26, 21, 6);
    slab(p, 6, 8, 13, 21);
    slab(p, 3, 12, 19, 7);
  });
}

/** 路沿/岸线直接烘焙进地面，不增加 Sprite 或运行时特效。 */
export function drawCartoonGroundEdges(
  g: CanvasRenderingContext2D,
  level: Level,
  x: number,
  y: number,
): void {
  const tile = level.at(x, y),
    road = tile === Tile.ROAD || tile === Tile.DIRT;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const neighbor = level.at(x + dx, y + dy);
    const bank = tile !== Tile.WATER && neighbor === Tile.WATER;
    if (!bank && !(road && neighbor === Tile.GRASS)) continue;
    g.fillStyle = bank ? '#d0d9a3' : '#a28e61';
    g.fillRect(
      x * 32 + (dx === 1 ? 30 : 0),
      y * 32 + (dy === 1 ? 30 : 0),
      dx ? 2 : 32,
      dy ? 2 : 32,
    );
  }
}
