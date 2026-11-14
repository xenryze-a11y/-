/**
 * 气候：季节、昼夜与局部微环境共同决定「环境气温」，再由衣物舒适区间换算成
 * 抗寒 / 暑热两条状态。规则在 systems/survival.ts，这里只算温度。
 *
 * ⚠️ 季节由 world.time 推导，不额外存字段：时间已经进存档，跨局天然保留，
 * 也不会因为迁移而丢季节。
 */
import { dist, type Vec2 } from '../engine/math';
import { TILE, Tile } from '../engine/level';
import { SURVIVAL } from './data';
import { comfortMax, comfortMin } from './armor';
import { worldSites } from './systems/exploration';
import type { Ctx } from './systems/context';

export const SEASONS = {
  spring: { name: '春', base: 12, length: 480 },
  summer: { name: '夏', base: 28, length: 600 },
  autumn: { name: '秋', base: 12, length: 480 },
  winter: { name: '冬', base: -8, length: 720 },
} as const;
export type SeasonId = keyof typeof SEASONS;
export const SEASON_ORDER: SeasonId[] = [
  'spring',
  'summer',
  'autumn',
  'winter',
];
const YEAR = SEASON_ORDER.reduce((sum, id) => sum + SEASONS[id].length, 0);

export function seasonAt(time: number): SeasonId {
  let t = ((time % YEAR) + YEAR) % YEAR;
  for (const id of SEASON_ORDER) {
    if (t < SEASONS[id].length) return id;
    t -= SEASONS[id].length;
  }
  return 'spring';
}
/** 当前季节已过秒数，给 HUD 显示进度用。 */
export function seasonTick(time: number): number {
  let t = ((time % YEAR) + YEAR) % YEAR;
  for (const id of SEASON_ORDER) {
    if (t < SEASONS[id].length) return t;
    t -= SEASONS[id].length;
  }
  return 0;
}

export const CLIMATE = {
  dayOffset: 4,
  nightOffset: -10,
  waterOffset: -10,
  fireOffset: 40,
  fireRadius: 110,
  /** 每低于舒适下限 1°C，每秒掉多少抗寒；暑热同值。 */
  perDegree: 0.055,
  /** 舒适区内每秒恢复。 */
  recover: 1.2,
} as const;

/** 一昼夜按 world.time 循环；夜晚更冷，是硬核模式的主要压力来源。 */
export function isNight(ctx: Ctx): boolean {
  const phase = (ctx.world.time % SURVIVAL.dayLength) / SURVIVAL.dayLength;
  return phase >= SURVIVAL.nightStart;
}

function nearWater(ctx: Ctx, p: Vec2): boolean {
  const cx = Math.floor(p.x / TILE),
    cy = Math.floor(p.y / TILE);
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++)
      if (ctx.level.at(x, y) === Tile.WATER) return true;
  return false;
}

/** 营火与火把旁回暖。营火用地点定义，火把是场景 prop。 */
export function nearFire(ctx: Ctx, p: Vec2): boolean {
  const range = CLIMATE.fireRadius;
  for (const site of worldSites(ctx))
    if (site.definition.kind === 'camp' && dist(site.position, p) <= range)
      return true;
  let found = false;
  ctx.s.prop.forEach((entity, prop) => {
    if (found || prop.sprite !== 'propTorch') return;
    if (dist(ctx.world.pos(entity), p) <= range) found = true;
  });
  return found;
}

/** 环境气温：季节基础 + 昼夜 + 水域 / 火堆微环境。 */
export function ambientAt(ctx: Ctx): number {
  let temperature =
    SEASONS[seasonAt(ctx.world.time)].base +
    (isNight(ctx) ? CLIMATE.nightOffset : CLIMATE.dayOffset);
  const p = ctx.world.pos(ctx.player);
  if (nearWater(ctx, p)) temperature += CLIMATE.waterOffset;
  if (nearFire(ctx, p)) temperature += CLIMATE.fireOffset;
  return temperature;
}

/** 玩家当前的舒适区间，给 HUD 与测试用。 */
export function comfortRange(ctx: Ctx): { min: number; max: number } {
  const eq = ctx.s.equip.get(ctx.player);
  return { min: comfortMin(eq), max: comfortMax(eq) };
}
