import { updateRules } from '../src/game/systems/rules';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import legacy from './fixtures/save-v1.json';
import { Camera } from '../src/engine/camera';
import { Tile } from '../src/engine/level';
import { buildScene } from '../src/game/spawn';
import { REGIONS, SITES, WORLD, regionAt } from '../src/game/world-data';
import {
  applyExplorationCommand,
  updateExploration,
  worldSites,
  nearbySite,
  siteGuardCount,
  exploredAt,
  reveal,
  safeToTravel,
} from '../src/game/systems/exploration';
import { applyDamage } from '../src/game/systems/combat';
import { spawnRegionalMob } from '../src/game/regional-spawn';
import {
  captureSave,
  restoreSave,
  parseSave,
  SaveRepository,
  SAVE_PREFIX,
} from '../src/game/saves';
import type { Ctx } from '../src/game/systems/context';
function context(scene = buildScene(246, 'adventure')): Ctx {
  const camera = new Camera();
  camera.w = 1000;
  camera.h = 700;
  camera.snap(scene.world.pos(scene.player));
  return {
    ...scene,
    camera,
    gameOver: false,
    debug: false,
    aimPointer: camera.toScreen({ x: 900, y: 700 }),
  };
}
function calm(): Ctx {
  const c = context();
  for (const id of c.s.mob.owners) c.world.destroy(id);
  c.world.flush();
  return c;
}
function at(c: Ctx, id: string) {
  const s = worldSites(c).find((s) => s.definition.id === id)!;
  for (const [dx, dy] of [
    [0, 32],
    [32, 0],
    [-32, 0],
    [0, -32],
  ]) {
    const p = { x: s.position.x + dx, y: s.position.y + dy };
    if (!c.level.blocked(p.x, p.y, 10)) {
      c.world.setPos(c.player, p);
      return s;
    }
  }
  throw new Error('No approach ' + id);
}
function use(c: Ctx, id: string) {
  at(c, id);
  return applyExplorationCommand(c, { type: 'interact', id });
}
function killGuards(c: Ctx, id: string) {
  for (const e of [...c.s.mob.owners])
    if (c.s.mob.get(e)!.site === id) applyDamage(c, e, 9999, c.player);
  c.world.flush();
}
const inventory = (c: Ctx) => c.s.inventory.get(c.player)!;

test('three fixed danger bands contain ten reachable sites each and deterministic seeded side locations', () => {
  for (const seed of [1, 2, 123, 20261109, 0xffffffff]) {
    const c = context(buildScene(seed, 'adventure')),
      sites = worldSites(c);
    assert.equal(c.level.w, WORLD.width);
    assert.equal(c.level.h, WORLD.height);
    assert.equal(sites.length, 30);
    for (const region of Object.keys(REGIONS))
      assert.equal(
        sites.filter((s) => s.definition.region === region).length,
        10,
      );
    const seen = new Set<number>(),
      q = [
        Math.floor(c.level.spawn.y / 32) * c.level.w +
          Math.floor(c.level.spawn.x / 32),
      ];
    seen.add(q[0]);
    for (let head = 0; head < q.length; head++) {
      const i = q[head],
        x = i % c.level.w,
        y = Math.floor(i / c.level.w);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx,
          yy = y + dy,
          n = yy * c.level.w + xx;
        if (
          xx < 1 ||
          yy < 1 ||
          xx >= c.level.w - 1 ||
          yy >= c.level.h - 1 ||
          seen.has(n) ||
          c.level.blocked((xx + 0.5) * 32, (yy + 0.5) * 32, 10)
        )
          continue;
        seen.add(n);
        q.push(n);
      }
    }
    for (const s of sites) {
      assert.equal(regionAt(s.position), s.definition.region);
      assert(
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) =>
          seen.has(
            (Math.floor(s.position.y / 32) + dy) * c.level.w +
              Math.floor(s.position.x / 32) +
              dx,
          ),
        ),
        s.definition.id,
      );
    }
  }
  const positions = (seed: number) =>
    worldSites(context(buildScene(seed))).map((s) => s.position);
  assert.deepEqual(positions(9), positions(9));
  assert.notDeepEqual(positions(9), positions(10));
});

test('walking reveals nearby terrain and sites without revealing distant locations or seeing through a wall', () => {
  const c = calm();
  assert.equal(c.progress.explored.length, 0);
  updateExploration(c);
  assert(c.progress.explored.length > 0 && c.progress.explored.length < 40);
  assert(c.progress.discovered.includes('vale-waystone'));
  assert(!c.progress.discovered.includes('forest-den'));
  c.progress.explored = [];
  c.level.tiles.fill(Tile.GRASS);
  c.world.setPos(c.player, { x: 600, y: 600 });
  for (let y = 0; y < c.level.h; y++)
    c.level.tiles[y * c.level.w + 20] = Tile.WALL;
  reveal(c, c.world.pos(c.player));
  assert.equal(exploredAt(c, { x: 704, y: 576 }), false);
  assert.equal(exploredAt(c, { x: 576, y: 576 }), true);
});

