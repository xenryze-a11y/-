import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/engine/camera';
import { Level, Tile } from '../src/engine/level';
import { buildScene, type Scene } from '../src/game/spawn';
import {
  captureSave,
  restoreSave,
  parseSave,
  SaveRepository,
  SAVE_PREFIX,
  SAVE_LIMIT,
  type SaveRecord,
} from '../src/game/saves';
import { applyInventoryCommand, returnCursor } from '../src/game/inventory';
import { ensureEquipmentInstances } from '../src/game/adventure';
import { dropSelected } from '../src/game/systems/loot';
import { updateRules } from '../src/game/systems/rules';
import { tickTimers } from '../src/game/systems/timers';
import { updateBlades } from '../src/game/systems/blades';
import { castStaffAbility } from '../src/game/systems/profession';
import { updateMage } from '../src/game/systems/mage';
import { updateStaffArts } from '../src/game/systems/staff-arts';
import { updateProjectiles } from '../src/game/systems/projectile';
import { castSelected, updateFields } from '../src/game/systems/magic';
import { updateSummons } from '../src/game/systems/basketball';
import { applyDamage } from '../src/game/systems/combat';
import { applyQuestCommand, grantXp } from '../src/game/systems/quests';
import type { Ctx } from '../src/game/systems/context';

function context(scene: Scene): Ctx {
  const camera = new Camera();
  camera.w = 1000;
  camera.h = 700;
  camera.snap(scene.world.pos(scene.player));
  return {
    ...scene,
    camera,
    gameOver: false,
    debug: false,
    aimPointer: camera.toScreen({ x: 760, y: 600 }),
  };
}
function sandbox(): Ctx {
  const scene = buildScene();
  scene.progress.mode = 'adventure';
  for (const id of scene.world.alive)
    if (id !== scene.player) scene.world.destroy(id);
  scene.world.flush();
  scene.level = new Level(256, 192);
  scene.level.tiles.fill(Tile.GRASS);
  scene.level.southWalls.fill(0);
  scene.world.setPos(scene.player, { x: 600, y: 600 });
  const p = scene.s.player.get(scene.player)!;
  p.mana = p.maxMana = 500;
  return context(scene);
}
function advance(ctx: Ctx, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    tickTimers(ctx, 1 / 60);
    updateProjectiles(ctx, 1 / 60);
    updateFields(ctx, 1 / 60);
    updateMage(ctx, 1 / 60);
    updateStaffArts(ctx, 1 / 60);
    updateBlades(ctx, 1 / 60);
    updateSummons(ctx, 1 / 60);
    ctx.world.flush();
    ensureEquipmentInstances(ctx);
  }
}
function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}
/** 模拟一个能自行重算校验码的不可信文件，必须仍被结构校验拦住。 */
function edited(
  record: SaveRecord,
  edit: (record: SaveRecord) => void,
): string {
  const copy = structuredClone(record);
  edit(copy);
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(copy.data))
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  copy.checksum = (hash >>> 0).toString(16).padStart(8, '0');
  return JSON.stringify(copy);
}

test('adventure starts with basic gear while full weapon trials retain their inventory', () => {
  const scene = buildScene(123, 'adventure', '  星火  '),
    trial = buildScene(123);
  const inv = scene.s.inventory.get(scene.player)!;
  assert.deepEqual(
    inv.slots.filter(Boolean).map((i) => i!.id),
    ['sword', 'ember', 'health', 'mana', 'wood', 'herb'],
  );
  assert.equal(scene.s.player.get(scene.player)!.weapon, 'sword');
  assert.equal(scene.progress.name, '星火');
  assert.equal(scene.s.mage.get(scene.player)!.schools.frost.unlocked, false);
  assert.ok(
    trial.s.inventory
      .get(trial.player)!
      .slots.some((i) => i?.id === 'greatsword'),
  );
  assert.throws(() => captureSave(trial), /试用/);
});

