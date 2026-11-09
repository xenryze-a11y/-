/** 规则层：拾取 + 缓慢补怪，让 demo 一直有东西可打。 */
import { TILE } from '../../engine/level';
import { TAG, type MobKind } from '../components';
import { CFG } from '../data';
import type { Ctx } from './context';

let nextRespawn = 0;

export function resetRules(): void {
  nextRespawn = 0;
}

export function updateRules(ctx: Ctx): void {
  const pp = ctx.world.pos(ctx.player);
  ctx.s.pickup.forEach((e, pk) => {
    const p = ctx.world.pos(e);
    if (Math.hypot(p.x - pp.x, p.y - pp.y) > 26) return;
    const pl = ctx.s.player.get(ctx.player);
    const h = ctx.s.health.get(ctx.player);
    if (pl && pk.kind === 'mana') pl.mana = Math.min(pl.maxMana, pl.mana + pk.amount);
    if (h && pk.kind === 'health') h.hp = Math.min(h.max, h.hp + pk.amount);
    ctx.world.emit({ kind: 'pickup', entity: e, x: p.x, y: p.y, text: pk.kind === 'mana' ? '+法力' : '+生命' });
    ctx.world.destroy(e);
  });

  if (ctx.gameOver) return;
  if (ctx.world.withTag(TAG.MOB).length >= 16 || ctx.world.time < nextRespawn) return;
  nextRespawn = ctx.world.time + 2.2;
  spawnOne(ctx);
}

/** 在玩家视野外补一只，避免「怪凭空出现在脸上」。 */
function spawnOne(ctx: Ctx): void {
  const pp = ctx.world.pos(ctx.player);
  for (let i = 0; i < 60; i++) {
    const a = ctx.world.rng() * Math.PI * 2;
    const d = 380 + ctx.world.rng() * 180;
    const x = pp.x + Math.cos(a) * d;
    const y = pp.y + Math.sin(a) * d;
    if (x < TILE * 2 || y < TILE * 2 || x > ctx.level.pixelW - TILE * 2 || y > ctx.level.pixelH - TILE * 2) continue;
    if (ctx.level.blocked(x, y, 14)) continue;

    const kinds: MobKind[] = ['shamble', 'shamble', 'lunge', 'caster'];
    const kind = kinds[Math.floor(ctx.world.rng() * kinds.length)];
    const cfg = CFG.mob[kind];
    const e = ctx.world.createAt([TAG.MOB, TAG.DAMAGEABLE], x, y);
    ctx.s.radius.set(e, { r: cfg.radius });
    ctx.s.health.set(e, { hp: cfg.hp, max: cfg.hp, armor: cfg.armor });
    ctx.s.facing.set(e, { angle: a + Math.PI });
    ctx.s.mob.set(e, {
      kind, speed: cfg.speed, aggro: cfg.aggro, atkRange: cfg.atkRange, atkCd: cfg.atkCd,
      dmg: cfg.dmg, think: ctx.world.rng(), attackAnim: 0, hurtFlash: 0, home: { x, y },
    });
    ctx.s.look.set(e, {
      family: kind === 'caster' ? 'caster' : 'zombie',
      scale: kind === 'lunge' ? 0.94 : 1, showHealth: true, animated: true,
    });
    ctx.s.equip.set(e, { shoes: ctx.world.rng() < 0.5 ? 'zombieBare' : 'cloth' });
    return;
  }
}
