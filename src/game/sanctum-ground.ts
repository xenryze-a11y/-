/** 圣域地面仅决定材质；不替换模拟瓦片或碰撞，旧城镇不受影响。 */
import { Tile, type TileValue } from '../engine/level';
import { SANCTUARY } from './sanctuary-data';
export const SANCTUM_GARDENS = [
  { x: 55 * 32, y: 18 * 32 },
  { x: 66.5 * 32, y: 18.5 * 32 },
  { x: 53.5 * 32, y: 25.5 * 32 },
  { x: 67 * 32, y: 28 * 32 },
  { x: 56 * 32, y: 30 * 32 },
  { x: 65.5 * 32, y: 31 * 32 },
  { x: 51.5 * 32, y: 36 * 32 },
  { x: 69.5 * 32, y: 36 * 32 },
  { x: 51.5 * 32, y: 52 * 32 },
  { x: 69.5 * 32, y: 52 * 32 },
];
export function sanctumGroundFrame(
  cx: number,
  cy: number,
  tile: TileValue,
): string | null {
  if (cx < 49 || tile === Tile.WALL || tile === Tile.WATER) return null;
  const r = SANCTUARY.cathedral,
    x = (cx + 0.5) * 32,
    y = (cy + 0.5) * 32;
  if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return null;
  const grove = ((cx + 0.5 - 60.5) / 8) ** 2 + ((cy + 0.5 - 22) / 10) ** 2;
  const approach = cx >= 51 && cx <= 69 && cy >= 32 && cy <= 58;
  if (
    (cy >= 23 && cy <= 25 && cx <= 60) ||
    (cx >= 60 && cx <= 61 && cy >= 19 && cy <= 60)
  )
    return 'tileSanctumPath';
  if (grove < 1) {
    if (grove > 0.78 || (cy < 20 && Math.abs(cx - 60) < 5))
      return 'tileSanctumGrass';
    return 'tileSanctumPave' + ((cx * 13 + cy * 7) % 5 === 0 ? 1 : 0);
  }
  return approach ? 'tileSanctumPave' + ((cx + cy) % 3 === 0 ? 1 : 0) : null;
}
