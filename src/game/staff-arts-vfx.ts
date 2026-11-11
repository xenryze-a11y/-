/** 五系表现只读模拟；粒子与残影用局部时钟/RNG，暂停不走时。 */
import { Container, Graphics } from 'pixi.js';
import type { GameEvent } from '../engine/ecs';
import { makeRng } from '../engine/math';
import type { Scene } from './spawn';
import type { ElementStaffId } from './staff-data';
interface Palette {
  dark: number;
  mid: number;
  light: number;
  core: number;
}
const COLORS: Record<ElementStaffId, Palette> = {
  ember: { dark: 0x77352b, mid: 0xd65e30, light: 0xffb957, core: 0xffefad },
  frost: { dark: 0x28577a, mid: 0x558fb5, light: 0x9ce3f3, core: 0xe4fbff },
  ward: { dark: 0x4d6650, mid: 0x90ad64, light: 0xe0d681, core: 0xfff6c5 },
  blink: { dark: 0x352650, mid: 0x7850b0, light: 0xbb8cef, core: 0xe9d8ff },
};
interface Burst {
  x: number;
  y: number;
  age: number;
  life: number;
  kind: string;
  school: ElementStaffId;
  radius: number;
  seed: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: number;
  size: number;
}
function dot(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha = 1,
): void {
  if (alpha > 0)
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
  const steps = Math.max(1, Math.ceil(Math.hypot(xx - x, yy - y) / 3));
  for (let i = 0; i <= steps; i++)
    dot(
      g,
      x + ((xx - x) * i) / steps,
      y + ((yy - y) * i) / steps,
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
  const count = Math.min(160, Math.max(24, Math.ceil(rx * 2)));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + phase;
    dot(g, x + Math.cos(a) * rx, y + Math.sin(a) * ry, 2, color, alpha);
  }
}
function disc(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  alpha: number,
): void {
  for (let yy = -r; yy < r; yy += 4) {
    const w = Math.sqrt(Math.max(0, r * r - yy * yy));
    g.rect(
      Math.round((x - w) / 2) * 2,
      Math.round((y + yy) / 2) * 2,
      Math.round(w) * 2,
      4,
    ).fill({ color, alpha });
  }
}
function star(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  c: Palette,
  alpha = 1,
): void {
  line(g, x - r, y, x + r, y, c.light, alpha);
  line(g, x, y - r * 1.6, x, y + r * 1.6, c.light, alpha);
  dot(g, x - 2, y - 2, 4, c.core, alpha);
}
function crystal(
  g: Graphics,
  x: number,
  y: number,
  h: number,
  c: Palette,
  alpha: number,
): void {
  line(g, x, y - h, x - 4, y - h * 0.4, c.mid, alpha, 4);
  line(g, x, y - h, x + 3, y - h * 0.4, c.core, alpha, 2);
  line(g, x - 4, y - h * 0.4, x, y, c.light, alpha, 3);
  line(g, x + 3, y - h * 0.4, x, y, c.mid, alpha, 2);
}
function flame(
  g: Graphics,
  x: number,
  y: number,
  h: number,
  c: Palette,
  phase: number,
  alpha: number,
): void {
  const bend = Math.sin(phase) * 3;
  line(g, x, y, x + bend, y - h, c.mid, alpha, 6);
  line(g, x, y, x - bend * 0.5, y - h * 0.7, c.light, alpha, 4);
  dot(g, x, y - h * 0.25, 2, c.core, alpha);
}
export class StaffArtsVfx {
  private readonly ground = new Graphics();
  private readonly air = new Graphics();
  private bursts: Burst[] = [];
  private particles: Particle[] = [];
  private trails = new Map<number, { x: number; y: number }>();
  private time = 0;
  private seed = 17;
  constructor(groundLayer: Container, airLayer: Container) {
    groundLayer.addChild(this.ground);
    airLayer.addChild(this.air);
  }
  get stats() {
    return {
      bursts: this.bursts.length,
      particles: this.particles.length,
      trails: this.trails.size,
    };
  }
  private particle(p: Particle): void {
    if (this.particles.length >= 384) this.particles.shift();
    this.particles.push(p);
  }
  consume(ev: GameEvent): void {
    if (ev.kind !== 'staffArt' || !(ev.element! in COLORS)) return;
    const school = ev.element as ElementStaffId,
      kind = ev.ability || 'cast',
      c = COLORS[school];
    if (this.bursts.length >= 64) this.bursts.shift();
    this.bursts.push({
      x: ev.x,
      y: ev.y,
      age: 0,
      life:
        kind === 'collapse'
          ? 0.95
          : kind === 'pillar'
            ? 0.65
            : kind === 'meteor'
              ? 0.7
              : kind === 'nova'
                ? 0.65
                : 0.4,
      kind,
      school,
      radius: ev.amount || 28,
      seed: this.seed++,
    });
    if (['meteor', 'collapse', 'nova', 'impact', 'blink'].includes(kind)) {
      const rng = makeRng(this.seed++),
        count =
          kind === 'collapse'
            ? 60
            : kind === 'meteor'
              ? 32
              : kind === 'nova'
                ? 30
                : 12;
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2,
          speed = 30 + rng() * (kind === 'collapse' ? 160 : 100);
        this.particle({
          x: ev.x,
          y: ev.y - 8,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed * 0.65 - (school === 'ember' ? 25 : 0),
          age: 0,
          life: 0.25 + rng() * 0.55,
          color: i % 3 ? c.light : c.core,
          size: i % 3 ? 3 : 2,
        });
      }
    }
  }
  sync(scene: Scene, dt: number): void {
    this.time += dt;
    this.ground.clear();
    this.air.clear();
    const frame = Math.floor(this.time * 15);
    scene.s.staffZone.forEach((id, z) => {
      if (scene.world.isPendingDeath(id)) return;
      const p = scene.world.pos(id),
        c = COLORS[z.school],
        r = z.radius,
        alpha = Math.min(1, z.life * 2),
        t = this.time;
      if (z.kind === 'burn') {
        disc(this.ground, p.x, p.y, r * 0.65, c.dark, 0.22 * alpha);
        for (let i = 0; i < 7; i++) {
          const a = i * 2.399;
          flame(
            this.air,
            p.x + Math.cos(a) * r * 0.6,
            p.y + Math.sin(a) * r * 0.45,
            9 + Math.sin(t * 9 + i) * 4,
            c,
            t * 8 + i,
            0.75 * alpha,
          );
        }
        return;
      }
      ring(this.ground, p.x, p.y, r, r * 0.65, c.mid, 0.7 * alpha);
      ring(this.ground, p.x, p.y, r - 6, (r - 6) * 0.65, c.light, 0.35 * alpha);
      if (z.kind === 'embers') {
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + t * 0.55,
            x = p.x + Math.cos(a) * r,
            y = p.y + Math.sin(a) * r * 0.65;
          flame(
            this.air,
            x,
            y,
            10 + (Math.sin(t * 8 + i) + 1) * 6,
            c,
            t * 7 + i,
            0.8 * alpha,
          );
        }
        for (let i = 0; i < 6; i++) {
          const a = t * 1.5 + (i * Math.PI) / 3;
          dot(
            this.air,
            p.x + Math.cos(a) * r * 0.7,
            p.y + Math.sin(a) * r * 0.4 - 14 - Math.sin(t * 4 + i) * 8,
            3,
            c.core,
            alpha,
          );
        }
      } else if (z.kind === 'meteors') {
        for (let i = 0; i < 9; i++) {
          const a = i * 2.399;
          star(
            this.ground,
            p.x + Math.cos(a) * r * 0.7,
            p.y + Math.sin(a) * r * 0.45,
            4,
            c,
            0.6 * alpha,
          );
        }
      } else if (z.kind === 'blizzard') {
        for (let i = 0; i < 28; i++) {
          const a = i * 2.399 + t * (i % 2 ? 0.3 : -0.25),
            rr = r * (0.2 + (i % 7) / 9),
            x = p.x + Math.cos(a) * rr,
            y = p.y + Math.sin(a) * rr * 0.65,
            fall = (t * 70 + i * 19) % 100;
          crystal(
            this.air,
            x + fall * 0.15,
            y - 100 + fall,
            8 + (i % 3) * 3,
            c,
            0.7 * alpha,
          );
        }
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 - t * 0.5;
          crystal(
            this.air,
            p.x + Math.cos(a) * r * 0.85,
            p.y + Math.sin(a) * r * 0.55,
            14,
            c,
            alpha,
          );
        }
        for (let i = 0; i < 3; i++)
          ring(
            this.ground,
            p.x,
            p.y,
            r * (0.3 + i * 0.22),
            r * (0.3 + i * 0.22) * 0.65,
            c.light,
            0.2 * alpha,
            t * 0.5,
          );
      } else if (z.kind === 'judgment') {
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + t * 0.15,
            x = p.x + Math.cos(a) * r * 0.7,
            y = p.y + Math.sin(a) * r * 0.45;
          star(this.air, x, y - 35 - Math.sin(t * 2 + i) * 6, 6, c, alpha);
          ring(this.ground, x, y, 12, 7, c.light, 0.65 * alpha);
          if ((Math.floor(t * 4) + i) % 6 < 2) {
            line(this.air, x - 3, y - 95, x - 3, y, c.mid, 0.18 * alpha, 8);
            line(this.air, x, y - 95, x, y, c.core, 0.6 * alpha, 2);
          }
          const b = a + (Math.PI * 2) / 3;
          line(
            this.ground,
            x,
            y,
            p.x + Math.cos(b) * r * 0.7,
            p.y + Math.sin(b) * r * 0.45,
            c.mid,
            0.35 * alpha,
          );
        }
        star(this.ground, p.x, p.y, 16, c, 0.65 * alpha);
      } else {
        disc(this.ground, p.x, p.y, 30, 0x120e25, 0.92 * alpha);
        ring(this.ground, p.x, p.y, 31, 21, c.light, 0.8 * alpha);
        for (let arm = 0; arm < 3; arm++)
          for (let i = 0; i < 30; i++) {
            const d = i / 30,
              rr = 18 + d * r * 0.8,
              a = (arm * Math.PI * 2) / 3 + t * 2.2 + d * 3.3;
            dot(
              this.air,
              p.x + Math.cos(a) * rr,
              p.y + Math.sin(a) * rr * 0.65 - 5,
              3 + (i % 4 === 0 ? 1 : 0),
              i % 4 === 0 ? c.core : c.mid,
              (0.9 - d * 0.6) * alpha,
            );
          }
        for (let i = 0; i < 10; i++) {
          const f = (i / 10 + t * 0.3) % 1,
            a = i * 2.399 + t,
            rr = r * (1 - f);
          star(
            this.air,
            p.x + Math.cos(a) * rr,
            p.y + Math.sin(a) * rr * 0.65 - 6,
            2,
            c,
            0.7 * alpha,
          );
        }
        ring(
          this.ground,
          p.x,
          p.y,
          42 + Math.sin(t * 5) * 4,
          26,
          c.mid,
          0.65 * alpha,
        );
      }
    });
    scene.s.meteor.forEach((id, m) => {
      if (scene.world.isPendingDeath(id)) return;
      const p = scene.world.pos(id),
        c = COLORS.ember,
        progress = 1 - m.delay / m.maxDelay;
      ring(this.ground, p.x, p.y, m.radius, m.radius * 0.65, c.mid, 0.55);
      ring(
        this.ground,
        p.x,
        p.y,
        Math.max(5, m.radius * (1 - progress)),
        Math.max(3, m.radius * (1 - progress) * 0.65),
        c.light,
        0.8,
      );
      star(this.ground, p.x, p.y, 6, c, 0.8);
    });
    scene.s.mob.forEach((id, m) => {
      if ((m.burn || 0) <= 0 || scene.world.isPendingDeath(id)) return;
      const p = scene.world.pos(id);
      flame(this.air, p.x - 7, p.y - 14, 12, COLORS.ember, frame + id, 0.8);
      flame(this.air, p.x + 6, p.y - 10, 9, COLORS.ember, frame + id + 2, 0.7);
    });
    const alive = new Set<number>();
    scene.s.staffShot.forEach((id, s) => {
      if (scene.world.isPendingDeath(id)) return;
      alive.add(id);
      const p = scene.world.pos(id),
        prev = this.trails.get(id) || p,
        c = COLORS[s.school],
        steps =
          dt > 0
            ? Math.min(
                6,
                Math.floor(Math.hypot(p.x - prev.x, p.y - prev.y) / 4),
              )
            : 0;
      for (let k = 0; k < steps; k++)
        this.particle({
          x: prev.x + ((p.x - prev.x) * k) / steps,
          y: prev.y + ((p.y - prev.y) * k) / steps - 12,
          vx: -s.vx * 0.025,
          vy: -s.vy * 0.025,
          age: 0,
          life: 0.23,
          color: k % 2 ? c.mid : c.light,
          size: s.style === 'blade' ? 2 : 3,
        });
      this.trails.set(id, { ...p });
    });
    for (const id of this.trails.keys())
      if (!alive.has(id)) this.trails.delete(id);
    for (const b of this.bursts) {
      b.age += dt;
      const f = b.age / b.life,
        a = Math.max(0, 1 - f),
        c = COLORS[b.school],
        rng = makeRng(b.seed);
      if (a <= 0) continue;
      if (b.kind === 'pillar') {
        ring(
          this.ground,
          b.x,
          b.y,
          b.radius * f,
          b.radius * f * 0.6,
          c.light,
          a,
        );
        line(this.air, b.x - 6, b.y - 150, b.x - 6, b.y, c.mid, a * 0.35, 12);
        line(this.air, b.x - 2, b.y - 150, b.x - 2, b.y, c.light, a * 0.65, 5);
        line(this.air, b.x, b.y - 150, b.x, b.y, c.core, a, 2);
        star(this.air, b.x, b.y - 20, 16 * a, c, a);
      } else if (b.kind === 'collapse') {
        const r =
          f < 0.2 ? b.radius * (1 - f / 0.2) : (b.radius * (f - 0.2)) / 0.8;
        ring(this.ground, b.x, b.y, r, r * 0.65, c.core, a);
        ring(this.air, b.x, b.y - 12, r * 0.7, r * 0.7, c.light, a * 0.7);
        if (f < 0.3)
          disc(this.air, b.x, b.y - 12, 18 * (1 - f / 0.3), c.core, a);
        for (let i = 0; i < 12; i++) {
          const angle = (i * Math.PI) / 6;
          line(
            this.air,
            b.x + Math.cos(angle) * r * 0.5,
            b.y - 12 + Math.sin(angle) * r * 0.35,
            b.x + Math.cos(angle) * r,
            b.y - 12 + Math.sin(angle) * r * 0.7,
            c.mid,
            a,
          );
        }
      } else if (b.kind === 'meteor') {
        ring(
          this.ground,
          b.x,
          b.y,
          8 + f * b.radius,
          5 + f * b.radius * 0.65,
          c.light,
          a,
        );
        for (let i = 0; i < 9; i++) {
          const angle = i * 2.399,
            r = rng() * b.radius * f;
          flame(
            this.air,
            b.x + Math.cos(angle) * r,
            b.y + Math.sin(angle) * r * 0.65,
            8 + 24 * a,
            c,
            i + frame,
            a,
          );
        }
        if (f < 0.25) disc(this.air, b.x, b.y - 10, 12, c.core, a);
      } else if (b.kind === 'nova') {
        const r = 10 + f * b.radius;
        ring(this.ground, b.x, b.y, r, r * 0.65, c.light, a);
        for (let i = 0; i < 16; i++) {
          const angle = (i * Math.PI) / 8;
          crystal(
            this.air,
            b.x + Math.cos(angle) * r,
            b.y + Math.sin(angle) * r * 0.65,
            10 + 16 * a,
            c,
            a,
          );
        }
      } else if (b.kind === 'blink') {
        ring(this.air, b.x, b.y - 22, 10 + f * 16, 28 * (1 - f), c.light, a);
        for (let i = 0; i < 6; i++)
          star(this.air, b.x + (rng() - 0.5) * 32, b.y - rng() * 40, 3, c, a);
      } else {
        const r = (b.kind === 'ultimate' ? b.radius : 22) * (0.3 + f);
        ring(this.ground, b.x, b.y, r, r * 0.65, c.light, a * 0.7);
        if (b.kind === 'impact') star(this.air, b.x, b.y - 12, 9 * a, c, a);
      }
    }
    this.bursts = this.bursts.filter((b) => b.age < b.life);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      dot(this.air, p.x, p.y, p.size, p.color, Math.max(0, 1 - p.age / p.life));
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }
  clear(): void {
    this.ground.clear();
    this.air.clear();
    this.bursts = [];
    this.particles = [];
    this.trails.clear();
    this.time = 0;
    this.seed = 17;
  }
}
