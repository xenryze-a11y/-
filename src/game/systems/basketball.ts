/** 篮球召唤是独立模拟实体；命中、到期、撞墙统一引爆，伤害永远走 applyDamage。 */
import { dist, type Vec2 } from '../../engine/math';
import { TAG } from '../components';
import { BASKETBALL, BASKETBALL_SKILL } from '../items';
import { notice } from '../inventory';
import { applyDamage } from './combat';
import type { Ctx } from './context';

function enemies(ctx: Ctx, at: Vec2): number[] {
  return ctx.world
    .query(at, BASKETBALL.seekRange, TAG.MOB)
    .filter(
      (id) =>
        !ctx.world.isPendingDeath(id) &&
        ctx.level.lineClear(at, ctx.world.pos(id)),
    )
    .sort(
      (a, b) =>
        dist(at, ctx.world.pos(a)) - dist(at, ctx.world.pos(b)) || a - b,
    );
}
export function summonBasketballs(ctx: Ctx): void {
  const player = ctx.s.player.get(ctx.player)!;
  if (ctx.gameOver || (player.cooldowns.basketball || 0) > 0) return;
  if (player.mana < BASKETBALL_SKILL.cost) {
    if (player.noManaCd <= 0) {
      notice(ctx, '法力不足 · 篮球召唤需要 18 法力');
      player.noManaCd = 0.65;
    }
    return;
  }
  const active = ctx.s.summon.owners.filter(
    (id) => !ctx.world.isPendingDeath(id),
  ).length;
  if (active + BASKETBALL.count > BASKETBALL.maxActive) {
    notice(ctx, '召唤物正在冲锋，请稍候');
    return;
  }
  const origin = { ...ctx.world.pos(ctx.player) },
    angle = ctx.s.facing.get(ctx.player)!.angle,
    targets = enemies(ctx, origin);
  player.mana -= BASKETBALL_SKILL.cost;
  player.cooldowns.basketball = BASKETBALL_SKILL.cd;
  player.castAnim = 0.32;
  for (let i = 0; i < BASKETBALL.count; i++) {
    // 扇形短距展开；生成点同样不能越过墙体。
    const a = angle + (i - 2) * 0.55,
      point = {
        x: origin.x + Math.cos(a) * 22,
        y: origin.y + Math.sin(a) * 22,
      };
    const spawn =
      ctx.level.blocked(point.x, point.y, BASKETBALL.radius) ||
      !ctx.level.lineClear(origin, point)
        ? origin
        : point;
    const id = ctx.world.createAt([TAG.SUMMON], spawn.x, spawn.y);
    ctx.s.radius.set(id, { r: BASKETBALL.radius });
    ctx.s.summon.set(id, {
      owner: ctx.player,
      target: targets[i % Math.max(1, targets.length)] || 0,
      life: BASKETBALL.life,
      age: 0,
      angle: a,
    });
    ctx.s.look.set(id, {
      family: 'summon',
      scale: 1,
      showHealth: false,
      animated: false,
      staticSprite: 'summon_0',
    });
  }
  ctx.world.emit({
    kind: 'basketball',
    stage: 'cast',
    x: origin.x,
    y: origin.y,
  });
}
function explode(ctx: Ctx, id: number, point: Vec2): void {
  if (ctx.world.isPendingDeath(id)) return;
  const summon = ctx.s.summon.get(id)!;
  for (const target of ctx.world.query(
    point,
    BASKETBALL.splashRadius + 16,
    TAG.MOB,
  )) {
    if (ctx.world.isPendingDeath(target)) continue;
    const pos = ctx.world.pos(target);
    if (
      dist(point, pos) >
        BASKETBALL.splashRadius + (ctx.s.radius.get(target)?.r || 0) ||
      !ctx.level.lineClear(point, pos)
    )
      continue;
    applyDamage(ctx, target, BASKETBALL.damage, summon.owner);
  }
  ctx.world.emit({
    kind: 'basketball',
    stage: 'impact',
    x: point.x,
    y: point.y,
    amount: BASKETBALL.splashRadius,
  });
  ctx.world.destroy(id);
}
export function updateSummons(ctx: Ctx, dt: number): void {
  ctx.s.summon.forEach((id, summon) => {
    if (ctx.world.isPendingDeath(id)) return;
    summon.age += dt;
    summon.life -= dt;
    let point = { ...ctx.world.pos(id) };
    if (summon.life <= 0) {
      explode(ctx, id, point);
      return;
    }
    if (summon.age < BASKETBALL.windup) return;
    if (
      !summon.target ||
      !ctx.world.alive.has(summon.target) ||
      ctx.world.isPendingDeath(summon.target) ||
      !ctx.level.lineClear(point, ctx.world.pos(summon.target))
    )
      summon.target = enemies(ctx, point)[0] || 0;
    if (summon.target) {
      const target = ctx.world.pos(summon.target);
      summon.angle = Math.atan2(target.y - point.y, target.x - point.x);
    }
    const distance =
        BASKETBALL.speed *
        Math.min(1, (summon.age - BASKETBALL.windup) * 5 + 0.3) *
        dt,
      steps = Math.max(1, Math.ceil(distance / 4));
    for (let i = 0; i < steps; i++) {
      const next = {
        x: point.x + (Math.cos(summon.angle) * distance) / steps,
        y: point.y + (Math.sin(summon.angle) * distance) / steps,
      };
      if (ctx.level.blocked(next.x, next.y, BASKETBALL.radius)) {
        explode(ctx, id, point);
        return;
      }
      ctx.world.setPos(id, next);
      point = next;
      for (const target of ctx.world.query(
        point,
        BASKETBALL.radius + 18,
        TAG.MOB,
      )) {
        if (
          ctx.world.isPendingDeath(target) ||
          !ctx.level.lineClear(point, ctx.world.pos(target))
        )
          continue;
        if (
          dist(point, ctx.world.pos(target)) <=
          BASKETBALL.radius + (ctx.s.radius.get(target)?.r || 0)
        ) {
          explode(ctx, id, point);
          return;
        }
      }
    }
  });
}
