/** 内容表：道具与技能数值统一在这里，系统不认识 DOM / Pixi。 */
export type SkillId = 'ember' | 'frost' | 'storm' | 'ward' | 'blink';
export type AbilityId = SkillId | 'basketball';
export type ArmorItemId =
  | `${'iron' | 'leather' | 'sanctum'}_${'head' | 'chest' | 'legs'}`
  | 'sanctum_boots'
  | 'fur_chest';
export type ItemId =
  | 'scythe'
  | 'sabre'
  | 'greatsword'
  | ArmorItemId
  | SkillId
  | 'basketball'
  | 'sword'
  | 'health'
  | 'mana'
  | 'wood'
  | 'planks'
  | 'stone'
  | 'crystal'
  | 'herb'
  | 'crate'
  | 'leather'
  | 'iron'
  | 'rations'
  | 'water'
  | 'bandage';
export interface ItemDefinition {
  name: string;
  kind:
    | 'scythe'
    | 'sabre'
    | 'greatsword'
    | 'staff'
    | 'basketball'
    | 'sword'
    | 'potion'
    | 'material'
    | 'supply'
    | 'boots'
    | 'armor'
    | 'food'
    | 'drink'
    | 'medical';
  armorSlot?: 'head' | 'chest' | 'legs';
  armorMat?: 'leather' | 'iron' | 'sanctum' | 'fur';
  stack: number;
  color: string;
  desc: string;
}
export interface SkillDefinition {
  name: string;
  cost: number;
  cd: number;
  baseCost: number;
  baseCd: number;
}
export const SKILL_IDS: SkillId[] = [
  'ember',
  'frost',
  'storm',
  'ward',
  'blink',
];
export function isSkill(id: ItemId): id is SkillId {
  return SKILL_IDS.includes(id as SkillId);
}
export function isAbility(id: ItemId): id is AbilityId {
  return id === 'basketball' || isSkill(id);
}
export const BASKETBALL = {
  count: 5,
  maxActive: 15,
  seekRange: 430,
  radius: 6,
  life: 2.8,
  windup: 0.18,
  speed: 235,
  splashRadius: 45,
  damage: 22,
};
export const BASKETBALL_SKILL: SkillDefinition = {
  name: '坤影突袭',
  cost: 18,
  cd: 2.4,
  baseCost: 18,
  baseCd: 2.4,
};
export const INVENTORY = {
  slots: 36,
  hotbar: 9,
  healthRestore: 40,
  manaRestore: 45,
  ironReduction: 2,
  pickupRange: 27,
  dropDelay: 1.5,
};
export const MAGIC = {
  projectileRadius: 5,
  projectileLife: 1.5,
  projectileSpeed: 320,
  frostSpeed: 350,
  blinkSpeed: 430,
  damage: 30,
  frostDamage: 24,
  blinkDamage: 28,
  pierce: 2,
  frostSlow: 2.6,
  fireRadius: 46,
  fireSplash: 15,
  volleySpread: 0.24,
  frostRadius: 125,
  frostNovaDamage: 31,
  freeze: 1.1,
  novaSlow: 3,
  chainRange: 250,
  chainJump: 100,
  chainCount: 3,
  chainDamage: 27,
  chainFalloff: 4,
  stormRadius: 90,
  stormLife: 3.2,
  stormPeriod: 0.55,
  stormDamage: 12,
  stormRange: 160,
  shieldLife: 4,
  shieldHp: 44,
  shieldRadius: 70,
  shieldDamage: 16,
  blinkRange: 140,
  blinkInvuln: 0.25,
};
const ARMOR_ITEMS = {} as Record<ArmorItemId, ItemDefinition>;
for (const mat of ['leather', 'iron', 'sanctum'] as const)
  for (const slot of ['head', 'chest', 'legs'] as const) {
    const name =
      { leather: '皮革', iron: '铁甲', sanctum: '晨曦' }[mat] +
      { head: '头盔', chest: '胸甲', legs: '护腿' }[slot];
    ARMOR_ITEMS[`${mat}_${slot}`] = {
      name,
      kind: 'armor',
      stack: 1,
      color:
        mat === 'sanctum' ? '#e4d49a' : mat === 'iron' ? '#c0cbd1' : '#bd946b',
      armorSlot: slot,
      armorMat: mat,
      desc: `放入${{ head: '头盔', chest: '胸甲', legs: '护腿' }[slot]}装备格，四方向与动作同步。`,
    };
  }
