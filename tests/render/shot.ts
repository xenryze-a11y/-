/**
 * 无头出图：在 Node 里重建运行时图集 + 场景 + 角色姿态，导出 PNG。
 *
 * 目的不是替代游戏，而是让协作者能「亲眼」看到画面（HUD、配色、构图、
 * 新增细条/行是否有排版问题），而不是只信类型检查与单元测试。
 *
 * 运行：node tests/render/run-shot.mjs <场景> [输出路径]
 *   node tests/render/run-shot.mjs hero docs/shots/hero.png
 *   node tests/render/run-shot.mjs atlas docs/shots/atlas.png
 *   node tests/render/run-shot.mjs field docs/shots/field.png
 *
 * 这里所有绘制规则都从 renderer.ts / block-avatar.ts 逐条对照抄来，
 * 任何一处对不上都是 bug——改动渲染逻辑时请同步改这里。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// shim 必须在 import art 之前装好（installShim 是模块副作用）。
const { installShim } = await import('./canvas-shim');
installShim();
const { buildProceduralAtlas } = await import('../../src/engine/art');
const { applyGeneratedStaves } = await import(
  '../../src/game/generated-staves'
);
const { applyBasketballAssets } = await import(
  '../../src/game/basketball-assets'
);
const { applyGroveArt } = await import('../../src/game/grove-art');
const { applyStaffArt } = await import('../../src/game/staff-art');
const { applyGeneratedBlades } = await import('../../src/game/generated-blades');
const { applyGeneratedScytheVfx } = await import(
  '../../src/game/generated-scythe-vfx'
);
const {
  applyGeneratedFlameArt,
  applyGeneratedSanctuaryArt,
} = await import('../../src/game/generated-flame-sanctuary');
const { applyRebuiltSanctumArt } = await import(
  '../../src/game/sanctum-rebuilt-art'
);
const { applyLandscapeArt, landscapeGroundFrame } = await import(
  '../../src/game/landscape-art'
);
const { applyCartoonSceneArt, drawCartoonGroundEdges } = await import(
  '../../src/game/cartoon-scene-art'
);
const { blockPose, BLOCK_RIG } = await import('../../src/game/block-rig');
const { TILE_SPRITE, Tile, Level } = await import('../../src/engine/level');
const { sanctumGroundFrame } = await import('../../src/game/sanctum-ground');
const { newLimbPose, updateWalk } = await import('../../src/engine/animation');
const { facingView } = await import('../../src/engine/facing');
const { encodePng } = await import('./png');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

interface AtlasLike {
  canvas: HTMLCanvasElement;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
}

/** 复刻 TextureAtlas.load() 的完整覆盖链——少一步就会漏掉生成素材。 */
async function buildRuntimeAtlas(): Promise<AtlasLike> {
  const built = buildProceduralAtlas();
  await applyGeneratedStaves(built);
  await applyBasketballAssets(built);
  await applyGroveArt(built);
  await applyStaffArt(built);
  await applyGeneratedBlades(built);
  await applyGeneratedScytheVfx(built);
  await applyGeneratedFlameArt(built);
  await applyGeneratedSanctuaryArt(built);
  await applyRebuiltSanctumArt(built);
  await applyLandscapeArt(built);
  applyCartoonSceneArt(built);
  return built as unknown as AtlasLike;
}

function save(name: string, canvas: HTMLCanvasElement): void {
  const out = resolve(ROOT, name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(canvas.data, canvas.width, canvas.height));
  console.info(`[shot] ${out} ${canvas.width}x${canvas.height}`);
}

function drawSprite(
  g: CanvasRenderingContext2D,
  atlas: AtlasLike,
  f: { x: number; y: number; w: number; h: number },
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  sx: number,
  sy: number,
  rotation: number,
  scale = 1,
): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(rotation);
  g.scale(sx * scale, sy * scale);
  g.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, -f.w * ax, -f.h * ay, f.w, f.h);
  g.restore();
}

const STAFF_GRIP = 48 / 64;

