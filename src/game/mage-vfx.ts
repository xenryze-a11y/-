/** 电场没有球；大招才显示五个高速环绕球，发射球是独立投射物。 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { TextureAtlas } from '../engine/atlas';
import type { GameEvent } from '../engine/ecs';
import { makeRng } from '../engine/math';
import { MAGE } from './mage-data';
import type { Scene } from './spawn';
interface Burst {
  x: number;
  y: number;
  age: number;
  life: number;
  kind: string;
  seed: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  bright: boolean;
}
const C = { dark: 0x173d46, mid: 0x298b98, light: 0x78e9df, core: 0xe1fff1 };
function dot(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha = 1,
): void {
  if (alpha <= 0) return;
  g.rect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, size, size).fill({
    color,
    alpha,
  });
}
function line(
  g: Graphics,
  x: number,
  y: number,
  xx: number,
  yy: number,
  color: number,
  alpha = 1,
  width = 2,
): void {
  const count = Math.max(1, Math.ceil(Math.hypot(xx - x, yy - y) / 2));
  for (let i = 0; i <= count; i++)
    dot(
      g,
      x + ((xx - x) * i) / count,
      y + ((yy - y) * i) / count,
      width,
      color,
      alpha,
    );
}
function ring(
  g: Graphics,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: number,
  alpha: number,
  phase = 0,
): void {
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2 + phase;
    dot(g, x + Math.cos(a) * rx, y + Math.sin(a) * ry, 2, color, alpha);
  }
}
function zap(
  g: Graphics,
  x: number,
  y: number,
  xx: number,
  yy: number,
  seed: number,
  alpha = 1,
): void {
  const rng = makeRng(seed),
    points = [{ x, y }],
    count = Math.max(3, Math.ceil(Math.hypot(xx - x, yy - y) / 12));
  for (let i = 1; i < count; i++) {
    const t = i / count;
    points.push({
      x: x + (xx - x) * t + (rng() - 0.5) * 11,
      y: y + (yy - y) * t + (rng() - 0.5) * 11,
    });
  }
  points.push({ x: xx, y: yy });
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    line(g, a.x, a.y, b.x, b.y, C.mid, alpha * 0.55, 4);
    line(g, a.x, a.y, b.x, b.y, C.core, alpha);
  }
}
export class MageVfx {
  private readonly ground = new Graphics();
  private readonly air = new Graphics();
  private readonly orbiters: Sprite[] = [];
  private bursts: Burst[] = [];
  private particles: Particle[] = [];
  private readonly lastOrbs = new Map<number, { x: number; y: number }>();
  private time = 0;
  private seed = 1;
  constructor(
    groundLayer: Container,
    airLayer: Container,
    private readonly atlas: TextureAtlas,
  ) {
    groundLayer.addChild(this.ground);
    airLayer.addChild(this.air);
    for (let i = 0; i < MAGE.orbitCount; i++) {
      const sprite = new Sprite(atlas.get('electricOrb_0'));
      sprite.anchor.set(0.5);
      sprite.scale.set(0.52);
      sprite.visible = false;
      airLayer.addChild(sprite);
      this.orbiters.push(sprite);
    }
  }
  get stats() {
    return {
      bursts: this.bursts.length,
      particles: this.particles.length,
      orbiters: this.orbiters.filter((s) => s.visible).length,
    };
  }
  consume(event: GameEvent): void {
    if (event.kind !== 'mage') return;
    const kind =
      event.ability === 'wave'
        ? event.stage === 'impact'
          ? 'wave'
          : 'start'
        : event.ability === 'field'
          ? 'field'
          : event.stage === 'impact'
            ? 'blast'
            : event.amount === 1
              ? 'spawn'
              : 'ultimate';
    if (this.bursts.length >= 48) this.bursts.shift();
    this.bursts.push({
      x: event.x,
      y: event.y,
      kind,
      age: 0,
      life: kind === 'wave' ? 0.46 : kind === 'blast' ? 0.62 : 0.35,
      seed: this.seed++,
    });
    if (kind === 'blast' || kind === 'wave') {
      const rng = makeRng(this.seed++);
      for (let i = 0; i < (kind === 'blast' ? 26 : 12); i++) {
        const a = rng() * Math.PI * 2,
          speed = 25 + rng() * 85;
        this.addParticle({
          x: event.x,
          y: event.y - 12,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed * 0.7,
          age: 0,
          life: 0.25 + rng() * 0.4,
          bright: i % 3 === 0,
        });
      }
    }
  }
  private addParticle(p: Particle): void {
    if (this.particles.length >= 256) this.particles.shift();
    this.particles.push(p);
  }
  sync(scene: Scene, dt: number): void {
    this.time += dt;
    this.ground.clear();
    this.air.clear();
    const mage = scene.s.mage.get(scene.player)!,
      at = scene.world.pos(scene.player),
      phase = Math.floor(this.time * 15);
    if (mage.fieldLeft > 0) {
      const radius = MAGE.fieldRadius,
        alpha = Math.min(1, mage.fieldLeft * 2),
        rng = makeRng(phase * 43 + 9);
      ring(this.ground, at.x, at.y, radius, radius * 0.65, C.mid, 0.8 * alpha);
      ring(
        this.ground,
        at.x,
        at.y,
        radius - 7,
        (radius - 7) * 0.65,
        C.light,
        0.5 * alpha,
      );
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + phase * 0.03,
          b = a + 0.18,
          rr = radius * (0.6 + rng() * 0.4);
        zap(
          this.ground,
          at.x + Math.cos(a) * rr,
          at.y + Math.sin(a) * rr * 0.65,
          at.x + Math.cos(b) * radius,
          at.y + Math.sin(b) * radius * 0.65,
          phase * 67 + i,
          alpha * 0.6,
        );
        if (i % 3 === 0)
          zap(
            this.air,
            at.x + Math.cos(a) * (radius - 12),
            at.y + Math.sin(a) * (radius - 12) * 0.65,
            at.x + Math.cos(a) * radius,
            at.y + Math.sin(a) * radius * 0.65 - 18,
            phase + i,
            alpha * 0.75,
          );
      }
      for (let i = 0; i < 4; i++) {
        const a = phase * 0.13 + (i * Math.PI) / 2;
        zap(
          this.ground,
          at.x + Math.cos(a) * 12,
          at.y + Math.sin(a) * 9,
          at.x + Math.cos(a) * radius * 0.7,
          at.y + Math.sin(a) * radius * 0.45,
          phase * 13 + i,
          0.28 * alpha,
        );
      }
    }
    for (let i = 0; i < this.orbiters.length; i++) {
      const sprite = this.orbiters[i];
      sprite.visible = mage.barrageLeft > 0;
      if (!sprite.visible) continue;
      const angle = mage.orbitPhase + (i / MAGE.orbitCount) * Math.PI * 2;
      sprite.texture = this.atlas.get('electricOrb_' + (phase % 8));
      sprite.position.set(
        at.x + Math.cos(angle) * MAGE.orbitRadius,
        at.y - 15 + Math.sin(angle) * MAGE.orbitRadius,
      );
      for (let k = 1; k <= 5; k++) {
        const a = angle - k * 0.14;
        dot(
          this.air,
          at.x + Math.cos(a) * MAGE.orbitRadius,
          at.y - 15 + Math.sin(a) * MAGE.orbitRadius,
          4,
          k % 2 ? C.mid : C.light,
          0.75 - k * 0.12,
        );
      }
    }
    if (mage.barrageLeft > 0) {
      ring(this.ground, at.x, at.y, 53, 34, C.mid, 0.65);
      ring(this.ground, at.x, at.y, 46, 29, C.light, 0.4);
    }
    const alive = new Set<number>();
    scene.s.projectile.forEach((id, p) => {
      if (!p.barrage || scene.world.isPendingDeath(id)) return;
      alive.add(id);
      const pos = scene.world.pos(id),
        last = this.lastOrbs.get(id) || pos,
        steps = Math.min(
          6,
          Math.floor(Math.hypot(pos.x - last.x, pos.y - last.y) / 6),
        );
      for (let i = 0; i < steps; i++)
        this.addParticle({
          x: last.x + ((pos.x - last.x) * i) / steps,
          y: last.y + ((pos.y - last.y) * i) / steps - 12,
          vx: -p.vx * 0.04,
          vy: -p.vy * 0.04,
          age: 0,
          life: 0.23,
          bright: i % 2 === 0,
        });
      this.lastOrbs.set(id, { ...pos });
    });
    for (const id of this.lastOrbs.keys())
      if (!alive.has(id)) this.lastOrbs.delete(id);
    for (const b of this.bursts) {
      b.age += dt;
      const progress = b.age / b.life,
        alpha = Math.max(0, 1 - progress);
      if (!alpha) continue;
      if (b.kind === 'wave') {
        ring(
          this.ground,
          b.x,
          b.y,
          12 + progress * 23,
          7 + progress * 13,
          C.light,
          alpha,
        );
        zap(this.air, b.x, b.y - 48, b.x, b.y - 5, b.seed + phase, alpha);
        zap(
          this.air,
          b.x - 15,
          b.y - 28,
          b.x + 12,
          b.y - 7,
          b.seed + 23,
          alpha * 0.75,
        );
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          line(
            this.ground,
            b.x,
            b.y,
            b.x + Math.cos(a) * 30,
            b.y + Math.sin(a) * 18,
            C.mid,
            alpha,
          );
        }
      } else if (b.kind === 'blast') {
        const r = 8 + progress * MAGE.orbSplash;
        ring(this.ground, b.x, b.y, r, r * 0.65, C.light, alpha);
        ring(this.air, b.x, b.y - 13, r * 0.7, r * 0.7, C.mid, alpha * 0.55);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          zap(
            this.air,
            b.x + Math.cos(a) * r * 0.35,
            b.y - 12 + Math.sin(a) * r * 0.35,
            b.x + Math.cos(a) * r,
            b.y - 12 + Math.sin(a) * r,
            b.seed + i,
            alpha,
          );
        }
        if (progress < 0.35)
          dot(this.air, b.x - 5, b.y - 17, 10, C.core, alpha);
      } else {
        const r = (b.kind === 'field' ? 32 : 16) * (1 + progress);
        ring(this.ground, b.x, b.y, r, r * 0.65, C.light, alpha * 0.7);
        if (b.kind === 'spawn')
          zap(
            this.air,
            b.x - 10,
            b.y - 18,
            b.x + 10,
            b.y - 6,
            b.seed + phase,
            alpha,
          );
      }
    }
    this.bursts = this.bursts.filter((b) => b.age < b.life);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = Math.max(0, 1 - p.age / p.life);
      dot(
        this.air,
        p.x,
        p.y,
        p.bright ? 2 : 4,
        p.bright ? C.core : C.mid,
        alpha,
      );
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }
  clear(): void {
    this.bursts = [];
    this.particles = [];
    this.lastOrbs.clear();
    this.time = 0;
    this.seed = 1;
    this.ground.clear();
    this.air.clear();
    this.orbiters.forEach((s) => (s.visible = false));
  }
}
