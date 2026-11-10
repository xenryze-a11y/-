/** 分段扫掠防止高速秘矢穿墙；碰撞与爆炸均使用同一套地形视线。 */
import { mageOrbImpact } from './mage';
import { dist, type Vec2 } from '../../engine/math';
import { TAG, type Projectile } from '../components';
import { MAGIC, ITEMS } from '../items';
import { applyDamage } from './combat';
import { circleHit, emitRing } from './magic';
import type { Ctx } from './context';

export function updateProjectiles(ctx: Ctx, dt: number): void {
  ctx.s.projectile.forEach((id, p) => {
    if (ctx.world.isPendingDeath(id)) return;
    p.life -= dt;
    const start = { ...ctx.world.pos(id) },
      steps = Math.max(1, Math.ceil(Math.hypot(p.vx * dt, p.vy * dt) / 4));
    for (let k = 1; k <= steps; k++) {
      const point = {
        x: start.x + (p.vx * dt * k) / steps,
        y: start.y + (p.vy * dt * k) / steps,
      };
      if (ctx.level.terrainBlocked(point.x, point.y, p.r * 0.45)) {
        impact(ctx, id, p, ctx.world.pos(id), 0);
        return;
      }
      const tag = p.fromPlayer ? TAG.DAMAGEABLE : TAG.PLAYER;
      for (const target of ctx.world.query(point, p.r + 18, tag)) {
        if (
          target === p.owner ||
          ctx.world.isPendingDeath(target) ||
          p.hit?.includes(target)
        )
          continue;
        const at = ctx.world.pos(target);
        if (dist(point, at) > p.r + (ctx.s.radius.get(target)?.r || 0))
          continue;
        if (p.element === 'blink' && (p.pierce || 0) > 0) {
          applyDamage(ctx, target, p.dmg, p.owner);
          p.hit!.push(target);
          p.pierce!--;
          emitRing(ctx, at, 18, ITEMS.blink.color, 0.25);
          continue;
        }
        impact(ctx, id, p, point, target);
        return;
      }
      ctx.world.setPos(id, point);
    }
    if (p.life <= 0) impact(ctx, id, p, ctx.world.pos(id), 0);
  });
}
function impact(
  ctx: Ctx,
  id: number,
  p: Projectile,
  pos: Vec2,
  target: number,
): void {
  if (p.barrage) {
    mageOrbImpact(ctx, pos);
    if (target && !ctx.s.mob.has(target))
      applyDamage(ctx, target, p.dmg, p.owner);
    ctx.world.destroy(id);
    return;
  }
  if (p.fromPlayer) {
    if (p.element === 'ember' || !p.element) {
      circleHit(ctx, pos, MAGIC.fireRadius, MAGIC.fireSplash);
      emitRing(ctx, pos, MAGIC.fireRadius, ITEMS.ember.color, 0.4);
    }
    if (target) {
      applyDamage(ctx, target, p.dmg, p.owner);
      const mob = ctx.s.mob.get(target);
      if (mob && p.element === 'frost') mob.slow = MAGIC.frostSlow;
    }
    if (p.element && p.element !== 'ember')
      emitRing(
        ctx,
        pos,
        p.element === 'frost' ? 28 : 20,
        ITEMS[p.element].color,
        0.35,
      );
  } else if (target) applyDamage(ctx, target, p.dmg, p.owner);
  ctx.world.emit({
    kind: 'spell',
    element: p.element || (p.fromPlayer ? 'ember' : 'blink'),
    stage: 'impact',
    x: pos.x,
    y: pos.y,
  });
  ctx.world.destroy(id);
}