// ── 场景 1：英雄立绘（含法杖、装备材质） ─────────────────────────────
function heroShot(atlas: AtlasLike): HTMLCanvasElement {
  const SCALE = 6,
    W = 260,
    H = 480,
    ox = W / 2;
  // 世界坐标：block 骨架从脚底 0 到头顶 ≈ -55（headY=-31，头帧 24 高、锚点 ay=1）。
  // 乘上 root.scale 1.25 与 SCALE 后约 412px 高。
  const groundY = 430;
  // 部件锚点（腰带）在世界 y=0 → 屏幕 groundY。
  const oy = groundY;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  // 地面：从角色头顶之上一直铺到画面底，三行不同地形（landscape 4×4 子块）。
  const groundRows = ['terrainMeadow', 'terrainFlowers', 'terrainForest'];
  for (let i = 0; i < 8; i++) {
    const name = groundRows[i % 3],
      f = atlas.frames[name];
    if (!f) throw new Error('缺地面帧 ' + name);
    const y = groundY - 128 + i * 32;
    for (let t = 0; t < 8; t++)
      for (let u = 0; u < 2; u++)
        g.drawImage(
          atlas.canvas,
          f.x + ((t + i) % 4) * 32,
          f.y + u * 32,
          32,
          32,
          t * 32 + 4,
          y + u * 32,
          32,
          32,
        );
  }
  // 影子（partShadow，anchor 0.5；BlockAvatar 用 scale 0.8/0.5、alpha 0.6）。
  const shadow = atlas.frames['partShadow'];
  if (shadow) {
    g.globalAlpha = 0.6;
    const sw = shadow.w * 0.8 * 3,
      sh = shadow.h * 0.5 * 3;
    g.drawImage(
      atlas.canvas,
      shadow.x,
      shadow.y,
      shadow.w,
      shadow.h,
      ox - sw / 2,
      oy - sh / 2,
      sw,
      sh,
    );
    g.globalAlpha = 1;
  }
  // 与 block-avatar 相同的姿态推进：站定 24 帧，blend 衰减到 0 → 标准站姿。
  const pose = newLimbPose();
  for (let step = 0; step < 24; step++) updateWalk(pose, ox, oy, 1 / 60);
  const eq = { head: 'iron', chest: 'iron', legs: 'leather', shoes: 'leather' } as const;
  // visualAngle=0（朝右）→ facingView 给 side + flip=false；与 block-avatar 的持杖旋转对应。
  const view = facingView(0);
  // root.scale = (look.scale ?? 1) * 1.25；block 玩家 look.scale 为 1。
  const parts = blockPose(pose, eq, view.view, view.flip, 0, 0)
    .slice()
    .sort((a, b) => a.z - b.z);
  for (const p of parts) {
    const f = atlas.frames[p.frame];
    if (!f) throw new Error('缺部件帧 ' + p.frame);
    drawSprite(
      g,
      atlas,
      f,
      ox + p.x * SCALE,
      oy + p.y * SCALE,
      p.ax,
      p.ay,
      p.sx,
      p.sy,
      p.rotation,
      SCALE * 1.25,
    );
  }
  // 法杖：staff_ember，anchor gripY/height = 48/64，侧视竖持 rotation≈0.25。
  const hand = parts.find((p) => p.part === 'hand1')!;
  const staffF = atlas.frames['staff_ember'];
  if (!staffF) throw new Error('缺帧 staff_ember');
  drawSprite(
    g,
    atlas,
    staffF,
    ox + hand.x * SCALE,
    oy + hand.y * SCALE,
    0.5,
    STAFF_GRIP,
    1,
    1,
    view.view === 'side' && !view.flip ? 0.25 : 0.16,
    BLOCK_RIG.weaponScale * SCALE * 1.25,
  );
  return canvas;
}

/**
 * 手工铺一块地形，保证每类瓦片都出现（自然生成容易一大片同色）。
 * Level.set 是私有的，但 tiles 是公开只读数组——出图工具直接写它。
 */
function demoLevel(): Level {
  const lvl = new Level(20, 14, 7);
  const W = lvl.w,
    H = lvl.h;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let t: number = Tile.GRASS;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) t = Tile.WALL;
      else if (x >= 2 && x <= 5 && y >= 9 && y <= 12) t = Tile.WATER;
      else if (x >= 8 && x <= 11 && y >= 3 && y <= 6) t = Tile.DIRT;
      else if (x >= 14 && x <= 17 && y >= 7 && y <= 10) t = Tile.STONE;
      else if (y === 7 || x === 12) t = Tile.ROAD;
      else if (x >= 15 && x <= 17 && y >= 2 && y <= 4) t = Tile.CLIFF;
      lvl.tiles[y * W + x] = t as never;
    }
  return lvl;
}

