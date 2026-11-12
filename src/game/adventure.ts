/** 世界进度属于模拟；未来的探索/首领/净化节点使用稳定内容 ID。 */
import type { RegionId } from './world-data';
import type { Scene } from './spawn';
import type { ItemStack, EquipmentInstance } from './inventory';
import { ITEMS } from './items';

export type RunMode = 'adventure' | 'trial';
export interface AdventureProgress {
  seed: number;
  mode: RunMode;
  name: string;
  nextEquipmentId: number;
  nextRespawn: number;
  explored: string[];
  openedChests: string[];
  purified: string[];
  bosses: string[];
  worldVersion: number;
  discovered: string[];
  waypoints: string[];
  startedSites: string[];
  trackedSite: string;
  lastRegion: RegionId | '';
  campReadyAt: number;
  travelReadyAt: number;
}
export function createProgress(
  seed: number,
  mode: RunMode,
  name: string,
): AdventureProgress {
  return {
    seed,
    mode,
    name: name.trim().slice(0, 20) || '灰烬旅人',
    nextEquipmentId: 1,
    nextRespawn: 0,
    explored: [],
    openedChests: [],
    purified: [],
    bosses: [],
    worldVersion: 0,
    discovered: [],
    waypoints: [],
    startedSites: [],
    trackedSite: 'vale-waystone',
    lastRegion: '',
    campReadyAt: 0,
    travelReadyAt: 0,
  };
}

/** 统一在创建、物品事务和固定步结束后补齐身份；换格、丢弃、拾回沿用原身份。 */
export function ensureEquipmentInstances(
  scene: Pick<Scene, 's' | 'progress'>,
): void {
  const ensure = (
    id: ItemStack['id'],
    holder: { instance?: EquipmentInstance },
  ): void => {
    if (ITEMS[id].stack !== 1 || holder.instance) return;
    holder.instance = {
      uid: `${scene.progress.seed}:${scene.progress.nextEquipmentId++}`,
      upgrade: 0,
      affixes: [],
      runes: {},
    };
  };
  const stack = (item: ItemStack | null): void => {
    if (item) ensure(item.id, item);
  };
  scene.s.inventory.forEach((_id, inv) => {
    inv.slots.forEach(stack);
    inv.craft.forEach(stack);
    stack(inv.cursor);
    stack(inv.boots);
    Object.values(inv.armor).forEach(stack);
  });
  scene.s.pickup.forEach((_id, pickup) => ensure(pickup.kind, pickup));
}
