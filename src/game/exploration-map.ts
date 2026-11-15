/** 地图绘制只读模拟；未知区域与未发现的地标不泄露。 */
import { DUNGEONS } from './realm-data';
import { Tile } from '../engine/level';
import { REGIONS, WORLD, regionForZone, type RegionId } from './world-data';
import {
  worldSites,
  exploredAt,
  exploredCells,
  completedSite,
  fogKey,
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
  [Tile.CLIFF]: '#394b47',
  [Tile.STAIRS]: '#c2c5a0',
};
export function mapViewport(
  canvas: HTMLCanvasElement,
  ctx: Ctx,
  region?: RegionId,
): { left: number; top: number; width: number; height: number } {
  const aspect = canvas.width / canvas.height,
    large = canvas.width > 300,
    p = ctx.world.pos(ctx.player);
  if (!large) {
    const width = Math.min(1280, ctx.level.pixelW),
      height = Math.min(width / aspect, ctx.level.pixelH);
    return {
      left: Math.max(
        0,
        Math.min(
          ctx.level.pixelW - width,
          Math.floor(p.x / 64) * 64 - width / 2,
        ),
      ),
      top: Math.max(
        0,
        Math.min(
          ctx.level.pixelH - height,
          Math.floor(p.y / 64) * 64 - height / 2,
        ),
      ),
      width,
      height,
    };
  }
  let left = 0,
    top = 0,
    right = ctx.level.pixelW,
    bottom = ctx.level.pixelH;
  if (region && ctx.progress.zone === 'overworld') {
    left = Infinity;
    top = Infinity;
    right = 0;
    bottom = 0;
    for (let y = 0; y < ctx.level.h; y += 4)
      for (let x = 0; x < ctx.level.w; x += 4)
        if (
          regionForZone(ctx.progress.zone, {
            x: (x + 2) * 32,
            y: (y + 2) * 32,
          }) === region
        ) {
          left = Math.min(left, x * 32);
          top = Math.min(top, y * 32);
          right = Math.max(right, (x + 4) * 32);
          bottom = Math.max(bottom, (y + 4) * 32);
        }
  }
  const width = Math.max(right - left, (bottom - top) * aspect),
    height = width / aspect;
  return {
    left: (left + right - width) / 2,
    top: (top + bottom - height) / 2,
    width,
    height,
  };
}
const terrainCache = new WeakMap<
  HTMLCanvasElement,
  {
    level: Ctx['level'];
    progress: Ctx['progress'];
    projection: string;
    revision: number;
    fog: number;
    image: HTMLCanvasElement;
  }
