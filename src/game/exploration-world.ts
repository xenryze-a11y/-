/** 内容初始化与旧世界扩展；只添加新区内容，不重建玩家、掉落、任务或已毁物件。 */
import type { Scene } from './spawn';
import { Tile } from '../engine/level';
import { TAG } from './components';
import { makeRng } from '../engine/math';
import { expandLevel, siteLocations } from './world-layout';
import { SITE_SPRITES, WORLD, roadClearance, regionAt } from './world-data';
import { groveClearance } from './grove';
export function initializeExploration(scene: Scene): void {
  if (scene.progress.worldVersion === 3) return;
  if (scene.level.w !== WORLD.width || scene.level.h !== WORLD.height)
    scene.level = expandLevel(scene.level, scene.progress.seed);
  const { world, s, level } = scene,
    locations = siteLocations(level, scene.progress.seed),
    rng = makeRng(scene.progress.seed ^ 0x812afe);
  const prop = (
    sprite: string,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    landmark?: string,
  ): void => {
    const id = world.createAt([TAG.PROP], x, y);
    s.prop.set(id, {
      sprite,
      w,
      h,
      blocks: r > 0,
      ...(landmark ? { landmark } : {}),
    });
    s.look.set(id, {
      family: 'prop',
      scale: 1,
      showHealth: false,
      animated: false,
      staticSprite: sprite,
    });
    if (r) {
      s.radius.set(id, { r });
      level.addBlocker(x, y, r);
      if (!landmark) {
        s.health.set(id, { hp: 28, max: 28, armor: 0 });
        world.addTag(id, TAG.DAMAGEABLE);
      }
    }
  };
  const existing = new Set(s.prop.data.map((p) => p.landmark).filter(Boolean));
  for (const { definition: d, position: p } of locations)
    if (!existing.has(d.id))
      prop(
        SITE_SPRITES[d.kind],
        p.x,
        p.y,
        d.kind === 'vista' ? 80 : 64,
        d.kind === 'waypoint' ? 88 : d.kind === 'shrine' ? 88 : 64,
        d.kind === 'camp' ? 8 : 10,
        d.id,
      );
  for (let i = 0; i < 760; i++) {
    const x = (3 + rng() * (level.w - 6)) * 32,
      y = (3 + rng() * (level.h - 6)) * 32;
    if (
      (scene.progress.worldVersion === 2 && x < 128 * 32 && y < 96 * 32) ||
      groveClearance(x, y) ||
      level.at(Math.floor(x / 32), Math.floor(y / 32)) === 4 ||
      roadClearance(x, y) ||
      level.blocked(x, y, 18) ||
      locations.some(
        (l) => Math.hypot(l.position.x - x, l.position.y - y) < 110,
      )
    )
      continue;
    const region = regionAt({ x, y }),
      forest = region === 'forest',
      meadow = region === 'vale';
    if (Math.sin(x / 220) + Math.cos(y / 190) > 0.75 && rng() < 0.8) continue;
    prop(
      forest
        ? rng() < 0.8
          ? 'propBlightTree'
          : 'propDeadTree'
        : meadow
          ? 'propTree'
          : rng() < 0.6
            ? 'propRuinArch'
            : 'propRuinPillar',
      x,
      y,
      forest || meadow ? 96 : 80,
      forest || meadow ? 128 : 112,
      forest || meadow ? 13 : 0,
    );
  }
  // 为地标建立可读的前庭和侧景，避免把孤立建筑撒在噪声地毯上。
  for (const { definition: d, position: fallback } of locations) {
    const id = s.prop.owners.find((e) => s.prop.get(e)?.landmark === d.id),
      p = id ? world.pos(id) : fallback;
    const tx = Math.floor(p.x / 32),
      ty = Math.floor(p.y / 32),
      radius = d.kind === 'shrine' || d.kind === 'vista' ? 4 : 2;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (
          dx * dx + dy * dy > radius * radius ||
          tx + dx < 1 ||
          ty + dy < 1 ||
          tx + dx >= level.w - 1 ||
          ty + dy >= level.h - 1
        )
          continue;
        const at = (ty + dy) * level.w + tx + dx,
          tile = level.tiles[at];
        if (tile === Tile.GRASS || tile === Tile.DIRT || tile === Tile.STONE)
          level.tiles[at] =
            d.kind === 'camp' || d.kind === 'cache' ? Tile.DIRT : Tile.STONE;
      }
    if (d.kind === 'shrine' || d.kind === 'vista') {
      for (const dx of [-84, 84])
        prop('propRuinPillar', p.x + dx, p.y - 20, 64, 96, 0);
      if (d.kind === 'shrine') prop('propRuinArch', p.x, p.y + 116, 80, 112, 0);
    }
    if (d.kind === 'camp')
      for (const dx of [-108, 108])
        if (!level.blocked(p.x + dx, p.y - 48, 15))
          prop(
            regionAt(p) === 'forest' ? 'propBlightTree' : 'propTree',
            p.x + dx,
            p.y - 48,
            96,
            128,
            13,
          );
  }
  level.revision++;
  scene.progress.worldVersion = 3;
}
