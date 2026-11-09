/**
 * 投射物：移动 → 撞墙 / 命中 → 火球范围爆炸。
 * 对应 goengine 的 engine/sim/combat.go UpdateProjectiles。
 * 撞墙用 r=0 的地形查询：绕过场景物，避免树把伤害吞掉。
 */
import { TAG } from '../components';
import { CFG } from '../data';
import { applyDamage } from './combat';
import type { Ctx } from './context';

export function updateProjectiles(ctx: Ctx, dt: number): void {
  ctx.s.projectile.forEach((e, pr) => {
    if (ctx.world.isPendingDeath(e)) return;
    pr.life -= dt;
    const p = ctx.world.pos(e);
    const next = { x: p.x + pr.vx * dt, y: p.y + pr.vy * dt };

    let hit = 0;
    if (ctx.level.blocked(next.x, next.y, 0)) {
      explode(ctx, e, pr.kind, pr.dmg, pr.owner, next, hit);
      return;
    }

    const tag = pr.fromPlayer ? TAG.DAMAGEABLE : TAG.PLAYER;
    for (const t of ctx.world.query(next, pr.r + 18, tag)) {
      if (t === pr.owner || ctx.world.isPendingDeath(t)) continue;
      if (!pr.fromPlayer && t !== ctx.player) continue;
      const tp = ctx.world.pos(t);
      const tr = ctx.s.radius.get(t)?.r ?? 0;
      if (Math.hypot(tp.x - next.x, tp.y - next.y) <= pr.r + tr) {
        hit = t;
        break;
      }
    }

    if (hit || pr.life <= 0) {
      explode(ctx, e, pr.kind, pr.dmg, pr.owner, next, hit);
      return;
    }
    ctx.world.setPos(e, next);
  });
}

function explode(
  ctx: Ctx, self: number, kind: 'fireball' | 'shadow', dmg: number, owner: number,
  at: { x: number; y: number }, directHit: number,
): void {
  const radius = kind === 'fireball' ? CFG.staff.splashRadius : 0;
  ctx.world.emit({ kind: 'impact', entity: self, x: at.x, y: at.y, amount: radius });
  if (kind === 'fireball') {
    for (const t of ctx.world.query(at, radius + 20, TAG.DAMAGEABLE)) {
      if (t === owner || ctx.world.isPendingDeath(t)) continue;
      const tp = ctx.world.pos(t);
      const tr = ctx.s.radius.get(t)?.r ?? 0;
      if (Math.hypot(tp.x - at.x, tp.y - at.y) > radius + tr) continue;
      applyDamage(ctx, t, CFG.staff.splashDmg, owner);
    }
    if (directHit) applyDamage(ctx, directHit, dmg, owner);
  } else if (directHit) {
    applyDamage(ctx, directHit, dmg, owner);
  }
  ctx.world.destroy(self);
}
