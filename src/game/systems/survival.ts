/**
 * 生存模拟：饱食 / 水分 / 抗寒 / 暑热 / 疲劳，加上流血、感染与负重。
 *
 * 抗寒与暑热由环境气温和衣物舒适区间决定（算法在 climate.ts）：
 * 环境温度低于舒适下限 → 抗寒下降；高于上限 → 暑热上升；在区间内两条都回安全值。
 *
 * 为什么归零是「持续掉血」而不是直接死：营火休息、药水无敌帧和读档都会
 * 让「瞬间死亡」变成无法挽回的惩罚；持续掉血给玩家吃东西、找火堆的时间。
 *
 * ⚠️ 表现层只读这里的状态（HUD 五条 + 负面状态），不要写回。
 * ⚠️ 负重是派生值，每帧从背包算，不存组件——否则丢东西后还会被旧重量拖住。
 */
import { SURVIVAL } from '../data';
import { carriedWeight } from '../inventory';
import type { Survival } from '../components';
import { ambientAt, CLIMATE, comfortRange, isNight, seasonAt } from '../climate';
import { applyDamage } from './combat';
import type { Ctx } from './context';

const clamp = (v: number): number =>
  Math.min(SURVIVAL.max, Math.max(0, v));

export type LoadTier = 'light' | 'heavy' | 'crushing' | 'maxed';

export function loadTier(weight: number): LoadTier {
  const w = SURVIVAL.weight;
  return weight >= w.maxed
    ? 'maxed'
    : weight >= w.crushing
      ? 'crushing'
      : weight >= w.heavy
        ? 'heavy'
        : 'light';
}

export { isNight, seasonAt };

export function loadTierFor(ctx: Ctx): LoadTier {
  const inv = ctx.s.inventory.get(ctx.player);
  return loadTier(inv ? carriedWeight(inv) : 0);
}

/** 移速倍率：饥饿 / 口渴 / 寒冷 / 暑热 / 感染 / 负重叠加。 */
export function survivalSpeed(ctx: Ctx): number {
  const sv = ctx.s.survival.get(ctx.player);
  if (!sv) return 1;
  let multiplier = 1;
  if (sv.hunger <= SURVIVAL.hungerSlow) multiplier *= SURVIVAL.hungerSpeed;
  if (sv.thirst <= SURVIVAL.thirstSlow) multiplier *= SURVIVAL.thirstSpeed;
  if (sv.warmth <= SURVIVAL.coldSlow) multiplier *= SURVIVAL.coldSpeed;
  if (sv.heat >= SURVIVAL.heatSlow) multiplier *= SURVIVAL.heatSpeed;
  if (sv.infection > 0) multiplier *= SURVIVAL.infectionSpeed;
  const w = SURVIVAL.weight;
  switch (loadTierFor(ctx)) {
    case 'maxed':
      multiplier *= w.maxedSpeed;
      break;
    case 'crushing':
      multiplier *= w.crushingSpeed;
      break;
    case 'heavy':
      multiplier *= w.heavySpeed;
      break;
  }
  return multiplier;
}

/** 攻速倍率：疲惫与感染拖慢出手。 */
export function survivalAttack(ctx: Ctx): number {
  const sv = ctx.s.survival.get(ctx.player);
  if (!sv) return 1;
  let multiplier = 1;
  if (sv.fatigue <= SURVIVAL.exhaustionSlow)
    multiplier *= SURVIVAL.exhaustionAttack;
  if (sv.infection > 0) multiplier *= SURVIVAL.infectionAttack;
  return multiplier;
}

/** 翻滚距离倍率；归零疲劳与超载会直接禁止翻滚。 */
export function survivalDodge(ctx: Ctx): number {
  const sv = ctx.s.survival.get(ctx.player);
  if (!sv || sv.fatigue <= 0) return 0;
  const w = SURVIVAL.weight;
  switch (loadTierFor(ctx)) {
    case 'maxed':
      return 0;
    case 'crushing':
      return w.crushingDodge;
    case 'heavy':
      return w.heavyDodge;
    default:
      return sv.fatigue <= SURVIVAL.exhaustionSlow
        ? SURVIVAL.exhaustionDodge
        : 1;
  }
}

