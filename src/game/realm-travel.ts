/** 各地图保留自己的实体/RNG/碰撞；角色组件跨图移动，不复制装备身份。 */
import { World, type WorldSnapshot } from '../engine/ecs';
import { Level, Tile } from '../engine/level';
import { makeRng } from '../engine/math';
import { createStores, TAG } from './components';
import { DUNGEONS, type ZoneId, type RealmLayer } from './realm-data';
import { sitesForZone, SITE_SPRITES } from './world-data';
import { spawnRegionalMob } from './regional-spawn';
import type { Scene } from './spawn';

export const DUNGEON_ROOMS = [
  [10, 12],
  [31, 12],
  [58, 14],
  [64, 35],
  [62, 60],
  [43, 64],
  [22, 55],
  [18, 33],
];
export const DUNGEON_EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [1, 7],
  [3, 5],
];
function corridor(
  level: Level,
  a: number[],
  b: number[],
  tile: number,
  width = 2,
): void {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  for (let i = 0; i <= n; i++) {
    const cx = Math.round(a[0] + ((b[0] - a[0]) * i) / (n || 1)),
      cy = Math.round(a[1] + ((b[1] - a[1]) * i) / (n || 1));
    for (let dy = -width; dy <= width; dy++)
      for (let dx = -width; dx <= width; dx++)
        level.tiles[(cy + dy) * level.w + cx + dx] = tile;
  }
}
export function dungeonLevel(seed: number): Level {
  const level = new Level(80, 80),
    rng = makeRng(seed ^ 0xfa81a);
  level.tiles.fill(Tile.WALL);
  level.southWalls.fill(0);
  for (const [x, y] of DUNGEON_ROOMS) {
    const rx = 6 + Math.floor(rng() * 3),
      ry = 6 + Math.floor(rng() * 3);
    for (let yy = y - ry; yy <= y + ry; yy++)
      for (let xx = x - rx; xx <= x + rx; xx++)
        level.tiles[yy * 80 + xx] = Tile.STONE;
  }
  for (const [a, b] of DUNGEON_EDGES) {
    const p = DUNGEON_ROOMS[a],
      q = DUNGEON_ROOMS[b],
      bend = rng() < 0.5 ? [q[0], p[1]] : [p[0], q[1]];
    corridor(level, p, bend, Tile.ROAD);
    corridor(level, bend, q, Tile.ROAD);
  }
  corridor(level, DUNGEON_ROOMS[0], DUNGEON_ROOMS[7], Tile.ROAD, 1);
  for (let y = 21; y <= 24; y++)
    for (let x = 9; x <= 22; x++) level.tiles[y * 80 + x] = Tile.WALL;
  level.spawn.x = 10.5 * 32;
  level.spawn.y = 14.5 * 32;
  level.revision++;
  return level;
}
export function openDungeonShortcut(scene: Scene): void {
  if (scene.progress.zone === 'overworld' || !scene.progress.zone) return;
  corridor(scene.level, DUNGEON_ROOMS[0], DUNGEON_ROOMS[7], Tile.ROAD, 1);
  scene.level.markTerrainChanged();
}
function withoutHero(scene: Scene): RealmLayer {
  const world = scene.world.snapshot();
  world.entities = world.entities.filter((e) => e.id !== scene.player);
  for (const entries of Object.values(world.stores))
    for (let i = entries.length - 1; i >= 0; i--)
      if (entries[i].id === scene.player) entries.splice(i, 1);
  return { world, level: scene.level.snapshot() };
}
/** 验证和跨图共用：从当前世界移入唯一角色，旧层从不含第二份背包。 */
export function mergeHero(
  target: WorldSnapshot,
  source: WorldSnapshot,
  player: number,
  at: { x: number; y: number },
): WorldSnapshot {
  const out = structuredClone(target),
    hero = source.entities.find((e) => e.id === player)!;
  out.entities.push({ ...structuredClone(hero), position: { ...at } });
  for (const [name, entries] of Object.entries(source.stores)) {
    const entry = entries.find((e) => e.id === player);
    if (entry) out.stores[name].push(structuredClone(entry));
  }
  out.time = source.time;
  out.nextId = Math.max(out.nextId, player + 1);
  return out;
}
function newDungeon(
  scene: Scene,
  zone: Exclude<ZoneId, 'overworld'>,
): RealmLayer {
  const seed =
      scene.progress.seed ^
      (zone === 'mine' ? 0xa145 : zone === 'roots' ? 0xb246 : 0xc347),
    world = new World(seed),
    s = createStores(world),
    level = dungeonLevel(seed),
    rng = makeRng(seed);
  // 保留角色ID，避免新地图把敌人分配成原玩家的编号。
  const blank = world.snapshot();
  blank.nextId = scene.player + 1;
  world.restore(blank);
  for (const d of sitesForZone(zone)) {
    const id = world.createAt([TAG.PROP], (d.x + 0.5) * 32, (d.y + 0.5) * 32),
      sprite = SITE_SPRITES[d.kind];
    s.prop.set(id, {
      sprite,
      w: d.kind === 'exit' ? 96 : 64,
      h: d.kind === 'exit' ? 112 : 88,
      blocks: false,
      landmark: d.id,
    });
    s.look.set(id, {
      family: 'prop',
      scale: 1,
      showHealth: false,
      animated: false,
      staticSprite: sprite,
    });
  }
  for (let i = 1; i < DUNGEON_ROOMS.length; i++)
    for (let j = 0; j < 2; j++) {
      const [x, y] = DUNGEON_ROOMS[i],
        at = { x: (x + 3 + j * 2) * 32, y: (y + 3) * 32 };
      if (!level.blocked(at.x, at.y, 12))
        spawnRegionalMob(
          { world, s },
          j ? 'caster' : i % 2 ? 'lunge' : 'shamble',
          at.x,
          at.y,
          undefined,
          DUNGEONS[zone].region,
        );
    }
  for (const [x, y] of DUNGEON_ROOMS)
    for (const dx of [-5, 5]) {
      const id = world.createAt(
        [TAG.PROP],
        (x + dx + 0.5) * 32,
        (y - 4 + 0.5) * 32,
      );
      s.prop.set(id, { sprite: 'propTorch', w: 16, h: 32, blocks: false });
      s.look.set(id, {
        family: 'prop',
        scale: 1,
        showHealth: false,
        animated: false,
        staticSprite: 'propTorch',
      });
    }
  for (let i = 0; i < 30; i++) {
    const room = DUNGEON_ROOMS[Math.floor(rng() * DUNGEON_ROOMS.length)],
      x = (room[0] + (rng() - 0.5) * 10) * 32,
      y = (room[1] + (rng() - 0.5) * 10) * 32;
    if (
      level.blocked(x, y, 12) ||
      sitesForZone(zone).some(
        (d) => Math.hypot(x - (d.x + 0.5) * 32, y - (d.y + 0.5) * 32) < 105,
      )
    )
      continue;
    const id = world.createAt([TAG.PROP, TAG.DAMAGEABLE], x, y),
      sprite = zone === 'roots' ? 'propFungus' : 'propCrate';
    s.prop.set(id, {
      sprite,
      w: zone === 'roots' ? 64 : 32,
      h: zone === 'roots' ? 48 : 32,
      blocks: false,
    });
    s.health.set(id, { hp: 20, max: 20, armor: 0 });
    s.look.set(id, {
      family: 'prop',
      scale: 1,
      showHealth: false,
      animated: false,
      staticSprite: sprite,
    });
  }
  return { world: world.snapshot(), level: level.snapshot() };
}
export function travelRealm(scene: Scene, destination: ZoneId): void {
  const from = scene.progress.zone || 'overworld';
  if (from === destination) return;
  const hero = scene.world.snapshot();
  const journey =
    scene.journey ||
    (scene.journey = {
      layers: {},
      returnAt: { ...scene.world.pos(scene.player) },
      returnTracked: scene.progress.trackedSite,
    });
  if (from === 'overworld') {
    journey.returnAt = { ...scene.world.pos(scene.player) };
    journey.returnTracked = scene.progress.trackedSite;
  }
  journey.layers[from] = withoutHero(scene);
  const layer =
    journey.layers[destination] ||
    (destination === 'overworld' ? undefined : newDungeon(scene, destination));
  if (!layer) throw new Error('返回地图缺失');
  delete journey.layers[destination];
  const level = Level.restore(layer.level),
    at = destination === 'overworld' ? journey.returnAt : level.spawn;
  const world = new World(),
    s = createStores(world);
  world.restore(mergeHero(layer.world, hero, scene.player, at));
  scene.world = world;
  scene.s = s;
  scene.level = level;
  scene.progress.zone = destination;
  scene.progress.trackedSite =
    destination === 'overworld'
      ? journey.returnTracked || 'vale-waystone'
      : scene.progress.bosses.includes(destination + '-warden')
        ? destination + '-exit'
        : destination + '-warden';
  scene.progress.lastRegion = '';
  scene.progress.travelReadyAt = world.time + 1;
  s.journal.get(scene.player)!.talking = 0;
  s.dodge.get(scene.player)!.time = 0;
  s.player.get(scene.player)!.invuln = Math.max(
    1,
    s.player.get(scene.player)!.invuln,
  );
  // 同一ID不会同时存在两层，装备身份在跨图前后完全相同。
  if (
    destination !== 'overworld' &&
    scene.progress.bosses.includes(destination + '-warden')
  )
    openDungeonShortcut(scene);
  world.drain();
}
