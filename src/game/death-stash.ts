/** 死亡恢复是一个完整、原子提交的存档事务，模拟层不访问 localStorage。 */
import { World } from '../engine/ecs';
import { Level } from '../engine/level';
import { createStores } from './components';
import { ITEMS } from './items';
import { BLADE_MAGIC } from './weapon-data';
import { spawnDrop } from './systems/loot';
import type { Scene } from './spawn';

/** 隔离生成恢复现场：从背包扣除的物资才生成遗物，失败时不修改原局与旧存档。 */
export function createDeathRecovery(source: Scene): Scene {
  if (source.progress.mode !== 'adventure')
    throw new Error('试用模式不保存遗物');
  const world = new World(),
    s = createStores(world);
  world.restore(source.world.snapshot());
  const next: Scene = {
    world,
    s,
    player: source.player,
    level: Level.restore(source.level.snapshot()),
    progress: structuredClone(source.progress),
    ...(source.journey ? { journey: structuredClone(source.journey) } : {}),
  };
  const inv = s.inventory.get(next.player)!,
    corpse = world.pos(next.player);
  for (let i = 0; i < inv.slots.length; i++) {
    const item = inv.slots[i];
    if (!item || ITEMS[item.id].stack <= 1 || world.rng() >= 0.25) continue;
    spawnDrop(next, corpse.x, corpse.y, item.id, item.count, 1);
    inv.slots[i] = null;
  }
  inv.revision++;
  const hp = s.health.get(next.player)!,
    player = s.player.get(next.player)!,
    blade = s.blade.get(next.player)!;
  if (blade.infernoVitality) hp.max /= BLADE_MAGIC.inferno.vitalityMultiplier;
  blade.infernoVitality = false;
  blade.infernoLeft = blade.comboLeft = blade.waveLeft = blade.stormLeft = 0;
  blade.waveSwingLeft = 0;
  hp.hp = hp.max;
  player.mana = player.maxMana;
  player.invuln = 3;
  player.attackAnim = player.castAnim = 0;
  s.dodge.get(next.player)!.time = 0;
  s.journal.get(next.player)!.talking = 0;
  const sv = s.survival.get(next.player)!;
  sv.hunger = Math.max(50, sv.hunger);
  sv.thirst = Math.max(50, sv.thirst);
  sv.warmth = sv.fatigue = 100;
  sv.heat = sv.bleed = sv.infection = sv.dot = sv.warned = 0;
  world.setPos(next.player, { ...next.level.spawn });
  world.drain();
  return next;
}
