/** 规则层：拾取 + 缓慢补怪，让 demo 一直有东西可打。 */
import { onCathedral } from '../sanctuary-data';
import { TILE } from '../../engine/level';
import { TAG, type MobKind } from '../components';
import { addItem, notice } from '../inventory';
import { ITEMS, INVENTORY } from '../items';
import { CFG } from '../data';
import type { Ctx } from './context';

export function updateRules(ctx: Ctx): void {
  if (ctx.gameOver) return;
  const pp = ctx.world.pos(ctx.player),
    inv = ctx.s.inventory.get(ctx.player)!;
  ctx.s.pickup.forEach((e, pk) => {
    if (ctx.world.isPendingDeath(e) || ctx.world.time < (pk.ignoreUntil || 0))
      return;
    const pos = ctx.world.pos(e);
    if (
      Math.hypot(pos.x - pp.x, pos.y - pp.y) > INVENTORY.pickupRange ||
      !ctx.level.lineClear(pp, pos)
    )
      return;
    const before = pk.count,
      remaining = addItem(inv.slots, pk.kind, before, pk.instance);
    pk.count = remaining;
    if (remaining === before) {
      if (ctx.world.time - (pk.fullNotice ?? -9) > 3) {
        notice(ctx, '背包已满 · 地上的物品会保留');
        pk.fullNotice = ctx.world.time;
      }
      return;
    }
    inv.revision++;
    notice(ctx, `拾取 ${ITEMS[pk.kind].name} ×${before - remaining}`);
    if (!remaining) ctx.world.destroy(e);
  });

  if (ctx.gameOver) return;
  if (
    ctx.world.withTag(TAG.MOB).length >= 16 ||
    ctx.world.time < ctx.progress.nextRespawn
  )
    return;
  ctx.progress.nextRespawn = ctx.world.time + 2.2;
  spawnOne(ctx);
}

/** 在玩家视野外补一只，避免「怪凭空出现在脸上」。 */
function spawnOne(ctx: Ctx): void {
  const pp = ctx.world.pos(ctx.player);
  for (let i = 0; i < 60; i++) {
    const a = ctx.world.rng() * Math.PI * 2;
    const d = 380 + ctx.world.rng() * 180;
    const x = pp.x + Math.cos(a) * d;
    const y = pp.y + Math.sin(a) * d;
    if (
      x < TILE * 2 ||
      y < TILE * 2 ||
      x > ctx.level.pixelW - TILE * 2 ||
      y > ctx.level.pixelH - TILE * 2
    )
      continue;
    if (ctx.level.blocked(x, y, 14) || onCathedral({ x, y }, 32)) continue;

    const kinds: MobKind[] = ['shamble', 'shamble', 'lunge', 'caster'];
    const kind = kinds[Math.floor(ctx.world.rng() * kinds.length)];
    const cfg = CFG.mob[kind];
    const e = ctx.world.createAt([TAG.MOB, TAG.DAMAGEABLE], x, y);
    ctx.s.radius.set(e, { r: cfg.radius });
    ctx.s.health.set(e, { hp: cfg.hp, max: cfg.hp, armor: cfg.armor });
    ctx.s.facing.set(e, { angle: a + Math.PI });
    ctx.s.mob.set(e, {
      kind,
      speed: cfg.speed,
      aggro: cfg.aggro,
      atkRange: cfg.atkRange,
      atkCd: cfg.atkCd,
      dmg: cfg.dmg,
      think: ctx.world.rng(),
      attackAnim: 0,
      hurtFlash: 0,
      home: { x, y },
    });
    ctx.s.look.set(e, {
      family: kind === 'caster' ? 'caster' : 'zombie',
      scale: kind === 'lunge' ? 0.94 : 1,
      showHealth: true,
      animated: true,
    });
    ctx.s.equip.set(e, {
      shoes: ctx.world.rng() < 0.5 ? 'zombieBare' : 'cloth',
    });
    return;
  }
}
