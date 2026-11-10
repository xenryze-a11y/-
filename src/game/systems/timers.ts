/**
 * 所有计时器只在这里推进。对应 goengine 的 World.Tick(dt)。
 * 收在一处是为了杜绝「某个系统忘了写回冷却」——Go 版最常见的 bug 就是读副本改完没写回；
 * TS 里组件是对象引用，天然没这个坑，但集中推进仍然让顺序一目了然。
 *
 * ⚠️ 本系统在 applyInput 之后跑：冷却必须在攻击判定之后推进，否则同一帧能打两次。
 */
import { CFG } from '../data';
import type { Ctx } from './context';

export function tickTimers(ctx: Ctx, dt: number): void {
  ctx.world.time += dt;
  const dec = (v: number): number => Math.max(0, v - dt);

  ctx.s.player.forEach((_e, p) => {
    p.atkCd = dec(p.atkCd);
    p.castCd = dec(p.castCd);
    p.attackAnim = dec(p.attackAnim);
    p.castAnim = dec(p.castAnim);
    p.hurtFlash = dec(p.hurtFlash);
    p.invuln = dec(p.invuln);
    for (const key of Object.keys(p.cooldowns) as (keyof typeof p.cooldowns)[])
      p.cooldowns[key] = dec(p.cooldowns[key] || 0);
    p.shield = dec(p.shield);
    if (!p.shield) p.shieldHp = 0;
    p.noManaCd = dec(p.noManaCd);
    p.mana = Math.min(p.maxMana, p.mana + CFG.player.manaRegen * dt);
  });

  ctx.s.mob.forEach((_e, m) => {
    m.atkCd = dec(m.atkCd);
    m.attackAnim = dec(m.attackAnim);
    m.hurtFlash = dec(m.hurtFlash);
    m.slow = dec(m.slow || 0);
    m.frozen = dec(m.frozen || 0);
  });

  ctx.s.dodge.forEach((_e, d) => {
    d.time = dec(d.time);
    d.cd = dec(d.cd);
    d.invuln = dec(d.invuln);
  });

  ctx.s.pickup.forEach((_e, pk) => {
    pk.bob += dt * 3;
  });
}
