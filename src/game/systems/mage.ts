/** 雷电法师：首次获得法杖解锁，只有选中雷电法杖才能释放；已释放法术独立完成。 */
import { dist, type Vec2 } from '../../engine/math';
import { TAG } from '../components';
import { MAGE, MAGE_SKILLS, type MageSkillId } from '../mage-data';
import { applyInventoryCommand, notice, selectedItem } from '../inventory';
import { applyDamage } from './combat';
import type { Ctx } from './context';

export function syncMageUnlock(ctx: Ctx): void {
  const mage = ctx.s.mage.get(ctx.player)!,
    inv = ctx.s.inventory.get(ctx.player)!;
  if (mage.unlocked) return;
  const index = inv.slots.findIndex((item) => item?.id === 'storm');
  if (index < 0 && inv.cursor?.id !== 'storm') return;
  mage.unlocked = true;
  if (index >= 0 && index < 9)
    applyInventoryCommand(ctx, { type: 'select', index });
  notice(ctx, '获得雷电法杖 · 解锁雷电法师 · Q / F / R');
}
export function mageEquipped(ctx: Ctx): boolean {
  return (
    !!ctx.s.mage.get(ctx.player)?.unlocked && selectedItem(ctx)?.id === 'storm'
  );
}
function pulse(
  ctx: Ctx,
  at: Vec2,
  radius: number,
  damage: number,
  hit?: number[],
): void {
  for (const id of ctx.world.query(at, radius + 16, TAG.MOB)) {
    if (ctx.world.isPendingDeath(id) || hit?.includes(id)) continue;
    const target = ctx.world.pos(id);
    if (
      dist(at, target) > radius + (ctx.s.radius.get(id)?.r || 0) ||
      !ctx.level.lineClear(at, target)
    )
      continue;
    applyDamage(ctx, id, damage, ctx.player);
    hit?.push(id);
  }
}
export function castMage(ctx: Ctx, ability: MageSkillId): void {
  if (ctx.gameOver) return;
  syncMageUnlock(ctx);
  if (!mageEquipped(ctx)) return;
  const mage = ctx.s.mage.get(ctx.player)!,
    p = ctx.s.player.get(ctx.player)!,
    def = MAGE_SKILLS[ability];
  if (mage.cooldowns[ability] > 0) return;
  if (p.mana < def.cost) {
    if (p.noManaCd <= 0) {
      notice(ctx, '法力不足');
      p.noManaCd = 0.65;
    }
    return;
  }
  p.mana -= def.cost;
  mage.cooldowns[ability] = def.cooldown;
  p.castAnim = 0.24;
  const at = { ...ctx.world.pos(ctx.player) },
    angle = ctx.s.facing.get(ctx.player)!.angle;
  if (ability === 'field') {
    mage.fieldLeft = MAGE.fieldLife;
    mage.fieldTick = 0;
  } else if (ability === 'wave') {
    const id = ctx.world.createAt([], at.x, at.y);
    ctx.s.wave.set(id, {
      owner: ctx.player,
      origin: at,
      angle,
      next: 0,
      tick: 0,
      hit: [],
    });
  } else {
    mage.barrageLeft = MAGE.barrageLife;
    mage.barrageTick = 0;
    mage.barragePhase = 0;
    mage.orbitTick = 0;
    mage.orbitPhase = 0;
  }
  ctx.world.emit({
    kind: 'mage',
    ability,
    stage: 'cast',
    x: at.x,
    y: at.y,
    angle,
  });
}
function launchOrb(ctx: Ctx, phase: number): void {
  const at = ctx.world.pos(ctx.player),
    angle = ctx.s.facing.get(ctx.player)!.angle;
  const side = (phase % 2 ? -1 : 1) * (14 + (phase % 3) * 7),
    rear = {
      x: at.x - Math.cos(angle) * 36 - Math.sin(angle) * side,
      y: at.y - Math.sin(angle) * 36 + Math.cos(angle) * side,
    };
  const start =
    ctx.level.terrainBlocked(rear.x, rear.y, 6) ||
    !ctx.level.lineClear(at, rear)
      ? at
      : rear;
  const id = ctx.world.createAt([TAG.PROJECTILE], start.x, start.y);
  ctx.s.radius.set(id, { r: 6 });
  ctx.s.projectile.set(id, {
    owner: ctx.player,
    kind: 'fireball',
    element: 'storm',
    barrage: true,
    fromPlayer: true,
    vx: Math.cos(angle) * MAGE.orbSpeed,
    vy: Math.sin(angle) * MAGE.orbSpeed,
    life: MAGE.orbLife,
    r: 6,
    dmg: MAGE.orbDamage,
  });
  ctx.s.look.set(id, {
    family: 'fx',
    scale: 1,
    animated: false,
    showHealth: false,
    staticSprite: 'electricOrb_0',
  });
  ctx.world.emit({
    kind: 'mage',
    ability: 'barrage',
    stage: 'cast',
    x: start.x,
    y: start.y,
    angle,
    amount: 1,
  });
}
export function mageOrbImpact(ctx: Ctx, pos: Vec2): void {
  pulse(ctx, pos, MAGE.orbSplash, MAGE.orbDamage);
  ctx.world.emit({
    kind: 'mage',
    ability: 'barrage',
    stage: 'impact',
    x: pos.x,
    y: pos.y,
    amount: MAGE.orbSplash,
  });
}
export function updateMage(ctx: Ctx, dt: number): void {
  syncMageUnlock(ctx);
  const mage = ctx.s.mage.get(ctx.player)!,
    at = ctx.world.pos(ctx.player);
  if (mage.fieldLeft > 0) {
    const active = Math.min(dt, mage.fieldLeft);
    mage.fieldLeft = Math.max(0, mage.fieldLeft - dt);
    mage.fieldTick -= active;
    while (mage.fieldTick <= 0) {
      mage.fieldTick += MAGE.fieldPeriod;
      pulse(ctx, at, MAGE.fieldRadius, MAGE.fieldDamage);
    }
  }
  if (mage.barrageLeft > 0) {
    const active = Math.min(dt, mage.barrageLeft);
    mage.barrageLeft = Math.max(0, mage.barrageLeft - dt);
    mage.barrageTick -= active;
    while (mage.barrageTick <= 0 && mage.barragePhase < MAGE.barrageShots) {
      mage.barrageTick += MAGE.barragePeriod;
      launchOrb(ctx, mage.barragePhase++);
    }
    mage.orbitPhase += active * MAGE.orbitSpeed;
    mage.orbitTick -= active;
    while (mage.orbitTick <= 0) {
      mage.orbitTick += MAGE.orbitPeriod;
      for (let i = 0; i < MAGE.orbitCount; i++) {
        const angle = mage.orbitPhase + (i / MAGE.orbitCount) * Math.PI * 2,
          point = {
            x: at.x + Math.cos(angle) * MAGE.orbitRadius,
            y: at.y + Math.sin(angle) * MAGE.orbitRadius,
          };
        if (ctx.level.lineClear(at, point))
          pulse(ctx, point, 15, MAGE.orbitDamage);
      }
    }
  }
  ctx.s.wave.forEach((id, wave) => {
    if (ctx.world.isPendingDeath(id)) return;
    wave.tick -= dt;
    while (wave.tick <= 0 && wave.next < MAGE.waveSegments) {
      const reach = MAGE.waveStart + wave.next * MAGE.waveSpacing,
        point = {
          x: wave.origin.x + Math.cos(wave.angle) * reach,
          y: wave.origin.y + Math.sin(wave.angle) * reach,
        };
      if (
        !ctx.level.lineClear(wave.origin, point) ||
        ctx.level.terrainBlocked(point.x, point.y, 8)
      ) {
        ctx.world.destroy(id);
        return;
      }
      pulse(ctx, point, MAGE.waveRadius, MAGE.waveDamage, wave.hit);
      ctx.world.emit({
        kind: 'mage',
        ability: 'wave',
        stage: 'impact',
        x: point.x,
        y: point.y,
        angle: wave.angle,
        amount: MAGE.waveRadius,
      });
      wave.next++;
      wave.tick += MAGE.wavePeriod;
    }
    if (wave.next >= MAGE.waveSegments) ctx.world.destroy(id);
  });
}
