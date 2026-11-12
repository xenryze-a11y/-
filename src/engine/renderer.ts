import { sanctumGroundFrame, SANCTUM_GARDENS } from '../game/sanctum-ground';
import { landscapeGroundFrame } from '../game/landscape-art';
import { SITES } from '../game/world-data';
import { completedSite } from '../game/systems/exploration';
import { GROVE } from '../game/mage-data';
/**
 * ECS → Pixi 显示对象。对应 goengine 的 game/scene（只读 World，从不写回）。
 *
 * 与 Go 版的一个 deliberate 偏离：Go 每帧重建绘制指令（Frame），Pixi 必须复用显示对象，
 * 否则会丢掉批处理。所以这里按 Entity 维护视图池，只改 x/y/texture/tint/zIndex。
 *
 * 表现状态（走路相位、混合、上一帧位置、渲染时钟）全部存在 AvatarView / WorldView 里，
 * 绝不写回 ECS —— 这条隔离是以后接服务端权威 / 回放的前提。
 */
import { Container, Sprite, Texture, Text, Rectangle } from 'pixi.js';
import { riftFrame, BLADE_MAGIC } from '../game/weapon-data';
import { BlockAvatar } from '../game/block-avatar';
import { SanctuaryView } from '../game/sanctuary-view';
import {
  NPCS,
  SANCTUARY,
  inCathedral,
  onCathedral,
} from '../game/sanctuary-data';
import type { TextureAtlas } from './atlas';
import { ANCHOR_Y, shoeSpriteName } from './art';
import { LAYER } from './layers';
import { PIXEL_FX } from '../game/spell-visuals';
import { BASKETBALL_VISUAL, summonFrameAt } from '../game/basketball-content';
import { STAFF_FRAME } from '../game/generated-staves';
import { makeRng } from './math';
import { spriteName, facingView, fourDirection } from './facing';
import { TILE, TILE_SPRITE, Tile } from './level';
import {
  RIG,
  bodyBob,
  footPos,
  fxFrame,
  handBob,
  handRest,
  newLimbPose,
  updateWalk,
  type LimbPose,
} from './animation';
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
  visualAngle?: number;
  block?: BlockAvatar;
  npcLabel?: Text;
}

const BODY_ANCHOR_Y = ANCHOR_Y / 48;

export class WorldView {
  readonly root = new Container();
  readonly groundLayer = new Container();
  readonly decalLayer = new Container();
  readonly entityLayer = new Container();
  readonly fxLayer = new Container();
  readonly lightLayer = new Container();
  readonly roofLayer = new Container();
  readonly buildingFrontLayer = new Container();
  readonly sanctuary: SanctuaryView;
  readonly walls: {
    sprite: Sprite;
    x: number;
    y: number;
    depth: number;
    alpha: number;
  }[] = [];
  private readonly lights = new Map<number, Sprite>();

  private readonly views = new Map<number, EntityView>();
  private readonly groundChunks = new Map<
    string,
    { sprite: Sprite; used: number; slot: number }
  >();
  private groundTick = 0;
  private groundAtlas?: Texture;
  private groundCanvas?: HTMLCanvasElement;
  private groundAtlasSize = 2048;
  private camera?: Camera;
  private viewBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  get performanceStats() {
    return {
      groundChunks: this.groundChunks.size,
      groundTextureBytes: this.groundAtlas ? this.groundAtlasSize ** 2 * 4 : 0,
      groundTextureSources: this.groundAtlas ? 1 : 0,
      entityViews: this.views.size,
      visibleWalls: this.walls.filter((w) => w.sprite.visible).length,
    };
  }
  /** 表现层自己的时钟：特效帧率不该依赖模拟步数。 */
  private renderTime = 0;

  constructor(private readonly atlas: TextureAtlas) {
    // 地面 → 血迹 → 火光 → 实体与墙（共用脚底深度）→ 特效。
    this.entityLayer.sortableChildren = true;
    this.buildingFrontLayer.sortableChildren = true;
    this.root.addChild(
      this.groundLayer,
      this.decalLayer,
      this.lightLayer,
      this.entityLayer,
      this.fxLayer,
      this.roofLayer,
      this.buildingFrontLayer,
    );
    this.sanctuary = new SanctuaryView(atlas, this.groundLayer, this.roofLayer);
  }

  setScene(scene: Scene): void {
    for (const v of this.views.values()) {
      v.root.removeFromParent();
      v.root.destroy({ children: true }); // 贴图是共享图集，绝不能 destroy texture
    }
    this.views.clear();
    this.clearGround();
    this.rebuildWalls(scene);
    this.sanctuary.reset();
  }