test('save roundtrip preserves seed, world, spatial queries, all inventory positions and exact RNG state', () => {
  const c = sandbox(),
    inv = c.s.inventory.get(c.player)!;
  applyInventoryCommand(c, {
    type: 'slot',
    index: 15,
    right: false,
    shift: false,
  });
  c.progress.explored = ['grove'];
  c.progress.openedChests = ['ruin:01'];
  c.progress.purified = ['altar:01'];
  c.progress.bosses = ['bishop'];
  c.progress.nextRespawn = 9.75;
  inv.craft[0] = { id: 'wood', count: 2 };
  const record = captureSave(c),
    loaded = restoreSave(parseSave(JSON.stringify(record)));
  assert.deepEqual(captureSave(loaded).data, record.data);
  assert.deepEqual(
    loaded.world.query(loaded.world.pos(loaded.player), 30, 'player'),
    [loaded.player],
  );
  assert.deepEqual(
    Array.from({ length: 15 }, () => loaded.world.rng()),
    Array.from({ length: 15 }, () => c.world.rng()),
  );
  assert.equal(loaded.s.inventory.get(loaded.player)!.cursor?.id, 'iron_head');
  loaded.world.setPos(loaded.player, { x: 700, y: 600 });
  assert.deepEqual(c.world.pos(c.player), { x: 600, y: 600 });
});

test('destroyed props, their removed blockers and uncollected loot stay changed after loading', () => {
  const c = context(buildScene(125, 'adventure'));
  const id = c.s.prop.owners.find((id) => c.s.health.has(id))!,
    pos = { ...c.world.pos(id) };
  applyDamage(c, id, 1000, c.player);
  c.world.flush();
  const before = captureSave(c),
    loaded = restoreSave(before);
  assert.equal(loaded.world.alive.has(id), false);
  assert.deepEqual(
    loaded.level.snapshot().blockers,
    c.level.snapshot().blockers,
  );
  assert.deepEqual(loaded.s.pickup.data, c.s.pickup.data);
  assert.equal(
    loaded.level.blocked(pos.x, pos.y, 1),
    c.level.blocked(pos.x, pos.y, 1),
  );
});

test('equipment identity survives cursor, quick move, drop and pickup without merging equal weapons', () => {
  const c = sandbox(),
    inv = c.s.inventory.get(c.player)!;
  const uid = inv.slots[0]!.instance!.uid;
  inv.slots[0]!.instance!.upgrade = 3;
  applyInventoryCommand(c, {
    type: 'slot',
    index: 0,
    right: false,
    shift: true,
  });
  const index = inv.slots.findIndex((i) => i?.instance?.uid === uid);
  applyInventoryCommand(c, { type: 'slot', index, right: false, shift: false });
  assert.equal(inv.cursor!.instance!.uid, uid);
  assert.ok(returnCursor(c));
  inv.selected = inv.slots.findIndex((i) => i?.instance?.uid === uid);
  dropSelected(c);
  ensureEquipmentInstances(c);
  assert.equal(c.s.pickup.data[0].instance?.uid, uid);
  const loaded = context(restoreSave(captureSave(c))),
    pickup = loaded.s.pickup.owners[0];
  loaded.world.time = 2;
  loaded.world.setPos(loaded.player, { ...loaded.world.pos(pickup) });
  updateRules(loaded);
  loaded.world.flush();
  const item = loaded.s.inventory
    .get(loaded.player)!
    .slots.find((i) => i?.instance?.uid === uid)!;
  assert.equal(item.instance?.upgrade, 3);
  assert.equal(loaded.s.pickup.length, 0);
});

test('loading during inferno resumes remaining time and boosted health once, including level growth', () => {
  const c = sandbox();
  applyInventoryCommand(c, { type: 'equip', id: 'greatsword' });
  castStaffAbility(c, 'barrage');
  advance(c, 2);
  grantXp(c, 40);
  c.s.health.get(c.player)!.hp -= 31;
  const loaded = context(restoreSave(captureSave(c)));
  assert.equal(loaded.s.health.get(loaded.player)!.max, 252);
  advance(c, 5.1);
  advance(loaded, 5.1);
  assert.equal(loaded.s.health.get(loaded.player)!.max, 126);
  assert.equal(loaded.s.blade.get(loaded.player)!.infernoVitality, false);
  assert.deepEqual(loaded.world.snapshot(), c.world.snapshot());
});

