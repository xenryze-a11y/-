import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/engine/camera';
import { Level, Tile } from '../src/engine/level';
import { buildScene } from '../src/game/spawn';
import { SURVIVAL } from '../src/game/data';
import {
  carriedWeight,
  useSelected,
  type InventoryState,
} from '../src/game/inventory';
import {
  loadTier,
  survivalDodge,
  survivalSpeed,
  updateSurvival,
} from '../src/game/systems/survival';
import { applyDamage } from '../src/game/systems/combat';
import {
  recordDeathStash,
  spawnDeathStash,
  takeDeathStash,
} from '../src/game/death-stash';
import { captureSave, parseSave, restoreSave } from '../src/game/saves';
import type { Ctx } from '../src/game/systems/context';

function arena(): Ctx {
  const scene = buildScene();
  scene.s.prop.forEach((id, p) => {
    const pos = scene.world.pos(id);
    if (p.blocks) scene.level.removeBlocker(pos.x, pos.y);
  });
  for (const id of [...scene.world.alive])
    if (id !== scene.player) scene.world.destroy(id);
  scene.world.flush();
  scene.level.tiles.fill(Tile.GRASS);
  scene.world.setPos(scene.player, { x: 600, y: 600 });
  const camera = new Camera();
  camera.w = 1000;
  camera.h = 700;
  camera.boundsW = 1536;
  camera.boundsH = 1536;
  camera.snap({ x: 600, y: 600 });
  return {
    ...scene,
    camera,
    gameOver: false,
    debug: false,
    aimPointer: camera.toScreen({ x: 760, y: 600 }),
  };
}

function empty(inv: InventoryState): void {
  inv.slots = inv.slots.map(() => null);
  inv.craft = [null, null, null, null];
  inv.cursor = null;
}

function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

test('hunger and thirst decay, rations and water restore, full values are not consumed', () => {
  const c = arena(),
    sv = c.s.survival.get(c.player)!,
    inv = c.s.inventory.get(c.player)!;
  const hunger = sv.hunger,
    thirst = sv.thirst;
  for (let i = 0; i < 60; i++) updateSurvival(c, 1 / 60);
  assert.ok(sv.hunger < hunger);
  assert.ok(sv.thirst < thirst);

  empty(inv);
  sv.hunger = 10;
  inv.slots[0] = { id: 'rations', count: 1 };
  inv.selected = 0;
  useSelected(c);
  assert.equal(sv.hunger, 10 + SURVIVAL.food.rations);
  assert.equal(inv.slots[0], null);

  sv.hunger = SURVIVAL.max;
  inv.slots[0] = { id: 'rations', count: 1 };
  useSelected(c);
  assert.equal(inv.slots[0]!.count, 1);

  sv.thirst = 20;
  inv.slots[0] = { id: 'water', count: 1 };
  useSelected(c);
  assert.equal(sv.thirst, 20 + SURVIVAL.food.water);
});

test('zeroed survival stats drain health instead of insta-killing, and bypass invulnerability', () => {
  const c = arena(),
    sv = c.s.survival.get(c.player)!,
    hp = c.s.health.get(c.player)!;
  const start = hp.hp;
  sv.hunger = 0;
  sv.thirst = 0;
  sv.warmth = 0;
  sv.bleed = 5;
  for (let i = 0; i < 120; i++) updateSurvival(c, 1 / 60);
  assert.ok(hp.hp < start);
  assert.ok(hp.hp > 0);
  assert.equal(c.gameOver, false);

  // 环境伤害不该被无敌帧挡住，也不该被护甲 / 护盾吸收。
  const before = hp.hp;
  applyDamage(c, c.player, 10, c.player, undefined, true);
  assert.equal(hp.hp, before - 10);
});

