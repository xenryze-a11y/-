/**
 * 输入 → 模拟。对应 goengine 的 engine/sim/control.go ApplyInput。
 * 优先级：翻滚 > 切武器 > 朝向 > 移动 > 普攻 > 特殊技。
 * ⚠️ 冷却判定必须在 tickTimers 之前（由 main.ts 的系统顺序保证），否则同一帧能打两次。
 */
import { BTN, type InputState } from '../../engine/input';
import { angle, len, norm } from '../../engine/math';
import { CFG, PLAYER_SHOES, SHOE_LABEL } from '../data';
import type { Ctx } from './context';
import { meleeAttack, spawnProjectile } from './combat';

export function applyInput(ctx: Ctx, input: InputState, dt: number): void {
  if (ctx.gameOver) return;
  const p = ctx.s.player.get(ctx.player);
  const f = ctx.s.facing.get(ctx.player);
  const dodge = ctx.s.dodge.get(ctx.player);
  if (!p || !f || !dodge) return;
  const pos = ctx.world.pos(ctx.player);
  const r = ctx.s.radius.get(ctx.player)?.r ?? 10;

  // 鼠标瞄准优先；鼠标没进过画面时退回移动方向（对应 Go 的 Aim 零值 = 自动瞄准）。
  const mouse = ctx.camera.toWorld(input.pointer);
  const aim = { x: mouse.x - pos.x, y: mouse.y - pos.y };
  if (Math.hypot(aim.x, aim.y) > 6) f.angle = angle(aim);
  else if (len(input.move) > 0.01) f.angle = angle(input.move);

  // 翻滚期间只位移，不接受攻击/切武器（Go 版 TryDodge 后直接 return）。
  if (dodge.time > 0) {
    const next = ctx.level.move(pos, dodge.dir.x * CFG.dodge.speed * dt, dodge.dir.y * CFG.dodge.speed * dt, r);
    ctx.world.setPos(ctx.player, next);
    return;
  }

  if (input.pressed & BTN.SWORD) p.weapon = 'sword';
  if (input.pressed & BTN.STAFF) p.weapon = 'staff';
  // 换鞋：只改 Equip.shoes 这个数据，渲染层按材质自己挑贴图（换装接缝）。
  if (input.pressed & BTN.SHOES) {
    const eq = ctx.s.equip.get(ctx.player);
    if (eq) {
      const i = PLAYER_SHOES.indexOf(eq.shoes);
      eq.shoes = PLAYER_SHOES[(i + 1) % PLAYER_SHOES.length];
      ctx.world.emit({ kind: 'pickup', entity: ctx.player, x: pos.x, y: pos.y, text: `换上${SHOE_LABEL[eq.shoes]}` });
    }
  }

  if ((input.pressed & BTN.DODGE) && dodge.cd <= 0 && len(input.move) > 0.01) {
    dodge.time = CFG.dodge.dur;
    dodge.cd = CFG.dodge.cd;
    dodge.invuln = CFG.dodge.invuln;
    dodge.dir = norm(input.move);
    ctx.world.emit({ kind: 'dodge', entity: ctx.player, x: pos.x, y: pos.y, angle: angle(dodge.dir) });
    return;
  }

  // 半推 = 慢走：scale 保留输入长度，不重新归一化。
  const scale = Math.min(1, len(input.move));
  let speed = CFG.player.speed * scale;
  if (p.attackAnim > 0 || p.castAnim > 0) speed *= CFG.player.castSlow;
  const next = ctx.level.move(pos, input.move.x * speed * dt, input.move.y * speed * dt, r);
  // 只有位置可能变化时也调 setPos：贴墙时它返回原坐标，空间哈希不变。
  ctx.world.setPos(ctx.player, next);

  // 左键 = 当前武器普攻（按住连击）；剑走扇形，法杖走火球。
  if ((input.down & BTN.ATTACK) && p.atkCd <= 0) {
    if (p.weapon === 'sword') {
      meleeAttack(ctx, ctx.player, f.angle, CFG.sword.arc, CFG.sword.range, CFG.sword.dmg);
      p.atkCd = CFG.sword.cd;
      p.attackAnim = CFG.sword.animDur;
      p.swingAngle = f.angle;
    } else {
      if (p.mana >= CFG.staff.manaCost) {
        p.mana -= CFG.staff.manaCost;
        spawnProjectile(ctx, ctx.player, f.angle, 'fireball', CFG.staff.projectileSpeed, CFG.staff.projectileDmg, true);
        p.atkCd = CFG.staff.cd;
        p.castAnim = CFG.staff.animDur;
        ctx.world.emit({ kind: 'cast', entity: ctx.player, x: pos.x, y: pos.y, angle: f.angle });
      } else {
        p.atkCd = 0.5; // 别每帧刷「法力不足」
        ctx.world.emit({ kind: 'noMana', entity: ctx.player, x: pos.x, y: pos.y, text: '法力不足' });
      }
    }
  }

  // 右键 = 特殊技：剑是整圈旋风斩，法杖是三连火球。
  if ((input.pressed & BTN.CAST) && p.castCd <= 0) {
    if (p.weapon === 'sword') {
      meleeAttack(ctx, ctx.player, f.angle, CFG.sword.whirlArc, CFG.sword.range, CFG.sword.whirlDmg);
      p.castCd = CFG.sword.whirlCd;
      p.attackAnim = 0.3;
      p.swingAngle = f.angle;
    } else if (p.mana >= CFG.staff.volleyCost) {
      p.mana -= CFG.staff.volleyCost;
      const n = CFG.staff.volleyCount;
      for (let i = 0; i < n; i++) {
        const a = f.angle + (i - (n - 1) / 2) * CFG.staff.volleySpread;
        spawnProjectile(ctx, ctx.player, a, 'fireball', CFG.staff.projectileSpeed, CFG.staff.projectileDmg, true);
      }
      p.castCd = CFG.staff.volleyCd;
      p.castAnim = CFG.staff.animDur;
      ctx.world.emit({ kind: 'cast', entity: ctx.player, x: pos.x, y: pos.y, angle: f.angle });
    } else {
      p.castCd = 0.5;
      ctx.world.emit({ kind: 'noMana', entity: ctx.player, x: pos.x, y: pos.y, text: '法力不足' });
    }
  }
}
