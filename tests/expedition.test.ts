import { test } from 'node:test';
import assert from 'node:assert/strict';
import v3 from './fixtures/save-v3.json';
import { buildScene } from '../src/game/spawn';
import { Camera } from '../src/engine/camera';
import { explorationPercent } from '../src/game/exploration-map';
import { Level, Tile } from '../src/engine/level';
import { applyDamage } from '../src/game/systems/combat';
import {
  applyExplorationCommand,
  worldSites,
  reveal,
  exploredAt,
} from '../src/game/systems/exploration';
import {
  dungeonLevel,
  DUNGEON_ROOMS,
  travelRealm,
} from '../src/game/realm-travel';
import {
  captureSave,
  parseSave,
  restoreSave,
  serializeSave,
  SaveRepository,
  SAVE_PREFIX,
} from '../src/game/saves';
import { stickForce } from '../src/game/mobile-stick';
import { cameraZoom } from '../src/game/display-settings';
import type { Ctx } from '../src/game/systems/context';
import type { ZoneId } from '../src/game/realm-data';
const context = (): Ctx => ({
  ...buildScene(513, 'adventure', '远行者'),
  camera: new Camera(),
  gameOver: false,
  debug: false,
  aimPointer: { x: 0, y: 0 },
});
function approach(c: Ctx, id: string): void {
  const site = worldSites(c).find((s) => s.definition.id === id)!;
  assert(site, id);
  for (const [dx, dy] of [
    [0, 32],
    [32, 0],
    [-32, 0],
    [0, -32],
  ]) {
    const p = { x: site.position.x + dx, y: site.position.y + dy };
    if (!c.level.blocked(p.x, p.y, 10)) {
      c.world.setPos(c.player, p);
      return;
    }
  }
  throw Error('No approach ' + id);
}
function calm(c: Ctx): void {
  for (const id of [...c.s.mob.owners]) c.world.destroy(id);
  c.world.flush();
}
function claim(c: Ctx, id: string): void {
  approach(c, id);
  applyExplorationCommand(c, { type: 'interact' });
  for (const e of [...c.s.mob.owners])
    if (c.s.mob.get(e)!.site === id) applyDamage(c, e, 99999, c.player);
  c.world.flush();
  applyExplorationCommand(c, { type: 'interact' });
}
test('analog stick has a small dead zone, monotonic push, early full speed and equal diagonal speed', () => {
  assert.deepEqual(stickForce(2, 2, 45), { x: 0, y: 0 });
  let last = 0;
  for (let x = 4; x < 80; x++) {
    const force = stickForce(x, 0, 45);
    assert(force.x >= last);
    assert(force.x <= 1);
    last = force.x;
  }
  assert.equal(stickForce(34, 0, 45).x, 1);
  const diagonal = stickForce(90, 90, 45);
  assert(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
  assert.equal(cameraZoom(844, 390, true, 'standard'), 1.3);
  assert.equal(cameraZoom(390, 844, true, 'standard'), 1.45);
  assert.equal(cameraZoom(844, 390, true, 'far'), 1.15);
});
test('dungeon room presets and core/cache/exit remain reachable across seeds', () => {
  for (const seed of [1, 513, 0xffffffff]) {
    const l = dungeonLevel(seed),
      visited = new Set([12 * l.w + 10]),
      q = [12 * l.w + 10];
    for (let head = 0; head < q.length; head++) {
      const i = q[head],
        x = i % l.w,
        y = Math.floor(i / l.w);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx,
          yy = y + dy,
          n = yy * l.w + xx;
        if (
          xx < 1 ||
          yy < 1 ||
          xx >= l.w - 1 ||
          yy >= l.h - 1 ||
          visited.has(n) ||
          l.blocked((xx + 0.5) * 32, (yy + 0.5) * 32, 10)
        )
          continue;
        visited.add(n);
        q.push(n);
      }
    }
    for (const [x, y] of DUNGEON_ROOMS)
      assert(visited.has(y * l.w + x), `room ${x},${y}`);
    assert.equal(l.at(14, 22), Tile.WALL);
  }
});
test('three persistent dungeons carry one hero, preserve drops and prevent repeated core rewards', () => {
  let c = context();
  calm(c);
  const hero = c.player,
    original = JSON.stringify(c.s.inventory.get(hero)),
    surfaceCount = c.world.alive.size;
  const keys: Exclude<ZoneId, 'overworld'>[] = ['mine', 'roots', 'jail'];
  for (const zone of keys) {
    travelRealm(c, zone);
    assert.equal(c.player, hero);
    assert.equal(c.level.w, 80);
    assert.equal(c.s.inventory.length, 1);
    assert.equal(
      c.journey!.layers.overworld!.world.entities.some((e) => e.id === hero),
      false,
    );
    if (zone === 'mine')
      assert.equal(JSON.stringify(c.s.inventory.get(hero)), original);
    calm(c);
    claim(c, zone + '-cache');
    claim(c, zone + '-warden');
    assert(c.progress.bosses.includes(zone + '-warden'));
    assert.equal(c.level.at(14, 22), Tile.ROAD);
    reveal(c, c.world.pos(hero));
    const copy = restoreSave(parseSave(serializeSave(captureSave(c))));
    assert.equal(copy.progress.zone, zone);
    assert.equal(copy.level.at(14, 22), Tile.ROAD);
    assert.deepEqual(copy.s.inventory.get(hero), c.s.inventory.get(hero));
    c = {
      ...copy,
      camera: new Camera(),
      gameOver: false,
      debug: false,
      aimPointer: { x: 0, y: 0 },
    };
    const gained = JSON.stringify(c.s.inventory.get(hero));
    travelRealm(c, 'overworld');
    assert.equal(c.world.alive.size, surfaceCount);
    assert.equal(JSON.stringify(c.s.inventory.get(hero)), gained);
    travelRealm(c, zone);
    calm(c);
    approach(c, zone + '-warden');
    const xp = c.s.journal.get(hero)!.xp;
    applyExplorationCommand(c, { type: 'interact' });
    assert.equal(c.s.journal.get(hero)!.xp, xp);
    assert.equal(JSON.stringify(c.s.inventory.get(hero)), gained);
    travelRealm(c, 'overworld');
  }
  assert.equal(Object.keys(c.journey!.layers).length, 3);
  const saved = captureSave(c),
    compressed = serializeSave(saved);
  assert.deepEqual(parseSave(compressed), saved);
  assert(compressed.length < JSON.stringify(saved).length * 0.8);
  const storage = new Map<string, string>(),
    repo = new SaveRepository({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        if (v.length > 2_400_000) throw Error('quota');
        storage.set(k, v);
      },
    });
  repo.write(0, saved);
  c.s.player.get(hero)!.mana -= 1;
  repo.writeScene(0, c);
  assert(storage.get(SAVE_PREFIX + '0')!.length < 2_400_000);
  assert.equal(repo.read(0).record!.version, 4);
});
test('fog namespaces, guarded outpost activation and portal combat restrictions are real rules', () => {
  const c = context();
  calm(c);
  reveal(c, { x: 320, y: 400 });
  assert(exploredAt(c, { x: 320, y: 400 }));
  approach(c, 'vale-mine');
  c.s.mage.get(c.player)!.fieldLeft = 2;
  assert.equal(
    applyExplorationCommand(c, { type: 'interact' }).zoneChanged,
    undefined,
  );
  c.s.mage.get(c.player)!.fieldLeft = 0;
  assert(applyExplorationCommand(c, { type: 'interact' }).zoneChanged);
  assert.equal(c.progress.zone, 'mine');
  assert(c.progress.explored.some((k) => k.startsWith('mine:fog:')));
  travelRealm(c, 'overworld');
  assert(c.progress.explored.some((k) => k.startsWith('fog:')));
  approach(c, 'marsh-reclaimed');
  applyExplorationCommand(c, { type: 'interact' });
  assert(!c.progress.waypoints.includes('marsh-reclaimed'));
  assert(c.s.mob.data.some((m) => m.site === 'marsh-reclaimed'));
  claim(c, 'marsh-reclaimed');
  assert(c.progress.waypoints.includes('marsh-reclaimed'));
  assert(c.progress.purified.includes('marsh-reclaimed'));
});
test('v3 world migrates to six regions without moving old entities or replacing equipment and claimed sites', () => {
  const record = parseSave(JSON.stringify(v3));
  assert.equal(record.version, 3);
  const scene = restoreSave(record);
  assert.equal(scene.level.w, 512);
  assert.equal(scene.level.h, 384);
  assert.equal(worldSites(scene).length, 63);
  assert.equal(scene.progress.zone, 'overworld');
  assert.deepEqual(
    scene.progress.openedChests,
    record.data.progress.openedChests,
  );
  assert.deepEqual(
    scene.s.inventory.get(scene.player),
    record.data.world.stores.inventory[0].value,
  );
  for (const e of record.data.world.entities) {
    assert(scene.world.alive.has(e.id));
    if (e.position) assert.deepEqual(scene.world.pos(e.id), e.position);
  }
  const twice = restoreSave(captureSave(scene));
  assert.deepEqual(captureSave(twice).data, captureSave(scene).data);
});
test('packed save rejects oversized runs and corrupted inactive layers before replacing a slot', () => {
  const c = context();
  calm(c);
  travelRealm(c, 'mine');
  const encoded = JSON.parse(serializeSave(captureSave(c)));
  encoded.data.level.tiles = [0, 999999999];
  assert.throws(() => parseSave(JSON.stringify(encoded)), /压缩/);
  const bad = JSON.parse(serializeSave(captureSave(c)));
  bad.data.journey.layers.evil = bad.data.journey.layers.overworld;
  assert.throws(() => parseSave(JSON.stringify(bad)));
});

test('exploration percentage counts traversable fog cells and updates when a return route opens', () => {
  const c = context();
  c.level = new Level(8, 8);
  c.level.tiles.fill(Tile.WALL);
  c.level.tiles[9] = Tile.STONE;
  c.level.tiles[14] = Tile.STONE;
  c.progress.explored = [];
  assert.equal(explorationPercent(c), 0);
  c.progress.explored.push('fog:0:0');
  assert.equal(explorationPercent(c), 50);
  c.progress.explored.push('fog:1:0');
  assert.equal(explorationPercent(c), 100);
  c.level.tiles[5 * 8 + 1] = Tile.STONE;
  c.level.markTerrainChanged();
  assert.equal(explorationPercent(c), 67);
});
