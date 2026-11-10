import type { Painter, Spec } from '../engine/art';
import { SUMMON_ANIMATION } from './basketball-content';
export function drawBasketball(
  p: Painter,
  x: number,
  y: number,
  r: number,
): void {
  p.disc(x, y, r, '#38261e');
  p.disc(x, y, r - 1, '#ad4f26');
  p.disc(x + 1, y - 1, r - 3, '#e58d3f');
  p.line(x - r + 2, y, x + r - 2, y, '#4a2d23');
  p.line(x, y - r + 2, x, y + r - 2, '#4a2d23');
  p.line(x - r * 0.6, y - r * 0.6, x - r * 0.35, y, '#65371e');
  p.line(x - r * 0.35, y, x - r * 0.6, y + r * 0.6, '#65371e');
  p.line(x + r * 0.6, y - r * 0.6, x + r * 0.35, y, '#65371e');
  p.line(x + r * 0.35, y, x + r * 0.6, y + r * 0.6, '#65371e');
  p.rect(x - 3, y - r + 3, 3, 1, '#ffd28a');
}
export function basketballSpecs(): Spec[] {
  const specs: Spec[] = [
    {
      name: 'weaponBasketball',
      w: 24,
      h: 24,
      draw: (p) => drawBasketball(p, 12, 12, 10),
    },
    {
      name: 'kunGlyph',
      w: 32,
      h: 32,
      draw: (p) => {
        // 解码失败仍有可读的像素「坤」，正常使用随构建内嵌的生图原稿。
        for (const [x, y, w, h] of [
          [6, 4, 3, 23],
          [2, 12, 11, 3],
          [2, 25, 11, 3],
          [17, 8, 12, 3],
          [17, 8, 3, 17],
          [26, 8, 3, 17],
          [17, 15, 12, 3],
          [17, 22, 12, 3],
          [22, 3, 3, 27],
        ]) {
          p.rect(x - 1, y - 1, w + 2, h + 2, '#71331d');
          p.rect(x, y, w, h, '#ffcb74');
        }
      },
    },
  ];
  for (let i = 0; i < SUMMON_ANIMATION.durations.length; i++)
    specs.push({
      name: 'summon_' + i,
      w: 48,
      h: 48,
      draw: (p) => {
        p.disc(24, 35, 9, '#1e2427');
        p.disc(22, 18, 11, '#b0a68b');
        p.rect(19, 19, 2, 2, '#282b30');
        p.rect(26, 19, 2, 2, '#282b30');
        p.line(19, 39, 17 + (i % 3), 44, '#202429', 5);
        p.line(29, 39, 31 - (i % 3), 44, '#202429', 5);
      },
    });
  return specs;
}
