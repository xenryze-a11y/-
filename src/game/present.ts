/**
 * 表现层：唯一一处消费事件队列（对应 goengine 的 Scene.consumeEvents）。
 * 模拟层只管发 swing/hurt/kill…，要不要飘字、要不要震屏、要不要音效，全在这里决定。
 * 加一种表现不需要改任何系统代码。
 */
import { Container, Sprite, Text, Graphics } from 'pixi.js';
import { fxFinished, fxFrameIndex, type FxAnim } from '../engine/animation';
import type { TextureAtlas } from '../engine/atlas';
import type { Camera } from '../engine/camera';
import type { GameEvent } from '../engine/ecs';
import { makeRng } from '../engine/math';
import type { Scene } from './spawn';
import { FX_ANIMS } from './data';

interface FxEffect {
  type: 'fx';
  sprite: Sprite;
  t: number;
  anim: FxAnim;
}
interface FloatEffect {
  type: 'float';
  text: Text;
  t: number;
  x: number;
  y: number;
}
type Effect = FxEffect | FloatEffect;

const MAX_DECALS = 60;

export class Presentation {
  private effects: Effect[] = [];
  private readonly magic = new Graphics();
  private rings: {
    x: number;
    y: number;
    r: number;
    color: number;
    life: number;
    max: number;
  }[] = [];
  private bolts: {
    points: { x: number; y: number }[];
    color: number;
    life: number;
    max: number;
  }[] = [];
  private time = 0;
  private boltSeed = 1;
  private readonly decals: Sprite[] = [];

  constructor(
    private readonly fxLayer: Container,
    private readonly decalLayer: Container,
    private readonly atlas: TextureAtlas,
    private readonly camera: Camera,
  ) {
    this.fxLayer.addChild(this.magic);
  }

