/**
 * 像素法术表现：地面法阵 / 空中粒子分层，所有笔触落在 2×2 世界像素网格。
 * 只消费标量事件和只读快照；粒子、关键帧时钟、随机数都不写回模拟。
 */
import { Container, Graphics } from 'pixi.js';
import type { GameEvent } from '../engine/ecs';
import { makeRng } from '../engine/math';
import type { Scene } from './spawn';
import { ITEMS, SKILL_IDS, type SkillId } from './items';
import {
  CAST_ENVELOPE,
  LEGACY_HALO,
  PIXEL_FX,
  SPELL_COLORS,
  sampleVisualTrack,
} from './spell-visuals';

interface Point {
  x: number;
  y: number;
}
interface Particle extends Point {
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  id: SkillId;
  bright: boolean;
  star: boolean;
}
interface Burst extends Point {
  id: SkillId;
  kind: 'cast' | 'impact' | 'ring';
  age: number;
  life: number;
  radius: number;
  angle: number;
  seed: number;
}
interface Bolt {
  points: Point[];
  age: number;
  life: number;
  id: SkillId;
}

const snap = (value: number): number =>
  Math.round(value / PIXEL_FX.grid) * PIXEL_FX.grid;
function block(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha = 1,
): void {
  if (alpha <= 0) return;
  const width = Math.max(PIXEL_FX.grid, snap(size));
  g.rect(snap(x) - width / 2, snap(y) - width / 2, width, width).fill({
    color,
    alpha: Math.min(1, alpha),
  });
}
/** Bresenham 方块线，不使用平滑描边或滤镜。 */
function line(
  g: Graphics,
  a: Point,
  b: Point,
  color: number,
  width = 2,
  alpha = 1,
): void {
  let x = Math.round(a.x / 2),
    y = Math.round(a.y / 2);
  const endX = Math.round(b.x / 2),
    endY = Math.round(b.y / 2);
  const dx = Math.abs(endX - x),
    dy = -Math.abs(endY - y),
    sx = x < endX ? 1 : -1,
    sy = y < endY ? 1 : -1;
  let error = dx + dy;
  for (let guard = 0; guard < 1024; guard++) {
    block(g, x * 2, y * 2, width, color, alpha);
    if (x === endX && y === endY) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}
function ellipse(
  g: Graphics,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: number,
  alpha: number,
  phase = 0,
  gaps = false,
): void {
  const steps = Math.min(112, Math.max(20, Math.ceil(Math.max(rx, ry) * 2)));
  for (let i = 0; i < steps; i++) {
    if (gaps && i % 8 > 4) continue;
    const angle = (i / steps) * Math.PI * 2 + phase;
    block(
      g,
      x + Math.cos(angle) * rx,
      y + Math.sin(angle) * ry,
      2,
      color,
      alpha,
    );
  }
}
function star(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  alpha = 1,
): void {
  line(g, { x: x - r, y }, { x: x + r, y }, color, 2, alpha);
  line(g, { x, y: y - r }, { x, y: y + r }, color, 2, alpha);
  block(g, x, y, 4, color, alpha);
}
function diamond(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  id: SkillId,
  alpha = 1,
): void {
  const p = SPELL_COLORS[id],
    points = [
      { x, y: y - r * 1.5 },
      { x: x + r, y },
      { x, y: y + r * 1.5 },
      { x: x - r, y },
      { x, y: y - r * 1.5 },
    ];
  for (let i = 1; i < points.length; i++)
    line(g, points[i - 1], points[i], i < 3 ? p.light : p.mid, 2, alpha);
  line(g, points[0], points[2], p.core, 2, alpha * 0.85);
}
function sigil(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  id: SkillId,
  phase: number,
  alpha: number,
): void {
  const p = SPELL_COLORS[id];
  ellipse(g, x, y, r, r * 0.6, p.dark, alpha * 0.9);
  ellipse(g, x, y, r - 4, (r - 4) * 0.6, p.light, alpha * 0.75);
  ellipse(g, x, y, r * 0.7, r * 0.42, p.mid, alpha * 0.6, -phase, true);
  const count = id === 'frost' ? 6 : 8;
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2,
      xx = x + Math.cos(a) * r * 0.86,
      yy = y + Math.sin(a) * r * 0.52;
    line(
      g,
      { x: xx - 2, y: yy - 2 },
      { x: xx + 2, y: yy + 2 },
      p.core,
      2,
      alpha,
    );
    if (i % 2 === 0) block(g, xx + 4, yy - 2, 2, p.light, alpha * 0.7);
    if (r > 35) {
      const b = a + Math.PI * 0.75;
      line(
        g,
        { x: x + Math.cos(a) * r * 0.58, y: y + Math.sin(a) * r * 0.35 },
        { x: x + Math.cos(b) * r * 0.58, y: y + Math.sin(b) * r * 0.35 },
        p.mid,
        2,
        alpha * 0.45,
      );
    }
  }
}
function elementOf(ev: GameEvent): SkillId {
  if (ev.element && SKILL_IDS.includes(ev.element as SkillId))
    return ev.element as SkillId;
  const value = parseInt((ev.color || ITEMS.ward.color).slice(1), 16);
  let best: SkillId = 'ward',
    distance = Infinity;
  for (const id of SKILL_IDS) {
    const c = parseInt(ITEMS[id].color.slice(1), 16),
      d =
        ((value >> 16) - (c >> 16)) ** 2 +
        (((value >> 8) & 255) - ((c >> 8) & 255)) ** 2 +
        ((value & 255) - (c & 255)) ** 2;
    if (d < distance) {
      distance = d;
      best = id;
    }
  }
  return best;
}