test('five-swing burst resumes its remaining swings, projectiles and cooldown without duplicating the first waves', () => {
  const c = sandbox();
  applyInventoryCommand(c, { type: 'equip', id: 'greatsword' });
  castStaffAbility(c, 'field');
  advance(c, 0.3);
  const index = c.s.blade.get(c.player)!.waveSwingIndex,
    loaded = context(restoreSave(captureSave(c)));
  assert.ok(index > 0 && index < 4);
  assert.equal(loaded.s.blade.get(loaded.player)!.waveSwingIndex, index);
  advance(c, 1);
  advance(loaded, 1);
  assert.deepEqual(loaded.world.snapshot(), c.world.snapshot());
});

test('all weapon skills and basketball can be saved and continued while active', () => {
  for (const weapon of [
    'ember',
    'frost',
    'ward',
    'blink',
    'scythe',
    'greatsword',
    'basketball',
    'storm',
  ] as const) {
    for (const ability of ['field', 'wave', 'barrage'] as const) {
      const c = sandbox();
      if (weapon === 'storm') {
        c.s.inventory.get(c.player)!.slots[2] = { id: 'storm', count: 1 };
        c.s.mage.get(c.player)!.unlocked = true;
      }
      applyInventoryCommand(c, { type: 'equip', id: weapon });
      if (weapon === 'basketball') castSelected(c);
      else castStaffAbility(c, ability);
      advance(c, 0.1);
      const loaded = context(restoreSave(captureSave(c)));
      advance(c, 0.3);
      advance(loaded, 0.3);
      assert.deepEqual(
        loaded.world.snapshot(),
        c.world.snapshot(),
        `${weapon}/${ability}`,
      );
    }
  }
});

test('claimed priest rewards and XP cannot be claimed again after restoring; dialogue does not reopen', () => {
  const c = context(buildScene(126, 'adventure')),
    priest = c.s.npc.owners.find((id) => c.s.npc.get(id)!.kind === 'priest')!;
  const pos = c.world.pos(priest);
  c.world.setPos(c.player, { x: pos.x, y: pos.y - 40 });
  c.s.journal.get(c.player)!.stage = 'pilgrimage';
  applyQuestCommand(c, { type: 'talk', npc: priest });
  applyQuestCommand(c, { type: 'bless' });
  const loaded = context(restoreSave(captureSave(c))),
    before = captureSave(loaded);
  assert.equal(loaded.s.journal.get(loaded.player)!.talking, 0);
  applyQuestCommand(loaded, { type: 'talk', npc: priest });
  applyQuestCommand(loaded, { type: 'bless' });
  assert.deepEqual(captureSave(loaded).data, before.data);
});

test('three save slots remain isolated; damaged primary recovers the previous valid checkpoint', () => {
  const storage = memory(),
    repository = new SaveRepository(storage);
  for (let i = 0; i < 3; i++)
    repository.write(
      i,
      captureSave(buildScene(i + 1, 'adventure', `旅人${i}`)),
    );
  const old = repository.read(1).record!,
    next = restoreSave(old);
  next.progress.name = '改名';
  repository.write(1, captureSave(next));
  const wrapper = JSON.parse(storage.map.get(SAVE_PREFIX + 1)!);
  wrapper.current = '{broken';
  storage.map.set(SAVE_PREFIX + 1, JSON.stringify(wrapper));
  assert.equal(repository.read(1).recovered, true);
  assert.equal(repository.read(1).record!.data.progress.name, '旅人1');
  assert.equal(repository.read(0).record!.data.progress.name, '旅人0');
  assert.throws(() => repository.write(3, old), /三个/);
});

