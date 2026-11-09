/**
 * ECS → Pixi 显示对象。对应 goengine 的 game/scene（只读 World，从不写回）。
 *
 * 与 Go 版的一个 deliberate 偏离：Go 每帧重建绘制指令（Frame），Pixi 必须复用显示对象，
 * 否则会丢掉批处理。所以这里按 Entity 维护视图池，只改 x/y/texture/tint/zIndex。
 *
 * 表现状态（走路相位、混合、上一帧位置、渲染时钟）全部存在 AvatarView / WorldView 里，
 * 绝不写回 ECS —— 这条隔离是以后接服务端权威 / 回放的前提。
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { TextureAtlas } from './atlas';
import { ANCHOR_Y, shoeSpriteName } from './art';
import { LAYER } from './layers';
import { spriteName, facingView } from './facing';
import { TILE, TILE_SPRITE } from './level';
import { RIG, bodyBob, footPos, fxFrame, handBob, handRest, newLimbPose, updateWalk, type LimbPose } from './animation';
import { FX_ANIMS, CFG } from '../game/data';
import { TAG, type Look } from '../game/components';
import type { Scene } from '../game/spawn';
import type { Camera } from './camera';

interface Parts {
  shadow: Sprite;
  feet: [Sprite, Sprite];
  body: Sprite;
  head: Sprite;
  flash: Sprite;
  weapon: Sprite;
  hands: [Sprite, Sprite];
  hpBg: Sprite;
  hpFg: Sprite;
}

interface EntityView {
  root: Container;
  look: Look;
  pose: LimbPose;
  /** 静态物件（树、拾取物、投射物）只有一个 sprite。 */
  sprite?: Sprite;
  parts?: Parts;
}

const BODY_ANCHOR_Y = ANCHOR_Y / 48;

export class WorldView {
  readonly root = new Container();
  readonly groundLayer = new Container();
  readonly decalLayer = new Container();
  readonly entityLayer = new Container();
  readonly fxLayer = new Container();
  readonly frontLayer = new Container();

  private readonly views = new Map<number, EntityView>();
  private groundSprite?: Sprite;
  private frontSprite?: Sprite;
  /** 表现层自己的时钟：特效帧率不该依赖模拟步数。 */
  private renderTime = 0;

  constructor(private readonly atlas: TextureAtlas) {
    // 层序固定：地面 → 血迹 → 实体（按 y 排） → 特效 → 前景墙。
    // 前景墙压住角色下半身，就是 Go 版「背面墙在实体之下、正面墙在实体之上」的伪 3D 做法。
    this.entityLayer.sortableChildren = true;
    this.root.addChild(this.groundLayer, this.decalLayer, this.entityLayer, this.fxLayer, this.frontLayer);
  }

  setScene(scene: Scene): void {
    for (const v of this.views.values()) {
      this.entityLayer.removeChild(v.root);
      v.root.destroy({ children: true }); // 贴图是共享图集，绝不能 destroy texture
    }
    this.views.clear();
    this.rebuildGround(scene);
    this.rebuildFront(scene);
  }