export class PixelSpellVfx {
  private readonly ground = new Graphics();
  private readonly air = new Graphics();
  private particles: Particle[] = [];
  private bursts: Burst[] = [];
  private bolts: Bolt[] = [];
  private readonly lastProjectiles = new Map<number, Point>();
  private seed = 1;
  private time = 0;

  constructor(airLayer: Container, groundLayer: Container) {
    groundLayer.addChild(this.ground);
    airLayer.addChild(this.air);
  }
  get stats(): {
    particles: number;
    bursts: number;
    bolts: number;
    projectiles: number;
  } {
    return {
      particles: this.particles.length,
      bursts: this.bursts.length,
      bolts: this.bolts.length,
      projectiles: this.lastProjectiles.size,
    };
  }
  clear(): void {
    this.particles = [];
    this.bursts = [];
    this.bolts = [];
    this.lastProjectiles.clear();
    this.seed = 1;
    this.time = 0;
    this.ground.clear();
    this.air.clear();
  }
  private addParticle(particle: Particle): void {
    if (this.particles.length >= PIXEL_FX.maxParticles) this.particles.shift();
    this.particles.push(particle);
  }
  private spray(
    x: number,
    y: number,
    id: SkillId,
    count: number,
    power: number,
    angle?: number,
  ): void {
    const rng = makeRng(this.seed++);
    for (let i = 0; i < count; i++) {
      const a =
          angle === undefined
            ? rng() * Math.PI * 2
            : angle + (rng() - 0.5) * 1.1,
        speed = power * (0.35 + rng() * 0.65);
      this.addParticle({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.7 - (id === 'ember' ? 15 : 0),
        age: 0,
        life: 0.25 + rng() * 0.55,
        size: rng() < 0.7 ? 2 : 4,
        id,
        bright: i % 3 === 0,
        star: i % 9 === 0,
      });
    }
  }
  consume(event: GameEvent): void {
    if (event.kind === 'ring') {
      const id = elementOf(event),
        radius = event.amount || 24;
      this.addBurst({
        x: event.x,
        y: event.y,
        id,
        kind: 'ring',
        radius,
        life: event.life || 0.6,
        age: 0,
        angle: 0,
        seed: this.seed++,
      });
      if (radius > 40)
        this.spray(
          event.x,
          event.y - 8,
          id,
          id === 'frost' ? 40 : 20,
          radius * 1.1,
        );
    } else if (event.kind === 'bolt') {
      const id = elementOf(event),
        end = { x: event.x2 ?? event.x, y: event.y2 ?? event.y },
        length = Math.hypot(end.x - event.x, end.y - event.y),
        count = Math.max(2, Math.ceil(length / 9)),
        rng = makeRng(this.seed++),
        points = [{ x: event.x, y: event.y }];
      for (let i = 1; i < count; i++) {
        const t = i / count;
        points.push({
          x: event.x + (end.x - event.x) * t + (rng() - 0.5) * 16,
          y: event.y + (end.y - event.y) * t + (rng() - 0.5) * 16,
        });
      }
      points.push(end);
      if (this.bolts.length >= PIXEL_FX.maxBolts) this.bolts.shift();
      this.bolts.push({ points, age: 0, life: event.life || 0.22, id });
      this.spray(end.x, end.y, id, 8, 45);
    } else if (event.kind === 'spell') {
      const id = elementOf(event),
        kind = event.stage === 'impact' ? 'impact' : 'cast';
      this.addBurst({
        x: event.x,
        y: event.y,
        id,
        kind,
        radius: event.amount || (event.special ? 34 : 22),
        life: kind === 'cast' ? 0.58 : 0.48,
        age: 0,
        angle: event.angle || 0,
        seed: this.seed++,
      });
      this.spray(
        event.x + (kind === 'cast' ? Math.cos(event.angle || 0) * 15 : 0),
        event.y - 12,
        id,
        kind === 'cast' ? (event.special ? 20 : 7) : 18,
        kind === 'cast' ? 28 : 70,
        kind === 'cast' ? event.angle : undefined,
      );
    }
  }
  private addBurst(burst: Burst): void {
    if (this.bursts.length >= PIXEL_FX.maxBursts) this.bursts.shift();
    this.bursts.push(burst);
  }

