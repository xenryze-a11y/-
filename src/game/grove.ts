/** 扩出东侧林地，保留原 48×48 城镇，开一条可通行的朝圣路。 */
import { Level, Tile, TILE } from '../engine/level';
import { makeRng } from '../engine/math';
import { GROVE } from './mage-data';
export function createGroveLevel(seed: number): Level {
  const level = new Level(GROVE.width, GROVE.height, seed),
    old = new Level(GROVE.oldWidth, GROVE.height, seed),
    rng = makeRng(seed ^ 0x38ab19);
  for (let y = 0; y < level.h; y++)
    for (let x = 0; x < level.w; x++) {
      const index = y * level.w + x;
      if (x < GROVE.oldWidth) {
        level.tiles[index] = old.at(x, y);
        level.southWalls[index] = old.southWalls[y * old.w + x];
      } else {
        level.southWalls[index] = 0;
        level.tiles[index] =
          y === 0 || y === level.h - 1 || x === level.w - 1
            ? Tile.WALL
            : rng() < 0.15
              ? Tile.DIRT
              : rng() < 0.13
                ? Tile.STONE
                : Tile.GRASS;
      }
    }
  level.spawn.x = old.spawn.x;
  level.spawn.y = old.spawn.y;
  const put = (x: number, y: number, t: number) => {
    level.tiles[y * level.w + x] = t;
    level.southWalls[y * level.w + x] = 0;
  };
  // 祭坛广场留空，避免随机水域、墙和道具切断路线。
  for (let y = 17; y <= 29; y++)
    for (let x = 54; x <= 67; x++)
      if (Math.hypot((x - 60.5) * 0.9, y - 23) < 7) put(x, y, Tile.STONE);
  for (let x = 25; x <= 61; x++)
    for (let y = 23; y <= 25; y++) put(x, y, Tile.ROAD);
  for (let y = 19; y <= 34; y++)
    for (let x = 60; x <= 61; x++) put(x, y, Tile.ROAD);
  // 林地边缘小水潭，朝圣路上不铺水。
  for (let y = 8; y < 14; y++)
    for (let x = 65; x < 69; x++)
      if (Math.hypot(x - 67, y - 11) < 2.8) put(x, y, Tile.WATER);
  return level;
}
export function groveClearance(x: number, y: number): boolean {
  return (
    x > GROVE.oldWidth * TILE &&
    (Math.hypot(x - GROVE.altar.x, y - GROVE.altar.y) < 220 ||
      Math.hypot(x - GROVE.tree.x, y - GROVE.tree.y) < 175 ||
      Math.abs(y - 24 * 32) < 60)
  );
}