  consume(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'ring':
          this.rings.push({
            x: ev.x,
            y: ev.y,
            r: ev.amount || 20,
            color: parseInt((ev.color || '#e4d49b').slice(1), 16),
            life: ev.life || 0.5,
            max: ev.life || 0.5,
          });
          break;
        case 'bolt': {
          const end = { x: ev.x2 ?? ev.x, y: ev.y2 ?? ev.y },
            count = Math.max(
              2,
              Math.ceil(Math.hypot(end.x - ev.x, end.y - ev.y) / 12),
            ),
            rng = makeRng(this.boltSeed++),
            points = [{ x: ev.x, y: ev.y }];
          for (let k = 1; k < count; k++) {
            const t = k / count;
            points.push({
              x: ev.x + (end.x - ev.x) * t + (rng() - 0.5) * 13,
              y: ev.y + (end.y - ev.y) * t + (rng() - 0.5) * 13,
            });
          }
          points.push(end);
          this.bolts.push({
            points,
            color: parseInt((ev.color || '#d5c4ff').slice(1), 16),
            life: ev.life || 0.2,
            max: ev.life || 0.2,
          });
          break;
        }
        case 'notice':
          break;
        case 'swing': {
          const a = ev.angle ?? 0;
          this.addFx(
            'slash',
            ev.x + Math.cos(a) * 22,
            ev.y + Math.sin(a) * 22,
            a + Math.PI / 2,
            1,
          );
          break;
        }
        case 'cast': {
          const a = ev.angle ?? 0;
          this.addFx(
            'spark',
            ev.x + Math.cos(a) * 20,
            ev.y + Math.sin(a) * 20,
            0,
            0.9,
          );
          break;
        }
        case 'impact': {
          const radius = ev.amount ?? 0;
          this.addFx('impact', ev.x, ev.y, 0, radius > 0 ? 1.15 : 0.6);
          this.camera.shake(radius > 0 ? 4 : 2, 0.22);
          break;
        }
        case 'hurt':
          this.addFx('blood', ev.x, ev.y - 10, 0, 0.75);
          this.float(`-${ev.amount ?? 0}`, ev.x, ev.y - 26, 0xffd08a);
          break;
        case 'playerHurt':
          this.camera.shake(5, 0.3);
          this.float(`-${ev.amount ?? 0}`, ev.x, ev.y - 30, 0xff7a7a);
          break;
        case 'kill':
          this.addFx('blood', ev.x, ev.y - 8, 0, 1);
          this.addDecal(ev.x, ev.y);
          break;
        case 'dodge':
          this.addFx('spark', ev.x, ev.y, 0, 0.7);
          break;
        case 'noMana':
        case 'pickup':
          this.float(
            ev.text ?? '',
            ev.x,
            ev.y - 24,
            ev.kind === 'noMana' ? 0x9ac4ff : 0xa8e6a0,
          );
          break;
        case 'spawn':
          break;
      }
    }
  }

  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.type === 'fx') {
        if (fxFinished(e.anim, e.t)) {
          this.fxLayer.removeChild(e.sprite);
          e.sprite.destroy();
          this.effects.splice(i, 1);
          continue;
        }
        e.sprite.texture = this.atlas.get(
          e.anim.frames[fxFrameIndex(e.anim, e.t)],
        );
      } else {
        e.text.y = e.y - e.t * 32;
        e.text.alpha = Math.max(0, 1 - e.t / 0.85);
        if (e.t > 0.85) {
          this.fxLayer.removeChild(e.text);
          e.text.destroy();
          this.effects.splice(i, 1);
        }
      }
    }
  }

  clear(): void {
    for (const e of this.effects) {
      this.fxLayer.removeChild(e.type === 'fx' ? e.sprite : e.text);
      (e.type === 'fx' ? e.sprite : e.text).destroy();
    }
    this.effects = [];
    this.rings = [];
    this.bolts = [];
    this.magic.clear();
    for (const d of this.decals) {
      this.decalLayer.removeChild(d);
      d.destroy();
    }
    this.decals.length = 0;
  }

  /** 只读组件投影护盾/预警；特效生命使用自己的渲染时钟。 */
  sync(scene: Scene, dt: number): void {
    this.time += dt;
    const g = this.magic;
    g.clear();
    for (const ring of this.rings) {
      ring.life -= dt;
      const t = 1 - ring.life / ring.max,
        radius = ring.r * (0.25 + t * 0.75),
        alpha = Math.max(0, ring.life / ring.max);
      g.ellipse(ring.x, ring.y, radius, radius * 0.65).stroke({
        width: 1.5,
        color: ring.color,
        alpha: alpha * 0.8,
      });
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const bolt of this.bolts) {
      bolt.life -= dt;
      const alpha = Math.max(0, bolt.life / bolt.max);
      for (const [width, color, strength] of [
        [4, bolt.color, 0.3],
        [1.4, 0xf0f5e6, 1],
      ]) {
        g.moveTo(bolt.points[0].x, bolt.points[0].y);
        for (const p of bolt.points.slice(1)) g.lineTo(p.x, p.y);
        g.stroke({ width, color, alpha: alpha * strength });
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
    scene.s.field.forEach((id, field) => {
      const pos = scene.world.pos(id);
      g.ellipse(pos.x, pos.y, field.r, field.r * 0.65)
        .fill({ color: 0xa68cdb, alpha: 0.055 })
        .stroke({ color: 0xb2a2e8, width: 1, alpha: 0.3 });
    });
    const player = scene.s.player.get(scene.player)!,
      pos = scene.world.pos(scene.player);
    if (player.shield > 0)
      g.ellipse(pos.x, pos.y - 13, 24, 32)
        .fill({ color: 0x93dcae, alpha: 0.06 })
        .stroke({
          color: 0xb8edc3,
          width: 1.3,
          alpha: 0.5 + Math.sin(this.time * 5) * 0.15,
        });
    scene.s.mob.forEach((id, m) => {
      const p = scene.world.pos(id);
      if ((m.windup || 0) > 0)
        g.ellipse(p.x, p.y, 16, 8).stroke({
          width: 1.5,
          color: m.kind === 'caster' ? 0xbc9de0 : 0xda9774,
          alpha: 0.8,
        });
      if ((m.frozen || 0) > 0)
        g.ellipse(p.x, p.y - 9, 17, 24)
          .fill({ color: 0x9cdded, alpha: 0.14 })
          .stroke({ color: 0xa4e3f2, width: 1, alpha: 0.5 });
    });
  }

  private addFx(
    animName: string,
    x: number,
    y: number,
    rotation: number,
    scale: number,
  ): void {
    const anim = FX_ANIMS[animName];
    if (!anim) return;
    const sprite = new Sprite(this.atlas.get(anim.frames[0]));
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.rotation = rotation;
    sprite.scale.set(anim.scale * scale);
    sprite.zIndex = 27;
    this.fxLayer.addChild(sprite);
    this.effects.push({ type: 'fx', sprite, t: 0, anim });
  }

  private addDecal(x: number, y: number): void {
    if (this.decals.length >= MAX_DECALS) {
      const old = this.decals.shift()!;
      this.decalLayer.removeChild(old);
      old.destroy();
    }
    const s = new Sprite(this.atlas.get('decalBlood'));
    s.anchor.set(0.5);
    s.position.set(x, y + 8);
    s.alpha = 0.85;
    this.decalLayer.addChild(s);
    this.decals.push(s);
  }

  private float(text: string, x: number, y: number, color: number): void {
    if (!text) return;
    const t = new Text({
      text,
      style: {
        fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
        fontSize: 15,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x1a1410, width: 3 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.zIndex = 28;
    this.fxLayer.addChild(t);
    this.effects.push({ type: 'float', text: t, t: 0, x, y });
  }
}
