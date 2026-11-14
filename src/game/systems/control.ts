/** 输入只改模拟；身体四方向归并保留在只读表现层。 */
import { BTN, type InputState } from '../../engine/input';
import { angle, len, norm, fromAngle } from '../../engine/math';
import { CFG } from '../data';
import { useSelected, notice } from '../inventory';
import { dropSelected } from './loot';
import { castStaffAbility, selectedProfession } from './profession';
import { castSelected } from './magic';
import { survivalDodge, survivalSpeed } from './survival';
import type { Ctx } from './context';

export function applyInput(ctx: Ctx, input: InputState, dt: number): void {
  if (ctx.gameOver) return;
  const p = ctx.s.player.get(ctx.player)!,
    f = ctx.s.facing.get(ctx.player)!,
    d = ctx.s.dodge.get(ctx.player)!,
    pos = ctx.world.pos(ctx.player);
  ctx.aimPointer = { ...input.pointer };
  const aim = ctx.camera.toWorld(input.pointer),
    vector = { x: aim.x - pos.x, y: aim.y - pos.y };
  if (
    input.aimActive ||
    (input.down | input.pressed) &
      (BTN.ATTACK | BTN.CAST | BTN.ULTIMATE | BTN.FIELD)
  ) {
    if (len(vector) > 5) f.angle = angle(vector);
  } else if (len(input.move) > 0.1) f.angle = angle(input.move);
  if (input.pressed & BTN.USE) useSelected(ctx);
  if (input.pressed & BTN.DROP) dropSelected(ctx);
  if (d.time > 0) {
    ctx.world.setPos(
      ctx.player,
      ctx.level.move(
        pos,
        d.dir.x * CFG.dodge.speed * dt,
        d.dir.y * CFG.dodge.speed * dt,
        CFG.player.radius,
      ),
    );
    return;
  }
  if (input.pressed & BTN.DODGE && d.cd <= 0) {
    const scale = survivalDodge(ctx);
    if (scale <= 0) {
      notice(ctx, '疲惫或超载 · 翻不动身');
      return;
    }
    d.dir = len(input.move) > 0.1 ? norm(input.move) : fromAngle(f.angle);
    d.time = CFG.dodge.dur * scale;
    d.cd = CFG.dodge.cd;
    d.invuln = CFG.dodge.invuln;
    ctx.world.emit({ kind: 'dodge', x: pos.x, y: pos.y, angle: angle(d.dir) });
    return;
  }
  // 向量已经携带摇杆推力，不能再乘一次长度，否则半推会变为四分之一速度。
  const speed =
    CFG.player.speed *
    (p.castAnim > 0 || p.attackAnim > 0 ? CFG.player.castSlow : 1) *
    survivalSpeed(ctx);
  ctx.world.setPos(
    ctx.player,
    ctx.level.move(
      pos,
      input.move.x * speed * dt,
      input.move.y * speed * dt,
      CFG.player.radius,
    ),
  );
  if (input.down & BTN.ATTACK) castSelected(ctx);
  if (input.pressed & BTN.FIELD) castStaffAbility(ctx, 'field');
  if (input.pressed & BTN.CAST) {
    if (selectedProfession(ctx)) castStaffAbility(ctx, 'wave');
    else castSelected(ctx, true);
  }
  if (input.pressed & BTN.ULTIMATE) castStaffAbility(ctx, 'barrage');
}