test('hits can cause bleeding and infection; bandage and herb cure them', () => {
  const c = arena(),
    sv = c.s.survival.get(c.player)!,
    p = c.s.player.get(c.player)!,
    inv = c.s.inventory.get(c.player)!,
    rng = c.world.rng;
  // 概率用固定 rng 钉住，避免测试变成抛硬币。
  (c.world as unknown as { rng: () => number }).rng = () => 0.01;
  p.invuln = 0;
  applyDamage(c, c.player, 1, c.player);
  assert.ok(sv.infection > 0);
  (c.world as unknown as { rng: () => number }).rng = () => 0.2;
  p.invuln = 0;
  applyDamage(c, c.player, 1, c.player);
  assert.ok(sv.bleed > 0);
  (c.world as unknown as { rng: () => number }).rng = rng;

  empty(inv);
  inv.slots[0] = { id: 'bandage', count: 1 };
  inv.selected = 0;
  useSelected(c);
  assert.equal(sv.bleed, 0);
  inv.slots[0] = { id: 'herb', count: 1 };
  useSelected(c);
  assert.equal(sv.infection, 0);
});

test('carried weight drives load tier and movement penalties', () => {
  const c = arena(),
    inv = c.s.inventory.get(c.player)!;
  empty(inv);
  const stone = (n: number): void => {
    for (let i = 0; i < n; i++) inv.slots[i] = { id: 'stone', count: 64 };
  };
  assert.equal(loadTier(carriedWeight(inv)), 'light');
  assert.equal(survivalSpeed(c), 1);
  stone(6);
  assert.equal(loadTier(carriedWeight(inv)), 'heavy');
  assert.ok(survivalSpeed(c) < 1);
  assert.ok(survivalDodge(c) < 1);
  stone(9);
  assert.equal(loadTier(carriedWeight(inv)), 'crushing');
  stone(12);
  assert.equal(loadTier(carriedWeight(inv)), 'maxed');
  assert.equal(survivalDodge(c), 0);
});

test('death stash keeps non-equipment supplies and respawns them for the same seed', () => {
  const storage = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, String(value)),
    removeItem: (key) => void storage.delete(key),
  } as Storage;
  const c = arena();
  c.progress.mode = 'adventure';
  const inv = c.s.inventory.get(c.player)!;
  empty(inv);
  inv.slots[0] = { id: 'rations', count: 5 };
  inv.slots[1] = { id: 'water', count: 3 };
  inv.slots[2] = { id: 'sword', count: 1 };
  const hp = c.s.health.get(c.player)!;
  hp.hp = 1;
  c.s.player.get(c.player)!.invuln = 0;
  // 固定 rng，否则「掉不掉」会变成抛硬币。
  const rng = c.world.rng;
  (c.world as unknown as { rng: () => number }).rng = () => 0.01;
  applyDamage(c, c.player, 50, c.player);
  (c.world as unknown as { rng: () => number }).rng = rng;
  assert.equal(c.gameOver, true);

  const stash = takeDeathStash(c.progress.seed);
  assert.ok(stash);
  assert.ok(stash!.items.some((item) => item.id === 'rations'));
  assert.ok(!stash!.items.some((item) => item.id === 'sword'));

  const next = arena();
  next.progress.seed = c.progress.seed;
  spawnDeathStash(next, stash!);
  assert.ok(next.s.pickup.length > 0);
  assert.equal(takeDeathStash(c.progress.seed), null);
});

test('a v3 save without survival data migrates to full survival values', () => {
  const c = arena();
  c.progress.mode = 'adventure';
  const record = captureSave(c),
    copy = structuredClone(record);
  copy.version = 3;
  delete (copy.data.world.stores as Record<string, unknown>).survival;
  copy.checksum = checksum(JSON.stringify(copy.data));
  const loaded = restoreSave(parseSave(JSON.stringify(copy))),
    sv = loaded.s.survival.get(loaded.player)!;
  assert.equal(sv.hunger, SURVIVAL.max);
  assert.equal(sv.thirst, SURVIVAL.max);
  assert.equal(sv.warmth, SURVIVAL.max);
  assert.equal(sv.fatigue, SURVIVAL.max);
  const again = restoreSave(captureSave(loaded));
  assert.deepEqual(again.s.survival.get(again.player), sv);
});
