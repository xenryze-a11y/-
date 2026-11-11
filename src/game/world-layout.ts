/** 世界布局只依赖种子和 Level；地标一律落在从出生点可达的完整空地上。 */
import { Level, Tile, TILE } from '../engine/level';
import { makeRng, type Vec2 } from '../engine/math';
import { createGroveLevel, groveClearance } from './grove';
import {
  SITES,
  WORLD,
  regionAt,
  roadClearance,
  type SiteDefinition,
} from './world-data';
export function expandLevel(old: Level, seed: number): Level {
  const level = new Level(WORLD.width, WORLD.height, seed),
    rng = makeRng(seed ^ 0x349abc);
  level.southWalls.fill(0);
  for (let y = 0; y < level.h; y++)
    for (let x = 0; x < level.w; x++) {
      const i = y * level.w + x;
      level.tiles[i] =
        x === 0 || y === 0 || x === level.w - 1 || y === level.h - 1
          ? Tile.WALL
          : rng() < 0.12
            ? Tile.DIRT
            : rng() < 0.14
              ? Tile.STONE
              : Tile.GRASS;
      if (x < old.w && y < old.h) {
        level.tiles[i] =
          (x === old.w - 1 || y === old.h - 1) && x > 0 && y > 0
            ? Tile.GRASS
            : old.at(x, y);
        level.southWalls[i] = old.southWalls[y * old.w + x];
      }
    }
  Object.assign(level.spawn, old.spawn);
  for (const b of old.snapshot().blockers) level.addBlocker(b.x, b.y, b.r);
  // 新区水潭不切断主路；旧区的墙、地板和玩家已经破坏的实体留给原快照。
  for (let n = 0; n < 12; n++) {
    const cx = 5 + Math.floor(rng() * (level.w - 10)),
      cy = 73 + Math.floor(rng() * 16);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -3; dx <= 3; dx++)
        if (
          (dx * dx) / 9 + (dy * dy) / 4 < 1 &&
          !roadClearance((cx + dx + 0.5) * 32, (cy + dy + 0.5) * 32)
        )
          level.tiles[(cy + dy) * level.w + cx + dx] = Tile.WATER;
  }
  for (let y = 1; y < level.h - 1; y++)
    for (let x = 1; x < level.w - 1; x++)
      if (roadClearance((x + 0.5) * 32, (y + 0.5) * 32)) {
        level.tiles[y * level.w + x] = Tile.ROAD;
        level.southWalls[y * level.w + x] = 0;
      }
  level.revision++;
  return level;
}
export function createWorldLevel(seed: number): Level {
  return expandLevel(createGroveLevel(seed), seed);
}
export interface SiteLocation {
  definition: SiteDefinition;
  position: Vec2;
}
export function siteLocations(level: Level, seed: number): SiteLocation[] {
  const rng = makeRng(seed ^ 0x7c19b1),
    reachable = new Uint8Array(level.w * level.h),
    queue = [
      Math.floor(level.spawn.y / TILE) * level.w +
        Math.floor(level.spawn.x / TILE),
    ];
  reachable[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head],
      x = i % level.w,
      y = Math.floor(i / level.w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx,
        yy = y + dy,
        j = yy * level.w + xx;
      if (
        xx < 1 ||
        yy < 1 ||
        xx >= level.w - 1 ||
        yy >= level.h - 1 ||
        reachable[j] ||
        level.blocked((xx + 0.5) * 32, (yy + 0.5) * 32, 11)
      )
        continue;
      reachable[j] = 1;
      queue.push(j);
    }
  }
  const out: SiteLocation[] = [];
  for (const definition of SITES) {
    const anchor = {
      x:
        definition.x +
        0.5 +
        (definition.kind === 'waypoint' ? 0 : rng() * 4 - 2),
      y:
        definition.y +
        0.5 +
        (definition.kind === 'waypoint' ? 0 : rng() * 4 - 2),
    };
    let best: Vec2 | undefined,
      score = Infinity;
    for (const i of queue) {
      const x = i % level.w,
        y = Math.floor(i / level.w),
        p = { x: (x + 0.5) * 32, y: (y + 0.5) * 32 },
        d = Math.hypot(x + 0.5 - anchor.x, y + 0.5 - anchor.y);
      if (
        d >= score ||
        regionAt(p) !== definition.region ||
        groveClearance(p.x, p.y) ||
        level.blocked(p.x, p.y, 24) ||
        out.some(
          (s) => Math.hypot(s.position.x - p.x, s.position.y - p.y) < 125,
        )
      )
        continue;
      best = p;
      score = d;
    }
    if (!best) throw new Error('无法放置探索地点：' + definition.id);
    out.push({ definition, position: best });
  }
  return out;
}
