/** 四系职业规则：状态、弹道、区域和陨石都属于模拟，表现只消费事件。 */
import { dist, type Vec2 } from '../../engine/math';
import { TAG, type StaffZoneKind, type StaffShotStyle } from '../components';
import {
  ELEMENT_STAVES,
  STAFF_PROFESSIONS,
  STAFF_ARTS,
  type ElementStaffId,
} from '../staff-data';
import type { MageSkillId } from '../mage-data';
import { selectedItem, applyInventoryCommand, notice } from '../inventory';
import { CFG } from '../data';
import { applyDamage } from './combat';
import type { Ctx } from './context';

export function syncElementUnlocks(ctx: Ctx): void {
  const mage = ctx.s.mage.get(ctx.player)!,
    inv = ctx.s.inventory.get(ctx.player)!;
  for (const school of ELEMENT_STAVES) {
    if (mage.schools[school].unlocked) continue;
    const index = inv.slots.findIndex((i) => i?.id === school);
    if (index < 0 && inv.cursor?.id !== school) continue;
    mage.schools[school].unlocked = true;
    if (index >= 0 && index < 9)
      applyInventoryCommand(ctx, { type: 'select', index });
    notice(ctx, '解锁' + STAFF_PROFESSIONS[school].name + ' · Q / F / R');
  }
}
function event(
  ctx: Ctx,
  school: ElementStaffId,
  ability: string,
  pos: Vec2,
  amount = 0,
): void {
  ctx.world.emit({
    kind: 'staffArt',
    element: school,
    ability,
    x: pos.x,
    y: pos.y,
    amount,
  });
}
function ignite(ctx: Ctx, id: number): void {
  const mob = ctx.s.mob.get(id);
  if (!mob) return;
  if ((mob.burn || 0) <= 0) mob.burnTick = STAFF_ARTS.ember.burnPeriod;
  mob.burn = STAFF_ARTS.ember.burnLife;
}
function strike(
  ctx: Ctx,
  id: number,
  damage: number,
  school: ElementStaffId,
  freeze = 0,
): void {
  if (damage > 0) applyDamage(ctx, id, damage, ctx.player);
  const mob = ctx.s.mob.get(id);
  if (mob && school === 'ember') ignite(ctx, id);
  if (mob && school === 'frost') {
    mob.slow = Math.max(mob.slow || 0, STAFF_ARTS.frost.slow);
    mob.frozen = Math.max(mob.frozen || 0, freeze);
  }
}
function pulse(
  ctx: Ctx,
  pos: Vec2,
  radius: number,
  damage: number,
  school: ElementStaffId,
  freeze = 0,
): void {
  for (const id of ctx.world.query(pos, radius + 18, TAG.MOB)) {
    if (ctx.world.isPendingDeath(id)) continue;
    const target = ctx.world.pos(id);
    if (
      dist(pos, target) > radius + (ctx.s.radius.get(id)?.r || 0) ||
      !ctx.level.lineClear(pos, target)
    )
      continue;
    strike(ctx, id, damage, school, freeze);
  }
}
function targetPoint(ctx: Ctx): Vec2 {
  const at = ctx.world.pos(ctx.player),
    aim = ctx.camera.toWorld(ctx.aimPointer),
    angle = ctx.s.facing.get(ctx.player)!.angle,
    reach = Math.min(STAFF_ARTS.targetRange, Math.max(90, dist(at, aim)));
  let point = { ...at };
  for (let d = 4; d <= reach; d += 4) {
    const next = {
      x: at.x + Math.cos(angle) * d,
      y: at.y + Math.sin(angle) * d,
    };
    if (
      ctx.level.terrainBlocked(next.x, next.y, 12) ||
      !ctx.level.lineClear(point, next)
    )
      break;
    point = next;
  }
  return point;
}
function zone(
  ctx: Ctx,
  school: ElementStaffId,
  kind: StaffZoneKind,
  pos: Vec2,
  life: number,
  radius: number,
): void {
  if (ctx.s.staffZone.length >= STAFF_ARTS.maxZones) return;
  const id = ctx.world.createAt([], pos.x, pos.y);
  ctx.s.staffZone.set(id, {
    owner: ctx.player,
    school,
    kind,
    life,
    maxLife: life,
    radius,
    tick: 0,
    phase: 0,
  });
}
function targets(ctx: Ctx, pos: Vec2): number[] {
  return ctx.world
    .query(pos, 360, TAG.MOB)
    .filter(
      (id) =>
        !ctx.world.isPendingDeath(id) &&
        ctx.level.lineClear(pos, ctx.world.pos(id)),
    )
    .sort(
      (a, b) =>
        dist(pos, ctx.world.pos(a)) - dist(pos, ctx.world.pos(b)) || a - b,
    );
}
function shot(
  ctx: Ctx,
  school: ElementStaffId,
  style: StaffShotStyle,
  angle: number,
  damage: number,
  speed: number,
  pierce: number,
  target = 0,
): void {
  const at = ctx.world.pos(ctx.player);
  let start = { ...at };
  for (let d = 4; d <= 16; d += 4) {
    const next = {
      x: at.x + Math.cos(angle) * d,
      y: at.y + Math.sin(angle) * d,
    };
    if (
      ctx.level.terrainBlocked(next.x, next.y, 4) ||
      !ctx.level.lineClear(start, next)
    )
      break;
    start = next;
  }
  const id = ctx.world.createAt([TAG.PROJECTILE], start.x, start.y);
  ctx.s.radius.set(id, { r: 5 });
  ctx.s.staffShot.set(id, {
    owner: ctx.player,
    school,
    style,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    age: 0,
    life:
      style === 'star'
        ? STAFF_ARTS.ward.orbLife
        : style === 'blade'
          ? STAFF_ARTS.blink.bladeLife
          : 1.45,
    damage,
    radius: 5,
    pierce,
    hit: [],
    returning: false,
    target,
  });
  ctx.s.look.set(id, {
    family: 'fx',
    scale: 1,
    animated: false,
    showHealth: false,
    staticSprite: style === 'lance' ? 'artFlameLance' : `missile_${school}_0`,
  });
}
export function castElementArt(
  ctx: Ctx,
  school: ElementStaffId,
  ability: MageSkillId,
): void {
  if (ctx.gameOver) return;
  syncElementUnlocks(ctx);
  if (selectedItem(ctx)?.id !== school) return;
  const state = ctx.s.mage.get(ctx.player)!.schools[school],
    player = ctx.s.player.get(ctx.player)!,
    def = STAFF_PROFESSIONS[school].skills[ability];
  if (!state.unlocked || state.cooldowns[ability] > 0) return;
  if (player.mana < def.cost) {
    if (player.noManaCd <= 0) {
      notice(ctx, '法力不足');
      player.noManaCd = 0.65;
    }
    return;
  }
  const count = ability === 'wave' ? (school === 'frost' ? 1 : 3) : 0;
  if (
    ctx.s.staffShot.length + count > STAFF_ARTS.maxShots ||
    ((ability === 'barrage' || (school === 'ember' && ability === 'field')) &&
      ctx.s.staffZone.length >= STAFF_ARTS.maxZones)
  ) {
    notice(ctx, '法术正在作用，请稍候');
    return;
  }
  player.mana -= def.cost;
  state.cooldowns[ability] = def.cooldown;
  player.castAnim = 0.26;
  const pos = { ...ctx.world.pos(ctx.player) },
    angle = ctx.s.facing.get(ctx.player)!.angle;
  event(ctx, school, 'cast', pos);
  if (ability === 'field') {
    if (school === 'ember')
      zone(
        ctx,
        school,
        'embers',
        pos,
        STAFF_ARTS.ember.auraLife,
        STAFF_ARTS.ember.auraRadius,
      );
    else if (school === 'frost') {
      pulse(
        ctx,
        pos,
        STAFF_ARTS.frost.novaRadius,
        STAFF_ARTS.frost.novaDamage,
        school,
        STAFF_ARTS.frost.freeze,
      );
      event(ctx, school, 'nova', pos, STAFF_ARTS.frost.novaRadius);
    } else if (school === 'ward') {
      player.shield = STAFF_ARTS.ward.shieldLife;
      player.shieldHp = STAFF_ARTS.ward.shieldHp;
      pulse(
        ctx,
        pos,
        STAFF_ARTS.ward.shieldRadius,
        STAFF_ARTS.ward.shieldDamage,
        school,
      );
      event(ctx, school, 'shield', pos, 72);
    } else {
      let end = { ...pos };
      for (let d = 4; d <= STAFF_ARTS.blink.range; d += 4) {
        const next = {
          x: pos.x + Math.cos(angle) * d,
          y: pos.y + Math.sin(angle) * d,
        };
        if (ctx.level.blocked(next.x, next.y, CFG.player.radius)) break;
        end = next;
      }
      ctx.world.setPos(ctx.player, end);
      player.invuln = STAFF_ARTS.blink.invuln;
      pulse(
        ctx,
        pos,
        STAFF_ARTS.blink.blinkRadius,
        STAFF_ARTS.blink.blinkDamage,
        school,
      );
      pulse(
        ctx,
        end,
        STAFF_ARTS.blink.blinkRadius,
        STAFF_ARTS.blink.blinkDamage,
        school,
      );
      event(ctx, school, 'blink', pos, 32);
      event(ctx, school, 'blink', end, 36);
    }
  } else if (ability === 'wave') {
    if (school === 'ember')
      for (const offset of [-0.24, 0, 0.24])
        shot(
          ctx,
          school,
          'lance',
          angle + offset,
          STAFF_ARTS.ember.lanceDamage,
          STAFF_ARTS.ember.lanceSpeed,
          STAFF_ARTS.ember.lancePierce,
        );
    else if (school === 'frost')
      shot(
        ctx,
        school,
        'spear',
        angle,
        STAFF_ARTS.frost.spearDamage,
        STAFF_ARTS.frost.spearSpeed,
        STAFF_ARTS.frost.spearPierce,
      );
    else if (school === 'ward') {
      const visible = targets(ctx, pos);
      for (let i = 0; i < STAFF_ARTS.ward.orbCount; i++)
        shot(
          ctx,
          school,
          'star',
          angle + (i - 1) * 0.22,
          STAFF_ARTS.ward.orbDamage,
          STAFF_ARTS.ward.orbSpeed,
          0,
          visible[i % Math.max(1, visible.length)] || 0,
        );
    } else
      for (const offset of [-0.3, 0, 0.3])
        shot(
          ctx,
          school,
          'blade',
          angle + offset,
          STAFF_ARTS.blink.bladeDamage,
          STAFF_ARTS.blink.bladeSpeed,
          STAFF_ARTS.blink.bladePierce,
        );
  } else {
    const at = targetPoint(ctx);
    if (school === 'ember')
      zone(
        ctx,
        school,
        'meteors',
        at,
        STAFF_ARTS.ember.meteorCount * STAFF_ARTS.ember.meteorPeriod,
        STAFF_ARTS.ember.stormRadius,
      );
    else if (school === 'frost') {
      zone(
        ctx,
        school,
        'blizzard',
        at,
        STAFF_ARTS.frost.stormLife,
        STAFF_ARTS.frost.stormRadius,
      );
      pulse(ctx, at, STAFF_ARTS.frost.stormRadius, 0, school, 1);
    } else if (school === 'ward') {
      zone(
        ctx,
        school,
        'judgment',
        at,
        STAFF_ARTS.ward.judgmentLife,
        STAFF_ARTS.ward.judgmentRadius,
      );
      player.shield = Math.max(player.shield, STAFF_ARTS.ward.judgmentLife);
      player.shieldHp = Math.max(
        player.shieldHp,
        STAFF_ARTS.ward.judgmentShield,
      );
    } else
      zone(
        ctx,
        school,
        'singularity',
        at,
        STAFF_ARTS.blink.singularityLife,
        STAFF_ARTS.blink.singularityRadius,
      );
    event(ctx, school, 'ultimate', at, 100);
  }
}
function updateShots(ctx: Ctx, dt: number): void {
  ctx.s.staffShot.forEach((id, p) => {
    if (ctx.world.isPendingDeath(id)) return;
    p.age += dt;
    p.life -= dt;
    let pos = { ...ctx.world.pos(id) };
    if (
      p.style === 'blade' &&
      !p.returning &&
      p.age >= STAFF_ARTS.blink.bladeReturn
    ) {
      p.returning = true;
      p.hit = [];
      p.pierce = STAFF_ARTS.blink.bladePierce;
    }
    if (p.style === 'star') {
      if (
        !p.target ||
        ctx.world.isPendingDeath(p.target) ||
        !ctx.world.alive.has(p.target) ||
        !ctx.level.lineClear(pos, ctx.world.pos(p.target))
      )
        p.target = targets(ctx, pos)[0] || 0;
      if (p.target) {
        const at = ctx.world.pos(p.target),
          a = Math.atan2(at.y - pos.y, at.x - pos.x),
          blend = Math.min(1, STAFF_ARTS.ward.orbTurn * dt);
        p.vx += (Math.cos(a) * STAFF_ARTS.ward.orbSpeed - p.vx) * blend;
        p.vy += (Math.sin(a) * STAFF_ARTS.ward.orbSpeed - p.vy) * blend;
      }
    }
    if (p.returning) {
      const at = ctx.world.pos(p.owner);
      if (dist(pos, at) < 16) {
        ctx.world.destroy(id);
        return;
      }
      const a = Math.atan2(at.y - pos.y, at.x - pos.x);
      p.vx = Math.cos(a) * STAFF_ARTS.blink.bladeSpeed;
      p.vy = Math.sin(a) * STAFF_ARTS.blink.bladeSpeed;
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(p.vx * dt, p.vy * dt) / 4));
    for (let k = 0; k < steps; k++) {
      const next = {
        x: pos.x + (p.vx * dt) / steps,
        y: pos.y + (p.vy * dt) / steps,
      };
      if (ctx.level.terrainBlocked(next.x, next.y, 3)) {
        event(ctx, p.school, 'impact', pos, 20);
        ctx.world.destroy(id);
        return;
      }
      for (const target of ctx.world.query(next, 23, TAG.DAMAGEABLE)) {
        if (
          target === p.owner ||
          p.hit.includes(target) ||
          ctx.world.isPendingDeath(target)
        )
          continue;
        const at = ctx.world.pos(target);
        if (
          dist(next, at) > p.radius + (ctx.s.radius.get(target)?.r || 0) ||
          !ctx.level.lineClear(pos, at)
        )
          continue;
        strike(
          ctx,
          target,
          p.damage,
          p.school,
          p.style === 'spear' ? STAFF_ARTS.frost.spearFreeze : 0,
        );
        p.hit.push(target);
        event(ctx, p.school, 'impact', next, 20);
        if (p.pierce > 0) p.pierce--;
        else {
          ctx.world.destroy(id);
          return;
        }
      }
      ctx.world.setPos(id, next);
      pos = next;
    }
    if (p.life <= 0) ctx.world.destroy(id);
  });
}
function meteor(ctx: Ctx, at: Vec2): void {
  if (ctx.s.meteor.length >= STAFF_ARTS.maxMeteors) return;
  const id = ctx.world.createAt([], at.x, at.y),
    def = STAFF_ARTS.ember;
  ctx.s.meteor.set(id, {
    owner: ctx.player,
    delay: def.meteorDelay,
    maxDelay: def.meteorDelay,
    radius: def.meteorRadius,
    damage: def.meteorDamage,
  });
  ctx.s.look.set(id, {
    family: 'fx',
    scale: 1,
    animated: false,
    showHealth: false,
    staticSprite: 'artMeteor',
  });
}
export function updateStaffArts(ctx: Ctx, dt: number): void {
  syncElementUnlocks(ctx);
  updateShots(ctx, dt);
  ctx.s.meteor.forEach((id, m) => {
    if (ctx.world.isPendingDeath(id)) return;
    m.delay -= dt;
    if (m.delay > 0) return;
    const pos = ctx.world.pos(id);
    pulse(ctx, pos, m.radius, m.damage, 'ember');
    event(ctx, 'ember', 'meteor', pos, m.radius);
    zone(ctx, 'ember', 'burn', pos, STAFF_ARTS.ember.patchLife, m.radius * 0.8);
    ctx.world.destroy(id);
  });
  ctx.s.staffZone.forEach((id, f) => {
    if (ctx.world.isPendingDeath(id)) return;
    if (f.kind === 'embers')
      ctx.world.setPos(id, { ...ctx.world.pos(f.owner) });
    const pos = ctx.world.pos(id),
      active = Math.min(dt, f.life);
    f.life = Math.max(0, f.life - dt);
    if (f.kind === 'singularity')
      for (const target of ctx.world.query(pos, f.radius + 24, TAG.MOB)) {
        if (ctx.world.isPendingDeath(target)) continue;
        const at = ctx.world.pos(target),
          distance = dist(at, pos);
        if (distance < 12 || !ctx.level.lineClear(pos, at)) continue;
        const step = Math.min(
            distance - 12,
            STAFF_ARTS.blink.pullSpeed * active,
          ),
          next = ctx.level.move(
            at,
            ((pos.x - at.x) / distance) * step,
            ((pos.y - at.y) / distance) * step,
            ctx.s.radius.get(target)?.r || 10,
          );
        ctx.world.setPos(target, next);
      }
    f.tick -= active;
    while (f.tick <= 0) {
      if (f.kind === 'embers') {
        f.tick += STAFF_ARTS.ember.auraPeriod;
        pulse(ctx, pos, f.radius, STAFF_ARTS.ember.auraDamage, 'ember');
      } else if (f.kind === 'burn') {
        f.tick += STAFF_ARTS.ember.patchPeriod;
        pulse(ctx, pos, f.radius, STAFF_ARTS.ember.patchDamage, 'ember');
      } else if (f.kind === 'meteors') {
        f.tick += STAFF_ARTS.ember.meteorPeriod;
        if (f.phase < STAFF_ARTS.ember.meteorCount) {
          const a = f.phase * 2.399963,
            r = f.phase === 0 ? 0 : 22 + (f.phase % 4) * 21,
            point = { x: pos.x + Math.cos(a) * r, y: pos.y + Math.sin(a) * r };
          if (
            !ctx.level.terrainBlocked(point.x, point.y, 4) &&
            ctx.level.lineClear(pos, point)
          )
            meteor(ctx, point);
        }
      } else if (f.kind === 'blizzard') {
        f.tick += STAFF_ARTS.frost.stormPeriod;
        pulse(ctx, pos, f.radius, STAFF_ARTS.frost.stormDamage, 'frost', 0.22);
      } else if (f.kind === 'judgment') {
        f.tick += STAFF_ARTS.ward.judgmentPeriod;
        pulse(ctx, pos, f.radius, STAFF_ARTS.ward.judgmentDamage, 'ward');
        const owner = ctx.world.pos(f.owner);
        if (dist(owner, pos) <= f.radius && ctx.level.lineClear(pos, owner)) {
          const health = ctx.s.health.get(f.owner)!;
          health.hp = Math.min(
            health.max,
            health.hp + STAFF_ARTS.ward.judgmentHeal,
          );
        }
        event(
          ctx,
          'ward',
          'pillar',
          {
            x: pos.x + Math.cos((f.phase * Math.PI) / 3) * f.radius * 0.65,
            y: pos.y + Math.sin((f.phase * Math.PI) / 3) * f.radius * 0.4,
          },
          38,
        );
      } else {
        f.tick += STAFF_ARTS.blink.singularityPeriod;
        pulse(ctx, pos, f.radius, STAFF_ARTS.blink.singularityDamage, 'blink');
      }
      f.phase++;
    }
    if (f.life <= 0) {
      if (f.kind === 'singularity') {
        pulse(
          ctx,
          pos,
          STAFF_ARTS.blink.collapseRadius,
          STAFF_ARTS.blink.collapseDamage,
          'blink',
        );
        event(ctx, 'blink', 'collapse', pos, STAFF_ARTS.blink.collapseRadius);
      }
      ctx.world.destroy(id);
    }
  });
  ctx.s.mob.forEach((id, m) => {
    if (ctx.world.isPendingDeath(id) || (m.burn || 0) <= 0) return;
    m.burnTick = (m.burnTick ?? STAFF_ARTS.ember.burnPeriod) - dt;
    while (m.burnTick <= 0) {
      m.burnTick += STAFF_ARTS.ember.burnPeriod;
      applyDamage(ctx, id, STAFF_ARTS.ember.burnDamage, ctx.player);
    }
  });
}
