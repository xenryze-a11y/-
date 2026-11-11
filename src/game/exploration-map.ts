/** 地图绘制只读模拟；未知区域与未发现的地标不泄露。 */
import { Tile } from '../engine/level';
import { REGIONS, WORLD, regionAt, type RegionId } from './world-data';
import {
  worldSites,
  exploredAt,
  exploredCells,
  completedSite,
} from './systems/exploration';
import type { Ctx } from './systems/context';
const tileColors: Record<number, string> = {
  [Tile.GRASS]: '#425540',
  [Tile.DIRT]: '#776247',
  [Tile.STONE]: '#81887b',
  [Tile.WATER]: '#254f5b',
  [Tile.FLOOR]: '#9b8c66',
  [Tile.WALL]: '#a3a18d',
  [Tile.ROAD]: '#b19d6e',
};
export function drawExplorationMap(canvas: HTMLCanvasElement, ctx: Ctx): void {
  const g = canvas.getContext('2d')!,
    level = ctx.level,
    sx = canvas.width / level.pixelW,
    sy = canvas.height / level.pixelH;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#091512';
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < level.h; y++)
    for (let x = 0; x < level.w; x++) {
      const p = { x: (x + 0.5) * 32, y: (y + 0.5) * 32 };
      if (!exploredAt(ctx, p)) continue;
      const tile = level.at(x, y),
        region = regionAt(p);
      g.fillStyle =
        tile === Tile.GRASS && region === 'forest'
          ? '#414958'
          : tileColors[tile];
      g.fillRect(
        x * 32 * sx,
        y * 32 * sy,
        Math.ceil(32 * sx),
        Math.ceil(32 * sy),
      );
    }
  const large = canvas.width > 300,
    sites = worldSites(ctx),
    player = ctx.world.pos(ctx.player);
  for (const site of sites) {
    const d = site.definition;
    if (!ctx.progress.discovered.includes(d.id)) continue;
    const x = site.position.x * sx,
      y = site.position.y * sy,
      size = large ? 5 : 2;
    g.fillStyle =
      d.kind === 'waypoint'
        ? ctx.progress.waypoints.includes(d.id)
          ? '#9cf0df'
          : '#588c89'
        : completedSite(ctx, d)
          ? '#647264'
          : d.kind === 'camp'
            ? '#f5b978'
            : '#e5d6a5';
    g.fillRect(x - size, y - size, size * 2, size * 2);
    if (ctx.progress.trackedSite === d.id) {
      g.strokeStyle = '#fff0bd';
      g.lineWidth = 1;
      g.strokeRect(x - size - 3, y - size - 3, size * 2 + 6, size * 2 + 6);
    }
  }
  ctx.s.npc.forEach((id) => {
    const p = ctx.world.pos(id);
    if (!exploredAt(ctx, p)) return;
    g.fillStyle = '#d2cda6';
    g.fillRect(p.x * sx - 2, p.y * sy - 2, 4, 4);
  });
  for (const id of ctx.world.query(player, 260, 'mob')) {
    const p = ctx.world.pos(id);
    if (!ctx.level.lineClear(player, p)) continue;
    g.fillStyle = '#c86c63';
    g.fillRect(p.x * sx - 1, p.y * sy - 1, 2, 2);
  }
  const px = player.x * sx,
    py = player.y * sy;
  g.fillStyle = '#ffedb4';
  g.beginPath();
  g.arc(px, py, large ? 4 : 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff5cf';
  g.strokeRect(px - 5, py - 5, 10, 10);
  if (large) {
    g.font = '11px system-ui';
    g.fillStyle = '#aab6a2';
    g.fillText('N ↑', 12, 20);
  }
}
export function explorationPercent(ctx: Ctx, region?: RegionId): number {
  let total = 0,
    known = 0;
  const cells = exploredCells(ctx);
  for (let y = 0; y < ctx.level.pixelH / WORLD.fogCell; y++)
    for (let x = 0; x < ctx.level.pixelW / WORLD.fogCell; x++) {
      if (
        region &&
        regionAt({
          x: (x + 0.5) * WORLD.fogCell,
          y: (y + 0.5) * WORLD.fogCell,
        }) !== region
      )
        continue;
      total++;
      if (cells.has(`fog:${x}:${y}`)) known++;
    }
  return total ? Math.round((known / total) * 100) : 0;
}
export function regionCaption(ctx: Ctx): string {
  const region = REGIONS[regionAt(ctx.world.pos(ctx.player))],
    low = ctx.s.journal.get(ctx.player)!.level < region.levels[0];
  return `${region.name} · 建议 ${region.levels.join('–')} 级${low ? ' · 危险' : ''}`;
}
