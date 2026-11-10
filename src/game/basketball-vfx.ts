/** 生图「坤」字按有界 Sprite 池散开；与命中模拟完全隔离。 */
import { Sprite, type Container } from 'pixi.js';
import type { TextureAtlas } from '../engine/atlas';
import { makeRng } from '../engine/math';
import type { GameEvent } from '../engine/ecs';
import { BASKETBALL_VISUAL } from './basketball-content';
interface Glyph {
  sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  spin: number;
  scale: number;
}
export class BasketballVfx {
  private live: Glyph[] = [];
  private free: Sprite[] = [];
  private allocated = 0;
  private seed = 1;
  constructor(
    private readonly layer: Container,
    private readonly atlas: TextureAtlas,
  ) {}
  get stats() {
    return { glyphs: this.live.length, allocated: this.allocated };
  }
  private release(g: Glyph): void {
    g.sprite.visible = false;
    this.free.push(g.sprite);
  }
  consume(event: GameEvent): void {
    if (event.kind !== 'basketball') return;
    const cast = event.stage === 'cast',
      count = cast ? 5 : BASKETBALL_VISUAL.glyphsPerBurst,
      rng = makeRng(this.seed++);
    for (let i = 0; i < count; i++) {
      if (this.live.length >= BASKETBALL_VISUAL.maxGlyphs)
        this.release(this.live.shift()!);
      let sprite = this.free.pop();
      if (!sprite) {
        sprite = new Sprite(this.atlas.get('kunGlyph'));
        sprite.anchor.set(0.5);
        this.layer.addChild(sprite);
        this.allocated++;
      }
      const angle = (i / count) * Math.PI * 2 + rng() * 0.3,
        speed = cast ? 25 : 38 + rng() * 78,
        scale = cast ? 0.3 : 0.32 + rng() * 0.28;
      sprite.visible = true;
      sprite.alpha = 1;
      sprite.position.set(event.x, event.y - 14);
      sprite.rotation = (rng() - 0.5) * 0.3;
      sprite.scale.set(scale);
      this.live.push({
        sprite,
        age: 0,
        life: cast ? 0.45 : 0.65 + rng() * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.7 - 25,
        spin: (rng() - 0.5) * 0.6,
        scale,
      });
    }
  }
  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.age += dt;
      if (g.age >= g.life) {
        this.release(g);
        this.live.splice(i, 1);
        continue;
      }
      g.vy += 45 * dt;
      g.vx *= Math.exp(-1.4 * dt);
      g.sprite.x += g.vx * dt;
      g.sprite.y += g.vy * dt;
      g.sprite.rotation += g.spin * dt;
      g.sprite.alpha = Math.min(1, (1 - g.age / g.life) * 2);
      g.sprite.scale.set(
        g.scale *
          (0.85 + Math.sin((Math.min(1, g.age * 8) * Math.PI) / 2) * 0.15),
      );
    }
  }
  clear(): void {
    for (const g of this.live) this.release(g);
    this.live = [];
    this.seed = 1;
  }
}
