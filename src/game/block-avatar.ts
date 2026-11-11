/** 方块旅人视图：部件 Sprite 复用，受击/攻击/施法均不写回 ECS。 */
import { Container, Sprite } from 'pixi.js';
import type { TextureAtlas } from '../engine/atlas';
import { newLimbPose, updateWalk } from '../engine/animation';
import { facingView, fourDirection } from '../engine/facing';
import { BLADES, isBlade, BLADE_MAGIC } from './weapon-data';
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
  private time = 0;
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
    this.time += dt;
    const { s, world } = scene,
      pos = world.pos(id),
      pl = s.player.get(id)!,
      f = s.facing.get(id)!,
      eq = s.equip.get(id)!;
    updateWalk(this.pose, pos.x, pos.y, dt);
    this.visualAngle = fourDirection(f.angle, this.visualAngle);
    const { view, flip } = facingView(this.visualAngle);
    const duration = isBlade(pl.weapon)
        ? s.blade.get(id)!.comboLeft > 0
          ? BLADE_MAGIC.combo.anim
          : BLADES[pl.weapon].anim
        : pl.weapon === 'staff'
          ? CFG.staff.animDur
          : CFG.sword.animDur,
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
      sprite.tint =
        pl.hurtFlash > 0
          ? 0xffc7a5
          : s.blade.get(id)!.infernoLeft > 0
            ? 0xffd5a0
            : 0xffffff;
    }
    const hand = poses.find((p) => p.part === 'hand1')!;
    this.weapon.position.set(hand.x, hand.y);
    const staff = pl.weapon === 'staff',
      ball = pl.weapon === 'basketball';
    this.weapon.texture = this.atlas.get(
      isBlade(pl.weapon)
        ? pl.weapon === 'greatsword'
          ? 'weaponGreatsword_' + (Math.floor(this.time * 12) % 4)
          : BLADES[pl.weapon].frame
        : staff
          ? 'staff_' + pl.skill
          : ball
            ? 'weaponBasketball'
            : 'weaponSword',
    );
    const blade = isBlade(pl.weapon) ? BLADES[pl.weapon] : null;
    this.weapon.anchor.set(
      blade ? blade.gripX / blade.width : 0.5,
      blade
        ? blade.gripY / blade.height
        : staff
          ? STAFF_FRAME.gripY / STAFF_FRAME.height
          : ball
            ? 0.5
            : 28 / 32,
    );
    // 长柄镰刀待机竖持，转向只小幅摆杆；挥击时才跟随真实攻击角。
    // 否则朝下瞄准会把整个镰头倒插脚边，失去轮廓和重量感。
    let rotation = staff || pl.weapon === 'scythe'
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
      const arc = blade ? blade.arc : CFG.sword.arc,
        reverse =
          pl.weapon === 'greatsword' &&
          s.blade.get(id)!.comboLeft > 0 &&
          s.blade.get(id)!.comboPhase === 2;
      rotation =
        pl.swingAngle +
        Math.PI / 2 +
        (reverse ? arc / 2 - arc * eased : -arc / 2 + arc * eased);
    } else if (staff && pl.castAnim > 0) rotation = f.angle + Math.PI / 2;
    this.weapon.rotation = rotation;
    this.weapon.scale.set(
      blade ? blade.scale : staff ? BLOCK_RIG.weaponScale : ball ? 0.75 : 1,
    );
    this.weapon.zIndex = view === 'back' ? 9 : 16;
    const d = s.dodge.get(id);
    this.shadow.tint =
      d && d.invuln > 0 ? 0x9ad8ff : pl.shield > 0 ? 0xa9efc6 : 0xffffff;
  }
}