  sync(scene: Scene, dt: number): void {
    this.time += dt;
    this.ground.clear();
    this.air.clear();
    this.trails(scene, dt);
    for (const particle of this.particles) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const drag = Math.exp(-2 * dt);
      particle.vx *= drag;
      particle.vy *= drag;
      if (particle.id === 'ember') particle.vy -= 18 * dt;
      const alpha = Math.max(0, 1 - particle.age / particle.life),
        p = SPELL_COLORS[particle.id];
      if (particle.star && alpha > 0.6)
        star(this.air, particle.x, particle.y, 3, p.core, alpha);
      else {
        block(
          this.air,
          particle.x,
          particle.y,
          particle.size + 2,
          p.dark,
          alpha * 0.6,
        );
        block(
          this.air,
          particle.x,
          particle.y,
          particle.size,
          particle.bright ? p.core : p.light,
          alpha,
        );
      }
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const burst of this.bursts) {
      burst.age += dt;
      this.drawBurst(burst);
    }
    this.bursts = this.bursts.filter((b) => b.age < b.life);
    for (const bolt of this.bolts) {
      bolt.age += dt;
      const alpha = Math.max(0, 1 - bolt.age / bolt.life),
        p = SPELL_COLORS[bolt.id];
      for (let i = 1; i < bolt.points.length; i++) {
        const a = bolt.points[i - 1],
          b = bolt.points[i];
        line(this.air, a, b, p.dark, 6, alpha * 0.8);
        line(this.air, a, b, p.mid, 4, alpha);
        line(this.air, a, b, p.core, 2, alpha);
        if (i % 4 === 2) {
          const end = { x: b.x + 8, y: b.y + 12 };
          line(this.air, b, end, p.light, 2, alpha * 0.7);
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.age < b.life);
    this.statusEffects(scene);
  }
  private trails(scene: Scene, dt: number): void {
    const seen = new Set<number>();
    scene.s.projectile.forEach((id, projectile) => {
      if (scene.world.isPendingDeath(id) || projectile.barrage) return;
      const element = projectile.element || 'blink',
        at = scene.world.pos(id),
        pos = { x: at.x, y: at.y - 12 },
        last = this.lastProjectiles.get(id) || pos;
      seen.add(id);
      const distance = Math.hypot(pos.x - last.x, pos.y - last.y),
        steps = Math.min(8, Math.floor(distance / PIXEL_FX.trailSpacing)),
        rng = makeRng(id * 31 + Math.floor(this.time * 15));
      for (let i = 0; i < steps; i++) {
        const t = i / Math.max(1, steps);
        this.addParticle({
          x: last.x + (pos.x - last.x) * t + (rng() - 0.5) * 4,
          y: last.y + (pos.y - last.y) * t + (rng() - 0.5) * 4,
          vx: -projectile.vx * 0.035,
          vy: -projectile.vy * 0.035 - (element === 'ember' ? 10 : 0),
          age: 0,
          life: element === 'blink' ? 0.45 : 0.25,
          size: element === 'frost' ? 2 : 4,
          id: element,
          bright: i % 3 === 0,
          star: element === 'blink' && i % 3 === 0,
        });
      }
      if (!steps && dt > 0 && Math.floor(this.time * 15) % 2 === 0)
        block(this.air, pos.x, pos.y, 4, SPELL_COLORS[element].core, 0.6);
      this.lastProjectiles.set(id, pos);
    });
    for (const id of this.lastProjectiles.keys())
      if (!seen.has(id)) this.lastProjectiles.delete(id);
  }
  private drawBurst(b: Burst): void {
    const progress = Math.min(1, b.age / b.life),
      phase = Math.floor(this.time * PIXEL_FX.fps) / PIXEL_FX.fps,
      p = SPELL_COLORS[b.id];
    if (b.kind === 'cast') {
      const sample = sampleVisualTrack(CAST_ENVELOPE, progress * 26),
        r = b.radius * sample.scale;
      sigil(this.ground, b.x, b.y, r, b.id, phase * 0.6, sample.alpha * 0.65);
      const x = b.x + Math.cos(b.angle) * 15,
        y = b.y + Math.sin(b.angle) * 9 - 15;
      if (b.id === 'frost')
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + phase;
          diamond(
            this.air,
            x + Math.cos(a) * r * 0.4,
            y + Math.sin(a) * r * 0.4,
            3,
            b.id,
            sample.alpha,
          );
        }
      else if (b.id === 'ward') {
        star(this.air, x, y, 7, p.core, sample.alpha);
        ellipse(this.air, x, y, 12, 12, p.light, sample.alpha);
      } else if (b.id === 'blink') {
        for (let i = 0; i < 16; i++) {
          const a = -Math.PI * 0.6 + (i / 15) * Math.PI * 1.25;
          block(
            this.air,
            x + Math.cos(a) * 12,
            y + Math.sin(a) * 12,
            2,
            p.light,
            sample.alpha,
          );
        }
        star(this.air, x, y, 4, p.core, sample.alpha);
      } else if (b.id === 'storm')
        for (let i = 0; i < 4; i++) {
          const a = phase * 2 + (i * Math.PI) / 2;
          star(
            this.air,
            x + Math.cos(a) * 11,
            y + Math.sin(a) * 11,
            3,
            p.core,
            sample.alpha,
          );
        }
      else {
        diamond(this.air, x, y, 6, b.id, sample.alpha);
        star(this.air, x, y, 4, p.core, sample.alpha);
      }
    } else if (b.kind === 'ring') {
      const sample = sampleVisualTrack(LEGACY_HALO, progress * 25),
        r = b.radius * (0.22 + progress * 0.78);
      ellipse(this.ground, b.x, b.y, r, r * 0.62, p.dark, sample.alpha * 0.8);
      ellipse(
        this.ground,
        b.x,
        b.y,
        r - 3,
        (r - 3) * 0.62,
        p.light,
        sample.alpha,
      );
      if (b.id === 'frost') {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          diamond(
            this.air,
            b.x + Math.cos(a) * r,
            b.y + Math.sin(a) * r * 0.62 - 4,
            3 + Math.sin(progress * Math.PI) * 3,
            b.id,
            sample.alpha,
          );
        }
      } else if (b.id === 'blink') {
        sigil(this.ground, b.x, b.y, r * 0.8, b.id, -phase, sample.alpha * 0.7);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + phase;
          star(
            this.air,
            b.x + Math.cos(a) * r * 0.8,
            b.y + Math.sin(a) * r * 0.4 - 8,
            3,
            p.core,
            sample.alpha,
          );
        }
      } else if (b.id === 'ember') {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          line(
            this.air,
            {
              x: b.x + Math.cos(a) * r * 0.5,
              y: b.y + Math.sin(a) * r * 0.3 - 8,
            },
            {
              x: b.x + Math.cos(a) * r * 0.9,
              y: b.y + Math.sin(a) * r * 0.6 - 14,
            },
            p.mid,
            4,
            sample.alpha,
          );
        }
      } else
        sigil(
          this.ground,
          b.x,
          b.y,
          r * 0.8,
          b.id,
          phase * 0.5,
          sample.alpha * 0.65,
        );
    } else {
      const alpha = 1 - progress,
        r = 5 + progress * 20;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + b.seed;
        line(
          this.air,
          {
            x: b.x + Math.cos(a) * r * 0.4,
            y: b.y - 12 + Math.sin(a) * r * 0.4,
          },
          { x: b.x + Math.cos(a) * r, y: b.y - 12 + Math.sin(a) * r },
          p.light,
          2,
          alpha,
        );
      }
      if (progress < 0.3) star(this.air, b.x, b.y - 12, 8, p.core, alpha);
      if (b.id === 'frost' || b.id === 'blink')
        diamond(
          this.air,
          b.x,
          b.y - 12,
          Math.max(2, 7 - progress * 5),
          b.id,
          alpha,
        );
    }
  }
  private statusEffects(scene: Scene): void {
    const phase = Math.floor(this.time * 15) / 15;
    scene.s.field.forEach((id, field) => {
      const pos = scene.world.pos(id),
        pulse = sampleVisualTrack(LEGACY_HALO, (phase * 30) % 26);
      sigil(this.ground, pos.x, pos.y, field.r, 'storm', phase * 0.25, 0.34);
      ellipse(
        this.ground,
        pos.x,
        pos.y,
        field.r * pulse.scale,
        field.r * 0.6 * pulse.scale,
        SPELL_COLORS.storm.light,
        pulse.alpha * 0.45,
      );
      for (let i = 0; i < 5; i++) {
        const a = phase + (i / 5) * Math.PI * 2;
        star(
          this.air,
          pos.x + Math.cos(a) * field.r * 0.65,
          pos.y + Math.sin(a) * field.r * 0.4 - 20,
          3,
          SPELL_COLORS.storm.core,
          0.55,
        );
      }
    });
    const player = scene.s.player.get(scene.player)!,
      pos = scene.world.pos(scene.player);
    if (player.shield > 0) {
      const p = SPELL_COLORS.ward,
        alpha = 0.55 + Math.sin(phase * 3) * 0.12;
      ellipse(this.air, pos.x, pos.y - 14, 25, 33, p.dark, alpha);
      ellipse(this.air, pos.x, pos.y - 14, 23, 31, p.light, alpha * 0.8);
      sigil(this.ground, pos.x, pos.y, 26, 'ward', phase * 0.5, 0.55);
      for (let i = 0; i < 6; i++) {
        const a = phase * 0.7 + (i / 6) * Math.PI * 2;
        star(
          this.air,
          pos.x + Math.cos(a) * 24,
          pos.y - 14 + Math.sin(a) * 32,
          3,
          p.core,
          alpha,
        );
      }
    }
    scene.s.mob.forEach((id, m) => {
      const at = scene.world.pos(id);
      if ((m.windup || 0) > 0)
        ellipse(
          this.ground,
          at.x,
          at.y,
          17,
          9,
          m.kind === 'caster' ? 0xbca2e3 : 0xd69870,
          0.8,
          0,
          true,
        );
      if ((m.frozen || 0) > 0) {
        const p = SPELL_COLORS.frost;
        const points = [
          { x: at.x - 12, y: at.y + 2 },
          { x: at.x - 16, y: at.y - 20 },
          { x: at.x - 6, y: at.y - 35 },
          { x: at.x + 10, y: at.y - 32 },
          { x: at.x + 16, y: at.y - 13 },
          { x: at.x + 10, y: at.y + 3 },
          { x: at.x - 12, y: at.y + 2 },
        ];
        for (let i = 1; i < points.length; i++)
          line(
            this.air,
            points[i - 1],
            points[i],
            i % 2 ? p.light : p.mid,
            2,
            0.6,
          );
        diamond(this.air, at.x + 11, at.y - 24, 4, 'frost', 0.7);
        ellipse(this.ground, at.x, at.y, 18, 9, p.mid, 0.7);
      }
    });
  }
}
