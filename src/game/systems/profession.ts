/** 三个职业输入入口；读取 UI 状态的函数不触发解锁或写组件。 */
import type { SkillId } from '../items';
import { isSkill } from '../items';
import type { MageSkillId } from '../mage-data';
import type { ProfessionState } from '../components';
import { selectedItem } from '../inventory';
import { castMage } from './mage';
import { castElementArt } from './staff-arts';
import type { Ctx } from './context';
export function selectedProfession(ctx: Ctx): SkillId | null {
  const item = selectedItem(ctx);
  return item && isSkill(item.id) ? item.id : null;
}
export function professionState(ctx: Ctx, school: SkillId): ProfessionState {
  const mage = ctx.s.mage.get(ctx.player)!;
  return school === 'storm' ? mage : mage.schools[school];
}
export function castStaffAbility(ctx: Ctx, ability: MageSkillId): void {
  const school = selectedProfession(ctx);
  if (!school) return;
  if (school === 'storm') castMage(ctx, ability);
  else castElementArt(ctx, school, ability);
}
