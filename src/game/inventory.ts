/** 背包属于模拟数据。界面只发命令，在组装层统一调用这些规则。 */
import { isBlade } from './weapon-data';
import { ARMOR_SLOTS } from './armor';
import { ITEMS, INVENTORY, isSkill, itemWeight, type ItemId } from './items';
import { SURVIVAL } from './data';
import type { Ctx } from './systems/context';

export interface ItemStack {
  id: ItemId;
  count: number;
  instance?: EquipmentInstance;
}
/** 强化、词缀和符文的逐件数据入口；现阶段保留零级空配置。 */
export interface EquipmentInstance {
  uid: string;
  upgrade: number;
  affixes: { id: string; value: number }[];
  runes: Record<string, string>;
}
export interface InventoryState {
  slots: (ItemStack | null)[];
  craft: (ItemStack | null)[];
  boots: ItemStack | null;
  armor: Record<'head' | 'chest' | 'legs', ItemStack | null>;
  cursor: ItemStack | null;
  selected: number;
  revision: number;
}
export type InventoryCommand =
  | { type: 'equip'; id: ItemId }
  | { type: 'select'; index: number }
  | { type: 'slot'; index: number; right: boolean; shift: boolean }
  | { type: 'craft' };

export function createInventory(
  mode: 'adventure' | 'trial' = 'trial',
): InventoryState {
  const slots: (ItemStack | null)[] = Array.from(
    { length: INVENTORY.slots },
    () => null,
  );
  const ids: ItemId[] = [
    'ember',
    'frost',
    'storm',
    'ward',
    'blink',
    'sword',
    'health',
    'mana',
    'basketball',
  ];
  ids.forEach(
    (id, i) => (slots[i] = { id, count: i === 6 || i === 7 ? 5 : 1 }),
  );
  slots[2] = null; // 雷电法杖在古树祭坛取得，首次获得时解锁职业。
  slots[9] = { id: 'herb', count: 8 };
  slots[10] = { id: 'crystal', count: 8 };
  slots[11] = { id: 'iron', count: 1 };
  slots[12] = { id: 'stone', count: 12 };
  slots[14] = { id: 'wood', count: 8 };
  slots[15] = { id: 'iron_head', count: 1 };
  slots[16] = { id: 'iron_chest', count: 1 };
  slots[17] = { id: 'iron_legs', count: 1 };
  slots[18] = { id: 'scythe', count: 1 };
  slots[19] = { id: 'sabre', count: 1 };
  slots[20] = { id: 'greatsword', count: 1 };
  if (mode === 'adventure') {
    slots.fill(null);
    slots[0] = { id: 'sword', count: 1 };
    slots[1] = { id: 'ember', count: 1 };
    slots[6] = { id: 'health', count: 3 };
    slots[7] = { id: 'mana', count: 3 };
    slots[9] = { id: 'wood', count: 4 };
    slots[10] = { id: 'herb', count: 2 };
    slots[11] = { id: 'rations', count: 3 };
    slots[12] = { id: 'water', count: 3 };
    slots[13] = { id: 'bandage', count: 2 };
  } else {
    slots[21] = { id: 'rations', count: 4 };
    slots[22] = { id: 'water', count: 4 };
    slots[23] = { id: 'bandage', count: 3 };
  }
  return {
    slots,
    craft: [null, null, null, null],
    boots: { id: 'leather', count: 1 },
    armor: {
      head: null,
      chest: { id: 'leather_chest', count: 1 },
      legs: { id: 'leather_legs', count: 1 },
    },
    cursor: null,
    selected: 0,
    revision: 0,
  };
}

