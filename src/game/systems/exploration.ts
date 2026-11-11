/** 发现、迷雾、营地、守卫与奖励都是纯模拟规则；地图只读取这里的状态。 */
import { dist, type Vec2 } from '../../engine/math';
import { addItem, notice } from '../inventory';
import { ensureEquipmentInstances } from '../adventure';
import {
  SITES,
  REGIONS,
  WORLD,
  regionAt,
  type SiteDefinition,
} from '../world-data';
import { inCathedral } from '../sanctuary-data';
import { spawnRegionalMob } from '../regional-spawn';
import { grantXp } from './quests';
import type { Ctx } from './context';
export type ExplorationCommand =
  | { type: 'interact'; id?: string }
  | { type: 'travel' | 'track'; id: string };
export interface SiteState {
  definition: SiteDefinition;
  position: Vec2;
  entity: number;
}
export function worldSites(ctx: Pick<Ctx, 's' | 'world'>): SiteState[] {
  const out: SiteState[] = [];
  ctx.s.prop.forEach((entity, p) => {
    if (p.landmark) {
      const definition = SITES.find((d) => d.id === p.landmark);
      if (definition)
        out.push({ definition, entity, position: ctx.world.pos(entity) });
    }
  });
  return out;
}
export function completedSite(
  ctx: Pick<Ctx, 'progress'>,
  s: SiteDefinition,
): boolean {
  return (
    s.kind === 'shrine' ? ctx.progress.purified : ctx.progress.openedChests
  ).includes(s.id);
}
export function nearbySite(ctx: Ctx): SiteState | undefined {
  const p = ctx.world.pos(ctx.player);
  return worldSites(ctx)
    .filter(
      (s) =>
        dist(p, s.position) <= WORLD.interact &&
        inCathedral(p) === inCathedral(s.position) &&
        ctx.level.lineClear(p, s.position),
    )
    .sort((a, b) => dist(p, a.position) - dist(p, b.position))[0];
}
const fogCache = new WeakMap<object, { length: number; set: Set<string> }>();
export function exploredCells(ctx: Pick<Ctx, 'progress'>): Set<string> {
  let cache = fogCache.get(ctx.progress);
  if (!cache || cache.length !== ctx.progress.explored.length) {
    cache = {
      length: ctx.progress.explored.length,
      set: new Set(ctx.progress.explored),
    };
    fogCache.set(ctx.progress, cache);
  }
  return cache.set;
}
export function fogKey(x: number, y: number): string {
  return `fog:${x}:${y}`;
}
export function exploredAt(ctx: Pick<Ctx, 'progress'>, p: Vec2): boolean {
  return exploredCells(ctx).has(
    fogKey(Math.floor(p.x / WORLD.fogCell), Math.floor(p.y / WORLD.fogCell)),
  );
}
export function reveal(
  ctx: Ctx,
  p: Vec2,
  radius = WORLD.sight,
  throughWalls = false,
): void {
  const cells = exploredCells(ctx),
    cell = WORLD.fogCell;
  for (
    let y = Math.max(0, Math.floor((p.y - radius) / cell));
    y <=
    Math.min(
      Math.ceil(ctx.level.pixelH / cell) - 1,
      Math.floor((p.y + radius) / cell),
    );
    y++
  )
    for (
      let x = Math.max(0, Math.floor((p.x - radius) / cell));
      x <=
      Math.min(
        Math.ceil(ctx.level.pixelW / cell) - 1,
        Math.floor((p.x + radius) / cell),
      );
      x++
    ) {
      const center = { x: (x + 0.5) * cell, y: (y + 0.5) * cell },
        key = fogKey(x, y);
      if (
        !cells.has(key) &&
        dist(p, center) <= radius &&
        (throughWalls || ctx.level.lineClear(p, center))
      ) {
        cells.add(key);
        ctx.progress.explored.push(key);
      }
    }
  fogCache.set(ctx.progress, {
    length: ctx.progress.explored.length,
    set: cells,
  });
}
const fogPosition = new WeakMap<object, string>();
export function updateExploration(ctx: Ctx): void {
  if (ctx.gameOver) return;
  const p = ctx.world.pos(ctx.player),
    cell = `${Math.floor(p.x / 32)}:${Math.floor(p.y / 32)}`;
  if (fogPosition.get(ctx.progress) !== cell) {
    fogPosition.set(ctx.progress, cell);
    reveal(ctx, p);
  }
  const region = regionAt(p);
  if (ctx.progress.lastRegion !== region) {
    ctx.progress.lastRegion = region;
    const r = REGIONS[region];
    notice(
      ctx,
      `${r.name} · 建议等级 ${r.levels.join('–')}${ctx.s.journal.get(ctx.player)!.level < r.levels[0] ? ' · 此地危险，可随时撤回' : ''}`,
    );
  }
  for (const s of worldSites(ctx))
    if (
      !ctx.progress.discovered.includes(s.definition.id) &&
      dist(p, s.position) <= WORLD.discover &&
      inCathedral(p) === inCathedral(s.position) &&
      ctx.level.lineClear(p, s.position)
    ) {
      ctx.progress.discovered.push(s.definition.id);
      notice(ctx, '发现 ' + s.definition.name + ' · C 互动 / M 地图');
    }
}
export function siteGuardCount(ctx: Ctx, id: string): number {
  let count = 0;
  ctx.s.mob.forEach((e, m) => {
    if (m.site === id && !ctx.world.isPendingDeath(e)) count++;
  });
  return count;
}
export function safeToTravel(ctx: Ctx): boolean {
  const p = ctx.world.pos(ctx.player),
    blade = ctx.s.blade.get(ctx.player)!,
    mage = ctx.s.mage.get(ctx.player)!;
  return (
    !ctx.world
      .query(p, 220, 'mob')
      .some(
        (id) =>
          !ctx.world.isPendingDeath(id) &&
          ctx.level.lineClear(p, ctx.world.pos(id)),
      ) &&
    !blade.infernoVitality &&
    blade.stormLeft <= 0 &&
    blade.waveLeft <= 0 &&
    blade.comboLeft <= 0 &&
    mage.fieldLeft <= 0 &&
    mage.barrageLeft <= 0 &&
    ctx.s.staffZone.length === 0 &&
    ctx.s.summon.length === 0 &&
    ctx.s.projectile.length === 0 &&
    ctx.s.staffShot.length === 0 &&
    ctx.s.rift.length === 0 &&
    ctx.s.flameWave.length === 0 &&
    ctx.s.wave.length === 0 &&
    ctx.s.meteor.length === 0 &&
    ctx.s.field.length === 0
  );
}
function landing(ctx: Ctx, position: Vec2): Vec2 | undefined {
  for (let r = 32; r <= 80; r += 16)
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]) {
      const p = { x: position.x + dx * r, y: position.y + dy * r };
      if (
        !ctx.level.blocked(p.x, p.y, ctx.s.radius.get(ctx.player)!.r) &&
        ctx.level.lineClear(p, position)
      )
        return p;
    }
}
export function applyExplorationCommand(
  ctx: Ctx,
  command: ExplorationCommand,
): { openMap?: boolean; teleported?: boolean } {
  if (ctx.gameOver) return {};
  if (command.type === 'track') {
    if (ctx.progress.discovered.includes(command.id)) {
      ctx.progress.trackedSite = command.id;
      notice(ctx, '追踪 ' + SITES.find((d) => d.id === command.id)!.name);
    }
    return {};
  }
  const here = nearbySite(ctx);
  if (command.type === 'travel') {
    const to = worldSites(ctx).find((s) => s.definition.id === command.id),
      progress = ctx.progress;
    if (
      !here ||
      here.definition.kind !== 'waypoint' ||
      !progress.waypoints.includes(here.definition.id) ||
      !to ||
      !progress.waypoints.includes(command.id) ||
      command.id === here.definition.id
    ) {
      notice(ctx, '须站在已激活的界石旁，选择另一处已激活界石');
      return {};
    }
    if (!safeToTravel(ctx) || ctx.world.time < progress.travelReadyAt) {
      notice(ctx, '先脱离战斗并等待持续法术结束，再使用界石');
      return {};
    }
    const p = landing(ctx, to.position);
    if (!p) {
      notice(ctx, '目的地被挡住，暂时无法传送');
      return {};
    }
    ctx.world.setPos(ctx.player, p);
    ctx.s.dodge.get(ctx.player)!.time = 0;
    ctx.s.player.get(ctx.player)!.invuln = Math.max(
      0.7,
      ctx.s.player.get(ctx.player)!.invuln,
    );
    progress.travelReadyAt = ctx.world.time + 2;
    reveal(ctx, p);
    updateExploration(ctx);
    notice(ctx, '抵达 ' + to.definition.name);
    return { teleported: true };
  }
  if (!here || (command.id && here.definition.id !== command.id)) {
    notice(ctx, '靠近地点，保持道路视线后再互动');
    return {};
  }
  const d = here.definition,
    p = ctx.progress;
  if (!p.discovered.includes(d.id)) p.discovered.push(d.id);
  if (d.kind === 'waypoint') {
    if (!p.waypoints.includes(d.id)) {
      p.waypoints.push(d.id);
      notice(ctx, '激活 ' + d.name + ' · 可连接已激活的界石');
    }
    return { openMap: true };
  }
  if (d.kind === 'camp') {
    if (!safeToTravel(ctx)) {
      notice(ctx, '附近仍有敌人或持续法术，暂时不能休息');
      return {};
    }
    if (ctx.world.time < p.campReadyAt) {
      notice(
        ctx,
        `营火余温未散 · ${Math.ceil(p.campReadyAt - ctx.world.time)} 秒后可再休息`,
      );
      return {};
    }
    const hp = ctx.s.health.get(ctx.player)!,
      player = ctx.s.player.get(ctx.player)!;
    hp.hp = hp.max;
    player.mana = player.maxMana;
    p.campReadyAt = ctx.world.time + 30;
    notice(ctx, '在 ' + d.name + ' 歇息 · 生命与法力恢复');
    return {};
  }
  if (completedSite(ctx, d)) {
    notice(
      ctx,
      d.kind === 'vista' ? '这里的道路已被记录' : '此地已探索，奖励已领取',
    );
    return {};
  }
  if (d.guards && !p.startedSites.includes(d.id)) {
    const positions: Vec2[] = [];
    for (let n = 0; n < 32 && positions.length < d.guards; n++) {
      const a = (n * Math.PI * 2) / 12,
        r = 80 + Math.floor(n / 12) * 32,
        at = {
          x: here.position.x + Math.cos(a) * r,
          y: here.position.y + Math.sin(a) * r,
        };
      if (
        !ctx.level.blocked(at.x, at.y, 12) &&
        ctx.level.lineClear(here.position, at) &&
        positions.every((v) => dist(v, at) > 30)
      )
        positions.push(at);
    }
    if (positions.length < d.guards) {
      notice(ctx, '此地空间不足，无法唤醒守卫');
      return {};
    }
    positions.forEach((v, i) =>
      spawnRegionalMob(
        ctx,
        i % 3 === 2 ? 'caster' : i % 2 ? 'lunge' : 'shamble',
        v.x,
        v.y,
        d.id,
      ),
    );
    p.startedSites.push(d.id);
    notice(ctx, `${d.name} · 击败 ${d.guards} 名守卫后再互动`);
    return {};
  }
  const guards = siteGuardCount(ctx, d.id);
  if (guards) {
    notice(ctx, `仍有 ${guards} 名守卫，清除后再来`);
    return {};
  }
  const inv = ctx.s.inventory.get(ctx.player)!,
    copy = structuredClone(inv.slots);
  if (d.reward.some((reward) => addItem(copy, reward.id, reward.count) > 0)) {
    notice(ctx, '背包空间不足 · 奖励保留，请整理后再来');
    return {};
  }
  inv.slots = copy;
  inv.revision++;
  (d.kind === 'shrine' ? p.purified : p.openedChests).push(d.id);
  ensureEquipmentInstances(ctx);
  grantXp(ctx, d.xp);
  if (d.kind === 'vista') reveal(ctx, here.position, 560, true);
  notice(
    ctx,
    `${d.name} · ${d.kind === 'shrine' ? '净化完成' : d.kind === 'vista' ? '附近地图已展开' : '获得遗物与补给'} · +${d.xp} 经验`,
  );
  return {};
}
