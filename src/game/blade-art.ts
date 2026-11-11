/** 异瞳魔镰、月弧刀、熔焰重剑及破土魔物，全为硬边像素图集帧。 */
import type { Painter, Spec } from '../engine/art';
import { BLADE_IDS, BLADES, combatIconName, type BladeId } from './weapon-data';
import { MAGE_IDS } from './mage-data';
const E = {
    dark: '#171d32',
    shade: '#3d315a',
    mid: '#765496',
    light: '#ba8bcc',
    rune: '#79c4ac',
    core: '#dbefd0',
  },
  F = { dark: '#69352d', mid: '#bc4d2e', light: '#ff9f41', core: '#ffe3a0' };
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
function eye(p: Painter, x: number, y: number, s = 1): void {
  poly(
    p,
    [
      [x - 7 * s, y],
      [x - 3 * s, y - 3 * s],
      [x + 3 * s, y - 3 * s],
      [x + 7 * s, y],
      [x + 3 * s, y + 3 * s],
      [x - 3 * s, y + 3 * s],
    ],
    E.rune,
  );
  p.rect(x - s, y - 3 * s, 2 * s, 6 * s, E.dark);
  p.rect(x + s, y - s, s, 2 * s, E.core);
}
export function drawBlade(p: Painter, id: BladeId, frame = 0): void {
  if (id === 'scythe') {
    p.line(22, 15, 22, 85, E.dark, 7);
    p.line(23, 16, 23, 83, E.shade, 4);
    p.line(24, 23, 24, 73, E.light, 1);
    for (const y of [30, 45, 62, 77]) {
      p.rect(20, y, 8, 3, '#8c8b76');
      p.rect(21, y, 6, 1, E.rune);
    }
    poly(
      p,
      [
        [17, 18],
        [24, 5],
        [42, 2],
        [56, 6],
        [63, 17],
        [61, 31],
        [53, 44],
        [53, 30],
        [48, 21],
        [35, 17],
        [25, 23],
      ],
      E.dark,
    );
    poly(
      p,
      [
        [20, 16],
        [27, 7],
        [43, 5],
        [55, 9],
        [60, 18],
        [57, 30],
        [54, 35],
        [54, 23],
        [48, 17],
        [35, 13],
        [25, 19],
      ],
      E.mid,
    );
    p.line(27, 7, 44, 5, E.core, 2);
    p.line(44, 5, 56, 10, E.rune, 2);
    p.line(56, 10, 60, 19, E.rune, 2);
    p.line(60, 19, 54, 35, E.rune, 2);
    p.line(24, 18, 39, 14, E.light, 3);
    eye(p, 36, 12, 0.8);
    p.rect(21, 9, 4, 7, E.core);
    poly(
      p,
      [
        [19, 82],
        [25, 82],
        [22, 88],
      ],
      E.rune,
    );
  } else if (id === 'sabre') {
    poly(
      p,
      [
        [13, 40],
        [16, 27],
        [24, 15],
        [30, 6],
        [33, 0],
        [36, 3],
        [35, 15],
        [29, 27],
        [21, 38],
        [19, 43],
      ],
      '#293e42',
    );
    poly(
      p,
      [
        [15, 39],
        [20, 25],
        [28, 14],
        [33, 3],
        [34, 12],
        [30, 23],
        [22, 34],
        [19, 40],
      ],
      '#8badad',
    );
    p.line(18, 31, 28, 17, '#d7e9df', 2);
    p.line(28, 17, 34, 3, '#edf5df', 2);
    p.line(15, 38, 21, 29, '#d7e9df', 2);
    p.line(6, 39, 23, 44, '#c0b27f', 4);
    p.line(9, 39, 24, 43, '#f0d69e', 1);
    p.line(14, 43, 10, 53, '#3a3a31', 6);
    p.line(14, 44, 11, 52, '#957654', 3);
    p.disc(10, 53, 3, '#c5bb8c');
  } else {
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1,
        x = 24 + side * (9 + (i % 3) * 3),
        y = 12 + i * 6,
        shift = (frame + i) % 4;
      p.line(x, y + 8, x + side * (3 + shift), y - 4, F.dark, 5);
      p.line(x, y + 5, x + side * (2 + shift), y - 3, F.light, 2);
    }
    poly(
      p,
      [
        [24, 1],
        [35, 15],
        [34, 43],
        [39, 49],
        [29, 60],
        [19, 60],
        [9, 49],
        [14, 43],
        [13, 15],
      ],
      '#2d2a2d',
    );
    poly(
      p,
      [
        [24, 4],
        [32, 17],
        [30, 45],
        [34, 49],
        [27, 57],
        [21, 57],
        [14, 49],
        [18, 45],
        [16, 17],
      ],
      '#6d4d40',
    );
    p.line(24, 6, 24, 56, F.light, 5);
    p.line(24, 9, 24, 55, F.core, 2);
    p.line(16, 18, 18, 43, '#b4a17b', 2);
    p.line(32, 18, 30, 43, '#ddb881', 2);
    p.line(19, 33, 28, 29, F.light, 2);
    p.line(20, 43, 28, 38, F.core, 2);
    p.line(8, 61, 39, 61, '#463a30', 6);
    p.line(10, 60, 37, 60, '#d4b574', 3);
    poly(
      p,
      [
        [8, 58],
        [4, 65],
        [14, 64],
      ],
      '#db9b55',
    );
    poly(
      p,
      [
        [39, 58],
        [44, 65],
        [34, 64],
      ],
      '#db9b55',
    );
    p.line(24, 65, 24, 83, '#352c2d', 7);
    p.line(24, 66, 24, 82, '#a67b45', 3);
    for (const y of [69, 75, 80]) p.rect(21, y, 7, 2, '#dbb16d');
    p.disc(24, 85, 3, F.core);
  }
}
function claw(p: Painter, frame: number): void {
  const scale = [0.2, 0.57, 1, 1, 0.6, 0.14][frame],
    curl = frame >= 3 ? 1 : 0;
  p.ctx.save();
  p.ctx.translate(0, 128 * (1 - scale));
  p.ctx.scale(1, scale);
  poly(
    p,
    [
      [34, 126],
      [29, 109],
      [31, 87],
      [27, 71],
      [33, 59],
      [62, 57],
      [74, 77],
      [68, 101],
      [68, 126],
    ],
    E.dark,
  );
  poly(
    p,
    [
      [39, 126],
      [35, 107],
      [37, 86],
      [34, 72],
      [40, 63],
      [59, 64],
      [66, 80],
      [61, 105],
      [62, 126],
    ],
    E.shade,
  );
  p.line(39, 126, 43, 91, E.mid, 5);
  p.line(61, 119, 55, 88, E.light, 3);
  const fingers = [
    [
      [34, 77],
      [20, 65],
      [14, 43],
      [19, 29],
      [26, 36],
      [25, 47],
      [32, 57],
    ],
    [
      [41, 67],
      [29, 46],
      [28, 20],
      [35, 10],
      [42, 17],
      [39, 30],
      [41, 47],
    ],
    [
      [51, 64],
      [44, 40],
      [49, 13],
      [58, 7],
      [63, 17],
      [56, 30],
      [55, 45],
    ],
    [
      [63, 70],
      [62, 49],
      [74, 26],
      [82, 24],
      [85, 35],
      [75, 46],
      [72, 61],
    ],
  ];
  fingers.forEach((points, i) => {
    for (let k = 1; k < points.length; k++) {
      const [x, y] = points[k - 1],
        [xx, yy] = points[k],
        bend = curl && k > 3 ? 10 : 0;
      p.line(x, y + bend, xx, yy + bend, E.dark, 11);
      p.line(x + 2, y + bend, xx + 2, yy + bend, E.mid, 7);
      p.line(x + 4, y + bend, xx + 4, yy + bend, i % 2 ? E.rune : E.light, 2);
    }
    const tip = points[3];
    poly(
      p,
      [
        [tip[0] - 4, tip[1] + 7],
        [tip[0] + 4, tip[1] + 5],
        [tip[0] + 5 - curl * 10, tip[1] - 7 + curl * 15],
      ],
      E.core,
    );
  });
  // 外翻拇指和掌心的异瞳，让轮廓读作巨爪而非触手柱。
  p.line(65, 88, 83, 72, E.dark, 13);
  p.line(83, 72, 88, 55, E.dark, 10);
  p.line(67, 87, 83, 73, E.mid, 8);
  p.line(83, 73, 88, 57, E.rune, 3);
  poly(
    p,
    [
      [84, 58],
      [90, 54],
      [90, 42],
    ],
    E.core,
  );
  p.disc(49, 80, 16, E.shade);
  p.line(35, 86, 44, 96, E.light, 2);
  eye(p, 49, 79, 1.5);
  p.line(48, 91, 51, 112, E.rune, 2);
  p.line(51, 101, 59, 106, E.light, 2);
  p.ctx.restore();
}
function spike(p: Painter, frame: number): void {
  const scale = [0.18, 0.6, 1, 0.7, 0.12][frame];
  p.ctx.save();
  p.ctx.translate(0, 80 * (1 - scale));
  p.ctx.scale(1, scale);
  poly(
    p,
    [
      [8, 79],
      [13, 61],
      [11, 50],
      [19, 29],
      [24, 4],
      [30, 15],
      [29, 32],
      [38, 48],
      [33, 65],
      [38, 79],
    ],
    E.dark,
  );
  poly(
    p,
    [
      [16, 77],
      [20, 59],
      [17, 51],
      [23, 31],
      [25, 10],
      [26, 34],
      [33, 48],
      [28, 67],
      [31, 77],
    ],
    E.mid,
  );
  p.line(25, 13, 24, 42, E.core, 2);
  p.line(24, 42, 29, 51, E.rune, 3);
  p.line(29, 51, 22, 69, E.light, 2);
  for (const [x, dir] of [
    [12, -1],
    [31, 1],
  ]) {
    p.line(x, 76, x + dir * 8, 58, E.shade, 7);
    p.line(x + dir * 8, 58, x + dir * 5, 46, E.rune, 2);
  }
  eye(p, 23, 65, 0.9);
  p.ctx.restore();
}
function wave(p: Painter, frame: number): void {
  for (let i = 0; i < 30; i++) {
    const a = -1.3 + (i / 29) * 2.6,
      x = 51 + Math.cos(a) * 29,
      y = 40 + Math.sin(a) * 35;
    p.disc(x - 7, y, 8, F.dark);
    p.disc(x - 3, y, 5, F.mid);
    p.disc(x, y, 3, F.light);
    p.rect(x + 1, y, 2, 2, F.core);
    if (i % 4 === 0)
      p.line(
        x - 5,
        y,
        x - 28 - ((i + frame) % 4) * 3,
        y - 8 + ((i + frame) % 3) * 7,
        F.mid,
        5,
      );
  }
  for (let i = 0; i < 7; i++)
    p.rect(15 + ((i * 13 + frame * 3) % 45), 12 + i * 8, 3, 2, F.light);
}
function icon(p: Painter, id: 'scythe' | 'greatsword', ability: string): void {
  p.rect(0, 0, 64, 64, id === 'scythe' ? '#131e2c' : '#261b1c');
  p.ring(32, 32, 30, 2, id === 'scythe' ? E.mid : '#997147');
  p.ring(32, 32, 27, 1, id === 'scythe' ? E.rune : F.light);
  if (id === 'scythe') {
    if (ability === 'field') {
      for (let k = 0; k < 3; k++)
        for (let i = 0; i < 18; i++) {
          const t = i / 18,
            a = (k * Math.PI * 2) / 3 + t * 3,
            r = 8 + t * 18;
          p.rect(
            31 + Math.cos(a) * r,
            31 + Math.sin(a) * r,
            3,
            3,
            i % 3 ? E.light : E.rune,
          );
        }
      eye(p, 32, 32, 1);
    } else if (ability === 'wave') {
      p.ctx.save();
      p.ctx.translate(8, 2);
      p.ctx.scale(0.5, 0.46);
      claw(p, 2);
      p.ctx.restore();
      p.ring(32, 48, 17, 1, E.rune);
    } else {
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        p.ctx.save();
        p.ctx.translate(32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15);
        p.ctx.rotate(a + Math.PI / 2);
        p.ctx.scale(0.3, 0.4);
        p.ctx.translate(-23, -60);
        spike(p, 2);
        p.ctx.restore();
      }
      eye(p, 32, 32, 1);
    }
  } else if (ability === 'field') {
    p.ctx.save();
    p.ctx.translate(2, 0);
    p.ctx.rotate(0.4);
    p.ctx.scale(0.65, 0.65);
    wave(p, 1);
    p.ctx.restore();
  } else if (ability === 'wave') {
    for (let k = 0; k < 3; k++) {
      p.line(12 + k * 8, 48 - k * 4, 36 + k * 6, 13 + k * 2, F.dark, 7);
      p.line(14 + k * 8, 47 - k * 4, 38 + k * 6, 13 + k * 2, F.light, 4);
      p.line(16 + k * 8, 45 - k * 4, 39 + k * 6, 13 + k * 2, F.core, 1);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2,
        x = 32 + Math.cos(a) * 18,
        y = 35 + Math.sin(a) * 20;
      p.line(x, y + 8, x + 3, y - 7, F.mid, 6);
      p.line(x + 1, y + 3, x + 3, y - 7, F.light, 3);
    }
    p.rect(26, 21, 12, 12, F.core);
    p.rect(25, 34, 14, 18, '#483528');
    p.rect(20, 35, 6, 11, F.core);
    p.rect(39, 35, 5, 11, F.core);
    p.rect(28, 38, 8, 15, F.light);
  }
}
function circleArt(p: Painter): void {
  p.ring(64, 64, 59, 2, E.mid);
  p.ring(64, 64, 54, 1, E.rune);
  p.ring(64, 64, 38, 1, E.light);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2,
      x = 64 + Math.cos(a) * 46,
      y = 64 + Math.sin(a) * 46;
    p.line(x, y - 4, x, y + 4, E.rune, 2);
    p.line(x - 3, y + 2, x + 3, y - 2, E.light, 1);
    if (i % 2 === 0) {
      const b = a + (Math.PI * 2) / 5;
      p.line(
        64 + Math.cos(a) * 34,
        64 + Math.sin(a) * 34,
        64 + Math.cos(b) * 34,
        64 + Math.sin(b) * 34,
        E.mid,
        1,
      );
    }
  }
  eye(p, 64, 64, 2.2);
  for (let arm = 0; arm < 4; arm++)
    for (let i = 0; i < 12; i++) {
      const d = i / 12,
        a = (arm * Math.PI) / 2 + d * 2.8,
        r = 58 + Math.sin(d * Math.PI) * 4;
      p.rect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1, 1, E.rune);
    }
}
function crackArt(p: Painter): void {
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7,
      x = 64 + Math.cos(a) * 28,
      y = 64 + Math.sin(a) * 28,
      xx = 64 + Math.cos(a + 0.23) * 54,
      yy = 64 + Math.sin(a + 0.23) * 54;
    p.line(64, 64, x, y, E.dark, 5);
    p.line(x, y, xx, yy, E.dark, 4);
    p.line(64, 64, x, y, E.light, 2);
    p.line(x, y, xx, yy, E.rune, 1);
  }
}
export function bladeSpecs(): Spec[] {
  const out: Spec[] = [
    ...Array.from({ length: 3 }, (_, i) => ({
      name: 'bladeFlameSlash_' + i,
      w: 128,
      h: 128,
      draw: (p: Painter) => {
        p.ctx.save();
        p.ctx.scale(1.3, 1.6);
        wave(p, i);
        p.ctx.restore();
      },
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      name: 'bladeInferno_' + i,
      w: 128,
      h: 128,
      draw: (p: Painter) => {
        p.ring(64, 94, 46, 4, F.light);
        for (let k = 0; k < 12; k++) {
          const a = (k * Math.PI) / 6;
          p.line(
            64 + Math.cos(a) * 45,
            94 + Math.sin(a) * 20,
            64 + Math.cos(a) * 45,
            60 + Math.sin(a) * 20 + i * 2,
            F.mid,
            5,
          );
        }
      },
    })),
    {
      name: 'eldritchStorm',
      w: 192,
      h: 192,
      draw: (p) => {
        for (let k = 0; k < 3; k++)
          for (let i = 0; i < 35; i++) {
            const a = (k * Math.PI * 2) / 3 + i * 0.055,
              r = 78 - i * 0.35;
            p.rect(
              96 + Math.cos(a) * r,
              96 + Math.sin(a) * r,
              4,
              4,
              i % 3 ? E.rune : E.core,
            );
          }
      },
    },
    {
      name: 'eldritchImpact',
      w: 128,
      h: 128,
      draw: (p) => {
        p.ring(64, 64, 50, 3, E.rune);
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          p.line(
            64 + Math.cos(a) * 35,
            64 + Math.sin(a) * 35,
            64 + Math.cos(a) * 61,
            64 + Math.sin(a) * 61,
            E.core,
            3,
          );
        }
      },
    },
    { name: 'eldritchCircle', w: 128, h: 128, draw: circleArt },
    { name: 'eldritchCracks', w: 128, h: 128, draw: crackArt },
  ];
  for (const id of BLADE_IDS) {
    const d = BLADES[id];
    out.push({
      name: d.frame,
      w: d.width,
      h: d.height,
      draw: (p) => drawBlade(p, id),
    });
  }
  for (let i = 0; i < 4; i++)
    out.push({
      name: 'weaponGreatsword_' + i,
      w: 48,
      h: 88,
      draw: (p) => drawBlade(p, 'greatsword', i),
    });
  for (let i = 0; i < 6; i++)
    out.push(
      { name: 'demonClaw_' + i, w: 96, h: 128, draw: (p) => claw(p, i) },
      { name: 'bladeFlameWave_' + i, w: 96, h: 80, draw: (p) => wave(p, i) },
    );
  for (let i = 0; i < 5; i++)
    out.push({
      name: 'demonSpike_' + i,
      w: 48,
      h: 80,
      draw: (p) => spike(p, i),
    });
  for (const id of ['scythe', 'greatsword'] as const)
    for (const ability of MAGE_IDS)
      out.push({
        name: combatIconName(id, ability),
        w: 64,
        h: 64,
        draw: (p) => icon(p, id, ability),
      });
  return out;
}
