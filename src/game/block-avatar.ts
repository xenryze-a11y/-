/** 方块旅人视图：部件 Sprite 复用，受击/攻击/施法均不写回 ECS。 */
import { Container, Sprite } from 'pixi.js';
import type { TextureAtlas } from '../engine/atlas';
import { newLimbPose, updateWalk } from '../engine/animation';
import { facingView, fourDirection } from '../engine/facing';
import { BLOCK_RIG, blockPose } from './block-rig';
import { STAFF_FRAME } from './generated-staves';
import { CFG } from './data';
import type { Scene } from './spawn';
export class BlockAvatar {
  readonly root = new Container();
  readonly pose = newLimbPose();
  readonly parts = new Map<string, Sprite>();
  readonly weapon: Sprite;
  readonly shadow: Sprite;
  private visualAngle?: number;
  constructor(private readonly atlas: TextureAtlas) {
    this.root.sortableChildren = true;
    this.shadow = new Sprite(atlas.get('partShadow'));
    this.shadow.anchor.set(0.5);
    this.shadow.scale.set(0.8, 0.5);
    this.shadow.alpha = 0.6;
    this.shadow.zIndex = 0;
    this.root.addChild(this.shadow);
    this.weapon = new Sprite(atlas.get('staff_ember'));
    this.root.addChild(this.weapon);
  }
  sync(scene: Scene, id: number, dt: number): void {
    const { s, world } = scene,
      pos = world.pos(id),
      pl = s.player.get(id)!,
      f = s.facing.get(id)!,
      eq = s.equip.get(id)!;
    updateWalk(this.pose, pos.x, pos.y, dt);
    this.visualAngle = fourDirection(f.angle, this.visualAngle);
    const { view, flip } = facingView(this.visualAngle);
    const duration =
        pl.weapon === 'staff' ? CFG.staff.animDur : CFG.sword.animDur,
      attack =
        pl.attackAnim > 0
          ? Math.sin((1 - pl.attackAnim / duration) * Math.PI)
          : 0,
      cast = pl.castAnim > 0 ? Math.min(1, pl.castAnim / 0.15) : 0;
    const poses = blockPose(this.pose, eq, view, flip, attack, cast);
    for (const p of poses) {
      let sprite = this.parts.get(p.part);
      if (!sprite) {
        sprite = new Sprite(this.atlas.get(p.frame));
        this.root.addChild(sprite);
        this.parts.set(p.part, sprite);
      }
      sprite.texture = this.atlas.get(p.frame);
      sprite.anchor.set(p.ax, p.ay);
      sprite.position.set(p.x, p.y);
      sprite.rotation = p.rotation;
      sprite.scale.set(p.sx, p.sy);
      sprite.zIndex = p.z;
      sprite.tint = pl.hurtFlash > 0 ? 0xffc7a5 : 0xffffff;
    }
    const hand = poses.find((p) => p.part === 'hand1')!;
    this.weapon.position.set(hand.x, hand.y);
    const staff = pl.weapon === 'staff',
      ball = pl.weapon === 'basketball';
    this.weapon.texture = this.atlas.get(
      staff ? 'staff_' + pl.skill : ball ? 'weaponBasketball' : 'weaponSword',
    );
    this.weapon.anchor.set(
      0.5,
      staff ? STAFF_FRAME.gripY / STAFF_FRAME.height : ball ? 0.5 : 28 / 32,
    );
    let rotation = staff
      ? view === 'back'
        ? -0.15
        : view === 'side'
          ? flip
            ? -0.25
            : 0.25
          : 0.16
      : ball
        ? 0
        : f.angle + Math.PI / 2 - 0.5;
    if (pl.attackAnim > 0 && !staff && !ball) {
      const t = 1 - pl.attackAnim / duration,
        eased = 1 - (1 - t) * (1 - t);
      rotation =
        pl.swingAngle + Math.PI / 2 - CFG.sword.arc / 2 + CFG.sword.arc * eased;
    } else if (staff && pl.castAnim > 0) rotation = f.angle + Math.PI / 2;
    this.weapon.rotation = rotation;
    this.weapon.scale.set(staff ? BLOCK_RIG.weaponScale : ball ? 0.65 : 0.85);
    this.weapon.zIndex = view === 'back' ? 9 : 16;
    const d = s.dodge.get(id);
    this.shadow.tint =
      d && d.invuln > 0 ? 0x9ad8ff : pl.shield > 0 ? 0xa9efc6 : 0xffffff;
  }
}