// ── 场景 2：野外地块（复刻 renderer 的地形选帧 + 卡通描边） ─────────
function fieldShot(atlas: AtlasLike, level: Level): HTMLCanvasElement {
  const ZOOM = 2,
    cols = 16,
    rows = 12;
  const canvas = document.createElement('canvas');
  canvas.width = cols * 32 * ZOOM;
  canvas.height = rows * 32 * ZOOM;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.scale(ZOOM, ZOOM);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const tile = level.at(x, y),
        sanctum = sanctumGroundFrame(x, y, tile),
        generated = !sanctum ? landscapeGroundFrame(level, x, y) : undefined,
        name =
          sanctum ||
          generated ||
          TILE_SPRITE[tile === Tile.WALL ? Tile.STONE : tile],
        f = atlas.frames[name];
      if (!f) throw new Error('缺地形帧 ' + name);
      g.drawImage(
        atlas.canvas,
        f.x + (generated ? (x % 4) * 32 : 0),
        f.y + (generated ? (y % 4) * 32 : 0),
        generated ? 32 : f.w,
        generated ? 32 : f.h,
        x * 32,
        y * 32,
        32,
        32,
      );
      if (generated) drawCartoonGroundEdges(g, level, x, y);
    }
  return canvas;
}

export async function render(which: string, out: string): Promise<void> {
  const atlas = await buildRuntimeAtlas();
  if (which === 'probe') {
    const { blockSpecs } = await import('../../src/game/block-art');
    const specs = blockSpecs();
    console.info('[probe] block specs =', specs.length);
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0f0';
    g.fillRect(2, 2, 4, 4);
    let hits = 0;
    for (let i = 0; i < c.data.length; i += 4)
      if (c.data[i + 1] === 255 && c.data[i + 3] === 255) hits++;
    console.info('[probe] green pixels =', hits, '(expect 16)');
    // 检查 iron 侧视头身帧在图集中的内容。
    for (const name of ['block_head_iron_side', 'block_body_iron_side']) {
      const f = atlas.frames[name];
      console.info('[probe]', name, JSON.stringify(f));
      if (!f) continue;
      const t = document.createElement('canvas');
      t.width = f.w;
      t.height = f.h;
      const tg = t.getContext('2d')!;
      tg.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      const px: string[] = [];
      for (let y = 0; y < f.h; y++) {
        let row = '';
        for (let x = 0; x < f.w; x++) {
          const i = (y * f.w + x) * 4;
          row += t.data[i + 3] === 0 ? '.' : t.data[i] > 200 ? '#' : '+';
        }
        px.push(row);
      }
      console.info(`[probe] ${name} 内容:\n` + px.join('\n'));
    }
    return;
  }
  if (which === 'dump') {
    for (const [name, f] of Object.entries(atlas.frames)) {
      if (!name.startsWith('block_')) continue;
      const c = document.createElement('canvas');
      c.width = f.w * 6;
      c.height = f.h * 6;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, 0, 0, f.w * 6, f.h * 6);
      save(`docs/shots/parts/${name}.png`, c);
    }
    return;
  }
  if (which === 'items') {
    const names = Object.keys(atlas.frames).filter((n) => n.startsWith('item_'));
    const cell = 40,
      perRow = 12;
    const c = document.createElement('canvas');
    c.width = perRow * (cell + 8);
    c.height = Math.ceil(names.length / perRow) * (cell + 8);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b1512';
    g.fillRect(0, 0, c.width, c.height);
    names.forEach((name, i) => {
      const f = atlas.frames[name];
      const ox = (i % perRow) * (cell + 8) + 4,
        oy = Math.floor(i / perRow) * (cell + 8) + 4;
      g.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, ox, oy, cell, cell);
    });
    save(out, c);
    return;
  }
  if (which === 'staff') {
    const f = atlas.frames['staff_ember'];
    if (!f) throw new Error('缺帧 staff_ember');
    const c = document.createElement('canvas');
    c.width = f.w * 6;
    c.height = f.h * 6;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, 0, 0, f.w * 6, f.h * 6);
    save(out, c);
    return;
  }
  console.info(
    `[shot] 图集 ${atlas.canvas.width}x${atlas.canvas.height}，帧数 ${Object.keys(atlas.frames).length}`,
  );
  if (which === 'atlas') save(out, atlas.canvas);
  else if (which === 'field') save(out, fieldShot(atlas, demoLevel()));
  else save(out, heroShot(atlas));
}