test('storage quota errors leave the last save intact and propagate to the caller', () => {
  const storage = memory();
  let full = false;
  const repository = new SaveRepository({
    getItem: storage.getItem,
    setItem: (key, raw) => {
      if (full) throw new Error('quota');
      storage.setItem(key, raw);
    },
  });
  const scene = buildScene(127, 'adventure');
  repository.write(0, captureSave(scene));
  const before = storage.map.get(SAVE_PREFIX + 0);
  full = true;
  scene.progress.name = '不能写入';
  assert.throws(() => repository.write(0, captureSave(scene)), /quota/);
  assert.equal(storage.map.get(SAVE_PREFIX + 0), before);
});

test('imports reject broken JSON, unknown versions, oversized files and bad checksums', () => {
  const record = captureSave(buildScene(128, 'adventure'));
  assert.throws(() => parseSave('{'), /JSON/);
  assert.throws(
    () => parseSave(JSON.stringify({ ...record, version: 9 })),
    /版本/,
  );
  assert.throws(() => parseSave(' '.repeat(SAVE_LIMIT + 1)), /过大/);
  assert.throws(
    () => parseSave(JSON.stringify({ ...record, checksum: 'bad' })),
    /校验/,
  );
});

test('even rechecksummed imports reject unknown items, missing components, duplicate IDs and malformed equipment', () => {
  const record = captureSave(buildScene(129, 'adventure'));
  for (const edit of [
    (r: SaveRecord) => {
      (r.data.world.stores.inventory[0].value as any).slots[0].id = '__proto__';
    },
    (r: SaveRecord) => {
      delete r.data.world.stores.mage;
    },
    (r: SaveRecord) => {
      r.data.world.entities[1].id = r.data.player;
    },
    (r: SaveRecord) => {
      (r.data.world.stores.inventory[0].value as any).slots[1].instance.uid = (
        r.data.world.stores.inventory[0].value as any
      ).slots[0].instance.uid;
    },
    (r: SaveRecord) => {
      (r.data.world.stores.inventory[0].value as any).slots.pop();
    },
    (r: SaveRecord) => {
      (r.data.world.stores.blade[0].value as any).infernoVitality = true;
    },
  ])
    assert.throws(() => parseSave(edited(record, edit)));
});

test('dead characters and unflushed deletions cannot replace a living checkpoint', () => {
  const c = sandbox(),
    repository = new SaveRepository(memory());
  repository.write(0, captureSave(c));
  c.s.health.get(c.player)!.hp = 0;
  assert.throws(() => repository.write(0, captureSave(c)), /生命/);
  assert.ok(repository.read(0).record);
  c.s.health.get(c.player)!.hp = 1;
  c.world.destroy(c.player);
  assert.throws(() => captureSave(c), /flush/);
});

test('unchanged saves retain the previous different checkpoint instead of replacing the backup', () => {
  const storage = memory(),
    repository = new SaveRepository(storage),
    scene = buildScene(130, 'adventure', '起点');
  repository.write(0, captureSave(scene));
  scene.progress.name = '第二站';
  repository.write(0, captureSave(scene));
  repository.write(0, captureSave(scene));
  const wrapper = JSON.parse(storage.map.get(SAVE_PREFIX + 0)!);
  assert.equal(parseSave(wrapper.backup).data.progress.name, '起点');
});

test('newly acquired blade professions unlock in adventure and persist after the weapon is dropped', () => {
  const c = context(buildScene(131, 'adventure')),
    inv = c.s.inventory.get(c.player)!;
  assert.equal(c.s.blade.get(c.player)!.schools.scythe.unlocked, false);
  inv.slots[2] = { id: 'scythe', count: 1 };
  updateBlades(c, 1 / 60);
  assert.equal(c.s.blade.get(c.player)!.schools.scythe.unlocked, true);
  inv.selected = 2;
  ensureEquipmentInstances(c);
  dropSelected(c);
  const loaded = restoreSave(captureSave(c));
  assert.equal(
    loaded.s.blade.get(loaded.player)!.schools.scythe.unlocked,
    true,
  );
});
