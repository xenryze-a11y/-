/** 圣域布局与任务内容共用的数据；碰撞、视图、指引不得各写一份边界。 */
import type { Vec2 } from '../engine/math';
export const SANCTUARY = {
  cathedral: { x: 53 * 32, y: 34 * 32, w: 15 * 32, h: 22 * 32 },
  roof: { w: 544, h: 864, overhang: 32, rise: 160 },
  northDoor: { x: 60.5 * 32, y: 34.5 * 32 },
  southDoor: { x: 60.5 * 32, y: 55.5 * 32 },
  herald: { x: 64.5 * 32, y: 25 * 32 },
  priest: { x: 60.5 * 32, y: 51.5 * 32 },
  altar: { x: 60.5 * 32, y: 54 * 32 },
  talkRange: 78,
  killsRequired: 3,
  killXp: 12,
  firstRewardXp: 30,
  finalRewardXp: 55,
  levelBaseXp: 40,
  levelStepXp: 20,
  levelHp: 6,
  levelMana: 3,
  maxLevel: 30,
};
export function inCathedral(p: Vec2): boolean {
  const r = SANCTUARY.cathedral;
  return (
    p.x > r.x + 32 && p.x < r.x + r.w - 32 && p.y >= r.y && p.y < r.y + r.h
  );
}
export function onCathedral(p: Vec2, margin = 0): boolean {
  const r = SANCTUARY.cathedral;
  return (
    p.x >= r.x - margin &&
    p.x <= r.x + r.w + margin &&
    p.y >= r.y - margin &&
    p.y <= r.y + r.h + margin
  );
}
export type NpcKind = 'herald' | 'priest';
export const NPCS: Record<
  NpcKind,
  { name: string; title: string; sprite: string }
> = {
  herald: { name: '圣使 · 瑟拉', title: '神树的守望者', sprite: 'npcHerald' },
  priest: { name: '神父 · 奥伦', title: '晨曦大教堂', sprite: 'npcPriest' },
};
