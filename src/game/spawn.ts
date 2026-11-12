/** 组装一局：地图 + 玩家 + 亡者 + 场景物件。对应 goengine 的 game/ 组装层。 */
import { World, type Entity } from '../engine/ecs';
import { Level, TILE, Tile } from '../engine/level';
import { makeRng, type Vec2 } from '../engine/math';
import { createStores, TAG, type MobKind, type Stores } from './components';
import { createInventory } from './inventory';
import { groveClearance } from './grove';
import {
  createWorldLevel,
  siteLocations,
  type SiteLocation,
} from './world-layout';
import { roadClearance } from './world-data';
import { initializeExploration } from './exploration-world';
import { SANCTUARY, NPCS } from './sanctuary-data';
import { GROVE } from './mage-data';
import { spawnDrop } from './systems/loot';
import { CFG } from './data';
import {
  createProgress,
  ensureEquipmentInstances,
  type AdventureProgress,
  type RunMode,
} from './adventure';
import { syncEquipment } from './inventory';

export interface Scene {
  world: World;
  s: Stores;
  level: Level;
  player: Entity;
  progress: AdventureProgress;
}

function solidAt(level: Level, x: number, y: number): boolean {
  const t = level.at(Math.floor(x / TILE), Math.floor(y / TILE));
  return t === Tile.WALL || t === Tile.WATER;
}

/** 随机找一个空地，避开实体和出生点。 */
function findSpot(
  level: Level,
  rng: () => number,
  minFromSpawn = 0,
  sites: SiteLocation[] = [],
): Vec2 {
  for (let i = 0; i < 400; i++) {
    const x = (2 + rng() * (level.w - 4)) * TILE;
    const y = (2 + rng() * (level.h - 4)) * TILE;
    if (
      level.blocked(x, y, 12) ||
      groveClearance(x, y) ||
      roadClearance(x, y) ||
      sites.some((s) => Math.hypot(s.position.x - x, s.position.y - y) < 110)
    )
      continue;
    if (
      minFromSpawn > 0 &&
      Math.hypot(x - level.spawn.x, y - level.spawn.y) < minFromSpawn
    )
      continue;
    return { x, y };
  }
  return { x: level.spawn.x + 200, y: level.spawn.y };
}

