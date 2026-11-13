/** 原稿经脚本48色/半尺寸/硬透明规范化，仅小图内嵌运行包。 */
import type { BuiltAtlas, Spec, AtlasFrame } from '../engine/art';
import imageURL from './assets/landscape-pixel.png?inline';
import metadata from './assets/landscape-pixel-frames.json?raw';
import { Tile, type Level } from '../engine/level';
import { regionAt } from './world-data';
export function landscapeSpecs(): Spec[] {
  const out: Spec[] = [];
  for (const name of [
    'terrainMarsh',
    'terrainHighland',
    'terrainWaste',
    'terrainBoardwalk',
    'terrainDungeonMine',
    'terrainDungeonRoots',
    'terrainDungeonJail',
    'terrainDungeonVoid',
    'terrainMeadow',
    'terrainEarth',
    'terrainFlowers',
    'terrainWater',
    'terrainForest',
    'terrainRoots',
    'terrainBlight',
    'terrainMud',
    'terrainRuin',
    'terrainSacred',
    'terrainRubble',
    'terrainTrail',
    'terrainCliff',
    'terrainCliffDark',
    'terrainStairs',
    'terrainTerrace',
  ])
    out.push({
      name,
      w: 128,
      h: 128,
      draw: (p) => {
        p.rect(0, 0, 128, 128, '#526d4b');
      },
    });
  for (const [name, w, h] of [
    ['propDungeonPortal', 96, 112],
    ['propRuinPillar', 64, 96],
    ['propDeadTree', 96, 128],
    ['propFungus', 64, 48],
    ['propRuinChapel', 112, 144],
  ] as const)
    out.push({
      name,
      w,
      h,
      draw: (p) => p.rect(w / 4, h / 4, w / 2, (h * 3) / 4, '#526d4b'),
    });
  out.push({
    name: 'tileCliffRaised',
    w: 32,
    h: 64,
    draw: (p) => {
      p.rect(0, 3, 32, 58, '#52645d');
      p.rect(0, 0, 32, 7, '#83966c');
    },
  });
  for (let i = 0; i < 4; i++)
    out.push({
      name: 'tileCartoonWallRaised' + i,
      w: 32,
      h: 64,
      draw: (p) => p.rect(0, 0, 32, 64, '#718b83'),
    });
  return out;
}
export async function applyLandscapeArt(atlas: BuiltAtlas): Promise<boolean> {
  try {
    const image = new Image();
    image.src = imageURL;
    await image.decode();
    const frames = JSON.parse(metadata) as Record<string, AtlasFrame>;
    for (const [name, f] of Object.entries(frames)) {
      const target = atlas.frames[name];
      if (
        !target ||
        f.w !== target.w ||
        f.h !== target.h ||
        f.x + f.w > image.width ||
        f.y + f.h > image.height
      )
        throw new Error('Landscape frame mismatch ' + name);
    }
    const g = atlas.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const [name, f] of Object.entries(frames)) {
      const t = atlas.frames[name];
      g.clearRect(t.x, t.y, t.w, t.h);
      g.drawImage(image, f.x, f.y, f.w, f.h, t.x, t.y, t.w, t.h);
      const active = atlas.frames[name + 'Active'];
      if (active) {
        g.clearRect(active.x, active.y, active.w, active.h);
        g.drawImage(
          image,
          f.x,
          f.y,
          f.w,
          f.h,
          active.x,
          active.y,
          active.w,
          active.h,
        );
        g.save();
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = name === 'landChest' ? '#152b2390' : '#adf8df30';
        g.fillRect(active.x, active.y, active.w, active.h);
        g.restore();
      }
    }
    const cliff = atlas.frames.tileCliffRaised,
      rock = frames.terrainCliff;
    g.clearRect(cliff.x, cliff.y, 32, 64);
    g.drawImage(
      image,
      rock.x + 32,
      rock.y + 32,
      32,
      64,
      cliff.x,
      cliff.y,
      32,
      64,
    );
    g.fillStyle = '#a2ad7d';
    g.fillRect(cliff.x, cliff.y, 32, 4);
    g.fillStyle = '#526d4b';
    g.fillRect(cliff.x, cliff.y + 4, 32, 4);
    return true;
  } catch (e) {
    console.warn('[atlas] landscape art fallback', e);
    return false;
  }
}
export function landscapeGroundFrame(
  level: Level,
  x: number,
  y: number,
): string | undefined {
  const tile = level.at(x, y),
    region = regionAt({ x: x * 32, y: y * 32 });
  if (tile === Tile.FLOOR || tile === Tile.WALL) return;
  if (tile === Tile.WATER) return 'terrainWater';
  if (tile === Tile.STAIRS) return 'terrainStairs';
  if (tile === Tile.CLIFF) return 'terrainCliffDark';
  if (
    tile === Tile.ROAD &&
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => level.at(x + dx, y + dy) === Tile.WATER)
  )
    return region === 'marsh' ? 'terrainBoardwalk' : 'terrainTrail';
  if (region === 'marsh' && tile === Tile.ROAD) return 'terrainBoardwalk';
  if (tile === Tile.ROAD)
    return region === 'sanctum'
      ? 'terrainTrail'
      : region === 'forest'
        ? 'terrainMud'
        : 'terrainEarth';
  if (tile === Tile.DIRT)
    return region === 'forest' ? 'terrainRoots' : 'terrainEarth';
  if (region === 'waste' && (tile === Tile.STONE || tile === Tile.GRASS))
    return 'terrainWaste';
  if (tile === Tile.STONE)
    return region === 'sanctum' ? 'terrainRuin' : 'terrainRubble';
  if (region === 'marsh') return 'terrainMarsh';
  if (region === 'highland') return 'terrainHighland';
  if (region === 'waste') return 'terrainWaste';
  if (region === 'forest')
    return Math.sin(x * 0.035) + Math.cos(y * 0.05) > 0.65
      ? 'terrainBlight'
      : 'terrainForest';
  if (region === 'sanctum') return 'terrainTerrace';
  return Math.sin(x * 0.037) + Math.cos(y * 0.041) > 1
    ? 'terrainFlowers'
    : 'terrainMeadow';
}
