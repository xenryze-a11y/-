/** 邪阵、眼纹与破土裂隙独立于空中魔爪；只读 ECS，不让动画决定伤害。 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { TextureAtlas } from '../engine/atlas';
import type { GameEvent } from '../engine/ecs';
import { makeRng } from '../engine/math';
import type { Scene } from './spawn';
import { BLADE_MAGIC as M, BLADES } from './weapon-data';
const E = {
    dark: 0x1a1930,
    mid: 0x63457f,
    light: 0xbb8bd1,
    rune: 0x78c5ac,
    core: 0xe3f2d1,
  },
  F = { dark: 0x7e3e2b, mid: 0xc86330, light: 0xffae4f, core: 0xffe9b0 };
interface Burst {
  x: number;
  y: number;
  angle: number;
  radius: number;
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
  const n = Math.max(1, Math.ceil(Math.hypot(xx - x, yy - y) / 3));
  for (let i = 0; i <= n; i++)
    dot(g, x + ((xx - x) * i) / n, y + ((yy - y) * i) / n, width, color, alpha);
}
function ring(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  alpha: number,
  phase = 0,
  ratio = 0.62,
): void {
  const count = Math.min(160, Math.max(30, Math.ceil(r * 2)));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + phase;
    dot(g, x + Math.cos(a) * r, y + Math.sin(a) * r * ratio, 2, color, alpha);
  }
}
function flame(
  g: Graphics,
  x: number,
  y: number,
  h: number,
  t: number,
  alpha: number,
): void {
  line(g, x - 2, y, x + Math.sin(t) * 3, y - h, F.dark, alpha, 7);
  line(g, x, y, x + Math.sin(t) * 2, y - h * 0.8, F.light, alpha, 4);
  dot(g, x, y - h * 0.22, 2, F.core, alpha);
}
function arc(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  angle: number,
  span: number,
  color: number,
  alpha: number,
  width = 3,
): void {
  for (let i = 0; i <= 45; i++) {
    const a = angle - span / 2 + (i / 45) * span;
    dot(
      g,
      x + Math.cos(a) * r,
      y + Math.sin(a) * r * 0.72,
      width,
      color,
      alpha,
    );
  }
}
export class BladeVfx {
  private readonly ground = new Graphics();
  private readonly sigils: {
    id: number;
    root: Container;
    circle: Sprite;
    cracks: Sprite;
  }[] = [];
  private readonly air = new Graphics();
  private readonly stormRoot = new Container();
  private readonly storm = new Sprite();
  private readonly groupSigils: { root: Container; circle: Sprite }[] = [];
  private readonly impacts: Sprite[] = [];
  private readonly orbiters: Sprite[] = [];
  private readonly comboGhosts: Sprite[] = [];
  private bursts: Burst[] = [];
  private particles: Particle[] = [];
  private trails = new Map<number, { x: number; y: number }>();
  private time = 0;
  private seed = 33;
  constructor(
    groundLayer: Container,
    airLayer: Container,
    private readonly atlas: TextureAtlas,
  ) {
    groundLayer.addChild(this.ground);
    this.storm.texture = atlas.get('eldritchStorm');
    this.storm.anchor.set(0.5);
    this.stormRoot.addChild(this.storm);
    this.stormRoot.visible = false;
    groundLayer.addChild(this.stormRoot);
    for (let i = 0; i < M.maxGroups; i++) {
      const root = new Container(),
        circle = new Sprite(atlas.get('eldritchCircle'));
      circle.anchor.set(0.5);
      root.addChild(circle);
      root.visible = false;
      groundLayer.addChild(root);
      this.groupSigils.push({ root, circle });
    }
    for (let i = 0; i < 64; i++) {
      const sprite = new Sprite(atlas.get('eldritchImpact'));
      sprite.anchor.set(0.5);
      sprite.visible = false;
      groundLayer.addChild(sprite);
      this.impacts.push(sprite);
    }
    for (let i = 0; i < M.maxRifts; i++) {
      const root = new Container(),
        circle = new Sprite(atlas.get('eldritchCircle')),
        cracks = new Sprite(atlas.get('eldritchCracks'));
      circle.anchor.set(0.5);
      cracks.anchor.set(0.5);
      root.addChild(circle, cracks);
      root.visible = false;
      groundLayer.addChild(root);
      this.sigils.push({ id: 0, root, circle, cracks });
    }
    airLayer.addChild(this.air);
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(atlas.get('weaponScythe'));
      s.anchor.set(
        BLADES.scythe.gripX / BLADES.scythe.width,
        BLADES.scythe.gripY / BLADES.scythe.height,
      );
      s.alpha = 0.65;
      s.scale.set(0.66);
      s.tint = E.rune;
      s.visible = false;
      airLayer.addChild(s);
      this.orbiters.push(s);
      const sword = new Sprite(atlas.get('weaponGreatsword'));
      sword.anchor.set(0.5, 70 / 88);
      sword.visible = false;
      sword.alpha = 0.8;
      airLayer.addChild(sword);
      this.comboGhosts.push(sword);
    }
  }
  get stats() {
    return {
      bursts: this.bursts.length,
      particles: this.particles.length,
      orbiters: this.orbiters.filter((s) => s.visible).length,
      comboGhosts: this.comboGhosts.filter((s) => s.visible).length,
      trails: this.trails.size,
      sigils: this.sigils.filter((s) => s.root.visible).length,
      stormRings: this.stormRoot.visible ? 1 : 0,
      groupSigils: this.groupSigils.filter((s) => s.root.visible).length,
      impacts: this.impacts.filter((s) => s.visible).length,
    };
  }
  private particle(p: Particle): void {
    if (this.particles.length >= 320) this.particles.shift();
    this.particles.push(p);
  }
  consume(ev: GameEvent): void {
    if (ev.kind !== 'bladeArt') return;
    const kind = ev.ability || '',
      life = kind.startsWith('combo')
        ? 0.43
        : kind === 'clawHit'
          ? 0.65
          : kind === 'spikeHit'
            ? 0.4
            : 0.45;
    if (this.bursts.length >= 64) this.bursts.shift();
    this.bursts.push({
      x: ev.x,
      y: ev.y,
      angle: ev.angle || 0,
      radius: ev.amount || 35,
      age: 0,
      life,
      kind,
      seed: this.seed++,
    });
    const fire = /fire|wave|combo|inferno/i.test(kind),
      color = fire ? F : E,
      rng = makeRng(this.seed++),
      count =
        kind === 'clawHit'
          ? 26
          : kind.startsWith('combo')
            ? 22
            : kind === 'spikeHit'
              ? 8
              : 14;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2,
        speed = 20 + rng() * 80;
      this.particle({
        x: ev.x,
        y: ev.y - 6,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.65 - (fire ? 25 : 0),
        age: 0,
        life: 0.25 + rng() * 0.4,
        color: i % 3 ? color.light : color.core,
        size: i % 3 ? 3 : 2,
      });
    }
  }
  sync(scene: Scene, dt: number): void {
    this.time += dt;
    this.ground.clear();
    this.air.clear();
    const at = scene.world.pos(scene.player),
      state = scene.s.blade.get(scene.player)!,
      t = this.time,
      frame = Math.floor(t * 15);
    this.stormRoot.visible = state.stormLeft > 0;
    if (this.stormRoot.visible) {
      const scale = (M.storm.radius * 2 + 24) / 192;
      this.stormRoot.position.set(at.x, at.y);
      this.stormRoot.scale.set(scale, scale * 0.62);
      this.stormRoot.alpha = Math.min(0.95, state.stormLeft * 3);
      this.storm.rotation = state.stormAngle * 0.22;
    }
    for (let i = 0; i < 3; i++) {
      const s = this.orbiters[i];
      s.visible = state.stormLeft > 0;
      if (s.visible) {
        const a = state.stormAngle + (i * Math.PI * 2) / 3;
        s.position.set(at.x + Math.cos(a) * 65, at.y - 10 + Math.sin(a) * 41);
        s.rotation = a + Math.PI / 2;
        s.alpha = Math.min(0.65, state.stormLeft);
      }
    }
    this.groupSigils.forEach((s) => (s.root.visible = false));
    let groupSlot = 0;
    scene.s.riftGroup.forEach((id, g) => {
      if (
        scene.world.isPendingDeath(id) ||
        groupSlot >= this.groupSigils.length
      )
        return;
      const slot = this.groupSigils[groupSlot++],
        p = scene.world.pos(id),
        scale = (M.spikes.spacing * M.spikes.segments * 2 + 12) / 128;
      slot.root.visible = true;
      slot.root.position.set(p.x, p.y);
      slot.root.scale.set(scale, scale * 0.62);
      slot.root.alpha = Math.min(0.55, g.life * 0.8);
      slot.circle.rotation = t * 0.12;
    });
    const activeRifts = new Set(
      scene.s.rift.owners.filter((id) => !scene.world.isPendingDeath(id)),
    );
    for (const slot of this.sigils)
      if (slot.id && !activeRifts.has(slot.id)) {
        slot.id = 0;
        slot.root.visible = false;
      }
    scene.s.rift.forEach((id, r) => {
      if (scene.world.isPendingDeath(id)) return;
      let slot = this.sigils.find((s) => s.id === id);
      if (!slot) {
        slot = this.sigils.find((s) => !s.id);
        if (!slot) return;
        slot.id = id;
      }
      const p = scene.world.pos(id),
        alpha = Math.min(1, r.age * 8, Math.max(0, (r.life - r.age) * 4)),
        charge = Math.min(1, r.age / Math.max(0.1, r.windup));
      slot.root.visible = true;
      slot.root.position.set(p.x, p.y);
      slot.root.scale.set(r.radius / 60, (r.radius / 60) * 0.62);
      slot.root.alpha = alpha * (0.8 + charge * 0.2);
      slot.circle.rotation = t * 0.16 + id * 0.51;
      slot.cracks.rotation = id * 2.399;
      slot.cracks.visible = r.age >= r.windup - 0.1;
    });
    if (state.infernoLeft > 0) {
      const alpha = Math.min(1, state.infernoLeft * 2);
      ring(this.ground, at.x, at.y, M.inferno.radius, F.mid, alpha * 0.5);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6 + t * 0.5;
        flame(
          this.air,
          at.x + Math.cos(a) * 32,
          at.y + Math.sin(a) * 17,
          9 + Math.sin(t * 7 + i) * 5,
          t * 8 + i,
          alpha * 0.8,
        );
      }
      for (let i = 0; i < 7; i++) {
        const a = i * 2.399 + t;
        dot(
          this.air,
          at.x + Math.cos(a) * 16,
          at.y - ((t * 38 + i * 9) % 58),
          2,
          i % 2 ? F.light : F.core,
          alpha * 0.85,
        );
      }
      flame(this.air, at.x - 11, at.y - 18, 20, t * 9, alpha * 0.7);
      flame(this.air, at.x + 11, at.y - 18, 20, t * 9 + 2, alpha * 0.7);
    }
    const alive = new Set<number>();
    scene.s.flameWave.forEach((id, w) => {
      if (scene.world.isPendingDeath(id)) return;
      alive.add(id);
      const p = scene.world.pos(id),
        prev = this.trails.get(id) || p,
        steps =
          dt > 0
            ? Math.min(
                6,
                Math.floor(Math.hypot(p.x - prev.x, p.y - prev.y) / 5),
              )
            : 0;
      for (let i = 0; i < steps; i++)
        this.particle({
          x: prev.x + ((p.x - prev.x) * i) / steps,
          y: prev.y + ((p.y - prev.y) * i) / steps - 10,
          vx: -w.vx * 0.08,
          vy: -w.vy * 0.08 - 12,
          age: 0,
          life: 0.28,
          color: i % 2 ? F.mid : F.light,
          size: 4,
        });
      this.trails.set(id, { ...p });
    });
    for (const id of this.trails.keys())
      if (!alive.has(id)) this.trails.delete(id);
    this.comboGhosts.forEach((s) => (s.visible = false));
    let ghost = 0,
      impact = 0;
    this.impacts.forEach((s) => (s.visible = false));
    for (const b of this.bursts) {
      b.age += dt;
      const f = b.age / b.life,
        alpha = Math.max(0, 1 - f);
      if (alpha <= 0) continue;
      if (b.kind.startsWith('combo')) {
        const index = Number(b.kind.slice(-1)),
          reverse = index === 1,
          span = M.combo.arc[index],
          a = b.angle + (reverse ? 1 : -1) * (0.5 - f) * span;
        arc(
          this.air,
          b.x,
          b.y - 12,
          b.radius,
          b.angle,
          span,
          F.dark,
          alpha * 0.7,
          10,
        );
        arc(
          this.air,
          b.x,
          b.y - 12,
          b.radius - 3,
          b.angle + (reverse ? 1 : -1) * f * 0.12,
          span,
          F.light,
          alpha,
          4,
        );
        arc(
          this.air,
          b.x,
          b.y - 12,
          b.radius - 6,
          b.angle,
          span,
          F.core,
          alpha * 0.8,
          2,
        );
        for (let i = 0; i < 9; i++) {
          const aa = b.angle - span / 2 + (i / 8) * span;
          flame(
            this.air,
            b.x + Math.cos(aa) * b.radius,
            b.y - 12 + Math.sin(aa) * b.radius * 0.72,
            8 + alpha * 12,
            t * 9 + i,
            alpha * 0.7,
          );
        }
        if (ghost < 3) {
          const s = this.comboGhosts[ghost++];
          s.visible = true;
          s.texture = this.atlas.get('weaponGreatsword_' + (frame % 4));
          s.position.set(b.x + Math.cos(a) * 39, b.y - 13 + Math.sin(a) * 28);
          s.rotation = a + Math.PI / 2;
          s.scale.set(index === 2 ? 1.25 : 1);
          s.alpha = alpha * 0.8;
        }
      } else if (b.kind === 'clawHit' || b.kind === 'spikeHit') {
        const sprite = this.impacts[impact++];
        if (sprite) {
          const scale = (b.radius * 2 * (0.6 + f * 0.8)) / 128;
          sprite.visible = true;
          sprite.position.set(b.x, b.y);
          sprite.scale.set(scale, scale * 0.62);
          sprite.rotation = 0;
          sprite.alpha = alpha * 0.95;
        }
      } else if (
        b.kind === 'sabreSlash' ||
        b.kind === 'scytheSlash' ||
        b.kind === 'fireSlash'
      ) {
        const c =
          b.kind === 'sabreSlash'
            ? 0xcce8de
            : b.kind === 'scytheSlash'
              ? E.rune
              : F.light;
        arc(
          this.air,
          b.x,
          b.y - 12,
          b.radius,
          b.angle,
          Math.PI * 0.85,
          c,
          alpha * 0.65,
          b.kind === 'sabreSlash' ? 2 : 4,
        );
      } else if (b.kind === 'waveImpact') {
        ring(this.ground, b.x, b.y, 10 + f * b.radius, F.light, alpha);
        for (let i = 0; i < 5; i++)
          flame(
            this.air,
            b.x + (i - 2) * 9,
            b.y - 5,
            25 * alpha,
            t * 6 + i,
            alpha,
          );
      } else if (b.kind === 'infernoCast') {
        ring(this.ground, b.x, b.y, 10 + f * 60, F.core, alpha * 0.7);
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
    for (const slot of this.sigils) {
      slot.id = 0;
      slot.root.visible = false;
    }
    this.stormRoot.visible = false;
    this.groupSigils.forEach((s) => (s.root.visible = false));
    this.impacts.forEach((s) => (s.visible = false));
    this.time = 0;
    this.seed = 33;
    this.orbiters.forEach((s) => (s.visible = false));
    this.comboGhosts.forEach((s) => (s.visible = false));
  }
}
