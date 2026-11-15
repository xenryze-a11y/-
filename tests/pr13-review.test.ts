import { test } from 'node:test';
import assert from 'node:assert/strict';
import legacyV4 from './fixtures/save-v4-survival.json';
import legacyV5 from './fixtures/save-v5-survival.json';
import expeditionV4 from './fixtures/save-v4-expedition.json';
import {
  captureSave,
  parseSave,
  restoreSave,
  serializeSave,
  SaveRepository,
} from '../src/game/saves';
import { travelRealm } from '../src/game/realm-travel';
import { createDeathRecovery } from '../src/game/death-stash';

for (const [name, fixture] of Object.entries({
  legacyV4,
  legacyV5,
  expeditionV4,
})) {
  test(`${name}: real pre-integration save upgrades to v6 without mutating its checksum, gear or survival`, () => {
    const raw = JSON.stringify(fixture),
      record = parseSave(raw);
    const restored = restoreSave(record);
    assert.equal(JSON.stringify(fixture), raw);
    assert.equal(JSON.stringify(parseSave(raw)), JSON.stringify(record));
    assert.equal(restored.level.w, 512);
    assert.equal(restored.level.h, 384);
    assert.equal(restored.progress.zone, 'overworld');
    const sv = restored.s.survival.get(restored.player)!;
    assert.equal(sv.hunger, name === 'expeditionV4' ? 100 : 63);
    assert.equal(sv.heat, name === 'legacyV5' ? 17 : 0);
    const gear = structuredClone(restored.s.inventory.get(restored.player));
    const next = captureSave(restored);
    assert.equal(next.version, 6);
    const again = restoreSave(parseSave(serializeSave(next)));
    assert.deepEqual(again.s.inventory.get(again.player), gear);
    assert.deepEqual(again.s.survival.get(again.player), sv);
    // 六域旧档含多个没有 survival 表的休眠层，必须补齐才能再次进出。
    travelRealm(again, 'mine');
    assert.equal(again.level.w, 80);
    assert.deepEqual(again.s.survival.get(again.player), sv);
    const underground = restoreSave(captureSave(again));
    travelRealm(underground, 'overworld');
    assert.deepEqual(underground.s.inventory.get(underground.player), gear);
    assert.deepEqual(underground.s.survival.get(underground.player), sv);
    assert.equal(underground.level.w, 512);
  });
}

test('underground death recovery stays in its own zone and a failed atomic write leaves the previous save intact', () => {
  const scene = restoreSave(parseSave(JSON.stringify(expeditionV4)));
  travelRealm(scene, 'roots');
  const inv = scene.s.inventory.get(scene.player)!;
  for (let i = 0; i < inv.slots.length; i++)
    inv.slots[i] = { id: 'water', count: 5 };
  const data = new Map<string, string>();
  let denied = false;
  const repo = new SaveRepository({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (denied) throw new Error('quota');
      data.set(k, v);
    },
  });
  repo.writeScene(0, scene);
  const before = JSON.stringify([...data]);
  const recovery = createDeathRecovery(scene);
  assert.equal(recovery.progress.zone, 'roots');
  assert.ok(recovery.s.pickup.length > scene.s.pickup.length);
  const deadAt = scene.world.pos(scene.player);
  const added = recovery.s.pickup.owners.filter(
    (id) => !scene.s.pickup.has(id),
  );
  for (const id of added) assert.deepEqual(recovery.world.pos(id), deadAt);
  denied = true;
  assert.throws(() => repo.writeScene(0, recovery), /quota/);
  assert.equal(JSON.stringify([...data]), before);
  denied = false;
  repo.writeScene(0, recovery);
  const loaded = restoreSave(repo.read(0).record!);
  assert.equal(loaded.progress.zone, 'roots');
  assert.deepEqual(loaded.s.pickup.data, recovery.s.pickup.data);
  travelRealm(loaded, 'overworld');
  travelRealm(loaded, 'roots');
  assert.deepEqual(loaded.s.pickup.data, recovery.s.pickup.data);
});