export function updateSurvival(ctx: Ctx, dt: number): void {
  if (ctx.gameOver) return;
  const sv = ctx.s.survival.get(ctx.player);
  if (!sv) return;
  const inv = ctx.s.inventory.get(ctx.player),
    weight = inv ? carriedWeight(inv) : 0;

  sv.hunger = clamp(sv.hunger - SURVIVAL.hungerPerSec * dt);
  sv.thirst = clamp(sv.thirst - SURVIVAL.thirstPerSec * dt);
  const w = SURVIVAL.weight,
    tier = loadTier(weight);
  sv.fatigue = clamp(
    sv.fatigue -
      SURVIVAL.fatiguePerSec *
        dt *
        (tier === 'maxed'
          ? w.maxedFatigue
          : tier === 'crushing'
            ? w.crushingFatigue
            : 1),
  );

  // 抗寒 / 暑热：与衣物舒适区间比较，超出越多掉得越快。
  const ambient = ambientAt(ctx),
    comfort = comfortRange(ctx);
  if (ambient < comfort.min) {
    sv.warmth = clamp(
      sv.warmth - (comfort.min - ambient) * CLIMATE.perDegree * dt,
    );
    sv.heat = clamp(sv.heat - CLIMATE.recover * dt);
  } else if (ambient > comfort.max) {
    sv.heat = clamp(
      sv.heat + (ambient - comfort.max) * CLIMATE.perDegree * dt,
    );
    sv.warmth = clamp(sv.warmth + CLIMATE.recover * dt);
  } else {
    sv.warmth = clamp(sv.warmth + CLIMATE.recover * dt);
    sv.heat = clamp(sv.heat - CLIMATE.recover * dt);
  }

  sv.bleed = Math.max(0, sv.bleed - dt);
  sv.infection = Math.max(0, sv.infection - dt);

  // 归零掉血按 0.5 秒一跳，避免每帧小数扣血让血量条抖动。
  sv.dot += dt;
  if (sv.dot >= 0.5) {
    const step = sv.dot;
    sv.dot = 0;
    let dps = 0;
    if (sv.hunger <= 0) dps += SURVIVAL.starveDps;
    if (sv.thirst <= 0) dps += SURVIVAL.dehydrateDps;
    if (sv.warmth <= 0) dps += SURVIVAL.freezeDps;
    if (sv.heat >= SURVIVAL.max) dps += SURVIVAL.heatDps;
    if (sv.bleed > 0) dps += SURVIVAL.bleedDps;
    if (sv.infection > 0) dps += SURVIVAL.infectionDps;
    if (dps > 0)
      applyDamage(ctx, ctx.player, dps * step, ctx.player, undefined, true);
  }

  warn(ctx, sv, weight, dt);
}

/** 只报最严重的一条，避免多条状态同时刷屏。 */
function warn(ctx: Ctx, sv: Survival, weight: number, dt: number): void {
  sv.warned = Math.max(0, sv.warned - dt);
  if (sv.warned > 0) return;
  const w = SURVIVAL.weight;
  let text = '';
  if (sv.thirst <= 0) text = '严重脱水 · 生命正在流失';
  else if (sv.hunger <= 0) text = '饥饿耗尽了你的力气';
  else if (sv.warmth <= 0) text = '抗寒耗尽 · 找火堆或添衣';
  else if (sv.heat >= SURVIVAL.max) text = '中暑 · 生命正在流失';
  else if (sv.bleed > 0) text = '伤口在流血 · 需要绷带';
  else if (sv.infection > 0) text = '伤口感染 · 需要月露草';
  else if (weight >= w.maxed) text = '负重过大 · 无法翻滚';
  else if (sv.fatigue <= 0) text = '精疲力尽 · 无法翻滚';
  else if (sv.thirst <= SURVIVAL.thirstSlow) text = '口渴 · 脚步开始发沉';
  else if (sv.hunger <= SURVIVAL.hungerSlow) text = '饥饿让你脚步发沉';
  else if (sv.warmth <= SURVIVAL.coldSlow) text = '寒意渗进骨头 · 穿得太薄';
  else if (sv.heat >= SURVIVAL.heatSlow) text = '暑热难耐 · 穿得太厚';
  else if (weight >= w.crushing) text = '负重很大 · 行动迟缓';
  else if (sv.fatigue <= SURVIVAL.exhaustionSlow) text = '疲惫开始拖累出手速度';
  if (!text) return;
  sv.warned = SURVIVAL.noticeEvery;
  const p = ctx.world.pos(ctx.player);
  ctx.world.emit({ kind: 'notice', x: p.x, y: p.y, text });
}
