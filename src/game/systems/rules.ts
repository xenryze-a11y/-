/** 规则层：拾取 + 缓慢补怪，让 demo 一直有东西可打。 */
import { regionAt } from '../world-data';
import { onCathedral } from '../sanctuary-data';
import { TILE } from '../../engine/level';
import { TAG, type MobKind } from '../components';
import { addItem, notice } from '../inventory';
import { ITEMS, INVENTORY } from '../items';
import { spawnRegionalMob } from '../regional-spawn';
import { updateExploration, worldSites } from './exploration';
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

  updateExploration(ctx);
  if (ctx.gameOver || ctx.progress.zone !== 'overworld') return;
  // 普通远怪可离场，地点守卫永久保留；全图实体上限不再阻断新区补怪。
  for (const id of [...ctx.s.mob.owners])
    if (
      !ctx.s.mob.get(id)!.site &&
      Math.hypot(ctx.world.pos(id).x - pp.x, ctx.world.pos(id).y - pp.y) > 2400
    )
      ctx.world.destroy(id);
  if (
    ctx.world.withTag(TAG.MOB).length >= 96 ||
    ctx.world.query(pp, 700, TAG.MOB).length >= 10 ||
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
    const d =
      Math.max(
        380,
        Math.hypot(ctx.camera.w, ctx.camera.h) / (2 * ctx.camera.zoom) + 96,
      ) +
      ctx.world.rng() * 180;
    const x = pp.x + Math.cos(a) * d;
    const y = pp.y + Math.sin(a) * d;
    if (
      x < TILE * 2 ||
      y < TILE * 2 ||
      x > ctx.level.pixelW - TILE * 2 ||
      y > ctx.level.pixelH - TILE * 2
    )
      continue;
    if (
      ctx.level.blocked(x, y, 14) ||
      onCathedral({ x, y }, 32) ||
      regionAt({ x, y }) !== regionAt(pp)
    )
      continue;

    const kinds: MobKind[] = ['shamble', 'shamble', 'lunge', 'caster'];
    const kind = kinds[Math.floor(ctx.world.rng() * kinds.length)];
    if (
      worldSites(ctx).some(
        (s) =>
          ['camp', 'waypoint'].includes(s.definition.kind) &&
          (!s.definition.guards ||
            ctx.progress.purified.includes(s.definition.id)) &&
          Math.hypot(s.position.x - x, s.position.y - y) < 200,
      )
    )
      continue;
    spawnRegionalMob(ctx, kind, x, y);
    return;
  }
}
