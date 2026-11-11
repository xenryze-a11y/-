/** 雷电法杖解锁的职业内容；法术判定和 UI 使用同一份冷却数据。 */
export type MageSkillId = 'field' | 'wave' | 'barrage';
export const MAGE_IDS: MageSkillId[] = ['field', 'wave', 'barrage'];
export const MAGE_SKILLS: Record<
  MageSkillId,
  {
    name: string;
    key: string;
    cost: number;
    cooldown: number;
    description: string;
  }
> = {
  field: {
    name: '环生电场',
    key: 'Q',
    cost: 18,
    cooldown: 9,
    description: '周身持续放电 4 秒，电场随身移动。',
  },
  wave: {
    name: '雷霆震荡',
    key: 'F',
    cost: 16,
    cooldown: 4.5,
    description: '雷电沿前方一列推进 5 段，遇墙停止。',
  },
  barrage: {
    name: '雷极天幕',
    key: 'R',
    cost: 42,
    cooldown: 18,
    description: '身后持续生成电球轰炸前方，周身另有 5 球高速环绕。',
  },
};
export const MAGE = {
  fieldLife: 4,
  fieldRadius: 84,
  fieldPeriod: 0.45,
  fieldDamage: 10,
  waveSegments: 5,
  waveSpacing: 42,
  waveStart: 38,
  wavePeriod: 0.09,
  waveRadius: 29,
  waveDamage: 26,
  barrageLife: 4.8,
  barragePeriod: 0.32,
  barrageShots: 15,
  orbSpeed: 310,
  orbLife: 1.5,
  orbDamage: 24,
  orbSplash: 52,
  orbitCount: 5,
  orbitRadius: 48,
  orbitSpeed: 14,
  orbitPeriod: 0.22,
  orbitDamage: 9,
};
export const GROVE = {
  width: 96,
  height: 72,
  oldHeight: 48,
  oldWidth: 48,
  tree: { x: 60.5 * 32, y: 18 * 32 },
  altar: { x: 60.5 * 32, y: 23 * 32 },
  staff: { x: 60.5 * 32, y: 24 * 32 },
  start: { x: 60.5 * 32, y: 25.5 * 32 },
};
