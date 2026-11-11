/** 近战兵器规则：邪阵预兆、破土命中与连斩均在固定步长模拟。 */
import { angleDiff, dist, type Vec2 } from '../../engine/math';
import { TAG } from '../components';
import {
  BLADE_MAGIC as M,
  BLADES,
  COMBAT_PROFESSIONS,
  type BladeProfessionId,
  type BladeId,
} from '../weapon-data';
import type { MageSkillId } from '../mage-data';
import { selectedItem, notice } from '../inventory';
import { applyDamage, meleeAttack } from './combat';
import { igniteMob } from './staff-arts';
import type { Ctx } from './context';
export function bladeEvent(
  ctx: Ctx,
  ability: string,
  at: Vec2,
  angle = 0,
  amount = 0,
): void {
  ctx.world.emit({
    kind: 'bladeArt',
    ability,
    x: at.x,
    y: at.y,
    angle,
    amount,
  });
}
function damageScale(ctx: Ctx): number {
  return ctx.s.blade.get(ctx.player)!.infernoLeft > 0
    ? M.inferno.multiplier
    : 1;
}
export function attackBlade(ctx: Ctx, id: BladeId): void {
  const p = ctx.s.player.get(ctx.player)!,
    state = ctx.s.blade.get(ctx.player)!,
    def = BLADES[id];
  if (
    p.atkCd > 0 ||
    state.comboLeft > 0 ||
    (id === 'greatsword' && (state.waveLeft > 0 || state.waveSwingLeft > 0))
  )
    return;
  const angle = ctx.s.facing.get(ctx.player)!.angle,
    at = ctx.world.pos(ctx.player),
    damage = def.damage * (id === 'greatsword' ? damageScale(ctx) : 1);
  meleeAttack(ctx, ctx.player, angle, def.arc, def.range, damage);
  p.atkCd = def.cooldown;
  p.attackAnim = def.anim;
  p.swingAngle = angle;
  bladeEvent(
    ctx,
    id === 'scythe'
      ? 'scytheSlash'
      : id === 'greatsword'
        ? 'fireSlash'
        : 'sabreSlash',
    at,
    angle,
    def.range,
  );
  if (id === 'greatsword')
    for (const target of ctx.world.query(at, def.range + 20, TAG.MOB)) {
      const pos = ctx.world.pos(target);
      if (
        dist(at, pos) <= def.range + (ctx.s.radius.get(target)?.r || 0) &&
        Math.abs(angleDiff(Math.atan2(pos.y - at.y, pos.x - at.x), angle)) <=
          def.arc / 2 &&
        ctx.level.lineClear(at, pos) &&
        !ctx.world.isPendingDeath(target)
      )
        igniteMob(ctx, target);
    }
}
function pulse(
  ctx: Ctx,
  at: Vec2,
  radius: number,
  damage: number,
  fire = false,
  group = 0,
  grasp = false,
): void {
  const shared = group ? ctx.s.riftGroup.get(group) : undefined;
  for (const id of ctx.world.query(at, radius + 20, TAG.MOB)) {
    if (ctx.world.isPendingDeath(id) || shared?.hit.includes(id)) continue;
    const pos = ctx.world.pos(id);
    if (
      dist(at, pos) > radius + (ctx.s.radius.get(id)?.r || 0) ||
      !ctx.level.lineClear(at, pos)
    )
      continue;
    applyDamage(ctx, id, damage, ctx.player);
    if (shared) shared.hit.push(id);
    const mob = ctx.s.mob.get(id);
    if (fire && mob) igniteMob(ctx, id);
    if (grasp && mob) {
      mob.frozen = Math.max(mob.frozen || 0, M.claw.freeze);
      mob.slow = Math.max(mob.slow || 0, M.claw.slow);
      const distance = dist(at, pos);
      if (distance > 1 && !ctx.world.isPendingDeath(id)) {
        const step = Math.min(M.claw.graspPull, distance * 0.65),
          next = ctx.level.move(
            pos,
            ((at.x - pos.x) / distance) * step,
            ((at.y - pos.y) / distance) * step,
            ctx.s.radius.get(id)?.r || 10,
          );
        ctx.world.setPos(id, next);
      }
    } else if (group && mob) mob.slow = Math.max(mob.slow || 0, M.spikes.slow);
  }
}
function targetPoint(ctx: Ctx): Vec2 {
  const at = ctx.world.pos(ctx.player),
    aim = ctx.camera.toWorld(ctx.aimPointer),
    angle = ctx.s.facing.get(ctx.player)!.angle,
    reach = Math.min(M.targetRange, Math.max(65, dist(at, aim)));
  let result = { ...at };
  for (let d = 4; d <= reach; d += 4) {
    const next = {
      x: at.x + Math.cos(angle) * d,
      y: at.y + Math.sin(angle) * d,
    };
    if (
      ctx.level.terrainBlocked(next.x, next.y, 12) ||
      !ctx.level.lineClear(result, next)
    )
      break;
    result = next;
  }
  return result;
}
function rift(
  ctx: Ctx,
  kind: 'claw' | 'spike',
  at: Vec2,
  delay: number,
  group = 0,
): void {
  const def = kind === 'claw' ? M.claw : M.spikes,
    id = ctx.world.createAt([], at.x, at.y),
    strikeAt = kind === 'claw' ? M.claw.strikeAt : delay + M.spikes.strikeAfter,
    life = kind === 'claw' ? M.claw.life : delay + M.spikes.life;
  ctx.s.rift.set(id, {
    owner: ctx.player,
    kind,
    age: 0,
    windup: delay,
    strikeAt,
    life,
    radius: def.radius,
    damage: def.damage,
    struck: false,
    group,
  });
  ctx.s.look.set(id, {
    family: 'fx',
    scale: 1,
    animated: false,
    showHealth: false,
    staticSprite: kind === 'claw' ? 'demonClaw_0' : 'demonSpike_0',
  });
}
function spawnFlameWave(ctx: Ctx, angle: number, multiplier: number): void {
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
  ctx.s.flameWave.set(id, {
    owner: ctx.player,
    vx: Math.cos(angle) * M.wave.speed,
    vy: Math.sin(angle) * M.wave.speed,
    age: 0,
    life: M.wave.life,
    radius: M.wave.radius,
    damage: M.wave.damage * multiplier,
    hit: [],
  });
  ctx.s.look.set(id, {
    family: 'fx',
    scale: 1,
    animated: false,
    showHealth: false,
    staticSprite: 'bladeFlameWave_0',
  });
  const state = ctx.s.blade.get(ctx.player)!,
    p = ctx.s.player.get(ctx.player)!;
  state.waveSwingLeft = M.wave.swingDuration;
  state.waveSwingIndex = M.wave.count - state.waveLeft - 1;
  if (selectedItem(ctx)?.id === 'greatsword') {
    p.attackAnim = M.wave.swingDuration;
    p.swingAngle = angle;
    p.castAnim = 0;
  }
  bladeEvent(ctx, 'fireSlash', at, angle, BLADES.greatsword.range);
  bladeEvent(ctx, 'waveCast', at, angle, 50);
}
export function castBladeAbility(
  ctx: Ctx,
  weapon: BladeProfessionId,
  ability: MageSkillId,
): void {
  if (ctx.gameOver || selectedItem(ctx)?.id !== weapon) return;
  const state = ctx.s.blade.get(ctx.player)!,
    school = state.schools[weapon],
    p = ctx.s.player.get(ctx.player)!,
    def = COMBAT_PROFESSIONS[weapon].skills[ability];
  if (!school.unlocked || school.cooldowns[ability] > 0) return;
  if (p.mana < def.cost) {
    if (p.noManaCd <= 0) {
      notice(ctx, '法力不足');
      p.noManaCd = 0.65;
    }
    return;
  }
  if (
    (weapon === 'scythe' &&
      ((ability === 'wave' && ctx.s.rift.length >= M.maxRifts) ||
        (ability === 'barrage' &&
          (ctx.s.rift.length + 1 + 4 * M.spikes.segments > M.maxRifts ||
            ctx.s.riftGroup.length >= M.maxGroups)))) ||
    (weapon === 'greatsword' &&
      ability === 'field' &&
      (state.waveLeft > 0 ||
        state.waveSwingLeft > 0 ||
        state.comboLeft > 0 ||
        ctx.s.flameWave.length + M.wave.count > M.maxWaves)) ||
    (weapon === 'greatsword' &&
      ability === 'wave' &&
      (state.waveLeft > 0 || state.waveSwingLeft > 0 || state.comboLeft > 0))
  ) {
    notice(ctx, '法术正在作用，请稍候');
    return;
  }
  p.mana -= def.cost;
  school.cooldowns[ability] = def.cooldown;
  p.castAnim = 0.24;
  const at = { ...ctx.world.pos(ctx.player) },
    angle = ctx.s.facing.get(ctx.player)!.angle;
  if (weapon === 'scythe') {
    if (ability === 'field') {
      state.stormLeft = M.storm.life;
      state.stormTick = 0;
      bladeEvent(ctx, 'stormCast', at, angle, M.storm.radius);
    } else if (ability === 'wave') {
      const point = targetPoint(ctx);
      rift(ctx, 'claw', point, M.claw.windup);
      bladeEvent(ctx, 'clawCast', point, angle, M.claw.radius);
    } else {
      const point = targetPoint(ctx),
        group = ctx.world.createAt([], point.x, point.y);
      ctx.s.riftGroup.set(group, {
        life: M.spikes.groupLife,
        hit: [],
        origin: { ...point },
      });
      rift(ctx, 'spike', point, M.spikes.windup, group);
      for (const direction of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
        let prev = { ...point };
        for (let i = 1; i <= M.spikes.segments; i++) {
          const pos = {
            x: point.x + Math.cos(direction) * M.spikes.spacing * i,
            y: point.y + Math.sin(direction) * M.spikes.spacing * i,
          };
          if (
            ctx.level.terrainBlocked(pos.x, pos.y, 4) ||
            !ctx.level.lineClear(prev, pos)
          )
            break;
          rift(
            ctx,
            'spike',
            pos,
            M.spikes.windup + i * M.spikes.stepDelay,
            group,
          );
          prev = pos;
        }
      }
      bladeEvent(
        ctx,
        'spikesCast',
        point,
        angle,
        M.spikes.spacing * M.spikes.segments,
      );
    }
  } else if (ability === 'field') {
    state.waveLeft = M.wave.count - 1;
    state.waveTick = M.wave.period;
    state.waveAngle = angle;
    state.waveMultiplier = damageScale(ctx);
    spawnFlameWave(ctx, angle, state.waveMultiplier);
  } else if (ability === 'wave') {
    state.comboLeft = M.combo.life;
    state.comboTick = M.combo.periods[0];
    state.comboPhase = 0;
    state.comboAngle = angle;
    state.comboMultiplier = damageScale(ctx);
  } else {
    if (!state.infernoVitality) {
      const hp = ctx.s.health.get(ctx.player)!;
      hp.max *= M.inferno.vitalityMultiplier;
      hp.hp *= M.inferno.vitalityMultiplier;
      state.infernoVitality = true;
    }
    state.infernoLeft = M.inferno.life;
    state.infernoTick = 0;
    bladeEvent(ctx, 'infernoCast', at, angle, 55);
  }
}
export function updateBlades(ctx: Ctx, dt: number): void {
  const state = ctx.s.blade.get(ctx.player)!,
    at = ctx.world.pos(ctx.player);
  const inv = ctx.s.inventory.get(ctx.player)!;
  for (const weapon of ['scythe', 'greatsword'] as const)
    if (
      !state.schools[weapon].unlocked &&
      (inv.slots.some((item) => item?.id === weapon) ||
        inv.cursor?.id === weapon)
    ) {
      state.schools[weapon].unlocked = true;
      notice(
        ctx,
        '获得' + COMBAT_PROFESSIONS[weapon].name + ' · 解锁 Q / F / R',
      );
    }
  state.waveSwingLeft = Math.max(0, state.waveSwingLeft - dt);
  if (state.waveLeft > 0) {
    state.waveTick -= dt;
    while (state.waveTick <= 0 && state.waveLeft > 0) {
      state.waveLeft--;
      spawnFlameWave(ctx, state.waveAngle, state.waveMultiplier);
      state.waveTick += M.wave.period;
    }
  }
  if (state.stormLeft > 0) {
    const active = Math.min(dt, state.stormLeft);
    state.stormLeft = Math.max(0, state.stormLeft - dt);
    state.stormAngle += M.storm.speed * active;
    state.stormTick -= active;
    while (state.stormTick <= 0) {
      state.stormTick += M.storm.period;
      pulse(ctx, at, M.storm.radius, M.storm.damage);
    }
  }
  if (state.infernoLeft > 0) {
    const active = Math.min(dt, state.infernoLeft);
    state.infernoLeft = Math.max(0, state.infernoLeft - dt);
    state.infernoTick -= active;
    while (state.infernoTick <= 0) {
      state.infernoTick += M.inferno.period;
      pulse(ctx, at, M.inferno.radius, M.inferno.damage, true);
    }
  }
  // 按剩余生命比例缩回，不能在到期时恢复旧血量或因换武器重复翻倍。
  if (state.infernoVitality && state.infernoLeft <= 0) {
    const hp = ctx.s.health.get(ctx.player)!;
    hp.max /= M.inferno.vitalityMultiplier;
    hp.hp = Math.min(hp.max, Math.max(0, hp.hp / M.inferno.vitalityMultiplier));
    state.infernoVitality = false;
  }
  if (state.comboLeft > 0) {
    const active = Math.min(dt, state.comboLeft);
    state.comboLeft = Math.max(0, state.comboLeft - dt);
    state.comboTick -= active;
    while (state.comboTick <= 0 && state.comboPhase < 3) {
      const i = state.comboPhase++,
        angle = state.comboAngle,
        radius = M.combo.range[i];
      for (const id of ctx.world.query(at, radius + 20, TAG.MOB)) {
        if (ctx.world.isPendingDeath(id)) continue;
        const pos = ctx.world.pos(id);
        if (
          dist(at, pos) > radius + (ctx.s.radius.get(id)?.r || 0) ||
          Math.abs(angleDiff(Math.atan2(pos.y - at.y, pos.x - at.x), angle)) >
            M.combo.arc[i] / 2 ||
          !ctx.level.lineClear(at, pos)
        )
          continue;
        applyDamage(
          ctx,
          id,
          M.combo.damage[i] * state.comboMultiplier,
          ctx.player,
        );
        igniteMob(ctx, id);
      }
      const p = ctx.s.player.get(ctx.player)!;
      if (selectedItem(ctx)?.id === 'greatsword') {
        p.attackAnim = M.combo.anim;
        p.swingAngle = angle;
      }
      bladeEvent(ctx, 'combo' + i, at, angle, radius);
      state.comboTick += M.combo.periods[Math.min(2, i + 1)];
    }
  }
  ctx.s.flameWave.forEach((id, w) => {
    if (ctx.world.isPendingDeath(id)) return;
    const active = Math.min(dt, w.life);
    w.age += active;
    w.life -= dt;
    let pos = { ...ctx.world.pos(id) };
    const steps = Math.max(1, Math.ceil((Math.hypot(w.vx, w.vy) * active) / 4));
    for (let i = 0; i < steps; i++) {
      const next = {
        x: pos.x + (w.vx * active) / steps,
        y: pos.y + (w.vy * active) / steps,
      };
      if (
        ctx.level.terrainBlocked(next.x, next.y, 3) ||
        !ctx.level.lineClear(pos, next)
      ) {
        bladeEvent(ctx, 'waveImpact', pos, Math.atan2(w.vy, w.vx), 35);
        ctx.world.destroy(id);
        return;
      }
      for (const target of ctx.world.query(next, w.radius + 20, TAG.MOB)) {
        if (w.hit.includes(target) || ctx.world.isPendingDeath(target))
          continue;
        const p = ctx.world.pos(target);
        if (
          dist(next, p) > w.radius + (ctx.s.radius.get(target)?.r || 0) ||
          !ctx.level.lineClear(pos, p)
        )
          continue;
        applyDamage(ctx, target, w.damage, w.owner);
        igniteMob(ctx, target);
        w.hit.push(target);
      }
      ctx.world.setPos(id, next);
      pos = next;
    }
    if (w.life <= 0) ctx.world.destroy(id);
  });
  ctx.s.rift.forEach((id, r) => {
    if (ctx.world.isPendingDeath(id)) return;
    r.age += dt;
    const pos = ctx.world.pos(id);
    if (!r.struck && r.age >= r.strikeAt) {
      r.struck = true;
      pulse(ctx, pos, r.radius, r.damage, false, r.group, r.kind === 'claw');
      bladeEvent(
        ctx,
        r.kind === 'claw' ? 'clawHit' : 'spikeHit',
        pos,
        0,
        r.radius,
      );
    }
    if (r.age >= r.life) ctx.world.destroy(id);
  });
  ctx.s.riftGroup.forEach((id, g) => {
    g.life -= dt;
    if (g.life <= 0) ctx.world.destroy(id);
  });
}
