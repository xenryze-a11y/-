/** 五根法杖共享三个职业键，数值与职业解锁各自独立。 */
import type { SkillId } from './items';
import { MAGE_SKILLS, type MageSkillId } from './mage-data';
export type ElementStaffId = Exclude<SkillId, 'storm'>;
export const ELEMENT_STAVES: ElementStaffId[] = [
  'ember',
  'frost',
  'ward',
  'blink',
];
export interface StaffAbility {
  name: string;
  short: string;
  key: string;
  cost: number;
  cooldown: number;
  description: string;
}
export interface StaffProfession {
  name: string;
  title: string;
  color: string;
  skills: Record<MageSkillId, StaffAbility>;
}
export const STAFF_PROFESSIONS: Record<SkillId, StaffProfession> = {
  ember: {
    name: '余烬法师',
    title: 'THE PYROMANCER',
    color: '#ffb15f',
    skills: {
      field: {
        name: '余烬护环',
        short: '火环',
        key: 'Q',
        cost: 16,
        cooldown: 8,
        description: '随身火环持续灼烧近敌，并点燃目标。',
      },
      wave: {
        name: '炎枪齐射',
        short: '炎枪',
        key: 'F',
        cost: 18,
        cooldown: 4.2,
        description: '三支穿透炎枪扇形齐射，附加灼烧。',
      },
      barrage: {
        name: '陨火天灾',
        short: '陨火',
        key: 'R',
        cost: 44,
        cooldown: 19,
        description: '九颗陨火接连坠落，爆炸后留下燃烧地面。',
      },
    },
  },
  frost: {
    name: '霜晶法师',
    title: 'THE FROSTWEAVER',
    color: '#a7e8f7',
    skills: {
      field: {
        name: '冰晶新星',
        short: '新星',
        key: 'Q',
        cost: 17,
        cooldown: 7,
        description: '冰晶向周身迸发，冻结并减速近敌。',
      },
      wave: {
        name: '极寒穿刺',
        short: '冰矛',
        key: 'F',
        cost: 16,
        cooldown: 4.3,
        description: '尖锐冰矛穿透一列敌人，命中冻结。',
      },
      barrage: {
        name: '绝冬风暴',
        short: '暴雪',
        key: 'R',
        cost: 43,
        cooldown: 19,
        description: '前方形成持续暴雪，冰晶密集落下并冻结敌人。',
      },
    },
  },
  storm: {
    name: '雷电法师',
    title: 'THE STORMCALLER',
    color: '#85e1da',
    skills: {
      field: { ...MAGE_SKILLS.field, short: '电场' },
      wave: { ...MAGE_SKILLS.wave, short: '震荡' },
      barrage: { ...MAGE_SKILLS.barrage, short: '天幕' },
    },
  },
  ward: {
    name: '星辉法师',
    title: 'THE ASTRAL WARDEN',
    color: '#d8e8a5',
    skills: {
      field: {
        name: '星辉护盾',
        short: '护盾',
        key: 'Q',
        cost: 16,
        cooldown: 9,
        description: '展开吸收伤害的护盾，星光震击近敌。',
      },
      wave: {
        name: '星轨回响',
        short: '星弹',
        key: 'F',
        cost: 18,
        cooldown: 4.8,
        description: '三枚星弹分头追踪可见敌人。',
      },
      barrage: {
        name: '星辉审判',
        short: '审判',
        key: 'R',
        cost: 42,
        cooldown: 20,
        description: '六道星光之柱轮番审判，领域内恢复生命，同时获得护盾。',
      },
    },
  },
  blink: {
    name: '虚空法师',
    title: 'THE RIFTWALKER',
    color: '#c3a4f2',
    skills: {
      field: {
        name: '相位闪烁',
        short: '闪烁',
        key: 'Q',
        cost: 14,
        cooldown: 5,
        description: '向前闪烁并短暂无敌，两端留下虚空震荡。',
      },
      wave: {
        name: '裂隙飞刃',
        short: '飞刃',
        key: 'F',
        cost: 18,
        cooldown: 5,
        description: '三道穿透飞刃出击后回旋，往返分别命中。',
      },
      barrage: {
        name: '虚空坍缩',
        short: '黑洞',
        key: 'R',
        cost: 45,
        cooldown: 21,
        description: '黑洞牵引近敌，持续撕裂后发生巨大坍缩。',
      },
    },
  },
};
export const STAFF_ARTS = {
  maxZones: 28,
  maxShots: 48,
  maxMeteors: 18,
  targetRange: 180,
  ember: {
    auraLife: 4,
    auraRadius: 76,
    auraPeriod: 0.5,
    auraDamage: 8,
    burnLife: 2.4,
    burnPeriod: 0.6,
    burnDamage: 4,
    lanceDamage: 25,
    lanceSpeed: 360,
    lancePierce: 2,
    meteorCount: 9,
    meteorPeriod: 0.3,
    meteorDelay: 0.45,
    meteorRadius: 44,
    meteorDamage: 32,
    stormRadius: 100,
    patchLife: 1.6,
    patchPeriod: 0.4,
    patchDamage: 5,
  },
  frost: {
    novaRadius: 112,
    novaDamage: 20,
    freeze: 1.2,
    slow: 3,
    spearDamage: 30,
    spearSpeed: 420,
    spearPierce: 4,
    spearFreeze: 0.65,
    stormRadius: 110,
    stormLife: 5,
    stormPeriod: 0.4,
    stormDamage: 10,
  },
  ward: {
    shieldHp: 44,
    shieldLife: 4,
    shieldRadius: 72,
    shieldDamage: 12,
    orbCount: 3,
    orbDamage: 23,
    orbSpeed: 245,
    orbLife: 2,
    orbTurn: 9,
    judgmentRadius: 105,
    judgmentLife: 4.5,
    judgmentPeriod: 0.5,
    judgmentDamage: 12,
    judgmentHeal: 2,
    judgmentShield: 50,
  },
  blink: {
    range: 140,
    invuln: 0.35,
    blinkRadius: 32,
    blinkDamage: 18,
    bladeDamage: 24,
    bladeSpeed: 360,
    bladeLife: 1.6,
    bladeReturn: 0.45,
    bladePierce: 3,
    singularityRadius: 110,
    singularityLife: 4,
    singularityPeriod: 0.4,
    singularityDamage: 7,
    pullSpeed: 80,
    collapseRadius: 125,
    collapseDamage: 70,
  },
};
export function staffIconName(staff: SkillId, ability: MageSkillId): string {
  return staff === 'storm' ? 'skill_' + ability : `skill_${staff}_${ability}`;
}
