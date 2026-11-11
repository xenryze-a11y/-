/** 共用 Q/F/R 输入入口；只读查询不触发解锁或修改组件。 */
import { isSkill } from '../items';
import type { MageSkillId } from '../mage-data';
import type { ProfessionState } from '../components';
import type { CombatProfessionId } from '../weapon-data';
import { selectedItem } from '../inventory';
import { castMage } from './mage';
import { castElementArt } from './staff-arts';
import { castBladeAbility } from './blades';
import type { Ctx } from './context';
export function selectedProfession(ctx: Ctx): CombatProfessionId | null {
  const item = selectedItem(ctx);
  return item &&
    (isSkill(item.id) || item.id === 'scythe' || item.id === 'greatsword')
    ? item.id
    : null;
}
export function professionState(
  ctx: Ctx,
  school: CombatProfessionId,
): ProfessionState {
  if (school === 'scythe' || school === 'greatsword')
    return ctx.s.blade.get(ctx.player)!.schools[school];
  const mage = ctx.s.mage.get(ctx.player)!;
  return school === 'storm' ? mage : mage.schools[school];
}
export function castStaffAbility(ctx: Ctx, ability: MageSkillId): void {
  const school = selectedProfession(ctx);
  if (!school) return;
  if (school === 'scythe' || school === 'greatsword')
    castBladeAbility(ctx, school, ability);
  else if (school === 'storm') castMage(ctx, ability);
  else castElementArt(ctx, school, ability);
}