  private clearGround(): void {
    for (const c of this.groundChunks.values())
      c.sprite.destroy({ texture: true });
    this.groundChunks.clear();
    this.groundAtlas?.destroy(true);
    this.groundAtlas = undefined;
    this.groundCanvas = undefined;
  }
  private updateBounds(scene: Scene): void {
    const p = this.camera?.pos || scene.world.pos(scene.player),
      halfW = (this.camera?.w || innerWidth) / (2 * (this.camera?.zoom || 2)),
      halfH = (this.camera?.h || innerHeight) / (2 * (this.camera?.zoom || 2));
    this.viewBounds = {
      left: p.x - halfW - 192,
      right: p.x + halfW + 192,
      top: p.y - halfH - 192,
      bottom: p.y + halfH + 400,
    };
  }
  private syncGround(scene: Scene): void {
    this.groundTick++;
    const p = this.camera?.pos || scene.world.pos(scene.player),
      halfW =
        (this.camera?.w || innerWidth) / (2 * (this.camera?.zoom || 2)) + 64,
      halfH =
        (this.camera?.h || innerHeight) / (2 * (this.camera?.zoom || 2)) + 64;
    const needed: { key: string; x: number; y: number }[] = [];
    for (
      let y = Math.max(0, Math.floor((p.y - halfH) / 512));
      y <=
      Math.min(
        Math.ceil(scene.level.pixelH / 512) - 1,
        Math.floor((p.y + halfH) / 512),
      );
      y++
    )
      for (
        let x = Math.max(0, Math.floor((p.x - halfW) / 512));
        x <=
        Math.min(
          Math.ceil(scene.level.pixelW / 512) - 1,
          Math.floor((p.x + halfW) / 512),
        );
        x++
      )
        needed.push({ key: `${x}:${y}`, x, y });
    const size =
      (Math.ceil((halfW * 2) / 512) + 1) * (Math.ceil((halfH * 2) / 512) + 1) >
      16
        ? 4096
        : 2048;
    if (this.groundAtlas && this.groundAtlasSize !== size) this.clearGround();
    if (!this.groundAtlas) {
      this.groundAtlasSize = size;
      this.groundCanvas = document.createElement('canvas');
      this.groundCanvas.width = size;
      this.groundCanvas.height = size;
      this.groundAtlas = Texture.from(this.groundCanvas, true);
      this.groundAtlas.source.style.scaleMode = 'nearest';
      this.groundAtlas.source.autoGenerateMipmaps = false;
    }
    const keys = new Set(needed.map((n) => n.key)),
      capacity = (this.groundAtlasSize / 512) ** 2;
    for (const [key, c] of this.groundChunks) c.sprite.visible = keys.has(key);
    for (const n of needed) {
      let c = this.groundChunks.get(n.key);
      if (!c) {
        let slot: number;
        if (this.groundChunks.size >= capacity) {
          const oldest = [...this.groundChunks]
            .filter(([key]) => !keys.has(key))
            .sort((a, b) => a[1].used - b[1].used)[0];
          if (!oldest) continue;
          slot = oldest[1].slot;
          oldest[1].sprite.destroy({ texture: true });
          this.groundChunks.delete(oldest[0]);
        } else {
          const used = new Set(
            [...this.groundChunks.values()].map((c) => c.slot),
          );
          slot = 0;
          while (used.has(slot)) slot++;
        }
        c = {
          sprite: this.bakeGroundChunk(scene, n.x, n.y, slot),
          used: this.groundTick,
          slot,
        };
        this.groundChunks.set(n.key, c);
        this.groundLayer.addChildAt(c.sprite, 0);
      }
      c.used = this.groundTick;
      c.sprite.visible = true;
    }
  }
  private bakeGroundChunk(
    scene: Scene,
    cx: number,
    cy: number,
    slot: number,
  ): Sprite {
    const level = scene.level,
      c = document.createElement('canvas');
    c.width = Math.min(512, level.pixelW - cx * 512);
    c.height = Math.min(512, level.pixelH - cy * 512);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.translate(-cx * 512, -cy * 512);
    for (let y = cy * 16; y < Math.min(level.h, cy * 16 + 16); y++)
      for (let x = cx * 16; x < Math.min(level.w, cx * 16 + 16); x++) {
        const tile = level.at(x, y),
          sanctum = sanctumGroundFrame(x, y, tile),
          generated = !sanctum ? landscapeGroundFrame(level, x, y) : undefined,
          name =
            sanctum ||
            generated ||
            TILE_SPRITE[tile === Tile.WALL ? Tile.STONE : tile],
          f = this.atlas.frames[name];
        g.drawImage(
          this.atlas.canvas,
          f.x + (generated ? (x % 4) * 32 : 0),
          f.y + (generated ? (y % 4) * 32 : 0),
          generated ? 32 : f.w,
          generated ? 32 : f.h,
          x * 32,
          y * 32,
          32,
          32,
        );
        if (sanctum || generated) continue;
        // Tile-local variations avoid a repeated carpet without introducing texture seams.
        const rng = makeRng(x * 73471 + y * 3571 + CFG.seed);
        if (tile === Tile.GRASS) {
          for (let i = 0; i < 7; i++) {
            g.fillStyle = i % 3 ? '#526c49' : '#6c8051';
            g.fillRect(
              x * 32 + ((rng() * 30) | 0),
              y * 32 + ((rng() * 30) | 0),
              1,
              2,
            );
          }
        }
        if (tile !== Tile.WALL && tile !== Tile.WATER) {
          if (level.at(x, y - 1) === Tile.WALL) {
            const grad = g.createLinearGradient(0, y * 32, 0, y * 32 + 25);
            grad.addColorStop(0, 'rgba(7,19,17,.45)');
            grad.addColorStop(1, 'rgba(7,19,17,0)');
            g.fillStyle = grad;
            g.fillRect(x * 32, y * 32, 32, 25);
          }
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (level.at(x + dx, y + dy) === Tile.WATER) {
              g.fillStyle = '#718376';
              g.fillRect(
                x * 32 + (dx === 1 ? 30 : 0),
                y * 32 + (dy === 1 ? 30 : 0),
                dx ? 2 : 32,
                dy ? 2 : 32,
              );
            }
        }
        if (tile === Tile.ROAD || tile === Tile.DIRT) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (level.at(x + dx, y + dy) === Tile.GRASS) {
              for (let i = 0; i < 17; i++) {
                const along = (rng() * 32) | 0,
                  depth = 1 + ((rng() * 4) | 0);
                g.fillStyle = i % 3 ? '#4b6247' : '#667a4e';
                g.fillRect(
                  x * 32 + (dx === 1 ? 32 - depth : dx === -1 ? 0 : along),
                  y * 32 + (dy === 1 ? 32 - depth : dy === -1 ? 0 : along),
                  dx ? depth : 1,
                  dy ? depth : 1,
                );
              }
            }
        }
      }
    const decal = (name: string, x: number, y: number) => {
      const f = this.atlas.frames[name];
      g.drawImage(
        this.atlas.canvas,
        f.x,
        f.y,
        f.w,
        f.h,
        Math.round(x - f.w / 2),
        Math.round(y - f.h / 2),
        f.w,
        f.h,
      );
    };
    decal('groundSacredRoots', GROVE.tree.x, GROVE.tree.y - 2);
    decal('groundSacredMosaic', GROVE.altar.x, GROVE.altar.y + 115);
    for (const at of SANCTUM_GARDENS)
      decal('groundSacredGarden', at.x, at.y - 12);
    const columns = this.groundAtlasSize / 512,
      x = (slot % columns) * 512,
      y = Math.floor(slot / columns) * 512,
      gc = this.groundCanvas!.getContext('2d')!;
    gc.clearRect(x, y, 512, 512);
    gc.drawImage(c, x, y);
    this.groundAtlas!.source.update();
    const texture = new Texture({
        source: this.groundAtlas!.source,
        frame: new Rectangle(x, y, c.width, c.height),
      }),
      sprite = new Sprite(texture);
    sprite.position.set(cx * 512, cy * 512);
    return sprite;
  }
  /** 墙脚和人物脚底共用同一排序，不能把南墙整张烘焙在最高层。 */
  private rebuildWalls(scene: Scene): void {
    for (const wall of this.walls) wall.sprite.destroy();
    this.walls.length = 0;
    const level = scene.level;
    for (let y = 0; y < level.h; y++)
      for (let x = 0; x < level.w; x++)
        if (level.at(x, y) === Tile.WALL || level.at(x, y) === Tile.CLIFF) {
          const sprite = new Sprite(
            this.atlas.get(
              level.at(x, y) === Tile.CLIFF
                ? 'tileCliffRaised'
                : 'tileWallRaised' + ((x + y * 7) % 4),
            ),
          );
          sprite.position.set(x * TILE, y * TILE - TILE);
          sprite.zIndex = (y + 1) * TILE + 0.1;
          this.entityLayer.addChild(sprite);
          this.walls.push({
            sprite,
            x: x * TILE,
            y: y * TILE,
            depth: (y + 1) * TILE,
            alpha: 1,
          });
        }
  }

  applyCamera(camera: Camera): void {
    this.camera = camera;
    const o = camera.offset();
    this.root.position.set(o.x, o.y);
    this.root.scale.set(camera.zoom);
  }

  /** 每渲染帧一次：对齐显示对象与 ECS。dt 用真实帧时间，走路相位才不会受固定步长影响。 */
  sync(scene: Scene, dt: number): void {
    this.renderTime += dt;
    this.updateBounds(scene);
    this.syncGround(scene);
    const { world, s } = scene;
    const seen = new Set<number>();

    s.look.forEach((e, look) => {
      const p = world.positions.get(e);
      if (!p || world.isPendingDeath(e)) return;
      const bounds = this.viewBounds;
      if (
        e !== scene.player &&
        (p.x < bounds.left ||
          p.x > bounds.right ||
          p.y < bounds.top ||
          p.y > bounds.bottom)
      )
        return;
      seen.add(e);
      let v = this.views.get(e);
      if (!v) {
        v = this.createView(look);
        this.views.set(e, v);
        this.entityLayer.addChild(v.root);
      }
      // 南立面前的角色按脚底站在屋面前；不能为露出头部而把屋顶从外面变透明。
      const church = SANCTUARY.cathedral,
        front =
          p.y >= church.y + church.h &&
          p.x >= church.x - 40 &&
          p.x <= church.x + church.w + 40,
        targetLayer = front ? this.buildingFrontLayer : this.entityLayer;
      if (v.root.parent !== targetLayer) targetLayer.addChild(v.root);
      v.root.position.set(p.x, p.y);
      // 伪深度：脚底越靠下（y 越大）越后画。
      v.root.zIndex = p.y;
      v.root.visible =
        e === scene.player ||
        !inCathedral(p) ||
        inCathedral(world.pos(scene.player));
      if (v.block) v.block.sync(scene, e, dt);
      else if (v.parts) this.updateAvatar(v, e, look, scene, dt);
      else if (v.sprite) this.updateStatic(v.sprite, e, look, scene);
      const landmark = s.prop.get(e)?.landmark;
      if (landmark && v.sprite) {
        const definition = SITES.find((d) => d.id === landmark)!;
        const active =
          definition.kind === 'waypoint'
            ? scene.progress.waypoints.includes(landmark)
            : completedSite(scene, definition);
        v.sprite.texture = this.atlas.get(
          look.staticSprite + (active ? 'Active' : ''),
        );
        if (!v.npcLabel) {
          v.npcLabel = new Text({
            text: definition.name,
            style: {
              fontFamily: 'system-ui',
              fontSize: 9,
              fill: 0xe6dfbc,
              stroke: { color: 0x182c29, width: 3 },
            },
          });
          v.npcLabel.anchor.set(0.5, 1);
          v.npcLabel.y = 18;
          v.root.addChild(v.npcLabel);
        }
        v.npcLabel.visible =
          Math.hypot(
            p.x - world.pos(scene.player).x,
            p.y - world.pos(scene.player).y,
          ) < 230;
      }
      const npc = s.npc.get(e);
      if (npc && !v.npcLabel) {
        const def = NPCS[npc.kind];
        v.npcLabel = new Text({
          text: def.name,
          style: {
            fontFamily: 'system-ui',
            fontSize: 9,
            fill: 0xe8dfb2,
            stroke: { color: 0x20352e, width: 3 },
          },
        });
        v.npcLabel.anchor.set(0.5, 1);
        v.npcLabel.y = npc.kind === 'herald' ? -92 : 15;
        v.root.addChild(v.npcLabel);
      }
    });

    for (const [e, v] of this.views) {
      if (seen.has(e)) continue;
      v.root.removeFromParent();
      v.root.destroy({ children: true });
      this.views.delete(e);
    }
    this.sanctuary.sync(scene, dt);
    const player = world.pos(scene.player);
    for (const wall of this.walls) {
      wall.sprite.visible =
        wall.x > this.viewBounds.left - 32 &&
        wall.x < this.viewBounds.right + 32 &&
        wall.y > this.viewBounds.top - 64 &&
        wall.y < this.viewBounds.bottom;
      if (!wall.sprite.visible) continue;
      const hides =
        player.y < wall.depth &&
        player.y > wall.y - 53 &&
        player.x > wall.x - 13 &&
        player.x < wall.x + 45;
      wall.alpha +=
        ((onCathedral({ x: wall.x + 16, y: wall.y + 16 }) && inCathedral(player)
          ? 0.35
          : hides
            ? 0.22
            : 1) -
          wall.alpha) *
        (1 - Math.exp(-14 * dt));
      wall.sprite.alpha = wall.alpha;
    }
    for (const [id, v] of this.views)
      if (
        [
          'propTree',
          'propBlightTree',
          'propDeadTree',
          'propAncientTree',
        ].includes(v.look.staticSprite || '') &&
        v.sprite
      ) {
        const p = world.pos(id),
          hides =
            player.y < p.y &&
            player.y > p.y - (s.prop.get(id)?.h || 128) + 15 &&
            Math.abs(player.x - p.x) < (s.prop.get(id)?.w || 96) * 0.43;
        v.sprite.alpha +=
          ((hides ? 0.33 : 1) - v.sprite.alpha) * (1 - Math.exp(-10 * dt));
      }
    const aliveLights = new Set<number>();
    s.prop.forEach((id, prop) => {
      if (prop.sprite !== 'propTorch' && prop.sprite !== 'propChurchCandles')
        return;
      aliveLights.add(id);
      let light = this.lights.get(id);
      if (!light) {
        light = new Sprite(this.atlas.get('partGlow'));
        light.anchor.set(0.5);
        light.blendMode = 'add';
        this.lightLayer.addChild(light);
        this.lights.set(id, light);
      }
      const p = world.pos(id);
      light.visible = !inCathedral(p) || inCathedral(player);
      light.position.set(p.x, p.y - 8);
      light.scale.set(1, 0.7);
      light.alpha = 0.7 + Math.sin(this.renderTime * 7 + id) * 0.1;
    });
    for (const [id, light] of this.lights)
      if (!aliveLights.has(id)) {
        light.destroy();
        this.lights.delete(id);
      }
  }

  private createView(look: Look): EntityView {
    if (look.family === 'hero') {
      const block = new BlockAvatar(this.atlas);
      return { root: block.root, look, pose: block.pose, block };
    }
    const root = new Container();
    const view: EntityView = { root, look, pose: newLimbPose() };
    if (look.staticSprite) {
      const sprite = new Sprite(this.atlas.get(look.staticSprite));
      const tree = [
        'propTree',
        'propBlightTree',
        'propDeadTree',
        'propAncientTree',
      ].includes(look.staticSprite || '');
      sprite.anchor.set(
        0.5,
        tree
          ? (sprite.texture.frame.height - 2) / sprite.texture.frame.height
          : look.staticSprite?.startsWith('propChurch')
            ? (sprite.texture.frame.height - 2) / sprite.texture.frame.height
            : look.staticSprite === 'propAltar'
              ? 94 / 96
              : look.family === 'prop'
                ? 0.88
                : 0.5,
      );
      if (
        look.family === 'prop' &&
        (look.staticSprite.startsWith('land') ||
          [
            'propRuinArch',
            'propRuinPillar',
            'propFungus',
            'propRuinChapel',
          ].includes(look.staticSprite))
      )
        sprite.anchor.y =
          (sprite.texture.frame.height - 2) / sprite.texture.frame.height;
      sprite.zIndex = look.family === 'prop' ? LAYER.BODY : LAYER.FX;
      if (look.family === 'summon') {
        const shadow = new Sprite(this.atlas.get('partShadow'));
        shadow.anchor.set(0.5);
        shadow.scale.set(0.5, 0.32);
        shadow.alpha = 0.6;
        root.addChild(shadow);
      }
      if (
        look.family === 'prop' &&
        !['propAncientTree', 'propAltar', 'propSanctuaryGarden'].includes(
          look.staticSprite || '',
        )
      ) {
        const shadow = new Sprite(this.atlas.get('partPropShadow'));
        shadow.anchor.set(0.5);
        shadow.position.set(4, 4);
        shadow.scale.set(
          look.staticSprite === 'propAncientTree'
            ? 3.6
            : look.staticSprite === 'propTree'
              ? 1.5
              : 0.7,
          look.staticSprite === 'propAncientTree' ? 1.4 : 0.65,
        );
        root.addChild(shadow);
      }
      root.addChild(sprite);
      view.sprite = sprite;
      return view;
    }

    root.sortableChildren = true;
    // 部件贴图是 32×48 画布、身体只占中间 14px，等比放大一点才压得住 32px 的瓦片。
    root.scale.set((look.scale ?? 1) * 1.25);
    const mk = (
      name: string,
      ax: number,
      ay: number,
      layer: number,
    ): Sprite => {
      const s = new Sprite(this.atlas.get(name));
      s.anchor.set(ax, ay);
      s.zIndex = layer;
      root.addChild(s);
      return s;
    };
    const parts: Parts = {
      shadow: mk('partShadow', 0.5, 0.5, LAYER.SHADOW),
      feet: [
        mk('partFoot', 0.5, 0.5, LAYER.FEET),
        mk('partFoot', 0.5, 0.5, LAYER.FEET),
      ],
      body: mk('heroFrontBody', 0.5, BODY_ANCHOR_Y, LAYER.BODY),
      head: mk('heroFrontHead', 0.5, BODY_ANCHOR_Y, LAYER.HEAD),
      flash: mk('heroFrontBody', 0.5, BODY_ANCHOR_Y, LAYER.HEAD + 1),
      weapon: mk('weaponSword', 0.5, 28 / 32, LAYER.WEAPON),
      hands: [
        mk('partHand', 0.5, 0.5, LAYER.HANDS),
        mk('partHand', 0.5, 0.5, LAYER.HANDS),
      ],
      hpBg: mk('partShadow', 0.5, 0.5, LAYER.LABEL),
      hpFg: mk('partShadow', 0.5, 0.5, LAYER.LABEL + 1),
    };
    parts.shadow.y = 0;
    parts.shadow.scale.set(1, 0.65);
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
    parts.hpBg.y = -43;
    parts.hpFg.y = -43;
    parts.hpBg.visible = false;
    parts.hpFg.visible = false;
    view.parts = parts;
    return view;
  }

  private updateAvatar(
    v: EntityView,
    e: number,
    look: Look,
    scene: Scene,
    dt: number,
  ): void {
    const parts = v.parts!;
    const { world, s } = scene;
    const p = world.pos(e);
    const rig = RIG[look.family] ?? RIG.hero;
    updateWalk(v.pose, p.x, p.y, dt);
    const bob = bodyBob(v.pose, rig);

    // 朝向归并：连续弧度 → 3 套贴图 + 水平镜像。朝左只翻，不旋转。
    const f = s.facing.get(e);
    v.visualAngle = fourDirection(f?.angle ?? Math.PI / 2, v.visualAngle);
    const { view, flip } = facingView(v.visualAngle);
    const flipX = flip ? -1 : 1;
    const bodyTex = this.atlas.get(spriteName(look.family, view, 'Body'));
    const headTex = this.atlas.get(spriteName(look.family, view, 'Head'));
    parts.body.texture = bodyTex;
    parts.head.texture = headTex;
    parts.flash.texture = bodyTex;
    // 斗篷部件先不下发（见 docs/DECISIONS.md D13），身体只剩 Body + Head。
    for (const sp of [parts.body, parts.head, parts.flash]) sp.scale.x = flipX;
    for (const sp of [parts.body, parts.head, parts.flash]) sp.y = -bob - 12;

    // 脚：相位跟位移，不跟时间。贴墙不动时 blend 会平滑回 0，脚自然停住。
    // 鞋按「装备材质 × 视角」选贴图：侧视用带鞋头的 <Mat>Side 那张。
    // 换装只改 Equip.shoes 这个数据，这里不用加分支。
    const shoeTex = this.atlas.get(
      shoeSpriteName(s.equip.get(e)?.shoes ?? 'cloth', view === 'side'),
    );
    for (let i = 0; i < 2; i++) {
      const fp = footPos(v.pose, rig, i, view, flip);
      parts.feet[i].x = fp.x;
      parts.feet[i].y = rig.soleY + fp.y - 12;
      parts.feet[i].texture = shoeTex;
      parts.feet[i].anchor.set(view === 'side' ? 4.5 / 12 : 0.5, 13 / 14);
      parts.feet[i].zIndex = view === 'side' && i === 0 ? 9 : 11;
      parts.feet[i].scale.set(rig.footScale * flipX, rig.footScale);
    }
    // 手位：三档视角锚点（Go D52 之前的「不平滑」版）+ 走路摆动，
    // 不做 360° 连续插值，过对角线时手直接跳到另一组锚点。
    for (let i = 0; i < 2; i++) {
      const rest = handRest(view, i, flip);
      const hb = handBob(v.pose, rig, i);
      parts.hands[i].x = rest.x + hb.x;
      parts.hands[i].y = rest.y + hb.y - bob - 12;
      // 手掌内侧与衣袖接近，仍保持独立像素部件。
      parts.hands[i].scale.set(1);
    }

    // 武器：平时随朝向，出手时用 ease-out 扫过一段弧（对应 Go 的 AttackAnim 0.22s）。
    const isPlayer = world.hasTag(e, TAG.PLAYER);
    const pl = s.player.get(e);
    const mob = s.mob.get(e);
    const aim = f?.angle ?? 0;
    const staff =
      (isPlayer && pl?.weapon === 'staff') || look.family === 'caster';
    const basketball = pl?.weapon === 'basketball';
    const weaponName = basketball
      ? 'weaponBasketball'
      : staff
        ? pl
          ? 'staff_' + pl.skill
          : 'weaponStaff'
        : 'weaponSword';
    parts.weapon.texture = this.atlas.get(weaponName);
    // 亡者手里是锈剑，和玩家那把亮剑一眼能分开。
    parts.weapon.tint = look.family === 'zombie' ? 0x8a8172 : 0xffffff;
    parts.weapon.anchor.set(
      0.5,
      basketball
        ? 0.5
        : staff
          ? pl
            ? STAFF_FRAME.gripY / STAFF_FRAME.height
            : 38 / 48
          : 28 / 32,
    );
    // 武器跟着持械手（右手）走，静止位置同样取离散锚点。
    const restR = handRest(view, 1, flip);
    const hbR = handBob(v.pose, rig, 1);
    parts.weapon.x = restR.x + hbR.x;
    parts.weapon.y = restR.y + hbR.y - bob - 12;

    let rotate = staff ? 0.16 : aim + Math.PI / 2 - 0.55;
    let swing = 0;
    if (pl && pl.attackAnim > 0) {
      const dur = pl.weapon === 'staff' ? CFG.staff.animDur : CFG.sword.animDur;
      const prog = 1 - pl.attackAnim / dur;
      const arc = pl.weapon === 'sword' ? CFG.sword.arc : 0.5;
      rotate =
        pl.swingAngle +
        Math.PI / 2 -
        arc / 2 +
        arc * (1 - (1 - prog) * (1 - prog));
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
    parts.flash.y = -bob - 12;

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

    parts.body.zIndex = 10;
    parts.head.zIndex = 14;
    parts.hands[0].zIndex = view === 'back' ? 8 : 16;
    parts.hands[1].zIndex = view === 'back' ? 9 : 17;
    parts.weapon.zIndex =
      view === 'back' ? 9 : view === 'side' && flip ? 11 : 16;
    if (staff) {
      parts.weapon.rotation =
        view === 'back' ? -0.22 : view === 'front' ? 0.2 : flip ? -0.34 : 0.34;
      if (pl && pl.castAnim > 0) parts.weapon.rotation = aim + Math.PI / 2;
    }
    parts.body.tint = mob?.kind === 'lunge' ? 0xb7a38c : 0xffffff;
    parts.head.tint = mob?.kind === 'lunge' ? 0xe0c08a : 0xffffff;
    if ((mob?.slow || 0) > 0) {
      parts.body.tint = 0x94cfe0;
      parts.head.tint = 0xa9d9e5;
    }
    if ((mob?.frozen || 0) > 0) {
      parts.body.tint = 0x79cae9;
      parts.head.tint = 0x9ddff5;
    }
    parts.body.rotation =
      (mob?.windup || 0) > 0 ? Math.sin(mob!.windup! * 8) * 0.045 : 0;
    parts.head.rotation = -parts.body.rotation * 0.5;
    if (mob?.kind === 'caster')
      v.root.y -= Math.sin(this.renderTime * 2 + e) * 1.2;
    if (look.family === 'zombie') {
      parts.weapon.visible = false;
      parts.hands.forEach((hand) => (hand.tint = 0xa3b58c));
    }
    if (basketball) {
      parts.weapon.rotation = 0;
      parts.weapon.scale.set(0.8);
      parts.weapon.x += flip ? -3 : 3;
      parts.weapon.y -= 3;
    }
    // 翻滚无敌帧：脚下亮环用影子放大 + 变亮代替。
    const dodge = s.dodge.get(e);
    parts.shadow.tint = dodge && dodge.invuln > 0 ? 0x9ad8ff : 0xffffff;
    parts.shadow.alpha = dodge && dodge.invuln > 0 ? 1 : 0.6;
    if (pl && pl.shield > 0) {
      parts.shadow.tint = 0xa9efc6;
      parts.shadow.alpha = 0.9;
    }
  }

  private updateStatic(
    sprite: Sprite,
    e: number,
    look: Look,
    scene: Scene,
  ): void {
    const { s } = scene;
    const rift = s.rift.get(e);
    if (rift) {
      const frame = riftFrame(rift.kind, rift.age, rift.windup);
      sprite.visible = frame >= 0;
      sprite.texture = this.atlas.get(
        (rift.kind === 'claw' ? 'demonClaw_' : 'demonSpike_') +
          Math.max(0, frame),
      );
      sprite.anchor.set(0.5, 1);
      sprite.y = 2;
      return;
    }
    const wave = s.flameWave.get(e);
    if (wave) {
      sprite.texture = this.atlas.get(
        'bladeFlameWave_' + (Math.floor(wave.age * 16) % 6),
      );
      sprite.anchor.set(0.5);
      sprite.y = -10;
      sprite.scale.set(BLADE_MAGIC.wave.visualScale);
      sprite.rotation = Math.atan2(wave.vy, wave.vx);
      return;
    }
    const npc = s.npc.get(e);
    if (npc) {
      sprite.texture = this.atlas.get(
        (npc.kind === 'herald' ? 'npcHerald_' : 'npcPriest_') +
          (Math.floor(this.renderTime * 4) % 4),
      );
      sprite.anchor.set(0.5, npc.kind === 'herald' ? 94 / 112 : 60 / 64);
      sprite.y = npc.kind === 'herald' ? -2 : 0;
      return;
    }
    const summon = s.summon.get(e);
    if (summon) {
      sprite.texture = this.atlas.get(
        'summon_' + summonFrameAt(this.renderTime + e * 0.037),
      );
      sprite.anchor.set(0.5, 1);
      sprite.rotation = 0;
      sprite.y = -1;
      sprite.scale.set(
        (Math.cos(summon.angle) < 0 ? -1 : 1) * BASKETBALL_VISUAL.scale,
        BASKETBALL_VISUAL.scale,
      );
      return;
    }
    const meteor = s.meteor.get(e);
    if (meteor) {
      sprite.texture = this.atlas.get('artMeteor');
      sprite.anchor.set(0.5, 1);
      sprite.y = -6 - Math.max(0, meteor.delay / meteor.maxDelay) * 130;
      sprite.rotation = 0;
      sprite.scale.set(1);
      return;
    }
    const art = s.staffShot.get(e);
    if (art) {
      sprite.texture = this.atlas.get(
        art.style === 'lance'
          ? 'artFlameLance'
          : `missile_${art.school}_${Math.floor(this.renderTime * PIXEL_FX.fps) % PIXEL_FX.projectileFrames}`,
      );
      sprite.anchor.set(0.5);
      sprite.y = -12;
      sprite.rotation = art.style === 'star' ? 0 : Math.atan2(art.vy, art.vx);
      sprite.scale.set(art.style === 'star' ? 1.1 : 1.25);
      return;
    }
    const pr = s.projectile.get(e);
    if (pr) {
      const anim = FX_ANIMS[pr.kind];
      sprite.texture = pr.barrage
        ? this.atlas.get(
            'electricOrb_' + (Math.floor(this.renderTime * 15) % 8),
          )
        : pr.element
          ? this.atlas.get(
              `missile_${pr.element}_${Math.floor(this.renderTime * PIXEL_FX.fps) % PIXEL_FX.projectileFrames}`,
            )
          : this.atlas.get(fxFrame(anim, this.renderTime, this.atlas));
      sprite.y = -12;
      sprite.rotation = pr.barrage ? 0 : Math.atan2(pr.vy, pr.vx);
      sprite.scale.set(1);
      return;
    }
    const pk = s.pickup.get(e);
    if (pk?.kind === 'storm') {
      sprite.y = -24 - Math.sin(pk.bob) * 2;
      sprite.scale.set(0.72);
      return;
    }
    if (pk) {
      sprite.y = -4 - Math.sin(pk.bob) * 2.5;
      sprite.scale.set(
        look.staticSprite?.startsWith('item_')
          ? 0.48
          : 1 + Math.sin(pk.bob) * 0.06,
      );
      return;
    }
    // 火把轻微闪动：表现层的时钟，不写回 ECS。
    if (look.family === 'prop' && s.prop.get(e)?.sprite === 'propTorch') {
      sprite.alpha = 0.86 + Math.sin(this.renderTime * 9 + e) * 0.14;
    }
  }
}
