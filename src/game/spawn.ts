/** 组装一局：地图 + 玩家 + 亡者 + 场景物件。对应 goengine 的 game/ 组装层。 */
import { World, type Entity } from '../engine/ecs';
import { Level, TILE, Tile } from '../engine/level';
import { makeRng, type Vec2 } from '../engine/math';
import { createStores, TAG, type MobKind, type Stores } from './components';
import { createInventory } from './inventory';
import { CFG } from './data';

export interface Scene {
  world: World;
  s: Stores;
  level: Level;
  player: Entity;
}

function solidAt(level: Level, x: number, y: number): boolean {
  const t = level.at(Math.floor(x / TILE), Math.floor(y / TILE));
  return t === Tile.WALL || t === Tile.WATER;
}

/** 随机找一个空地，避开实体和出生点。 */
function findSpot(level: Level, rng: () => number, minFromSpawn = 0): Vec2 {
  for (let i = 0; i < 400; i++) {
    const x = (2 + rng() * (level.w - 4)) * TILE;
    const y = (2 + rng() * (level.h - 4)) * TILE;
    if (level.blocked(x, y, 12)) continue;
    if (
      minFromSpawn > 0 &&
      Math.hypot(x - level.spawn.x, y - level.spawn.y) < minFromSpawn
    )
      continue;
    return { x, y };
  }
  return { x: level.spawn.x + 200, y: level.spawn.y };
}

export function buildScene(seed = CFG.seed): Scene {
  const world = new World((seed ^ 0x5bf03635) >>> 0);
  const s = createStores(world);
  const level = new Level(CFG.map.w, CFG.map.h, seed);
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);

  const player = world.createAt(
    [TAG.PLAYER, TAG.DAMAGEABLE],
    level.spawn.x,
    level.spawn.y,
  );
  s.radius.set(player, { r: CFG.player.radius });
  s.health.set(player, {
    hp: CFG.player.hp,
    max: CFG.player.hp,
    armor: CFG.player.armor,
  });
  s.facing.set(player, { angle: Math.PI / 2 });
  s.player.set(player, {
    weapon: 'staff',
    mana: CFG.player.mana,
    maxMana: CFG.player.mana,
    atkCd: 0,
    castCd: 0,
    attackAnim: 0,
    castAnim: 0,
    hurtFlash: 0,
    invuln: 0,
    kills: 0,
    swingAngle: Math.PI / 2,
    skill: 'ember',
    cooldowns: {},
    shield: 0,
    shieldHp: 0,
    noManaCd: 0,
  });
  s.dodge.set(player, { time: 0, cd: 0, invuln: 0, dir: { x: 0, y: 1 } });
  s.look.set(player, {
    family: 'hero',
    scale: 1,
    showHealth: false,
    animated: true,
  });
  s.equip.set(player, { shoes: 'leather' });
  s.inventory.set(player, createInventory());

  // 场景物件：静态贴图 + 圆形碰撞，注册进 Level 的 blockers。
  const props: {
    sprite: string;
    w: number;
    h: number;
    r: number;
    blocks: boolean;
    count: number;
  }[] = [
    {
      sprite: 'propTree',
      w: 48,
      h: 64,
      r: 9,
      blocks: true,
      count: CFG.spawn.trees,
    },
    {
      sprite: 'propGrave',
      w: 24,
      h: 32,
      r: 7,
      blocks: true,
      count: CFG.spawn.graves,
    },
    {
      sprite: 'propCrate',
      w: 32,
      h: 32,
      r: 10,
      blocks: true,
      count: CFG.spawn.crates,
    },
    {
      sprite: 'propTorch',
      w: 16,
      h: 32,
      r: 0,
      blocks: false,
      count: CFG.spawn.torches,
    },
    { sprite: 'propRock', w: 24, h: 24, r: 8, blocks: true, count: 10 },
  ];
  for (const def of props) {
    for (let i = 0; i < def.count; i++) {
      const p = findSpot(level, rng, 120);
      if (def.blocks) level.addBlocker(p.x, p.y, def.r);
      const e = world.createAt(
        [TAG.PROP, ...(def.blocks ? [TAG.DAMAGEABLE] : [])],
        p.x,
        p.y,
      );
      s.radius.set(e, { r: def.r || 6 });
      s.prop.set(e, {
        sprite: def.sprite,
        w: def.w,
        h: def.h,
        blocks: def.blocks,
      });
      s.look.set(e, {
        family: 'prop',
        scale: 1,
        showHealth: false,
        animated: false,
        staticSprite: def.sprite,
      });
      if (def.blocks) s.health.set(e, { hp: 28, max: 28, armor: 0 });
    }
  }

  // 药剂：靠近自动拾取，演示「标签 + 事件」怎么扩玩法。
  for (let i = 0; i < CFG.spawn.pickups; i++) {
    const p = findSpot(level, rng, 90);
    const kind = rng() < 0.5 ? 'mana' : 'health';
    const e = world.createAt([TAG.PICKUP], p.x, p.y);
    s.pickup.set(e, { kind, count: 1, bob: rng() * Math.PI * 2 });
    s.look.set(e, {
      family: 'pickup',
      scale: 1,
      showHealth: false,
      animated: false,
      staticSprite: kind === 'mana' ? 'pickupMana' : 'pickupHealth',
    });
  }

  // 亡者：三种行为数据驱动。前几只刻意放在刚进视野的位置，开局就能看到追击动画。
  const kinds: MobKind[] = ['shamble', 'shamble', 'shamble', 'lunge', 'caster'];
  const addMob = (kind: MobKind, x: number, y: number): void => {
    const cfg = CFG.mob[kind];
    const e = world.createAt([TAG.MOB, TAG.DAMAGEABLE], x, y);
    s.radius.set(e, { r: cfg.radius });
    s.health.set(e, { hp: cfg.hp, max: cfg.hp, armor: cfg.armor });
    s.facing.set(e, {
      angle: Math.atan2(level.spawn.y - y, level.spawn.x - x),
    });
    s.mob.set(e, {
      kind,
      speed: cfg.speed,
      aggro: cfg.aggro,
      atkRange: cfg.atkRange,
      atkCd: cfg.atkCd,
      dmg: cfg.dmg,
      think: rng() * 1.5,
      attackAnim: 0,
      hurtFlash: 0,
      home: { x, y },
    });
    s.look.set(e, {
      family: kind === 'caster' ? 'caster' : 'zombie',
      scale: kind === 'lunge' ? 0.94 : 1,
      showHealth: true,
      animated: true,
    });
    // 行尸按腐肉色出赤脚（Go 版 spr<Rig>ShoeBare[Side] 同款），法师穿布鞋。
    s.equip.set(e, {
      shoes: kind === 'caster' || rng() < 0.45 ? 'cloth' : 'zombieBare',
    });
  };

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng() * 0.4;
    const d = 190 + rng() * 90;
    const x = level.spawn.x + Math.cos(a) * d;
    const y = level.spawn.y + Math.sin(a) * d;
    const p = solidAt(level, x, y) ? findSpot(level, rng, 150) : { x, y };
    addMob(kinds[i % kinds.length], p.x, p.y);
  }
  for (let i = 5; i < CFG.spawn.mobs; i++) {
    const p = findSpot(level, rng, 170);
    addMob(kinds[Math.floor(rng() * kinds.length)], p.x, p.y);
  }

  return { world, s, level, player };
}
