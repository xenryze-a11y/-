import { TAG } from '../components';
import type { ItemId } from '../items';
import { INVENTORY } from '../items';
import { selectedItem } from '../inventory';
import type { Ctx } from './context';

export function spawnDrop(
  ctx: Pick<Ctx, 'world' | 's'>,
  x: number,
  y: number,
  kind: ItemId,
  count = 1,
  delay = 0,
): number {
  const id = ctx.world.createAt([TAG.PICKUP], x, y);
  ctx.s.pickup.set(id, {
    kind,
    count,
    bob: ctx.world.rng() * Math.PI * 2,
    ignoreUntil: ctx.world.time + delay,
  });
  ctx.s.look.set(id, {
    family: 'pickup',
    scale: 1,
    showHealth: false,
    animated: false,
    staticSprite: 'item_' + kind,
  });
  return id;
}
export function dropSelected(ctx: Ctx): void {
  if (ctx.gameOver) return;
  const item = selectedItem(ctx);
  if (!item) return;
  const inv = ctx.s.inventory.get(ctx.player)!,
    pos = ctx.world.pos(ctx.player),
    angle = ctx.s.facing.get(ctx.player)!.angle;
  let end = { ...pos };
  for (let distance = 4; distance <= 44; distance += 4) {
    const point = {
      x: pos.x + Math.cos(angle) * distance,
      y: pos.y + Math.sin(angle) * distance,
    };
    if (ctx.level.blocked(point.x, point.y, 4)) break;
    end = point;
  }
  spawnDrop(ctx, end.x, end.y, item.id, 1, INVENTORY.dropDelay);
  if (--item.count === 0) inv.slots[inv.selected] = null;
  inv.revision++;
}
