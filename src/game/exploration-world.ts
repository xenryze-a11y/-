/** 内容初始化与旧世界扩展；只添加新区内容，不重建玩家、掉落、任务或已毁物件。 */
import type { Scene } from './spawn';
import { TAG } from './components';
import { makeRng } from '../engine/math';
import { expandLevel, siteLocations } from './world-layout';
import { SITE_SPRITES, WORLD, roadClearance, regionAt } from './world-data';
import { groveClearance } from './grove';
export function initializeExploration(scene: Scene): void {
  if (scene.progress.worldVersion === 2) return;
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
  for (const { definition: d, position: p } of locations)
    prop(
      SITE_SPRITES[d.kind],
      p.x,
      p.y,
      d.kind === 'vista' ? 80 : 64,
      d.kind === 'waypoint' ? 88 : d.kind === 'shrine' ? 88 : 64,
      d.kind === 'camp' ? 8 : 10,
      d.id,
    );
  for (let i = 0; i < 100; i++) {
    const x = (3 + rng() * (level.w - 6)) * 32,
      y = (3 + rng() * (level.h - 6)) * 32;
    if (
      (x < 96 * 32 && y < 64 * 32) ||
      groveClearance(x, y) ||
      roadClearance(x, y) ||
      level.blocked(x, y, 18) ||
      locations.some(
        (l) => Math.hypot(l.position.x - x, l.position.y - y) < 110,
      )
    )
      continue;
    const forest = regionAt({ x, y }) === 'forest';
    prop(
      forest ? 'propBlightTree' : 'propRuinArch',
      x,
      y,
      forest ? 96 : 80,
      forest ? 128 : 112,
      forest ? 13 : 0,
    );
  }
  scene.progress.worldVersion = 2;
}