test('distant or wall-obstructed site commands cannot claim rewards or activate travel', () => {
  const c = calm(),
    before = JSON.stringify(c.progress);
  applyExplorationCommand(c, { type: 'interact', id: 'forest-den' });
  assert.equal(JSON.stringify(c.progress), before);
  const s = at(c, 'vale-supply'),
    p = c.world.pos(c.player);
  c.level.tiles[
    Math.floor((p.y + s.position.y) / 64) * c.level.w +
      Math.floor((p.x + s.position.x) / 64)
  ] = Tile.WALL;
  assert.equal(nearbySite(c), undefined);
  applyExplorationCommand(c, { type: 'interact', id: s.definition.id });
  assert(!c.progress.openedChests.includes(s.definition.id));
});

test('guarded relics start one encounter, grant real weapons once after combat and preserve full-bag rewards', () => {
  const c = calm(),
    id = 'vale-crypt';
  use(c, id);
  assert.equal(siteGuardCount(c, id), 2);
  use(c, id);
  assert.equal(siteGuardCount(c, id), 2);
  assert(!inventory(c).slots.some((s) => s?.id === 'frost'));
  killGuards(c, id);
  inventory(c).slots = Array.from({ length: 36 }, () => ({
    id: 'stone',
    count: 64,
  }));
  const xp = c.s.journal.get(c.player)!.xp;
  use(c, id);
  assert(!c.progress.openedChests.includes(id));
  assert.equal(c.s.journal.get(c.player)!.xp, xp);
  inventory(c).slots[0] = null;
  inventory(c).slots[1] = null;
  use(c, id);
  const frost = inventory(c).slots.find((s) => s?.id === 'frost');
  assert(frost?.instance?.uid);
  assert(c.progress.openedChests.includes(id));
  const before = JSON.stringify(inventory(c));
  use(c, id);
  assert.equal(JSON.stringify(inventory(c)), before);
  const loaded = context(restoreSave(captureSave(c)));
  use(loaded, id);
  assert.equal(JSON.stringify(inventory(loaded)), before);
});

test('shrine purification and vista reveal provide one-time progress and XP', () => {
  const c = calm();
  use(c, 'vale-shrine');
  killGuards(c, 'vale-shrine');
  use(c, 'vale-shrine');
  assert(c.progress.purified.includes('vale-shrine'));
  const before = c.progress.explored.length;
  use(c, 'vale-watch');
  assert(c.progress.explored.length > before);
  assert(c.progress.openedChests.includes('vale-watch'));
  const journal = { ...c.s.journal.get(c.player)! };
  use(c, 'vale-watch');
  assert.deepEqual(c.s.journal.get(c.player), journal);
});

test('camp rests respect enemy proximity, repeated-rest time and active doubled vitality', () => {
  const c = calm();
  at(c, 'vale-camp');
  const hp = c.s.health.get(c.player)!,
    p = c.s.player.get(c.player)!;
  hp.hp = 20;
  p.mana = 10;
  const enemy = spawnRegionalMob(
    c,
    'shamble',
    c.world.pos(c.player).x + 40,
    c.world.pos(c.player).y,
  );
  applyExplorationCommand(c, { type: 'interact' });
  assert.equal(hp.hp, 20);
  c.world.destroy(enemy);
  c.world.flush();
  applyExplorationCommand(c, { type: 'interact' });
  assert.equal(hp.hp, hp.max);
  assert.equal(p.mana, p.maxMana);
  hp.hp = 40;
  applyExplorationCommand(c, { type: 'interact' });
  assert.equal(hp.hp, 40);
  c.world.time = 31;
  c.s.blade.get(c.player)!.infernoVitality = true;
  applyExplorationCommand(c, { type: 'interact' });
  assert.equal(hp.hp, 40);
  c.s.blade.get(c.player)!.infernoVitality = false;
  applyExplorationCommand(c, { type: 'interact' });
  assert.equal(hp.hp, hp.max);
});

