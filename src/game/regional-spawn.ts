/** 共用亡者组装；区域危险度固定，不随玩家等级膨胀。 */
import { CFG } from './data';
import { TAG, type MobKind } from './components';
import type { Scene } from './spawn';
import { REGIONS, regionAt, type RegionId } from './world-data';
export function spawnRegionalMob(
  scene: Pick<Scene, 's' | 'world'>,
  kind: MobKind,
  x: number,
  y: number,
  site?: string,
  region?: RegionId,
): number {
  const { world, s } = scene,
    cfg = CFG.mob[kind],
    r = REGIONS[region || regionAt({ x, y })],
    id = world.createAt([TAG.MOB, TAG.DAMAGEABLE], x, y),
    hp = Math.round(cfg.hp * r.hp);
  s.radius.set(id, { r: cfg.radius });
  s.health.set(id, { hp, max: hp, armor: cfg.armor });
  s.facing.set(id, { angle: Math.PI / 2 });
  s.mob.set(id, {
    kind,
    speed: cfg.speed,
    aggro: cfg.aggro,
    atkRange: cfg.atkRange,
    atkCd: cfg.atkCd,
    dmg: Math.round(cfg.dmg * r.damage),
    think: world.rng(),
    attackAnim: 0,
    hurtFlash: 0,
    home: { x, y },
    ...(site ? { site } : {}),
  });
  s.look.set(id, {
    family: kind === 'caster' ? 'caster' : 'zombie',
    scale: kind === 'lunge' ? 0.94 : 1,
    showHealth: true,
    animated: true,
  });
  s.equip.set(id, { shoes: kind === 'caster' ? 'cloth' : 'zombieBare' });
  return id;
}
