/** 外部为完整不透明屋面，入内只读玩家位置揭开屋顶。 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { TextureAtlas } from '../engine/atlas';
import type { Scene } from './spawn';
import { SANCTUARY, inCathedral } from './sanctuary-data';
import { GROVE } from './mage-data';
export class SanctuaryView {
  readonly roof: Sprite;
  readonly floor: Sprite;
  readonly glow = new Graphics();
  private time = 0;
  constructor(atlas: TextureAtlas, ground: Container, top: Container) {
    const r = SANCTUARY.cathedral;
    this.floor = new Sprite(atlas.get('cathedralInterior'));
    this.floor.position.set(r.x, r.y);
    ground.addChild(this.floor);
    this.roof = new Sprite(atlas.get('cathedralRoof'));
    this.roof.position.set(
      r.x - SANCTUARY.roof.overhang,
      r.y - SANCTUARY.roof.rise,
    );
    top.addChild(this.roof);
    ground.addChild(this.glow);
    this.reset();
  }
  reset(): void {
    this.roof.alpha = 1;
    this.floor.visible = false;
    this.time = 0;
    this.glow.clear();
  }
  sync(scene: Scene, dt: number): void {
    this.time += dt;
    const inside = inCathedral(scene.world.pos(scene.player));
    this.floor.visible = inside;
    this.roof.alpha = inside
      ? this.roof.alpha + (0.035 - this.roof.alpha) * (1 - Math.exp(-12 * dt))
      : 1;
    this.glow.clear();
    const t = this.time,
      at = GROVE.tree;
    for (let i = 0; i < 26; i++) {
      const a = i * 2.399 + t * 0.12,
        r = 25 + (i % 6) * 15,
        x = at.x + Math.cos(a) * r,
        y = at.y - 110 + Math.sin(a) * r * 0.65 - Math.sin(t * 0.8 + i) * 18;
      this.glow
        .rect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 2, i % 3 ? 2 : 4)
        .fill({
          color: i % 3 ? 0xc9cb8c : 0xe7edbe,
          alpha: 0.35 + 0.3 * Math.sin(t * 2 + i) ** 2,
        });
    }
  }
}