test('waypoints require discovery and activation, reject combat/casts and arrive at a collision-safe position', () => {
  const c = calm();
  use(c, 'vale-waystone');
  const start = { ...c.world.pos(c.player) };
  applyExplorationCommand(c, { type: 'travel', id: 'forest-waystone' });
  assert.deepEqual(c.world.pos(c.player), start);
  use(c, 'forest-waystone');
  at(c, 'vale-waystone');
  c.s.mage.get(c.player)!.barrageLeft = 1;
  assert(!safeToTravel(c));
  assert(
    !applyExplorationCommand(c, { type: 'travel', id: 'forest-waystone' })
      .teleported,
  );
  c.s.mage.get(c.player)!.barrageLeft = 0;
  assert(
    applyExplorationCommand(c, { type: 'travel', id: 'forest-waystone' })
      .teleported,
  );
  assert.equal(regionAt(c.world.pos(c.player)), 'forest');
  assert(
    !c.level.blocked(c.world.pos(c.player).x, c.world.pos(c.player).y, 10),
  );
  const atDest = { ...c.world.pos(c.player) };
  assert(
    !applyExplorationCommand(c, { type: 'travel', id: 'vale-waystone' })
      .teleported,
  );
  assert.deepEqual(c.world.pos(c.player), atDest);
  c.world.time = 3;
  assert(
    applyExplorationCommand(c, { type: 'travel', id: 'vale-waystone' })
      .teleported,
  );
});

test('exploration, active site guards, tracked targets and activated waypoints roundtrip exactly', () => {
  const c = calm();
  use(c, 'vale-waystone');
  use(c, 'vale-crypt');
  updateExploration(c);
  applyExplorationCommand(c, { type: 'track', id: 'vale-crypt' });
  const record = captureSave(c),
    loaded = context(restoreSave(record));
  assert.deepEqual(captureSave(loaded).data, record.data);
  assert.equal(siteGuardCount(loaded, 'vale-crypt'), 2);
});

test('regional enemy danger stays fixed when player levels up', () => {
  const c = calm(),
    v = spawnRegionalMob(c, 'shamble', 700, 700),
    f = spawnRegionalMob(c, 'shamble', 700, 2400),
    s = spawnRegionalMob(c, 'shamble', 3500, 700);
  assert(c.s.health.get(f)!.max > c.s.health.get(v)!.max);
  assert(c.s.health.get(s)!.max > c.s.health.get(f)!.max);
  c.s.journal.get(c.player)!.level = 30;
  const again = spawnRegionalMob(c, 'shamble', 700, 2400);
  assert.equal(c.s.health.get(again)!.max, c.s.health.get(f)!.max);
});

test('real stage-one save migrates to expanded world while preserving active inferno, IDs, gear, RNG and inventory', () => {
  const record = parseSave(JSON.stringify(legacy)),
    old = record.data,
    loaded = restoreSave(record);
  assert.equal(record.version, 1);
  assert.equal(loaded.level.w, 256);
  assert.equal(loaded.level.h, 192);
  assert.equal(worldSites(loaded).length, 30);
  assert.equal(loaded.world.rng.getState(), old.world.rng);
  assert.equal(loaded.world.time, old.world.time);
  assert.deepEqual(
    loaded.s.health.get(loaded.player),
    old.world.stores.health.find((e) => e.id === old.player)!.value,
  );
  assert.deepEqual(
    loaded.s.inventory.get(loaded.player),
    old.world.stores.inventory[0].value,
  );
  assert.equal(loaded.s.blade.get(loaded.player)!.infernoVitality, true);
  for (const entity of old.world.entities) {
    assert(loaded.world.alive.has(entity.id));
    if (entity.position)
      assert.deepEqual(loaded.world.pos(entity.id), entity.position);
  }
  assert.equal(captureSave(loaded).version, 3);
  assert.deepEqual(
    captureSave(restoreSave(captureSave(loaded))).data,
    captureSave(loaded).data,
  );
  const map = new Map<string, string>([
      [
        SAVE_PREFIX + '0',
        JSON.stringify({ current: JSON.stringify(record), backup: null }),
      ],
    ]),
    repo = new SaveRepository({
      getItem: (key) => map.get(key) || null,
      setItem: (key, raw) => {
        map.set(key, raw);
      },
    });
  assert.equal(repo.read(0).record!.version, 1);
  repo.write(0, captureSave(loaded));
  assert.equal(repo.read(0).record!.version, 3);
});

test('distant monsters do not prevent local regional encounters from repopulating', () => {
  const c = calm();
  for (let i = 0; i < 16; i++) spawnRegionalMob(c, 'shamble', 500 + i * 8, 500);
  at(c, 'forest-waystone');
  updateRules(c);
  assert.equal(c.s.mob.length, 17);
  const id = c.s.mob.owners.at(-1)!;
  assert.equal(regionAt(c.world.pos(id)), 'forest');
});