ARMOR_ITEMS.sanctum_boots = {
  name: '晨曦圣靴',
  kind: 'boots',
  stack: 1,
  color: '#e4d49a',
  desc: '晨曦套装的靴子；四件齐全时每秒额外恢复 2 法力。',
};
ARMOR_ITEMS.fur_chest = {
  name: '毛皮斗篷',
  kind: 'armor',
  stack: 1,
  color: '#b08f68',
  armorSlot: 'chest',
  armorMat: 'fur',
  desc: '厚毛皮斗篷，几乎不减伤，但能把舒适温度压到零下。冬夜外出的唯一解。',
};
export const ITEMS: Record<ItemId, ItemDefinition> = {
  ...ARMOR_ITEMS,
  scythe: {
    name: '魔域镰刀',
    kind: 'scythe',
    stack: 1,
    color: '#b097df',
    desc: '异瞳镰刃与深海邪纹。\nQ 魔旋风暴 · F 深渊魔爪 · R 魔域地刺。',
  },
  sabre: {
    name: '月弧弯刃',
    kind: 'sabre',
    stack: 1,
    color: '#c1ded4',
    desc: '轻盈的弯曲长刃，快速近战连击。\n没有主动技能，普攻不消耗法力。',
  },
  greatsword: {
    name: '烬皇火焰大剑',
    kind: 'greatsword',
    stack: 1,
    color: '#ffb06b',
    desc: '重刃内流淌炽热熔焰。\nQ 焰火浪潮 · F 三叠流焰斩 · R 炎躯加身。',
  },
  ember: {
    name: '余烬法杖',
    kind: 'staff',
    stack: 1,
    color: '#f3a361',
    desc: '普攻：爆裂火球\nQ 余烬护环 · F 炎枪齐射 · R 陨火天灾。',
  },
  frost: {
    name: '霜晶法杖',
    kind: 'staff',
    stack: 1,
    color: '#91dce4',
    desc: '普攻：寒冰箭\nQ 冰晶新星 · F 极寒穿刺 · R 绝冬风暴。',
  },
  storm: {
    name: '雷电法杖',
    kind: 'staff',
    stack: 1,
    color: '#85e1da',
    desc: '普攻：连锁闪电\n获得后解锁雷电法师；装备时使用 Q / F / R 三职业技能。',
  },
  ward: {
    name: '星辉法杖',
    kind: 'staff',
    stack: 1,
    color: '#a2e3bd',
    desc: '普攻：奥术弹\nQ 星辉护盾 · F 星轨回响 · R 星辉审判。',
  },
  blink: {
    name: '虚空法杖',
    kind: 'staff',
    stack: 1,
    color: '#baa5f2',
    desc: '普攻：穿刺秘矢\nQ 相位闪烁 · F 裂隙飞刃 · R 虚空坍缩。',
  },
  basketball: {
    name: '坤影篮球',
    kind: 'basketball',
    stack: 1,
    color: '#ffb063',
    desc: '左键 / 右键：召唤 5 个小坤影\n短暂起舞后追击敌人，命中爆出坤字。',
  },
  sword: {
    name: '守望者长剑',
    kind: 'sword',
    stack: 1,
    color: '#e1d5ae',
    desc: '普攻：弧形斩击 · 特殊技：旋风斩\n近战攻击需要视线，不会隔墙命中。',
  },
  health: {
    name: '生命药水',
    kind: 'potion',
    stack: 64,
    color: '#ed8d87',
    desc: '使用恢复 40 点生命，满生命时不会消耗。',
  },
  mana: {
    name: '法力药水',
    kind: 'potion',
    stack: 64,
    color: '#88baff',
    desc: '使用恢复 45 点法力，满法力时不会消耗。',
  },
  wood: {
    name: '古木',
    kind: 'material',
    stack: 64,
    color: '#be9466',
    desc: '砍伐树木、木箱获得。可合成木板。',
  },
  planks: {
    name: '木板',
    kind: 'material',
    stack: 64,
    color: '#cfac7b',
    desc: '一块古木合成四块木板；四块木板合成补给箱。',
  },
  stone: {
    name: '苔石',
    kind: 'material',
    stack: 64,
    color: '#a1aaa3',
    desc: '击碎岩石、墓碑获得的建造材料。',
  },
  crystal: {
    name: '魔晶碎片',
    kind: 'material',
    stack: 64,
    color: '#bc9be5',
    desc: '击败怪物获得。与月露草合成法力药水。',
  },
  herb: {
    name: '月露草',
    kind: 'material',
    stack: 64,
    color: '#a4c887',
    desc: '击败怪物获得；两株合成生命药水。',
  },
  crate: {
    name: '补给箱',
    kind: 'supply',
    stack: 64,
    color: '#c8aa76',
    desc: '使用可获得 1 瓶生命药水和 1 瓶法力药水。',
  },
  leather: {
    name: '皮革长靴',
    kind: 'boots',
    stack: 1,
    color: '#bd946b',
    desc: '放入靴子装备格可穿戴。',
  },
  iron: {
    name: '铁甲战靴',
    kind: 'boots',
    stack: 1,
    color: '#c0cbd1',
    desc: '装备后受到的伤害降低 2 点。',
  },
  rations: {
    name: '干粮',
    kind: 'food',
    stack: 16,
    color: '#c9a06a',
    desc: '使用恢复 45 点饱食。放久不易腐坏，是远行的基础。',
  },
  water: {
    name: '清水',
    kind: 'drink',
    stack: 16,
    color: '#8fc4d8',
    desc: '使用恢复 50 点水分。比药水更重的补给。',
  },
  bandage: {
    name: '绷带',
    kind: 'medical',
    stack: 16,
    color: '#ddd3bd',
    desc: '使用止住流血并恢复 8 点生命。',
  },
};

