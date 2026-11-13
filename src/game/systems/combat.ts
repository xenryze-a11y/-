/**
 * 战斗：所有伤害只有一个出口 applyDamage，无敌帧检查必须放在最前。
 * 对应 goengine 的 engine/sim/combat.go（不变量 6/7）与扇形判定。
 */
import { angleDiff, dist, fromAngle, type Vec2 } from '../../engine/math';
import { CFG } from '../data';
import { BLADE_MAGIC } from '../weapon-data';
import { armorReduction } from '../armor';
import { grantXp } from './quests';
import { SANCTUARY } from '../sanctuary-data';
import { spawnDrop } from './loot';
import { TAG, type Projectile } from '../components';
import type { Ctx } from './context';

/** 统一伤害出口。漏掉这里的无敌帧，翻滚就会被任何一种伤害穿透。 */
export function applyDamage(
  ctx: Ctx,
  target: number,
  raw: number,
  from: number,
  knock?: Vec2,
): void {
  const h = ctx.s.health.get(target);
  if (!h || ctx.world.isPendingDeath(target)) return;

  const pl = ctx.s.player.get(target);
  const dodge = ctx.s.dodge.get(target);
  if ((pl && pl.invuln > 0) || (dodge && dodge.invuln > 0)) return;

  if (pl) {
    if ((ctx.s.blade.get(target)?.infernoLeft || 0) > 0)
      raw *= 1 - BLADE_MAGIC.inferno.reduction;
    raw = Math.max(1, raw - armorReduction(ctx.s.equip.get(target)));
    if (pl.shield > 0 && pl.shieldHp > 0) {
      const absorbed = Math.min(raw, pl.shieldHp);
      pl.shieldHp -= absorbed;
      raw -= absorbed;
      const p = ctx.world.pos(target);
      ctx.world.emit({
        kind: 'ring',
        x: p.x,
        y: p.y,
        amount: 29,
        color: '#b5e9c5',
        life: 0.25,
      });
      if (raw <= 0) return;
    }
    pl.invuln = CFG.player.hurtInvuln;
  }
  const dmg = Math.max(1, Math.round(raw - h.armor * 0.35));
  h.hp -= dmg;
  const mob = ctx.s.mob.get(target);
  if (mob) mob.hurtFlash = 0.18;
  if (pl) pl.hurtFlash = 0.25;
  const p = { ...ctx.world.pos(target) };
  ctx.world.emit({
    kind: target === ctx.player ? 'playerHurt' : 'hurt',
    entity: target,
    x: p.x,
    y: p.y,
    amount: dmg,
    text: `${dmg}`,
  });

  // 击退也走 setPos，别直接写坐标。
  if (knock && !ctx.s.prop.has(target)) {
    const r = ctx.s.radius.get(target)?.r ?? 0;
    const next = ctx.level.move(p, knock.x * 8, knock.y * 8, r);
    ctx.world.setPos(target, next);
  }

  if (h.hp > 0) return;
  ctx.world.emit({ kind: 'kill', entity: target, x: p.x, y: p.y });
  if (target === ctx.player) {
    ctx.gameOver = true;
    return;
  }
  ctx.world.destroy(target);
  const prop = ctx.s.prop.get(target);
  if (prop) {
    ctx.level.removeBlocker(p.x, p.y);
    const wood = [
      'propTree',
      'propBlightTree',
      'propDeadTree',
      'propCrate',
    ].includes(prop.sprite);
    spawnDrop(
      ctx,
      p.x,
      p.y,
      prop.sprite === 'propFungus' ? 'herb' : wood ? 'wood' : 'stone',
      prop.sprite === 'propTree' ? 3 : 2,
    );
  } else if (ctx.world.hasTag(target, TAG.MOB)) {
    const killer = ctx.s.player.get(ctx.player);
    if (killer && ctx.world.hasTag(from, TAG.PLAYER)) {
      killer.kills++;
      grantXp(ctx, SANCTUARY.killXp);
    }
    spawnDrop(ctx, p.x, p.y, ctx.world.rng() < 0.55 ? 'crystal' : 'herb');
    if (ctx.world.rng() < 0.22)
      spawnDrop(ctx, p.x, p.y, ctx.world.rng() < 0.5 ? 'mana' : 'health');
  }
}

/** 近战扇形：空间查询 + 角度判定。arc = 2π 时就是旋风斩。 */
export function meleeAttack(
  ctx: Ctx,
  attacker: number,
  a: number,
  arc: number,
  range: number,
  dmg: number,
): void {
  const p = ctx.world.pos(attacker);
  // 查询半径要留实体自身半径的余量，否则贴身的大体积敌人会被漏掉。
  for (const e of ctx.world.query(p, range + 24, TAG.DAMAGEABLE)) {
    if (e === attacker || ctx.world.isPendingDeath(e)) continue;
    const ep = ctx.world.pos(e);
    const er = ctx.s.radius.get(e)?.r ?? 0;
    if (dist(p, ep) > range + er) continue;
    if (arc < Math.PI * 2 - 0.01) {
      const to = Math.atan2(ep.y - p.y, ep.x - p.x);
      if (Math.abs(angleDiff(to, a)) > arc / 2) continue;
    }
    if (!ctx.level.lineClear(p, ep)) continue;
    applyDamage(ctx, e, dmg, attacker, fromAngle(toTargetAngle(p, ep)));
  }
  ctx.world.emit({
    kind: 'swing',
    entity: attacker,
    x: p.x,
    y: p.y,
    angle: a,
    amount: range,
  });
}

function toTargetAngle(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function spawnProjectile(
  ctx: Ctx,
  owner: number,
  a: number,
  kind: Projectile['kind'],
  speed: number,
  dmg: number,
  fromPlayer: boolean,
): number {
  const p = ctx.world.pos(owner);
  let muzzle = { ...p };
  // 发射点不能越过贴身墙体，否则出生点会在墙的另一侧。
  for (let d = 4; d <= 18; d += 4) {
    const next = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
    if (
      !ctx.level.lineClear(muzzle, next) ||
      ctx.level.terrainBlocked(next.x, next.y, 3)
    )
      break;
    muzzle = next;
  }
  const e = ctx.world.createAt([TAG.PROJECTILE], muzzle.x, muzzle.y);
  const v = fromAngle(a, speed);
  ctx.s.radius.set(e, { r: kind === 'fireball' ? 7 : 6 });
  ctx.s.projectile.set(e, {
    vx: v.x,
    vy: v.y,
    life: 1.6,
    dmg,
    r: kind === 'fireball' ? 7 : 6,
    fromPlayer,
    owner,
    kind,
  });
  ctx.s.look.set(e, {
    family: 'fx',
    scale: 1,
    showHealth: false,
    animated: false,
    staticSprite: kind === 'fireball' ? 'fireball_000' : 'shadow_000',
  });
  return e;
}
