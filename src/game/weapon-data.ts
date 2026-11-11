/** 三兵器内容：握把、普攻与六项专属技能共用同一份数据。 */
import type { SkillId } from './items';
import type { MageSkillId } from './mage-data';
import { STAFF_PROFESSIONS, type StaffProfession } from './staff-data';
export type BladeId = 'scythe' | 'sabre' | 'greatsword';
export type BladeProfessionId = Exclude<BladeId, 'sabre'>;
export type CombatProfessionId = SkillId | BladeProfessionId;
export const BLADE_IDS: BladeId[] = ['scythe', 'sabre', 'greatsword'];
export function isBlade(id: string): id is BladeId {
  return BLADE_IDS.includes(id as BladeId);
}
export interface BladeDefinition {
  frame: string;
  width: number;
  height: number;
  gripX: number;
  gripY: number;
  scale: number;
  damage: number;
  range: number;
  arc: number;
  cooldown: number;
  anim: number;
}
export const BLADES: Record<BladeId, BladeDefinition> = {
  scythe: {
    frame: 'weaponScythe',
    width: 72,
    height: 96,
    gripX: 22,
    gripY: 74,
    scale: 0.85,
    damage: 28,
    range: 63,
    arc: Math.PI * 0.9,
    cooldown: 0.5,
    anim: 0.28,
  },
  sabre: {
    frame: 'weaponSabre',
    width: 40,
    height: 56,
    gripX: 13,
    gripY: 45,
    scale: 1,
    damage: 19,
    range: 48,
    arc: Math.PI * 0.65,
    cooldown: 0.26,
    anim: 0.2,
  },
  greatsword: {
    frame: 'weaponGreatsword',
    width: 48,
    height: 88,
    gripX: 24,
    gripY: 70,
    scale: 0.85,
    damage: 36,
    range: 62,
    arc: Math.PI * 0.8,
    cooldown: 0.62,
    anim: 0.32,
  },
};
export const COMBAT_PROFESSIONS: Record<CombatProfessionId, StaffProfession> = {
  ...STAFF_PROFESSIONS,
  scythe: {
    name: '魔域镰使',
    title: 'THE ABYSS REAPER',
    color: '#ac8de1',
    skills: {
      field: {
        name: '魔旋风暴',
        short: '风暴',
        key: 'Q',
        cost: 20,
        cooldown: 8,
        description: '魔能风暴随身旋转，三柄虚影镰刃持续切割周围敌人。',
      },
      wave: {
        name: '深渊魔爪',
        short: '魔爪',
        key: 'F',
        cost: 24,
        cooldown: 7.5,
        description: '前方邪阵张开，魔神巨爪从地裂中破出抓击，短暂禁锢敌人。',
      },
      barrage: {
        name: '魔域地刺',
        short: '地刺',
        key: 'R',
        cost: 42,
        cooldown: 18,
        description:
          '巨大邪阵中向上、右、下、左四向逐段召出魔刺，每根刺都有独立召唤阵。',
      },
    },
  },
  greatsword: {
    name: '流焰剑使',
    title: 'THE FLAMEBRINGER',
    color: '#ffb06b',
    skills: {
      field: {
        name: '焰火浪潮',
        short: '焰潮',
        key: 'Q',
        cost: 18,
        cooldown: 5,
        description: '挥出宽幅火焰浪潮，穿透敌群，遇墙停止并附加灼烧。',
      },
      wave: {
        name: '三叠流焰斩',
        short: '三斩',
        key: 'F',
        cost: 26,
        cooldown: 8,
        description:
          '自动完成三次重斩，交错流焰逐次爆发，第三斩范围和伤害更高。',
      },
      barrage: {
        name: '炎躯加身',
        short: '炎躯',
        key: 'R',
        cost: 30,
        cooldown: 17,
        description:
          '火焰护体六秒，持续灼烧近敌，大剑伤害提升35%，受到伤害减少20%。',
      },
    },
  },
};
export function combatIconName(
  school: CombatProfessionId,
  ability: MageSkillId,
): string {
  return school === 'storm' ? 'skill_' + ability : `skill_${school}_${ability}`;
}
export const BLADE_MAGIC = {
  maxRifts: 40,
  maxGroups: 4,
  maxWaves: 8,
  targetRange: 185,
  storm: { life: 3.6, radius: 88, period: 0.24, damage: 10, speed: 12 },
  claw: {
    radius: 55,
    windup: 0.5,
    strikeAt: 0.78,
    life: 1.65,
    damage: 54,
    freeze: 0.4,
    slow: 2,
    graspPull: 22,
  },
  spikes: {
    radius: 25,
    spacing: 36,
    segments: 4,
    windup: 0.35,
    stepDelay: 0.1,
    strikeAfter: 0.18,
    life: 0.95,
    damage: 40,
    groupLife: 3.4,
    slow: 1.4,
  },
  wave: { speed: 270, life: 1, radius: 42, damage: 30 },
  combo: {
    periods: [0.04, 0.31, 0.36],
    damage: [23, 28, 42],
    range: [78, 86, 105],
    arc: [Math.PI * 0.85, Math.PI * 0.95, Math.PI * 0.75],
    anim: 0.24,
    life: 1.05,
  },
  inferno: {
    life: 6,
    radius: 55,
    period: 0.45,
    damage: 6,
    multiplier: 1.35,
    reduction: 0.2,
  },
};
/** 可见破土帧与模拟打击时间对应，延迟阶段只画脚下魔法阵。 */
export function riftFrame(
  kind: 'claw' | 'spike',
  age: number,
  windup: number,
): number {
  const t = age - windup;
  if (t < 0) return -1;
  return kind === 'claw'
    ? t < 0.12
      ? 0
      : t < 0.24
        ? 1
        : t < 0.4
          ? 2
          : t < 0.62
            ? 3
            : t < 0.9
              ? 4
              : 5
    : t < 0.08
      ? 0
      : t < 0.18
        ? 1
        : t < 0.4
          ? 2
          : t < 0.65
            ? 3
            : 4;
}