/** 返回未放入的数量；空间不足不能静默丢失，也不能先清空地上的物品。 */
export function addItem(
  slots: (ItemStack | null)[],
  id: ItemId,
  count: number,
  instance?: EquipmentInstance,
): number {
  for (const item of slots)
    if (item?.id === id && item.count < ITEMS[id].stack) {
      const n = Math.min(count, ITEMS[id].stack - item.count);
      item.count += n;
      count -= n;
      if (!count) return 0;
    }
  for (let i = 0; i < slots.length; i++)
    if (!slots[i]) {
      const n = Math.min(count, ITEMS[id].stack);
      slots[i] = { id, count: n, ...(instance ? { instance } : {}) };
      count -= n;
      if (!count) return 0;
    }
  return count;
}
export function getSlot(inv: InventoryState, index: number): ItemStack | null {
  if (ARMOR_SLOTS[index]) return inv.armor[ARMOR_SLOTS[index].slot];
  return index === 40
    ? inv.boots
    : index >= 36 && index < 40
      ? (inv.craft[index - 36] ?? null)
      : (inv.slots[index] ?? null);
}
function setSlot(
  inv: InventoryState,
  index: number,
  item: ItemStack | null,
): void {
  if (ARMOR_SLOTS[index]) inv.armor[ARMOR_SLOTS[index].slot] = item;
  else if (index === 40) inv.boots = item;
  else if (index >= 36 && index < 40) inv.craft[index - 36] = item;
  else inv.slots[index] = item;
}
export function recipe(inv: InventoryState): ItemStack | null {
  const items = inv.craft.filter((x): x is ItemStack => !!x),
    counts: Partial<Record<ItemId, number>> = {};
  for (const item of items) counts[item.id] = (counts[item.id] || 0) + 1;
  if (items.length === 1 && counts.wood) return { id: 'planks', count: 4 };
  if (items.length === 4 && counts.planks === 4)
    return { id: 'crate', count: 1 };
  if (items.length === 2 && counts.herb === 2)
    return { id: 'health', count: 1 };
  if (items.length === 2 && counts.herb === 1 && counts.crystal === 1)
    return { id: 'mana', count: 2 };
  return null;
}
export function carriedWeight(inv: InventoryState): number {
  let total = 0;
  const add = (item: ItemStack | null): void => {
    if (item) total += itemWeight(item.id) * item.count;
  };
  inv.slots.forEach(add);
  inv.craft.forEach(add);
  add(inv.boots);
  Object.values(inv.armor).forEach(add);
  add(inv.cursor);
  return total;
}
export function notice(ctx: Ctx, text: string): void {
  const pos = ctx.world.pos(ctx.player);
  ctx.world.emit({ kind: 'notice', x: pos.x, y: pos.y, text });
}
export function selectedItem(ctx: Ctx): ItemStack | null {
  const inv = ctx.s.inventory.get(ctx.player);
  return inv?.slots[inv.selected] ?? null;
}
export function syncEquipment(ctx: Pick<Ctx, 's' | 'player'>): void {
  const inv = ctx.s.inventory.get(ctx.player),
    p = ctx.s.player.get(ctx.player),
    eq = ctx.s.equip.get(ctx.player);
  if (!inv || !p || !eq) return;
  const selected = inv.slots[inv.selected];
  if (selected && isSkill(selected.id)) {
    p.weapon = 'staff';
    p.skill = selected.id;
  } else if (selected && isBlade(selected.id)) p.weapon = selected.id;
  else if (selected?.id === 'sword') p.weapon = 'sword';
  else if (selected?.id === 'basketball') p.weapon = 'basketball';
  eq.shoes =
    inv.boots?.id === 'sanctum_boots'
      ? 'sanctum'
      : inv.boots?.id === 'iron'
        ? 'iron'
        : inv.boots?.id === 'leather'
          ? 'leather'
          : 'bare';
  for (const slot of ['head', 'chest', 'legs'] as const)
    eq[slot] = inv.armor[slot]
      ? ITEMS[inv.armor[slot]!.id].armorMat || 'none'
      : 'none';
}
export function returnCursor(ctx: Ctx): boolean {
  const inv = ctx.s.inventory.get(ctx.player)!;
  if (inv.cursor) {
    const remaining = addItem(
      inv.slots,
      inv.cursor.id,
      inv.cursor.count,
      inv.cursor.instance,
    );
    inv.revision++;
    if (remaining) {
      inv.cursor.count = remaining;
      notice(ctx, '先把手中的物品放入空格或合成区');
      return false;
    }
    inv.cursor = null;
  }
  syncEquipment(ctx);
  return true;
}
export function applyInventoryCommand(ctx: Ctx, cmd: InventoryCommand): void {
  if (ctx.gameOver) return;
  const inv = ctx.s.inventory.get(ctx.player)!;
  if (cmd.type === 'equip') {
    if (inv.cursor) {
      notice(ctx, '先放下手中的物品再快速装备');
      return;
    }
    const index = inv.slots.findIndex((item) => item?.id === cmd.id);
    if (
      index < 0 ||
      ![
        'staff',
        'scythe',
        'sabre',
        'greatsword',
        'sword',
        'basketball',
      ].includes(ITEMS[cmd.id].kind)
    )
      return;
    if (index < 9) inv.selected = index;
    else {
      const target = inv.selected;
      [inv.slots[target], inv.slots[index]] = [
        inv.slots[index],
        inv.slots[target],
      ];
    }
  } else if (cmd.type === 'select') {
    inv.selected =
      ((cmd.index % INVENTORY.hotbar) + INVENTORY.hotbar) % INVENTORY.hotbar;
  } else if (cmd.type === 'craft') {
    const output = recipe(inv);
    if (!output) return;
    if (
      inv.cursor &&
      (inv.cursor.id !== output.id ||
        inv.cursor.count + output.count > ITEMS[output.id].stack)
    ) {
      notice(ctx, '先放下手中的物品');
      return;
    }
    if (!inv.cursor) inv.cursor = { ...output };
    else inv.cursor.count += output.count;
    inv.craft = inv.craft.map((item) =>
      item && item.count > 1 ? { ...item, count: item.count - 1 } : null,
    );
  } else {
    const index = cmd.index;
    if (!Number.isInteger(index) || index < 0 || index > 44 || index === 41)
      return;
    const source = getSlot(inv, index);
    let cursor = inv.cursor;
    if (cmd.shift && source && !cursor) {
      const start = index < 9 ? 9 : 0,
        end = index < 9 ? 36 : index < 36 ? 9 : 36;
      const destination = inv.slots.slice(start, end),
        remaining = addItem(
          destination,
          source.id,
          source.count,
          source.instance,
        );
      for (let i = start; i < end; i++) inv.slots[i] = destination[i - start];
      if (remaining) source.count = remaining;
      else setSlot(inv, index, null);
    } else if (!cursor && source) {
      const count = cmd.right ? Math.ceil(source.count / 2) : source.count;
      inv.cursor = { ...source, count };
      source.count -= count;
      if (!source.count) setSlot(inv, index, null);
    } else if (cursor) {
      if (
        ARMOR_SLOTS[index] &&
        ITEMS[cursor.id].armorSlot !== ARMOR_SLOTS[index].slot
      ) {
        notice(ctx, '这个位置只能装备' + ARMOR_SLOTS[index].name);
        return;
      }
      if (index === 40 && ITEMS[cursor.id].kind !== 'boots') {
        notice(ctx, '这个位置只能装备靴子');
        return;
      }
      if (!source) {
        const count = cmd.right ? 1 : cursor.count;
        setSlot(inv, index, { ...cursor, count });
        cursor.count -= count;
      } else if (source.id === cursor.id && ITEMS[source.id].stack > 1) {
        const count = Math.min(
          cmd.right ? 1 : cursor.count,
          ITEMS[source.id].stack - source.count,
        );
        source.count += count;
        cursor.count -= count;
      } else if (!cmd.right) {
        setSlot(inv, index, cursor);
        inv.cursor = source;
        cursor = source;
      }
      if (cursor.count === 0) inv.cursor = null;
    }
  }
  inv.revision++;
  syncEquipment(ctx);
}
export function useSelected(ctx: Ctx): void {
  if (ctx.gameOver) return;
  const inv = ctx.s.inventory.get(ctx.player)!,
    item = selectedItem(ctx);
  if (!item) return;
  const player = ctx.s.player.get(ctx.player)!,
    health = ctx.s.health.get(ctx.player)!;
  if (item.id === 'health') {
    if (health.hp >= health.max) {
      notice(ctx, '生命已满');
      return;
    }
    health.hp = Math.min(health.max, health.hp + INVENTORY.healthRestore);
    notice(ctx, `生命 +${INVENTORY.healthRestore}`);
  } else if (item.id === 'mana') {
    if (player.mana >= player.maxMana) {
      notice(ctx, '法力已满');
      return;
    }
    player.mana = Math.min(player.maxMana, player.mana + INVENTORY.manaRestore);
    notice(ctx, `法力 +${INVENTORY.manaRestore}`);
  } else if (item.id === 'crate') {
    // 先在副本上试放，两种药剂都放得下才提交，避免半开箱吞材料。
    const copy = inv.slots.map((x) => (x ? { ...x } : null));
    copy[inv.selected]!.count--;
    if (!copy[inv.selected]!.count) copy[inv.selected] = null;
    if (addItem(copy, 'health', 1) || addItem(copy, 'mana', 1)) {
      notice(ctx, '背包空间不足，无法打开补给箱');
      return;
    }
    inv.slots = copy;
    inv.revision++;
    notice(ctx, '获得生命药水 ×1、法力药水 ×1');
    return;
  } else if (item.id === 'rations') {
    const sv = ctx.s.survival.get(ctx.player)!;
    if (sv.hunger >= SURVIVAL.max) {
      notice(ctx, '现在还不饿');
      return;
    }
    sv.hunger = Math.min(SURVIVAL.max, sv.hunger + SURVIVAL.food.rations);
    notice(ctx, `饱食 +${SURVIVAL.food.rations}`);
  } else if (item.id === 'water') {
    const sv = ctx.s.survival.get(ctx.player)!;
    if (sv.thirst >= SURVIVAL.max) {
      notice(ctx, '现在还不渴');
      return;
    }
    sv.thirst = Math.min(SURVIVAL.max, sv.thirst + SURVIVAL.food.water);
    notice(ctx, `水分 +${SURVIVAL.food.water}`);
  } else if (item.id === 'bandage') {
    const sv = ctx.s.survival.get(ctx.player)!;
    if (sv.bleed <= 0) {
      notice(ctx, '没有流血');
      return;
    }
    sv.bleed = 0;
    health.hp = Math.min(health.max, health.hp + SURVIVAL.food.bandageHeal);
    notice(ctx, `止血 · 生命 +${SURVIVAL.food.bandageHeal}`);
  } else if (item.id === 'herb') {
    const sv = ctx.s.survival.get(ctx.player)!;
    health.hp = Math.min(health.max, health.hp + SURVIVAL.food.herbHeal);
    if (sv.infection > 0) {
      sv.infection = 0;
      notice(ctx, `感染退去 · 生命 +${SURVIVAL.food.herbHeal}`);
    } else notice(ctx, `生命 +${SURVIVAL.food.herbHeal}`);
  } else return;
  if (--item.count === 0) inv.slots[inv.selected] = null;
  inv.revision++;
  const pos = ctx.world.pos(ctx.player);
  ctx.world.emit({
    kind: 'ring',
    x: pos.x,
    y: pos.y,
    amount: 25,
    color: ITEMS[item.id].color,
    life: 0.4,
  });
}
