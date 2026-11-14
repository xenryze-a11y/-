/**
 * 死亡掉落：倒下时把一部分「非装备物资」留在原地，下一次回到同一局时可以捡回。
 *
 * 为什么单独存 localStorage 而不进冒险存档：存档是「角色状态」，而遗物堆是
 * 「上一局留下的现场」。存档被拒绝或换设备导入时，遗物堆跟着存档走反而会复制。
 * 只对冒险模式生效——武器试用会反复重开，掉东西只会让人烦躁。
 */
import { ITEMS, type ItemId } from './items';
import type { ItemStack } from './inventory';
import { spawnDrop } from './systems/loot';
import type { Ctx } from './systems/context';

const KEY = 'ashen-vale.death-stash';

export interface DeathStash {
  seed: number;
  x: number;
  y: number;
  items: { id: ItemId; count: number }[];
}

function read(seed: number): DeathStash | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const stash = JSON.parse(raw) as DeathStash;
    if (
      stash.seed !== seed ||
      !Array.isArray(stash.items) ||
      typeof stash.x !== 'number' ||
      typeof stash.y !== 'number'
    )
      return null;
    return stash;
  } catch {
    return null;
  }
}

function write(stash: DeathStash): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stash));
  } catch {
    /* 存储不可用就当作没有遗物；不能因此阻断死亡流程 */
  }
}

/** 倒下时记录；已有同一局的遗物堆则合并，避免第二次死亡把第一次的物资吞掉。 */
export function recordDeathStash(ctx: Ctx): void {
  if (ctx.progress.mode !== 'adventure') return;
  const inv = ctx.s.inventory.get(ctx.player);
  if (!inv) return;
  const dropped: { id: ItemId; count: number }[] = [];
  for (const slot of inv.slots as (ItemStack | null)[])
    // 只掉可堆叠物资：武器 / 护甲有装备身份，掉了会让角色直接废掉。
    if (slot && ITEMS[slot.id].stack > 1 && ctx.world.rng() < 0.25)
      dropped.push({ id: slot.id, count: slot.count });
  const total = dropped.reduce((sum, item) => sum + item.count, 0);
  if (!total) return;
  const p = ctx.world.pos(ctx.player);
  const previous = read(ctx.progress.seed);
  write({
    seed: ctx.progress.seed,
    x: p.x,
    y: p.y,
    items: [...(previous?.items ?? []), ...dropped],
  });
}

/** 取走并清掉当前这局的遗物堆；没有就返回 null。 */
export function takeDeathStash(seed: number): DeathStash | null {
  const stash = read(seed);
  if (!stash) return null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
  return stash;
}

/** 把遗物堆生成成可拾取物；落点被墙挡住时退回出生点，避免物资永久拿不到。 */
export function spawnDeathStash(ctx: Ctx, stash: DeathStash): void {
  let x = stash.x,
    y = stash.y;
  if (ctx.level.blocked(x, y, 6)) {
    x = ctx.level.spawn.x;
    y = ctx.level.spawn.y;
  }
  for (const item of stash.items) spawnDrop(ctx, x, y, item.id, item.count);
}
