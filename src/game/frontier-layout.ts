import { Tile, type Level } from '../engine/level';
import { makeRng } from '../engine/math';
import { FRONTIER_NODES, frontierPaths } from './expedition-design';
/** 新区从封闭地貌中雕出盆地、回环通路与桥口，旧世界格子不被改写。 */
export function carveFrontier(
  level: Level,
  seed: number,
  oldW: number,
  oldH: number,
): void {
  const rng = makeRng(seed ^ 0xbefa431);
  const fresh = (x: number, y: number): boolean =>
    x > 0 &&
    y > 0 &&
    x < level.w - 1 &&
    y < level.h - 1 &&
    !(x < oldW - 1 && y < oldH - 1);
  const put = (x: number, y: number, tile: number): void => {
    if (fresh(x, y)) level.tiles[y * level.w + x] = tile;
  };
  const base = (x: number): number => (x >= 384 ? Tile.STONE : Tile.GRASS);
  for (let y = 1; y < level.h - 1; y++)
    for (let x = 1; x < level.w - 1; x++)
      if (fresh(x, y) && (x >= 256 || y >= 192))
        put(x, y, x < 384 && y >= 224 ? Tile.WATER : Tile.CLIFF);
  for (const node of FRONTIER_NODES) {
    const [, region, , kind, cx, cy] = node,
      rx = (region === 'marsh' ? 22 : 19) + rng() * 5,
      ry = 18 + rng() * 6;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const theta = Math.atan2((y - cy) / ry, (x - cx) / rx),
          edge = 1 + Math.sin(theta * 5 + cx) * 0.09;
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < edge)
          put(
            x,
            y,
            kind === 'cache' && Math.abs(x - cx) < 8 && Math.abs(y - cy) < 7
              ? Tile.DIRT
              : base(x),
          );
      }
  }
  const stroke = (
    a: number[],
    b: number[],
    width: number,
    tile?: number,
  ): void => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let i = 0; i <= n; i++) {
      const cx = a[0] + ((b[0] - a[0]) * i) / n,
        cy = a[1] + ((b[1] - a[1]) * i) / n;
      for (let y = Math.floor(cy - width); y <= cy + width; y++)
        for (let x = Math.floor(cx - width); x <= cx + width; x++)
          if (Math.hypot(x - cx, y - cy) <= width) put(x, y, tile ?? base(x));
    }
  };
  for (const path of frontierPaths())
    for (let i = 1; i < path.length; i++) {
      stroke(path[i - 1], path[i], 6);
      stroke(path[i - 1], path[i], 1.6, Tile.ROAD);
    }
  // 通路靠近盆地的短支路预设：藏匣和碎柱放在路外，不封主路。
  for (const node of FRONTIER_NODES) {
    const cx = node[4],
      cy = node[5];
    if (node[1] === 'highland')
      for (let x = cx - 9; x <= cx + 9; x++)
        for (let y = cy + 10; y <= cy + 12; y++) put(x, y, Tile.STAIRS);
  }
}
