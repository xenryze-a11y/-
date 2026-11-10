/** 共用目标距离场绕墙，分离推力仍先全算完，再统一写位置。 */
import { angle, norm, dist, type Vec2 } from '../../engine/math';
import { TILE, type Level } from '../../engine/level';
import { TAG } from '../components';
import { CFG } from '../data';
import { applyDamage, spawnProjectile } from './combat';
import type { Ctx } from './context';

interface Field {
  distances: Int16Array;
  tx: number;
  ty: number;
  time: number;
  revision: number;
}
const fields = new WeakMap<Level, Field>();
function pathField(ctx: Ctx): Int16Array {
  const l = ctx.level,
    pos = ctx.world.pos(ctx.player),
    tx = Math.floor(pos.x / TILE),
    ty = Math.floor(pos.y / TILE),
    old = fields.get(l);
  if (
    old &&
    old.tx === tx &&
    old.ty === ty &&
    old.revision === l.revision &&
    ctx.world.time - old.time < 0.8
  )
    return old.distances;
  const distances = new Int16Array(l.w * l.h);
  distances.fill(-1);
  const queue = [ty * l.w + tx];
  distances[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head],
      x = cell % l.w,
      y = Math.floor(cell / l.w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 1 || yy < 1 || xx >= l.w - 1 || yy >= l.h - 1) continue;
      const next = yy * l.w + xx;
      if (distances[next] >= 0 || l.blocked(xx * TILE + 16, yy * TILE + 16, 9))
        continue;
      distances[next] = distances[cell] + 1;
      queue.push(next);
    }
  }
  fields.set(l, {
    distances,
    tx,
    ty,
    time: ctx.world.time,
    revision: l.revision,
  });
  return distances;
}
export function updateAI(ctx: Ctx, dt: number): void {
  if (ctx.gameOver) return;
  const ids = ctx.world.withTag(TAG.MOB),
    player = ctx.world.pos(ctx.player),
    l = ctx.level,
    field = pathField(ctx),
    sep = new Map<number, Vec2>();
  for (let i = 0; i < ids.length; i++) {
    if (ctx.world.isPendingDeath(ids[i])) continue;
    const a = ctx.world.pos(ids[i]);
    for (let j = i + 1; j < ids.length; j++) {
      if (ctx.world.isPendingDeath(ids[j])) continue;
      const b = ctx.world.pos(ids[j]),
        dx = a.x - b.x,
        dy = a.y - b.y,
        d = Math.hypot(dx, dy);
      if (d < 0.001 || d >= 23) continue;
      const push = (23 - d) * 1.9,
        sa = sep.get(ids[i]) || { x: 0, y: 0 },
        sb = sep.get(ids[j]) || { x: 0, y: 0 };
      sep.set(ids[i], { x: sa.x + (dx / d) * push, y: sa.y + (dy / d) * push });
      sep.set(ids[j], { x: sb.x - (dx / d) * push, y: sb.y - (dy / d) * push });
    }
  }
  for (const id of ids) {
    if (ctx.world.isPendingDeath(id)) continue;
    const m = ctx.s.mob.get(id)!,
      pos = ctx.world.pos(id),
      f = ctx.s.facing.get(id)!;
    if ((m.frozen || 0) > 0) continue;
    const distance = dist(pos, player),
      direct = norm({ x: player.x - pos.x, y: player.y - pos.y }),
      visible = l.lineClear(pos, player),
      active = distance < m.aggro * 1.65;
    let direction: Vec2 = { x: 0, y: 0 },
      speed = m.speed * ((m.slow || 0) > 0 ? 0.43 : 1);
    if ((m.windup || 0) > 0) {
      m.windup! -= dt;
      speed *= 0.15;
      if (m.windup! <= 0) {
        if (m.kind === 'caster') {
          if (visible)
            spawnProjectile(
              ctx,
              id,
              angle(direct),
              'shadow',
              190,
              m.dmg,
              false,
            );
        } else if (distance < 44 && visible)
          applyDamage(ctx, ctx.player, m.dmg, id, direct);
        m.atkCd = CFG.mob[m.kind].atkCd;
        m.attackAnim = 0.25;
      }
    } else if (active) {
      f.angle = angle(direct);
      if (m.kind === 'caster' && visible)
        direction =
          distance < 125
            ? { x: -direct.x, y: -direct.y }
            : distance > 190
              ? direct
              : { x: 0, y: 0 };
      else if (distance > 27) {
        if (visible) direction = direct;
        else {
          const x = Math.floor(pos.x / TILE),
            y = Math.floor(pos.y / TILE);
          let best = Infinity,
            target: Vec2 | null = null;
          for (const [dx, dy] of [
            [0, 0],
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= l.w || yy >= l.h) continue;
            const value = field[yy * l.w + xx],
              point = { x: xx * TILE + 16, y: yy * TILE + 16 };
            if (
              value < 0 ||
              l.blocked(point.x, point.y, 9) ||
              !l.lineClear(pos, point)
            )
              continue;
            const score = value * 40 + dist(pos, point);
            if (score < best) {
              best = score;
              target = point;
            }
          }
          if (target)
            direction = norm({ x: target.x - pos.x, y: target.y - pos.y });
        }
      }
      if (m.kind === 'lunge' && distance > 65 && distance < 210 && visible) {
        m.charge = (m.charge || 0) + dt;
        if (m.charge % 2.2 > 1.75) speed *= 2.1;
      }
      if (
        m.atkCd <= 0 &&
        visible &&
        distance < (m.kind === 'caster' ? 210 : 40)
      ) {
        m.windup = m.kind === 'caster' ? 0.55 : 0.3;
        m.attackAnim = m.windup;
      }
    } else if (dist(pos, m.home) > 20) {
      direction = norm({ x: m.home.x - pos.x, y: m.home.y - pos.y });
      speed *= 0.35;
    }
    const push = sep.get(id);
    ctx.world.setPos(
      id,
      l.move(
        pos,
        (direction.x * speed + (push?.x || 0)) * dt,
        (direction.y * speed + (push?.y || 0)) * dt,
        10,
      ),
    );
  }
}