  /** 地面整张预渲染成一张 canvas → 一个 Sprite，避免 4096 个瓦片各占一个显示对象。 */
  private rebuildGround(scene: Scene): void {
    if (this.groundSprite) {
      this.groundLayer.removeChild(this.groundSprite);
      this.groundSprite.destroy({ texture: true, textureSource: true });
    }
    const { level } = scene;
    const canvas = document.createElement('canvas');
    canvas.width = level.pixelW;
    canvas.height = level.pixelH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let cy = 0; cy < level.h; cy++) {
      for (let cx = 0; cx < level.w; cx++) {
        const name = TILE_SPRITE[level.at(cx, cy)];
        const f = this.atlas.frames[name];
        if (f) ctx.drawImage(this.atlas.canvas, f.x, f.y, f.w, f.h, cx * TILE, cy * TILE, TILE, TILE);
        else {
          ctx.fillStyle = '#3a5430';
          ctx.fillRect(cx * TILE, cy * TILE, TILE, TILE);
        }
      }
    }
    const tex = Texture.from(canvas, true);
    tex.source.style.scaleMode = 'nearest';
    this.groundSprite = new Sprite(tex);
    this.groundSprite.zIndex = LAYER.GROUND;
    this.groundLayer.addChild(this.groundSprite);
  }

  /** 只画南面墙：透明底，盖在实体之上。 */
  private rebuildFront(scene: Scene): void {
    if (this.frontSprite) {
      this.frontLayer.removeChild(this.frontSprite);
      this.frontSprite.destroy({ texture: true, textureSource: true });
    }
    const { level } = scene;
    const canvas = document.createElement('canvas');
    canvas.width = level.pixelW;
    canvas.height = level.pixelH;
    const ctx = canvas.getContext('2d');
    const f = this.atlas.frames.tileWallTop;
    if (!ctx || !f) return;
    ctx.imageSmoothingEnabled = false;
    for (let cy = 0; cy < level.h; cy++) {
      for (let cx = 0; cx < level.w; cx++) {
        if (!level.southWalls[cy * level.w + cx]) continue;
        ctx.drawImage(this.atlas.canvas, f.x, f.y, f.w, f.h, cx * TILE, cy * TILE, TILE, TILE);
      }
    }
    const tex = Texture.from(canvas, true);
    tex.source.style.scaleMode = 'nearest';
    this.frontSprite = new Sprite(tex);
    this.frontLayer.addChild(this.frontSprite);
  }

  applyCamera(camera: Camera): void {
    const o = camera.offset();
    this.root.position.set(o.x, o.y);
    this.root.scale.set(camera.zoom);
  }

  /** 每渲染帧一次：对齐显示对象与 ECS。dt 用真实帧时间，走路相位才不会受固定步长影响。 */
  sync(scene: Scene, dt: number): void {
    this.renderTime += dt;
    const { world, s } = scene;
    const seen = new Set<number>();

    s.look.forEach((e, look) => {
      const p = world.positions.get(e);
      if (!p || world.isPendingDeath(e)) return;
      seen.add(e);
      let v = this.views.get(e);
      if (!v) {
        v = this.createView(look);
        this.views.set(e, v);
        this.entityLayer.addChild(v.root);
      }
      v.root.position.set(p.x, p.y);
      // 伪深度：脚底越靠下（y 越大）越后画。
      v.root.zIndex = p.y;
      if (v.parts) this.updateAvatar(v, e, look, scene, dt);
      else if (v.sprite) this.updateStatic(v.sprite, e, look, scene);
    });

    for (const [e, v] of this.views) {
      if (seen.has(e)) continue;
      this.entityLayer.removeChild(v.root);
      v.root.destroy({ children: true });
      this.views.delete(e);
    }
  }

  private createView(look: Look): EntityView {
    const root = new Container();
    const view: EntityView = { root, look, pose: newLimbPose() };
    if (look.staticSprite) {
      const sprite = new Sprite(this.atlas.get(look.staticSprite));
      sprite.anchor.set(0.5, look.family === 'prop' ? 0.88 : 0.5);
      sprite.zIndex = look.family === 'prop' ? LAYER.BODY : LAYER.FX;
      root.addChild(sprite);
      view.sprite = sprite;
      return view;
    }

    root.sortableChildren = true;
    // 部件贴图是 32×48 画布、身体只占中间 14px，等比放大一点才压得住 32px 的瓦片。
    root.scale.set((look.scale ?? 1) * 1.25);
    const mk = (name: string, ax: number, ay: number, layer: number): Sprite => {
      const s = new Sprite(this.atlas.get(name));
      s.anchor.set(ax, ay);
      s.zIndex = layer;
      root.addChild(s);
      return s;
    };
    const parts: Parts = {
      shadow: mk('partShadow', 0.5, 0.5, LAYER.SHADOW),
      feet: [mk('partFoot', 0.5, 0.5, LAYER.FEET), mk('partFoot', 0.5, 0.5, LAYER.FEET)],
      body: mk('heroFrontBody', 0.5, BODY_ANCHOR_Y, LAYER.BODY),
      head: mk('heroFrontHead', 0.5, BODY_ANCHOR_Y, LAYER.HEAD),
      flash: mk('heroFrontBody', 0.5, BODY_ANCHOR_Y, LAYER.HEAD + 1),
      weapon: mk('weaponSword', 0.5, 28 / 32, LAYER.WEAPON),
      hands: [mk('partHand', 0.5, 0.5, LAYER.HANDS), mk('partHand', 0.5, 0.5, LAYER.HANDS)],
      hpBg: mk('partShadow', 0.5, 0.5, LAYER.LABEL),
      hpFg: mk('partShadow', 0.5, 0.5, LAYER.LABEL + 1),
    };
    parts.shadow.y = 12;
    parts.flash.blendMode = 'add';
    parts.flash.alpha = 0;
    // 血条用 1×1 白点拉伸，比每帧重建 Graphics 便宜。
    parts.hpBg.texture = Texture.WHITE;
    parts.hpFg.texture = Texture.WHITE;
    parts.hpBg.anchor.set(0.5);
    parts.hpFg.anchor.set(0, 0.5);
    parts.hpBg.tint = 0x241a18;
    parts.hpFg.tint = 0xc4413b;
    parts.hpBg.width = 22;
    parts.hpBg.height = 3;
    parts.hpFg.height = 2;
    parts.hpBg.y = -35;
    parts.hpFg.y = -35;
    parts.hpBg.visible = false;
    parts.hpFg.visible = false;
    view.parts = parts;
    return view;
  }

  private updateAvatar(v: EntityView, e: number, look: Look, scene: Scene, dt: number): void {
    const parts = v.parts!;
    const { world, s } = scene;
    const p = world.pos(e);
    const rig = RIG[look.family] ?? RIG.hero;
    updateWalk(v.pose, p.x, p.y, dt);
    const bob = bodyBob(v.pose, rig);

    // 朝向归并：连续弧度 → 3 套贴图 + 水平镜像。朝左只翻，不旋转。
    const f = s.facing.get(e);
    const { view, flip } = facingView(f?.angle ?? Math.PI / 2);
    const flipX = flip ? -1 : 1;
    const bodyTex = this.atlas.get(spriteName(look.family, view, 'Body'));
    const headTex = this.atlas.get(spriteName(look.family, view, 'Head'));
    parts.body.texture = bodyTex;
    parts.head.texture = headTex;
    parts.flash.texture = bodyTex;
    // 斗篷部件先不下发（见 docs/DECISIONS.md D13），身体只剩 Body + Head。
    for (const sp of [parts.body, parts.head, parts.flash]) sp.scale.x = flipX;
    for (const sp of [parts.body, parts.head, parts.flash]) sp.y = -bob;

    // 脚：相位跟位移，不跟时间。贴墙不动时 blend 会平滑回 0，脚自然停住。
    // 鞋按「装备材质 × 视角」选贴图：侧视用带鞋头的 <Mat>Side 那张。
    // 换装只改 Equip.shoes 这个数据，这里不用加分支。
    const shoeTex = this.atlas.get(shoeSpriteName(s.equip.get(e)?.shoes ?? 'cloth', view === 'side'));
    for (let i = 0; i < 2; i++) {
      const fp = footPos(v.pose, rig, i);
      parts.feet[i].x = fp.x;
      parts.feet[i].y = rig.soleY + fp.y;
      parts.feet[i].texture = shoeTex;
      parts.feet[i].scale.set(rig.footScale);
    }
    // 手位：三档视角锚点（Go D52 之前的「不平滑」版）+ 走路摆动，
    // 不做 360° 连续插值，过对角线时手直接跳到另一组锚点。
    for (let i = 0; i < 2; i++) {
      const rest = handRest(view, i, flip);
      const hb = handBob(v.pose, rig, i);
      parts.hands[i].x = rest.x + hb.x;
      parts.hands[i].y = rest.y + hb.y - bob;
      // 悬浮手比躯干小得多，放大后会像两块装甲板。
      parts.hands[i].scale.set(0.65);
    }

    // 武器：平时随朝向，出手时用 ease-out 扫过一段弧（对应 Go 的 AttackAnim 0.22s）。
    const isPlayer = world.hasTag(e, TAG.PLAYER);
    const pl = s.player.get(e);
    const mob = s.mob.get(e);
    const aim = f?.angle ?? 0;
    const weaponName = isPlayer && pl?.weapon === 'staff' ? 'weaponStaff' : look.family === 'caster' ? 'weaponStaff' : 'weaponSword';
    parts.weapon.texture = this.atlas.get(weaponName);
    // 亡者手里是锈剑，和玩家那把亮剑一眼能分开。
    parts.weapon.tint = look.family === 'zombie' ? 0x8a8172 : 0xffffff;
    parts.weapon.anchor.set(0.5, weaponName === 'weaponStaff' ? 38 / 48 : 28 / 32);
    // 武器跟着持械手（右手）走，静止位置同样取离散锚点。
    const restR = handRest(view, 1, flip);
    const hbR = handBob(v.pose, rig, 1);
    parts.weapon.x = restR.x + hbR.x;
    parts.weapon.y = restR.y + hbR.y - bob;

    let rotate = weaponName === 'weaponStaff' ? 0.16 : aim + Math.PI / 2 - 0.55;
    let swing = 0;
    if (pl && pl.attackAnim > 0) {
      const dur = pl.weapon === 'staff' ? CFG.staff.animDur : CFG.sword.animDur;
      const prog = 1 - pl.attackAnim / dur;
      const arc = pl.weapon === 'sword' ? CFG.sword.arc : 0.5;
      rotate = pl.swingAngle + Math.PI / 2 - arc / 2 + arc * (1 - (1 - prog) * (1 - prog));
      swing = Math.sin(prog * Math.PI);
    } else if (pl && pl.castAnim > 0) {
      rotate = 0.16 + Math.sin(pl.castAnim * 18) * 0.12;
      swing = 0.6;
    } else if (mob && mob.attackAnim > 0) {
      rotate = aim + Math.PI / 2 - 0.3 + mob.attackAnim * 2;
      swing = 0.5;
    }
    parts.weapon.rotation = rotate;
    // 武器用 rotation 表达方向，不再镜像；镜像会把挥砍弧扫的方向一起翻过去。
    const wscale = (1 + swing * 0.12) * (look.family === 'zombie' ? 0.82 : 1);
    parts.weapon.scale.set(wscale, wscale);

    // 受伤闪白：同一张贴图加色混合叠上去，等价于 Go 版 shader 的 vFlash。
    const flash = Math.max(pl?.hurtFlash ?? 0, mob?.hurtFlash ?? 0);
    parts.flash.alpha = Math.min(0.85, flash * 4);
    parts.flash.x = 0;
    parts.flash.y = -bob;

    // 头顶血条
    const h = s.health.get(e);
    // 满血不画血条：一堆红色小条顶在头上会像帽子，画面也吵。挨打后再显示。
    const show = look.showHealth && !!h && h.hp < h.max;
    parts.hpBg.visible = show;
    parts.hpFg.visible = show;
    if (show && h) {
      const ratio = Math.max(0, h.hp / h.max);
      parts.hpFg.width = 20 * ratio;
      parts.hpFg.x = -10;
    }

    // 翻滚无敌帧：脚下亮环用影子放大 + 变亮代替。
    const dodge = s.dodge.get(e);
    parts.shadow.tint = dodge && dodge.invuln > 0 ? 0x9ad8ff : 0xffffff;
    parts.shadow.alpha = dodge && dodge.invuln > 0 ? 1 : 0.75;
  }

  private updateStatic(sprite: Sprite, e: number, look: Look, scene: Scene): void {
    const { s } = scene;
    const pr = s.projectile.get(e);
    if (pr) {
      const anim = FX_ANIMS[pr.kind];
      sprite.texture = this.atlas.get(fxFrame(anim, this.renderTime, this.atlas));
      sprite.rotation = Math.atan2(pr.vy, pr.vx) + Math.PI / 2;
      sprite.scale.set(1.15);
      return;
    }
    const pk = s.pickup.get(e);
    if (pk) {
      sprite.y = -4 - Math.sin(pk.bob) * 2.5;
      sprite.scale.set(1 + Math.sin(pk.bob) * 0.06);
      return;
    }
    // 火把轻微闪动：表现层的时钟，不写回 ECS。
    if (look.family === 'prop' && s.prop.get(e)?.sprite === 'propTorch') {
      sprite.alpha = 0.86 + Math.sin(this.renderTime * 9 + e) * 0.14;
    }
  }
}
