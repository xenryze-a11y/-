/** 装备槽、材质、套装加成与像素配色统一配置。新增套装不需要修改骨架。 */
import type { Equip } from './components';
export type ArmorMat = 'none' | 'leather' | 'iron' | 'sanctum';
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
};
export const ARMOR_MATS = Object.keys(ARMOR_COLORS) as ArmorMat[];
export const ARMOR_SLOTS: Record<number, { slot: ArmorSlot; name: string }> = {
  42: { slot: 'head', name: '头盔' },
  43: { slot: 'chest', name: '胸甲' },
  44: { slot: 'legs', name: '护腿' },
};
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
