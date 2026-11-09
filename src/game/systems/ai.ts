/**
 * 亡者 AI：索敌 → 追击/保持距离 → 分离 → 近身攻击。
 * 对应 goengine 的 engine/sim/ai.go，三种 behavior 由 data.ts 数值驱动。
 * 分离必须两段式（先算完所有推力，再统一 setPos），否则遍历中改空间索引会漏怪。
 */
import { angle, norm, type Vec2 } from '../../engine/math';
import { TAG } from '../components';
import { CFG } from '../data';
import { applyDamage, spawnProjectile } from './combat';
import type { Ctx } from './context';

export function updateAI(ctx: Ctx, dt: number): void {
  if (ctx.gameOver) return;
  const mobs = ctx.world.withTag(TAG.MOB);
  const pp = ctx.world.pos(ctx.player);

  // 第一段：只算分离力，不动位置。
  const sep = new Map<number, Vec2>();
  for (let i = 0; i < mobs.length; i++) {
    const a = ctx.world.pos(mobs[i]);
    for (let j = i + 1; j < mobs.length; j++) {
      const b = ctx.world.pos(mobs[j]);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.001 || d > 26) continue;
      const push = (26 - d) / 26;
      const ux = dx / d * push;
      const uy = dy / d * push;
      const sa = sep.get(mobs[i]) ?? { x: 0, y: 0 };
      const sb = sep.get(mobs[j]) ?? { x: 0, y: 0 };
      sep.set(mobs[i], { x: sa.x + ux, y: sa.y + uy });
      sep.set(mobs[j], { x: sb.x - ux, y: sb.y - uy });
    }
  }

  // 第二段：统一写位置。
  for (const e of mobs) {
    // 同一模拟步里刚被打死的怪还在 alive 集合里（删除统一在 flush），别让它再动一下。
    if (ctx.world.isPendingDeath(e)) continue;
    const m = ctx.s.mob.get(e);
    const f = ctx.s.facing.get(e);
    if (!m || !f) continue;
    const p = ctx.world.pos(e);
    const r = ctx.s.radius.get(e)?.r ?? 10;
    const toPlayer = { x: pp.x - p.x, y: pp.y - p.y };
    const d = Math.hypot(toPlayer.x, toPlayer.y);
    const dir = norm(toPlayer);
    m.think -= dt;

    let speed = m.speed;
    let moveDir: Vec2 = { x: 0, y: 0 };
    const aggroed = d <= m.aggro * 1.6;

    if (m.kind === 'caster' && aggroed) {
      // 亡灵法师：太近后退、太远靠近、射程内站定放暗影弹。
      if (d < 130) moveDir = { x: -dir.x, y: -dir.y };
      else if (d > 200) moveDir = dir;
      if (d < m.atkRange && m.atkCd <= 0 && ctx.level.lineClear(p, pp)) {
        spawnProjectile(ctx, e, angle(dir), 'shadow', 190, m.dmg, false);
        m.atkCd = CFG.mob.caster.atkCd;
        m.attackAnim = 0.24;
        ctx.world.emit({ kind: 'cast', entity: e, x: p.x, y: p.y, angle: angle(dir) });
      }
    } else if (aggroed) {
      moveDir = dir;
      if (m.kind === 'lunge') {
        // think 末尾 0.28 秒冲刺，其余时间慢行（Go 版 dart 行为同款节奏）。
        if (m.think > 0 && m.think < 0.28 && d < m.aggro) speed *= 2.3;
      }
    } else {
      // 脱战回出生点附近晃，别整张地图一起涌过来。
      const home = norm({ x: m.home.x - p.x, y: m.home.y - p.y });
      if (Math.hypot(m.home.x - p.x, m.home.y - p.y) > 40) moveDir = home;
      speed *= 0.35;
    }
    if (m.think <= 0) m.think = m.kind === 'lunge' ? 1.7 : 1.2;

    const push = sep.get(e);
    const vx = moveDir.x * speed + (push?.x ?? 0) * 55;
    const vy = moveDir.y * speed + (push?.y ?? 0) * 55;
    const next = ctx.level.move(p, vx * dt, vy * dt, r);
    ctx.world.setPos(e, next);
    f.angle = aggroed ? angle(dir) : f.angle;

    // 近身攻击：体表外再延伸 atkRange，不是圆心重叠才打。
    const pr = ctx.s.radius.get(ctx.player)?.r ?? 10;
    if (m.kind !== 'caster' && d <= r + pr + m.atkRange && m.atkCd <= 0) {
      applyDamage(ctx, ctx.player, m.dmg, e);
      m.atkCd = CFG.mob[m.kind].atkCd;
      m.attackAnim = 0.22;
    }
  }
}