export function buildScene(
  seed = CFG.seed,
  mode: RunMode = 'trial',
  name = '灰烬旅人',
): Scene {
  const world = new World((seed ^ 0x5bf03635) >>> 0);
  const s = createStores(world);
  const level = createWorldLevel(seed);
  const sites = siteLocations(level, seed);
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
  s.equip.set(player, {
    shoes: 'leather',
    head: 'none',
    chest: 'leather',
    legs: 'leather',
  });
  s.journal.set(player, {
    stage: 'unmet',
    killsAtStart: 0,
    talking: 0,
    level: 1,
    xp: 0,
  });
  s.inventory.set(player, createInventory(mode));
  s.blade.set(player, {
    schools: {
      scythe: { unlocked: true, cooldowns: { field: 0, wave: 0, barrage: 0 } },
      greatsword: {
        unlocked: true,
        cooldowns: { field: 0, wave: 0, barrage: 0 },
      },
    },
    waveLeft: 0,
    waveSwingLeft: 0,
    waveSwingIndex: 0,
    waveTick: 0,
    waveAngle: 0,
    waveMultiplier: 1,
    stormLeft: 0,
    stormTick: 0,
    stormAngle: 0,
    infernoLeft: 0,
    infernoVitality: false,
    infernoTick: 0,
    comboLeft: 0,
    comboTick: 0,
    comboPhase: 0,
    comboAngle: 0,
    comboMultiplier: 1,
  });
  s.mage.set(player, {
    schools: {
      ember: { unlocked: true, cooldowns: { field: 0, wave: 0, barrage: 0 } },
      frost: { unlocked: true, cooldowns: { field: 0, wave: 0, barrage: 0 } },
      ward: { unlocked: true, cooldowns: { field: 0, wave: 0, barrage: 0 } },
      blink: { unlocked: true, cooldowns: { field: 0, wave: 0, barrage: 0 } },
    },
    unlocked: false,
    cooldowns: { field: 0, wave: 0, barrage: 0 },
    fieldLeft: 0,
    fieldTick: 0,
    barrageLeft: 0,
    barrageTick: 0,
    barragePhase: 0,
    orbitTick: 0,
    orbitPhase: 0,
  });

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
      w: 96,
      h: 128,
      r: 14,
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
      const p = findSpot(level, rng, 120, sites);
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

  // 固定地标不参与破坏，树根碰撞只占实体底部。
  for (const def of [
    { sprite: 'propAncientTree', pos: GROVE.tree, w: 320, h: 352, r: 30 },
    { sprite: 'propAltar', pos: GROVE.altar, w: 128, h: 96, r: 18 },
  ]) {
    const id = world.createAt([TAG.PROP], def.pos.x, def.pos.y);
    s.prop.set(id, { sprite: def.sprite, w: def.w, h: def.h, blocks: true });
    s.radius.set(id, { r: def.r });
    level.addBlocker(def.pos.x, def.pos.y, def.r);
    s.look.set(id, {
      family: 'prop',
      scale: 1,
      showHealth: false,
      animated: false,
      staticSprite: def.sprite,
    });
  }
  // 教堂家具是独立地面实体，屋面只遮挡显示，不能代替真正的墙与座椅碰撞。
  const furniture = (
    sprite: string,
    x: number,
    y: number,
    w: number,
    h: number,
    r = 0,
  ) => {
    const id = world.createAt([TAG.PROP], x, y);
    s.prop.set(id, { sprite, w, h, blocks: r > 0 });
    if (r) {
      s.radius.set(id, { r });
      level.addBlocker(x, y, r);
    }
    s.look.set(id, {
      family: 'prop',
      scale: 1,
      animated: false,
      showHealth: false,
      staticSprite: sprite,
    });
  };
  for (const y of [39.5, 42.5, 45.5, 48.5])
    for (const x of [56.5, 64.5]) {
      furniture('propChurchPew', x * TILE, y * TILE, 88, 44, 20);
      level.addBlocker(x * TILE - 25, y * TILE, 13);
      level.addBlocker(x * TILE + 25, y * TILE, 13);
    }
  for (const y of [38.5, 42.5, 46.5, 50.5])
    for (const x of [54.5, 66.5])
      furniture('propChurchColumn', x * TILE, y * TILE, 40, 104, 12);
  for (const y of [36.5, 53])
    for (const x of [56.5, 64.5])
      furniture('propChurchCandles', x * TILE, y * TILE, 32, 48);
  furniture(
    'propChurchAltar',
    SANCTUARY.altar.x,
    SANCTUARY.altar.y,
    112,
    72,
    22,
  );
  for (const kind of ['herald', 'priest'] as const) {
    const at = SANCTUARY[kind],
      id = world.createAt([TAG.NPC], at.x, at.y);
    s.npc.set(id, { kind });
    s.look.set(id, {
      family: 'npc',
      scale: 1,
      animated: false,
      showHealth: false,
      staticSprite: NPCS[kind].sprite,
    });
    s.radius.set(id, { r: 10 });
    level.addBlocker(at.x, at.y, 10);
  }
  const staff = spawnDrop(
    { world, s },
    GROVE.staff.x,
    GROVE.staff.y,
    'storm',
    1,
  );
  s.pickup.get(staff)!.ignoreUntil = 0;

  // 药剂：靠近自动拾取，演示「标签 + 事件」怎么扩玩法。
  for (let i = 0; i < CFG.spawn.pickups; i++) {
    const p = findSpot(level, rng, 90, sites);
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
    const p =
      solidAt(level, x, y) ||
      level.blocked(x, y, 12) ||
      sites.some((s) => Math.hypot(s.position.x - x, s.position.y - y) < 100)
        ? findSpot(level, rng, 150, sites)
        : { x, y };
    addMob(kinds[i % kinds.length], p.x, p.y);
  }
  for (let i = 5; i < CFG.spawn.mobs; i++) {
    const p = findSpot(level, rng, 170, sites);
    addMob(kinds[Math.floor(rng() * kinds.length)], p.x, p.y);
  }

  for (const [dx, dy] of [
    [-160, 200],
    [150, 180],
    [220, 40],
  ]) {
    const x = GROVE.altar.x + dx,
      y = GROVE.altar.y + dy;
    if (!level.blocked(x, y, 12)) addMob('shamble', x, y);
  }
  const scene = {
    world,
    s,
    level,
    player,
    progress: createProgress(seed, mode, name),
  };
  if (mode === 'adventure') {
    for (const school of Object.values(s.mage.get(player)!.schools))
      school.unlocked = false;
    s.mage.get(player)!.schools.ember.unlocked = true;
    for (const school of Object.values(s.blade.get(player)!.schools))
      school.unlocked = false;
  }
  initializeExploration(scene);
  syncEquipment(scene);
  ensureEquipmentInstances(scene);
  return scene;
}