/** 未列出的物品按这个重量计。 */
export const DEFAULT_ITEM_WEIGHT = 0.3;
/**
 * 单件重量，负重按堆叠数量累计（见 SURVIVAL 与 inventory.carriedWeight）。
 * 单独列表而不是塞进 ItemDefinition：重量是生存机制的规则数据，改它不该顺手改物品内容。
 */
export const ITEM_WEIGHT: Partial<Record<ItemId, number>> = {
  wood: 0.12,
  planks: 0.12,
  stone: 0.18,
  crystal: 0.04,
  herb: 0.02,
  leather: 1.2,
  iron: 1.8,
  health: 0.08,
  mana: 0.08,
  crate: 0.4,
  rations: 0.2,
  water: 0.25,
  bandage: 0.04,
  basketball: 1,
  sword: 3,
  ember: 2,
  frost: 2,
  storm: 2,
  ward: 2,
  blink: 2,
  scythe: 4,
  sabre: 2.5,
  greatsword: 5,
  leather_head: 2,
  leather_chest: 2.4,
  leather_legs: 2.2,
  iron_head: 3,
  iron_chest: 3.6,
  iron_legs: 3.2,
  sanctum_head: 2.2,
  sanctum_chest: 2.6,
  sanctum_legs: 2.4,
  sanctum_boots: 1,
  fur_chest: 2.8,
};
export function itemWeight(id: ItemId): number {
  return ITEM_WEIGHT[id] ?? DEFAULT_ITEM_WEIGHT;
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
  ember: { name: '三重炎矢', cost: 24, cd: 1.3, baseCost: 9, baseCd: 0.36 },
  frost: { name: '冰霜新星', cost: 26, cd: 4.5, baseCost: 8, baseCd: 0.42 },
  storm: { name: '雷暴领域', cost: 32, cd: 5.5, baseCost: 12, baseCd: 0.65 },
  ward: { name: '星辉护盾', cost: 25, cd: 7, baseCost: 7, baseCd: 0.36 },
  blink: { name: '相位闪烁', cost: 18, cd: 2.8, baseCost: 10, baseCd: 0.4 },
};

export const ABILITIES: Record<AbilityId, SkillDefinition> = {
  ...SKILLS,
  basketball: BASKETBALL_SKILL,
};