>();
export function drawExplorationMap(
  canvas: HTMLCanvasElement,
  ctx: Ctx,
  region?: RegionId,
): void {
  const g = canvas.getContext('2d')!,
    level = ctx.level,
    viewport = mapViewport(canvas, ctx, region),
    projection = JSON.stringify(viewport),
    sx = canvas.width / viewport.width,
    sy = canvas.height / viewport.height;
  g.imageSmoothingEnabled = false;
  let cached = terrainCache.get(canvas);
  if (
    !cached ||
    cached.level !== level ||
    cached.progress !== ctx.progress ||
    cached.revision !== level.revision ||
    cached.projection !== projection ||
    cached.fog !== ctx.progress.explored.length
  ) {
    const image = document.createElement('canvas');
    image.width = canvas.width;
    image.height = canvas.height;
    const bg = image.getContext('2d')!;
    bg.fillStyle = '#091512';
    bg.fillRect(0, 0, image.width, image.height);
    for (const key of exploredCells(ctx)) {
      const prefix =
        ctx.progress.zone === 'overworld'
          ? 'fog:'
          : ctx.progress.zone + ':fog:';
      if (!key.startsWith(prefix)) continue;
      const [cx, cy] = key.slice(prefix.length).split(':').map(Number);
      for (let y = cy * 4; y < Math.min(level.h, cy * 4 + 4); y++)
        for (let x = cx * 4; x < Math.min(level.w, cx * 4 + 4); x++) {
          if (
            x * 32 < viewport.left - 32 ||
            x * 32 > viewport.left + viewport.width ||
            y * 32 < viewport.top - 32 ||
            y * 32 > viewport.top + viewport.height
          )
            continue;
          const tile = level.at(x, y);
          bg.fillStyle = tileColors[tile];
          bg.fillRect(
            (x * 32 - viewport.left) * sx,
            (y * 32 - viewport.top) * sy,
            Math.ceil(32 * sx),
            Math.ceil(32 * sy),
          );
        }
    }
    cached = {
      level,
      progress: ctx.progress,
      revision: level.revision,
      projection,
      fog: ctx.progress.explored.length,
      image,
    };
    terrainCache.set(canvas, cached);
  }
  g.drawImage(cached.image, 0, 0);
  const large = canvas.width > 300,
    sites = worldSites(ctx),
    player = ctx.world.pos(ctx.player);
  for (const site of sites) {
    const d = site.definition;
    if (!ctx.progress.discovered.includes(d.id)) continue;
    const x = (site.position.x - viewport.left) * sx,
      y = (site.position.y - viewport.top) * sy,
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
    g.fillRect(
      (p.x - viewport.left) * sx - 2,
      (p.y - viewport.top) * sy - 2,
      4,
      4,
    );
  });
  for (const id of ctx.world.query(player, 260, 'mob')) {
    const p = ctx.world.pos(id);
    if (!ctx.level.lineClear(player, p)) continue;
    g.fillStyle = '#c86c63';
    g.fillRect(
      (p.x - viewport.left) * sx - 1,
      (p.y - viewport.top) * sy - 1,
      2,
      2,
    );
  }
  const px = (player.x - viewport.left) * sx,
    py = (player.y - viewport.top) * sy;
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
const explorationAreaCache = new WeakMap<
  Ctx['level'],
  { revision: number; zone: string; cells: { key: string; region: RegionId }[] }
>();
export function explorationPercent(ctx: Ctx, region?: RegionId): number {
  let area = explorationAreaCache.get(ctx.level);
  if (
    !area ||
    area.revision !== ctx.level.terrainRevision ||
    area.zone !== ctx.progress.zone
  ) {
    const cells: { key: string; region: RegionId }[] = [];
    for (let cy = 0; cy < Math.ceil(ctx.level.h / 4); cy++)
      for (let cx = 0; cx < Math.ceil(ctx.level.w / 4); cx++) {
        let reachable = false;
        for (let dy = 0; dy < 4 && !reachable; dy++)
          for (let dx = 0; dx < 4; dx++)
            if (
              ![Tile.WALL, Tile.WATER, Tile.CLIFF].includes(
                ctx.level.at(cx * 4 + dx, cy * 4 + dy) as 3 | 5 | 7,
              )
            ) {
              reachable = true;
              break;
            }
        if (reachable)
          cells.push({
            key: fogKey(cx, cy, ctx.progress.zone),
            region: regionForZone(ctx.progress.zone, {
              x: (cx + 0.5) * WORLD.fogCell,
              y: (cy + 0.5) * WORLD.fogCell,
            }),
          });
      }
    area = {
      revision: ctx.level.terrainRevision,
      zone: ctx.progress.zone,
      cells,
    };
    explorationAreaCache.set(ctx.level, area);
  }
  const cells = region
      ? area.cells.filter((c) => c.region === region)
      : area.cells,
    known = exploredCells(ctx);
  return cells.length
    ? Math.round(
        (cells.filter((c) => known.has(c.key)).length / cells.length) * 100,
      )
    : 0;
}
export function regionCaption(ctx: Ctx): string {
  const region =
      REGIONS[regionForZone(ctx.progress.zone, ctx.world.pos(ctx.player))],
    low = ctx.s.journal.get(ctx.player)!.level < region.levels[0];
  const name =
    ctx.progress.zone !== 'overworld'
      ? DUNGEONS[ctx.progress.zone].name
      : region.name;
  return `${name} · 建议 ${region.levels.join('–')} 级${low ? ' · 危险' : ''}`;
}
