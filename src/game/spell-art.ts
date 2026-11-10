/** 所有投射物帧在启动时画进同一图集；方块笔触与阶梯轮廓避免矢量光球。 */
import type { Painter } from '../engine/art';
import { makeRng } from '../engine/math';
import { SPELL_COLORS } from './spell-visuals';
import type { SkillId } from './items';

const hex = (color: number): string =>
  '#' + color.toString(16).padStart(6, '0');
export function drawSpellMissile(p: Painter, id: SkillId, frame: number): void {
  const colors = SPELL_COLORS[id],
    dark = hex(colors.dark),
    mid = hex(colors.mid),
    light = hex(colors.light),
    core = hex(colors.core);
  const rng = makeRng(frame * 613 + id.length * 47),
    cy = 12;
  if (id === 'ember') {
    for (let i = 0; i < 9; i++) {
      const x = 2 + Math.floor(rng() * 14),
        y = cy - 5 + Math.floor(rng() * 11);
      p.rect(x, y, 3 + Math.floor(rng() * 5), 2, i % 3 ? mid : dark);
    }
    p.disc(22, cy, 8, dark);
    p.disc(23, cy - 1, 6, mid);
    p.disc(24, cy - 1, 4, light);
    p.disc(25, cy - 2, 2, core);
    p.rect(15, cy - 5, 4, 2, light);
    p.rect(10, cy + 3, 5, 2, mid);
    p.rect(4 + (frame % 3), cy - 5, 2, 2, light);
  } else if (id === 'frost') {
    p.line(9, cy, 28, cy, dark, 5);
    p.line(13, cy - 1, 28, cy - 1, light, 3);
    p.line(19, 5, 30, 12, core, 2);
    p.line(30, 12, 19, 19, mid, 2);
    p.line(20, 7, 20, 17, light);
    p.line(10, 6, 16, 18, mid, 2);
    p.line(10, 18, 16, 6, light, 2);
    p.line(5, 12, 17, 12, light);
    p.rect(2 + (frame % 4), 8, 2, 2, core);
    p.rect(7 - (frame % 3), 17, 2, 2, mid);
  } else if (id === 'ward') {
    p.ring(22, cy, 8, 2, dark);
    p.ring(22, cy, 6, 1, light);
    p.disc(22, cy, 4, mid);
    p.disc(23, cy - 1, 2, core);
    const angle = (frame / 8) * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      const a = angle + (i * Math.PI) / 2;
      p.rect(22 + Math.cos(a) * 7, cy + Math.sin(a) * 7, 2, 2, core);
    }
    p.rect(4, 10, 9, 2, mid);
    p.rect(9, 13, 7, 1, light);
  } else if (id === 'blink') {
    p.ring(22, cy, 8, 3, dark);
    p.ring(24, cy - 1, 6, 2, light);
    p.ctx.save();
    p.ctx.globalCompositeOperation = 'destination-out';
    p.disc(26, cy - 2, 5, '#000000');
    p.ctx.restore();
    // 用透明挖空形成月牙，尾部星点沿帧位移。
    p.line(16, 12, 28, 12, mid, 3);
    p.line(22, 7, 22, 17, core);
    p.line(17, 12, 28, 12, core);
    for (let i = 0; i < 5; i++)
      p.rect(2 + i * 3, 8 + ((frame + i) % 7), 2, 2, i % 2 ? mid : light);
  } else {
    p.line(3, cy, 14, cy - 5, mid, 2);
    p.line(14, cy - 5, 18, cy + 4, core, 2);
    p.line(18, cy + 4, 30, cy - 1, light, 2);
  }
}
