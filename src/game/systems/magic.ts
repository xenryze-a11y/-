/** 技能只改模拟与发事件；环形粒子、闪电折线与震屏由 present.ts 消费。 */
import { summonBasketballs } from './basketball';
import { angleDiff, dist, norm, type Vec2 } from '../../engine/math';
import { TAG } from '../components';
import { CFG } from '../data';
import { ITEMS, SKILLS, MAGIC, isSkill, type SkillId } from '../items';
import { notice, selectedItem, useSelected } from '../inventory';
import { applyDamage, meleeAttack, spawnProjectile } from './combat';
import type { Ctx } from './context';

export function emitRing(
  ctx: Ctx,
  pos: Vec2,
  r: number,
  color: string,
  life = 0.55,
): void {
  ctx.world.emit({ kind: 'ring', x: pos.x, y: pos.y, amount: r, color, life });
}
function emitBolt(ctx: Ctx, a: Vec2, b: Vec2, color = ITEMS.storm.color): void {
  ctx.world.emit({
    kind: 'bolt',
    x: a.x,
    y: a.y - 12,
    x2: b.x,
    y2: b.y - 12,
    color,
    life: 0.2,
  });
}
export function circleHit(
  ctx: Ctx,
  pos: Vec2,
  r: number,
  damage: number,
  slow = 0,
  freeze = 0,
): void {
  for (const id of ctx.world.query(pos, r + 14, TAG.MOB)) {
    const p = ctx.world.pos(id),
      mob = ctx.s.mob.get(id);
    if (
      ctx.world.isPendingDeath(id) ||
      dist(pos, p) > r + (ctx.s.radius.get(id)?.r || 0) ||
      !ctx.level.lineClear(pos, p)
    )
      continue;
    applyDamage(
      ctx,
      id,
      damage,
      ctx.player,
      norm({ x: p.x - pos.x, y: p.y - pos.y }),
    );
    if (mob) {
      mob.slow = Math.max(mob.slow || 0, slow);
      mob.frozen = Math.max(mob.frozen || 0, freeze);
    }
  }
}
function chain(ctx: Ctx, angle: number): void {
  const origin = { ...ctx.world.pos(ctx.player) },
    targets = ctx.world
      .query(origin, MAGIC.chainRange, TAG.MOB)
      .filter((id) => !ctx.world.isPendingDeath(id));
  const ordered = (at: Vec2, ids: number[]): number[] =>
    ids.sort(
      (a, b) =>
        dist(at, ctx.world.pos(a)) - dist(at, ctx.world.pos(b)) || a - b,
    );
  let current = origin;
  let next = ordered(
    origin,
    targets.filter((id) => {
      const p = ctx.world.pos(id);
      return (
        Math.abs(angleDiff(Math.atan2(p.y - origin.y, p.x - origin.x), angle)) <
          0.68 && ctx.level.lineClear(origin, p)
      );
    }),
  )[0];
  const seen = new Set<number>();
  while (next !== undefined && seen.size < MAGIC.chainCount) {
    const p = { ...ctx.world.pos(next) };
    emitBolt(ctx, current, p);
    applyDamage(
      ctx,
      next,
      Math.max(9, MAGIC.chainDamage - seen.size * MAGIC.chainFalloff),
      ctx.player,
    );
    seen.add(next);
    current = p;
    next = ordered(
      current,
      targets.filter(
        (id) =>
          !seen.has(id) &&
          !ctx.world.isPendingDeath(id) &&
          dist(current, ctx.world.pos(id)) < MAGIC.chainJump &&
          ctx.level.lineClear(current, ctx.world.pos(id)),
      ),
    )[0];
  }
  if (!seen.size) {
    let end = { ...origin };
    for (let d = 4; d <= 180; d += 4) {
      const p = {
        x: origin.x + Math.cos(angle) * d,
        y: origin.y + Math.sin(angle) * d,
      };
      if (!ctx.level.lineClear(end, p)) break;
      end = p;
    }
    emitBolt(ctx, origin, end);
  }
}
function projectile(ctx: Ctx, angle: number, element: SkillId): void {
  const speed =
    element === 'frost'
      ? MAGIC.frostSpeed
      : element === 'blink'
        ? MAGIC.blinkSpeed
        : MAGIC.projectileSpeed;
  const damage =
    element === 'frost'
      ? MAGIC.frostDamage
      : element === 'blink'
        ? MAGIC.blinkDamage
        : MAGIC.damage;
  const id = spawnProjectile(
      ctx,
      ctx.player,
      angle,
      'fireball',
      speed,
      damage,
      true,
    ),
    p = ctx.s.projectile.get(id)!;
  p.element = element;
  p.pierce = element === 'blink' ? MAGIC.pierce : 0;
  p.hit = [];
  p.life = MAGIC.projectileLife;
  p.r = MAGIC.projectileRadius;
  ctx.s.look.get(id)!.staticSprite = `missile_${element}_0`;
}
export function castSelected(ctx: Ctx, special = false): void {
  const p = ctx.s.player.get(ctx.player)!,
    item = selectedItem(ctx);
  if (!item || ctx.gameOver) return;
  const kind = ITEMS[item.id].kind;
  if (kind === 'potion' || kind === 'supply') {
    if (p.atkCd <= 0) {
      useSelected(ctx);
      p.atkCd = 0.35;
    }
    return;
  }
  const angle = ctx.s.facing.get(ctx.player)!.angle,
    pos = { ...ctx.world.pos(ctx.player) };
  if (kind === 'basketball') {
    summonBasketballs(ctx);
    return;
  }
  if (kind === 'sword') {
    if ((special ? p.castCd : p.atkCd) > 0) return;
    meleeAttack(
      ctx,
      ctx.player,
      angle,
      special ? CFG.sword.whirlArc : CFG.sword.arc,
      special ? CFG.sword.whirlRange : CFG.sword.range,
      special ? CFG.sword.whirlDmg : CFG.sword.dmg,
    );
    if (special) p.castCd = CFG.sword.whirlCd;
    else p.atkCd = CFG.sword.cd;
    p.attackAnim = special ? 0.3 : CFG.sword.animDur;
    p.swingAngle = angle;
    return;
  }
  if (!isSkill(item.id)) return;
  const type = item.id,
    skill = SKILLS[type];
  if (special ? (p.cooldowns[type] || 0) > 0 : p.atkCd > 0) return;
  const cost = special ? skill.cost : skill.baseCost;
  if (p.mana < cost) {
    if (p.noManaCd <= 0) {
      notice(ctx, '法力不足 · 切换药水后按 X 使用');
      p.noManaCd = 0.65;
    }
    return;
  }
  p.mana -= cost;
  p.castAnim = CFG.staff.animDur;
  if (special) p.cooldowns[type] = skill.cd;
  else p.atkCd = skill.baseCd;
  if (!special) {
    if (type === 'storm') chain(ctx, angle);
    else projectile(ctx, angle, type);
  } else if (type === 'ember')
    for (const offset of [-MAGIC.volleySpread, 0, MAGIC.volleySpread])
      projectile(ctx, angle + offset, type);
  else if (type === 'frost') {
    circleHit(
      ctx,
      pos,
      MAGIC.frostRadius,
      MAGIC.frostNovaDamage,
      MAGIC.novaSlow,
      MAGIC.freeze,
    );
    emitRing(ctx, pos, MAGIC.frostRadius, ITEMS[type].color, 0.7);
  } else if (type === 'storm') {
    const aim = ctx.camera.toWorld(ctx.aimPointer),
      distance = Math.min(MAGIC.stormRange, dist(pos, aim));
    let point = { ...pos };
    for (let d = 4; d <= distance; d += 4) {
      const next = {
        x: pos.x + Math.cos(angle) * d,
        y: pos.y + Math.sin(angle) * d,
      };
      if (!ctx.level.lineClear(point, next)) break;
      point = next;
    }
    const id = ctx.world.createAt([], point.x, point.y);
    ctx.s.field.set(id, {
      type: 'storm',
      r: MAGIC.stormRadius,
      life: MAGIC.stormLife,
      tick: 0,
      owner: ctx.player,
    });
    emitRing(ctx, point, MAGIC.stormRadius, ITEMS[type].color, 0.6);
  } else if (type === 'ward') {
    p.shield = MAGIC.shieldLife;
    p.shieldHp = MAGIC.shieldHp;
    circleHit(ctx, pos, MAGIC.shieldRadius, MAGIC.shieldDamage, 1);
    emitRing(ctx, pos, MAGIC.shieldRadius, ITEMS[type].color, 0.6);
    notice(ctx, `星辉护盾 · ${MAGIC.shieldHp} 点 / ${MAGIC.shieldLife} 秒`);
  } else if (type === 'blink') {
    let end = { ...pos };
    for (let d = 4; d <= MAGIC.blinkRange; d += 4) {
      const next = {
        x: pos.x + Math.cos(angle) * d,
        y: pos.y + Math.sin(angle) * d,
      };
      if (ctx.level.blocked(next.x, next.y, CFG.player.radius)) break;
      end = next;
    }
    ctx.world.setPos(ctx.player, end);
    p.invuln = MAGIC.blinkInvuln;
    emitBolt(ctx, pos, end, ITEMS[type].color);
    emitRing(ctx, pos, 25, ITEMS[type].color, 0.4);
    emitRing(ctx, end, 35, ITEMS[type].color, 0.4);
  }
  ctx.world.emit({
    kind: 'spell',
    element: type,
    stage: 'cast',
    special,
    entity: ctx.player,
    x: pos.x,
    y: pos.y,
    angle,
  });
}
/** 新系统接在投射物之后、flush 之前，遵守 main.ts 的顺序约定。 */
export function updateFields(ctx: Ctx, dt: number): void {
  ctx.s.field.forEach((id, field) => {
    if (ctx.world.isPendingDeath(id)) return;
    field.life -= dt;
    field.tick -= dt;
    if (field.life <= 0) {
      ctx.world.destroy(id);
      return;
    }
    if (field.tick > 0) return;
    field.tick = MAGIC.stormPeriod;
    const pos = ctx.world.pos(id);
    circleHit(ctx, pos, field.r, MAGIC.stormDamage, 0.6);
    emitRing(ctx, pos, field.r, ITEMS.storm.color, 0.35);
    for (const target of ctx.world
      .query(pos, field.r, TAG.MOB)
      .filter(
        (e) =>
          !ctx.world.isPendingDeath(e) &&
          ctx.level.lineClear(pos, ctx.world.pos(e)),
      )
      .slice(0, 4)) {
      const p = ctx.world.pos(target);
      emitBolt(ctx, { x: p.x - 8, y: p.y - 60 }, p);
    }
  });
}
