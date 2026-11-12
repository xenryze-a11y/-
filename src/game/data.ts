/**
 * 内容 = 数据。对应 goengine 的「内容改 JSON，规则改代码」（AGENTS.md）。
 * demo 阶段先收在一个文件里；要外置就整体搬成 public/data/config.json，
 * 用 fetch 读进来覆盖 CFG 即可，系统代码不用动。
 */
import { WORLD } from './world-data';
import type { FxAnim } from '../engine/animation';
import { TILE } from '../engine/level';
import type { MobKind, ShoeMat } from './components';

/** 鞋子是独立贴图，按「材质 × 视角」出图（Go 版 sprShoe<Mat>[Side] 同款）。 */
export const SHOE_MATERIALS: ShoeMat[] = [
  'bare',
  'cloth',
  'leather',
  'iron',
  'zombieBare',
  'sanctum',
];
/** 玩家能换的四种；zombieBare 是亡者按腐肉色出的赤脚，不给玩家穿。 */
export const PLAYER_SHOES: ShoeMat[] = ['bare', 'cloth', 'leather', 'iron'];
export const SHOE_LABEL: Record<ShoeMat, string> = {
  bare: '赤脚',
  cloth: '布鞋',
  leather: '皮靴',
  iron: '铁靴',
  zombieBare: '腐足',
  sanctum: '圣靴',
};

export const CFG = {
  seed: 20261109,
  map: { w: WORLD.width, h: WORLD.height, tile: TILE },

  player: {
    hp: 120,
    mana: 100,
    radius: 10,
    speed: 120,
    /** 施法瞬间减速，让动作有重量。 */
    castSlow: 0.72,
    manaRegen: 9,
    armor: 1,
    hurtInvuln: 0.35,
  },

  sword: {
    range: 62,
    arc: 2.2619, // ≈130°，与 Go 版 MeleeArc 一致
    dmg: 34,
    cd: 0.34,
    animDur: 0.22,
    /** 右键旋风斩：整圈、范围略大、冷却更长。 */
    whirlArc: Math.PI * 2,
    whirlDmg: 40,
    whirlCd: 1.2,
    whirlRange: 68,
  },

  staff: {
    manaCost: 16,
    cd: 0.42,
    animDur: 0.24,
    projectileSpeed: 330,
    projectileDmg: 30,
    splashRadius: 46,
    splashDmg: 16,
    /** 右键三连发，扇形展开。 */
    volleyCount: 3,
    volleySpread: 0.32,
    volleyCost: 34,
    volleyCd: 0.95,
  },

  dodge: {
    cd: 1.1,
    dur: 0.22,
    speed: 330,
    invuln: 0.3,
  },

  mob: {
    shamble: {
      hp: 55,
      speed: 43,
      aggro: 250,
      atkRange: 16,
      atkCd: 1.1,
      dmg: 9,
      armor: 0,
      radius: 10,
    },
    lunge: {
      hp: 46,
      speed: 64,
      aggro: 300,
      atkRange: 15,
      atkCd: 1.3,
      dmg: 13,
      armor: 0,
      radius: 10,
    },
    caster: {
      hp: 42,
      speed: 38,
      aggro: 340,
      atkRange: 210,
      atkCd: 2.0,
      dmg: 8,
      armor: 1,
      radius: 10,
    },
  } satisfies Record<
    MobKind,
    {
      hp: number;
      speed: number;
      aggro: number;
      atkRange: number;
      atkCd: number;
      dmg: number;
      armor: number;
      radius: number;
    }
  >,

  spawn: {
    mobs: 34,
    trees: 44,
    graves: 18,
    crates: 10,
    torches: 10,
    pickups: 10,
  },

  camera: { zoom: 1.65, touchZoom: 1.45 },

  /** 屏幕上一屏能看到的世界像素宽，用来定 HUD 与刷怪半径。 */
  view: { w: 0, h: 0 },
};

/** 序列帧只给特效用；走路是相位，不进这张表。 */
export const FX_ANIMS: Record<string, FxAnim> = {
  slash: {
    frames: ['slash_000', 'slash_001', 'slash_002', 'slash_003', 'slash_004'],
    fps: 20,
    loop: false,
    scale: 1,
  },
  impact: {
    frames: [
      'impact_000',
      'impact_001',
      'impact_002',
      'impact_003',
      'impact_004',
      'impact_005',
    ],
    fps: 18,
    loop: false,
    scale: 1,
  },
  fireball: {
    frames: ['fireball_000', 'fireball_001', 'fireball_002', 'fireball_003'],
    fps: 12,
    loop: true,
    scale: 1,
  },
  shadow: {
    frames: ['shadow_000', 'shadow_001', 'shadow_002', 'shadow_003'],
    fps: 12,
    loop: true,
    scale: 1,
  },
  spark: {
    frames: ['spark_000', 'spark_001', 'spark_002', 'spark_003'],
    fps: 18,
    loop: false,
    scale: 1,
  },
  blood: {
    frames: ['blood_000', 'blood_001', 'blood_002'],
    fps: 14,
    loop: false,
    scale: 1,
  },
};

export const PALETTE = {
  outline: '#241b18',
  grass: '#4c6b3c',
  grassDark: '#3a5430',
  grassLight: '#617f47',
  dirt: '#7a6244',
  stone: '#8a8a80',
  wood: '#6b4a30',
  woodDark: '#4a3220',
  water: '#2f5670',
  linen: '#c9b89a',
  leather: '#7a5436',
  leatherDark: '#523723',
  iron: '#9aa3aa',
  ironDark: '#5d666e',
  robe: '#3f4c86',
  robeDark: '#2b3560',
  gold: '#d9b45a',
  skin: '#d8ac86',
  skinDark: '#a97c5c',
  hair: '#4a3428',
  zombieSkin: '#8ba377',
  zombieSkinDark: '#5f7650',
  zombieRag: '#5c5548',
  casterRobe: '#4b3566',
  casterGlow: '#a46bd8',
  fire: '#ff9a3c',
  fireHot: '#ffe4a0',
  shadow: '#7a55b8',
  blood: '#8d2a2a',
};
