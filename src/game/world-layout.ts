/** 世界布局只依赖种子和 Level；地标一律落在从出生点可达的完整空地上。 */
import { carveFrontier } from './frontier-layout';
import { Level, Tile, TILE } from '../engine/level';
import { makeRng, type Vec2 } from '../engine/math';
import { TERRACES, riverCenter } from './landscape-design';
import { createGroveLevel, groveClearance } from './grove';
import {
  SURFACE_SITES,
  WORLD,
  regionAt,
  roadClearance,
  type SiteDefinition,
} from './world-data';
export function expandLevel(old: Level, seed: number): Level {
  const level = new Level(WORLD.width, WORLD.height, seed);
  level.southWalls.fill(0);
  for (let y = 0; y < level.h; y++)
    for (let x = 0; x < level.w; x++) {
      const i = y * level.w + x;
      level.tiles[i] =
        x === 0 || y === 0 || x === level.w - 1 || y === level.h - 1
          ? Tile.WALL
          : regionAt({ x: x * 32, y: y * 32 }) === 'sanctum' &&
              x >= 128 &&
              Math.sin(x * 0.09) + Math.cos(y * 0.11) > 1.1
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
  // 溪流留在新扩区域，主路与溪流交汇处自然形成石桥。
  for (let y = 97; y < Math.min(192, level.h) - 3; y++)
    for (let x = 1; x < Math.min(256, level.w) - 1; x++) {
      const river = Math.abs(x - riverCenter(y));
      const pond = ((x - 176) / 13) ** 2 + ((y - 178) / 7) ** 2 < 1;
      if (river < 2.6 || pond) level.tiles[y * level.w + x] = Tile.WATER;
    }
  for (let y = 1; y < Math.min(192, level.h) - 1; y++)
    for (let x = 1; x < Math.min(256, level.w) - 1; x++)
      if (roadClearance((x + 0.5) * 32, (y + 0.5) * 32)) {
        level.tiles[y * level.w + x] = Tile.ROAD;
        level.southWalls[y * level.w + x] = 0;
      }
  // 台地边缘是真实阻挡，台阶是唯一入口；不引入会破坏挂点/瞄准的角色 Z 偏移。
  for (const hill of TERRACES) {
    for (let y = hill.y; y < hill.y + hill.h; y++)
      for (let x = hill.x; x < hill.x + hill.w; x++) {
        if (x < old.w && y < old.h) continue;
        const edge =
          x === hill.x ||
          y === hill.y ||
          x === hill.x + hill.w - 1 ||
          y === hill.y + hill.h - 1;
        level.tiles[y * level.w + x] = edge ? Tile.CLIFF : Tile.GRASS;
      }
    const yy = hill.side === 'south' ? hill.y + hill.h - 1 : hill.y;
    for (let y = yy - 1; y <= yy + 1; y++)
      for (let x = hill.gate - 2; x <= hill.gate + 2; x++)
        level.tiles[y * level.w + x] = Tile.STAIRS;
  }
  carveFrontier(level, seed, old.w, old.h);
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
  for (const definition of SURFACE_SITES) {
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
    const ax = Math.floor(anchor.x),
      ay = Math.floor(anchor.y);
    for (let radius = 0; radius < 80; radius++) {
      if (best && radius > score + 1) break;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = ax + dx,
            y = ay + dy;
          if (
            x < 1 ||
            y < 1 ||
            x >= level.w - 1 ||
            y >= level.h - 1 ||
            !reachable[y * level.w + x]
          )
            continue;
          const p = { x: (x + 0.5) * 32, y: (y + 0.5) * 32 },
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
    }
    if (!best) throw new Error('无法放置探索地点：' + definition.id);
    out.push({ definition, position: best });
  }
  return out;
}
