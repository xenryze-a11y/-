import { test } from 'node:test';
import assert from 'node:assert/strict';
import oldSave from './fixtures/save-v2.json';
import { Level, Tile } from '../src/engine/level';
import { makeRng } from '../src/engine/math';
import { WORLD, SITES } from '../src/game/world-data';
import { TERRACES } from '../src/game/landscape-design';
import { buildScene } from '../src/game/spawn';
import {
  parseSave,
  restoreSave,
  captureSave,
  SaveRepository,
} from '../src/game/saves';
import { worldSites } from '../src/game/systems/exploration';
import { updateAI } from '../src/game/systems/ai';
import { Camera } from '../src/engine/camera';

test('fourfold world adds traversable terraced ground with blocking cliffs and real stair openings', () => {
  const scene = buildScene(13, 'adventure');
  assert.equal(scene.level.w * scene.level.h, 128 * 96 * 4);
  assert.equal(worldSites(scene).length, 30);
  for (const hill of TERRACES) {
    const edgeY = hill.side === 'south' ? hill.y + hill.h - 1 : hill.y;
    assert.equal(scene.level.at(hill.x, edgeY), Tile.CLIFF);
    assert.equal(scene.level.at(hill.gate, edgeY), Tile.STAIRS);
    const x = (hill.gate + 0.5) * 32;
    const from = { x, y: (edgeY + (hill.side === 'south' ? 2.5 : -1.5)) * 32 };
    const to = { x, y: (edgeY + (hill.side === 'south' ? -1.5 : 2.5)) * 32 };
    assert(scene.level.lineClear(from, to));
    let pos = from;
    for (let i = 0; i < 64; i++)
      pos = scene.level.move(pos, 0, (to.y - from.y) / 64, 10);
    assert.equal(pos.y, to.y);
    const blockedFrom = { x: (hill.x + 3.5) * 32, y: from.y },
      blockedTo = { x: blockedFrom.x, y: to.y };
    assert.equal(scene.level.lineClear(blockedFrom, blockedTo), false);
  }
  assert.equal(SITES.filter((s) => s.kind === 'waypoint').length, 6);
});

test('blocker spatial lookup matches a brute-force collision reference across removal and restore', () => {
  const level = new Level(256, 192);
  level.tiles.fill(Tile.GRASS);
  const rng = makeRng(43),
    blockers = Array.from({ length: 500 }, () => ({
      x: rng() * 8192,
      y: rng() * 6144,
      r: 2 + rng() * 120,
    }));
  for (const b of blockers) level.addBlocker(b.x, b.y, b.r);
  const verify = (l: Level, list: typeof blockers) => {
    for (let i = 0; i < 800; i++) {
      const x = 500 + rng() * 7000,
        y = 500 + rng() * 5000,
        r = 1 + rng() * 90;
      const expected = list.some(
        (b) => (x - b.x) ** 2 + (y - b.y) ** 2 < (r + b.r) ** 2,
      );
      assert.equal(l.blocked(x, y, r), expected);
    }
  };
  verify(level, blockers);
  for (const b of blockers.splice(0, 150)) level.removeBlocker(b.x, b.y);
  verify(level, blockers);
  verify(Level.restore(level.snapshot()), blockers);
});

test('v2 exploration save expands without resetting IDs, claimed equipment, waypoints or RNG', () => {
  const record = parseSave(JSON.stringify(oldSave));
  assert.equal(record.version, 2);
  const scene = restoreSave(record);
  assert.equal(scene.level.w, WORLD.width);
  assert.equal(scene.level.h, WORLD.height);
  assert.equal(worldSites(scene).length, 30);
  assert.equal(scene.world.rng.getState(), record.data.world.rng);
  assert.equal(scene.world.time, record.data.world.time);
  assert.deepEqual(
    scene.s.inventory.get(scene.player),
    record.data.world.stores.inventory[0].value,
  );
  assert.deepEqual(
    scene.progress.openedChests,
    record.data.progress.openedChests,
  );
  assert.deepEqual(scene.progress.waypoints, record.data.progress.waypoints);
  for (const e of record.data.world.entities) {
    assert(scene.world.alive.has(e.id));
    if (e.position) assert.deepEqual(scene.world.pos(e.id), e.position);
  }
  assert.equal(captureSave(scene).version, 5);
  const again = restoreSave(captureSave(scene));
  assert.equal(again.s.prop.length, scene.s.prop.length);
  assert.deepEqual(captureSave(again).data, captureSave(scene).data);
});

test('distant AI sleeps while nearby enemies still approach through the real simulation', () => {
  const scene = buildScene(15, 'adventure'),
    camera = new Camera(),
    ctx = {
      ...scene,
      camera,
      gameOver: false,
      debug: false,
      aimPointer: { x: 0, y: 0 },
    };
  const far = scene.s.mob.owners.find(
    (e) =>
      Math.hypot(
        scene.world.pos(e).x - scene.world.pos(scene.player).x,
        scene.world.pos(e).y - scene.world.pos(scene.player).y,
      ) > 1100,
  )!;
  assert(far);
  const before = { ...scene.world.pos(far) };
  for (let i = 0; i < 60; i++) updateAI(ctx, 1 / 60);
  assert.deepEqual(scene.world.pos(far), before);
});

test('cached save reads stay isolated and scene writes retain atomic failure behavior', () => {
  const map = new Map<string, string>();
  let full = false;
  const repo = new SaveRepository({
      getItem: (key) => map.get(key) || null,
      setItem: (key, value) => {
        if (full) throw new Error('quota');
        map.set(key, value);
      },
    }),
    scene = buildScene(19, 'adventure', '原名');
  repo.writeScene(0, scene);
  const loaded = repo.read(0).record!;
  loaded.data.progress.name = '修改副本';
  assert.equal(repo.read(0).record!.data.progress.name, '原名');
  full = true;
  scene.progress.name = '新名';
  assert.throws(() => repo.writeScene(0, scene), /quota/);
  assert.equal(repo.read(0).record!.data.progress.name, '原名');
});
