/** 装备槽、材质、保暖 / 耐热、套装加成与像素配色统一配置。新增套装不需要修改骨架。 */
import type { Equip, ShoeMat } from './components';

export type ArmorMat = 'none' | 'leather' | 'iron' | 'sanctum' | 'fur';
export type ArmorSlot = 'head' | 'chest' | 'legs';
export interface ArmorPalette {
  dark: string;
  mid: string;
  light: string;
  trim: string;
}
export const ARMOR_COLORS: Record<ArmorMat, ArmorPalette> = {
  none: { dark: '#2e4250', mid: '#48697b', light: '#6d8c91', trim: '#c4ac75' },
  leather: {
    dark: '#493c32',
    mid: '#866247',
    light: '#ad875c',
    trim: '#cab487',
  },
  iron: { dark: '#495e65', mid: '#899b9c', light: '#c4d0c6', trim: '#d4bd81' },
  sanctum: {
    dark: '#526c68',
    mid: '#adbda1',
    light: '#f0e8c4',
    trim: '#ccad5d',
  },
  fur: {
    dark: '#3b2f28',
    mid: '#7a5f45',
    light: '#b08f68',
    trim: '#d8c39a',
  },
};
export const ARMOR_MATS = Object.keys(ARMOR_COLORS) as ArmorMat[];
export const ARMOR_SLOTS: Record<number, { slot: ArmorSlot; name: string }> = {
  42: { slot: 'head', name: '头盔' },
  43: { slot: 'chest', name: '胸甲' },
  44: { slot: 'legs', name: '护腿' },
};

/** 保暖 / 耐热是衣物的第二组属性，与减伤无关。 */
export interface Thermal {
  insulation: number;
  cooling: number;
}
export const ARMOR_THERMAL: Record<ArmorMat, Thermal> = {
  none: { insulation: 0, cooling: 0 },
  leather: { insulation: 4, cooling: 0.5 },
  iron: { insulation: 0.5, cooling: 1 },
  sanctum: { insulation: 2.5, cooling: 2 },
  // 毛皮几乎不减伤，但能把舒适区间压到零下，是冬夜外出的唯一解。
  fur: { insulation: 7, cooling: 0 },
};
export const SHOE_THERMAL: Record<ShoeMat, Thermal> = {
  bare: { insulation: 0, cooling: 0 },
  cloth: { insulation: 0.5, cooling: 0 },
  leather: { insulation: 1, cooling: 0.5 },
  iron: { insulation: 0.5, cooling: 1 },
  zombieBare: { insulation: 0, cooling: 0 },
  sanctum: { insulation: 1.5, cooling: 1.5 },
};

export function clothingInsulation(eq: Equip | undefined): number {
  if (!eq) return 0;
  let value = SHOE_THERMAL[eq.shoes].insulation;
  for (const slot of ['head', 'chest', 'legs'] as ArmorSlot[])
    value += ARMOR_THERMAL[eq[slot] ?? 'none'].insulation;
  return value;
}
export function clothingCooling(eq: Equip | undefined): number {
  if (!eq) return 0;
  let value = SHOE_THERMAL[eq.shoes].cooling;
  for (const slot of ['head', 'chest', 'legs'] as ArmorSlot[])
    value += ARMOR_THERMAL[eq[slot] ?? 'none'].cooling;
  return value;
}

/** 舒适温度区间：环境气温落在区间内，抗寒与暑热都回到安全值。 */
export const COMFORT = {
  baseMin: 5,
  perInsulation: 1.2,
  baseMax: 25,
  perCooling: 2,
} as const;
export function comfortMin(eq: Equip | undefined): number {
  return COMFORT.baseMin - clothingInsulation(eq) * COMFORT.perInsulation;
}
export function comfortMax(eq: Equip | undefined): number {
  return COMFORT.baseMax + clothingCooling(eq) * COMFORT.perCooling;
}

export function armorReduction(eq: Equip | undefined): number {
  if (!eq) return 0;
  let value = eq.shoes === 'iron' || eq.shoes === 'sanctum' ? 2 : 0;
  for (const slot of ['head', 'chest', 'legs'] as ArmorSlot[])
    if (eq[slot] === 'iron' || eq[slot] === 'sanctum')
      value += slot === 'chest' ? 2 : 1;
  return value;
}
export function fullSet(eq: Equip | undefined): ArmorMat | null {
  if (!eq) return null;
  const mat = eq.head;
  if (
    mat &&
    mat !== 'none' &&
    eq.chest === mat &&
    eq.legs === mat &&
    eq.shoes === mat
  )
    return mat;
  return null;
}
export const ARMOR_SET_MANA_REGEN = 2;
