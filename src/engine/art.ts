/**
 * 程序化像素美术：demo 不依赖任何外部图片，开箱即跑。
 *
 * 对应 goengine 的 game/art + backend/atlas.go：
 *  - 所有部件运行时打进「一张」图集，按名字查 UV（贴图名即协议）；
 *  - 行式装箱、按高度降序（不排序会浪费一半空间，Go 版踩过）；
 *  - 帧之间留 2px gutter，等价于 Go 版 rectUV 的半像素内缩，防最近邻采样串色；
 *  - 查不到名字要降级到白点，不能崩（Go 版 SpriteUV 同款兜底）。
 *
 * 朋友拿到真美术后：把 public/assets/atlas.png + atlas.json 放进去即可整体替换，
 * 不需要改任何绘制代码。用 window.__ASHEN__.dumpAtlas() 可以把当前这套导出成模板。
 */
import {
  detailTile,
  detailBody,
  detailHead,
  detailProp,
  upgradeSpecs,
} from '../game/art-upgrade';
import { explorationSpecs } from '../game/exploration-art';
import { drawForestTree } from '../game/sanctuary-art';
import { makeRng } from './math';
import { PALETTE as P, SHOE_MATERIALS } from '../game/data';

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuiltAtlas {
  canvas: HTMLCanvasElement;
  frames: Record<string, AtlasFrame>;
}

type DrawFn = (p: Painter) => void;
export interface Spec {
  name: string;
  w: number;
  h: number;
  draw: DrawFn;
}

/** 像素画助手：一切用 fillRect，放大后才是硬边像素而不是糊边。 */
export class Painter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly w: number,
    readonly h: number,
  ) {}

  rect(x: number, y: number, w: number, h: number, c: string): void {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(
      Math.round(x),
      Math.round(y),
      Math.round(w),
      Math.round(h),
    );
  }

  /** 逐行画像素圆，保持像素风。 */
  disc(cx: number, cy: number, r: number, c: string): void {
    const rr = Math.round(r);
    for (let y = -rr; y <= rr; y++) {
      const half = Math.floor(Math.sqrt(Math.max(0, rr * rr - y * y)));
      this.rect(cx - half, cy + y, half * 2 + 1, 1, c);
    }
  }

  ring(cx: number, cy: number, r: number, width: number, c: string): void {
    const rr = Math.round(r);
    for (let y = -rr; y <= rr; y++) {
      for (let x = -rr; x <= rr; x++) {
        const d = Math.hypot(x, y);
        if (d <= r && d >= r - width) this.rect(cx + x, cy + y, 1, 1, c);
      }
    }
  }

  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    c: string,
    thick = 1,
  ): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      this.rect(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick, thick, c);
    }
  }

  /** 描边：先画一圈深色再画内容，Q 版轮廓立刻立起来。 */
  outline(x: number, y: number, w: number, h: number, c = P.outline): void {
    this.rect(x - 1, y - 1, w + 2, h + 2, c);
  }
}

const ANCHOR_Y = 30; // 部件腰带锚点；WorldView 再上移 12，使脚底与世界碰撞点对齐

// ── 人形部件 ────────────────────────────────────────────────────────────
export interface Skin {
  cloth: string;
  clothDark: string;
  trim: string;
  skin: string;
  skinDark: string;
  hair: string;
  eye: string;
}

const SKINS: Record<string, Skin> = {
  hero: {
    cloth: '#3d536d',
    clothDark: '#293c52',
    trim: '#c3a269',
    skin: P.skin,
    skinDark: P.skinDark,
    hair: P.hair,
    eye: '#2b2b3a',
  },
  zombie: {
    cloth: P.zombieRag,
    clothDark: '#3e3a32',
    trim: '#6b6252',
    skin: P.zombieSkin,
    skinDark: P.zombieSkinDark,
    hair: '#6d6a5b',
    eye: '#c4413b',
  },
  caster: {
    cloth: P.casterRobe,
    clothDark: '#332247',
    trim: P.casterGlow,
    skin: '#9d8aa8',
    skinDark: '#6f5c7c',
    hair: '#2b2038',
    eye: P.casterGlow,
  },
};

/** 躯干 + 裤腿。头和鞋/手是独立部件，方便以后换装；斗篷暂不画（见 docs/DECISIONS.md D13）。 */
function drawBody(
  p: Painter,
  view: 'front' | 'back' | 'side',
  sk: Skin,
  zombie: boolean,
): void {
  const c = P.outline;

  if (view === 'side') {
    // 侧视只画「朝右」一套，朝左由渲染层 scale.x = -1 镜像。
    // 静态贴图只画裤腿，鞋和手全部交给运行时（Go D43 悬浮手脚）——
    // 侧视不再有靴子那块大色块，身体和脚都收小一档。
    p.outline(11, 31, 3, 10);
    p.rect(11, 31, 3, 9, '#302b26'); // 后腿：只露一小截
    p.outline(16, 30, 4, 11);
    p.rect(16, 30, 4, 10, sk.clothDark); // 前腿
    p.rect(16, 30, 2, 10, sk.cloth);

    // 躯干 10px 宽，比正面 14px 瘦一圈；侧视不该和正面一样壮。
    p.outline(10, 16, 10, 15);
    p.rect(10, 16, 10, 15, sk.cloth);
    p.rect(10, 16, 3, 15, sk.clothDark);
    p.rect(17, 17, 1, 13, sk.trim);
    p.rect(10, 28, 10, 3, P.leatherDark);
    p.rect(14, 28, 2, 3, sk.trim);

    // Go D43：手臂段根本不画，只有静态裤子 + 悬浮手。
    // 之前画的同色前臂和躯干连成一片，侧视又被撑回正面那么宽。
    if (zombie) p.rect(16, 24, 3, 2, P.blood);
    p.rect(10, 16, 10, 1, c);
    return;
  }

  // 前视 / 后视：只画两条并排的裤腿（鞋在运行时画）+ 对称双臂。
  p.outline(11, 30, 4, 11);
  p.outline(18, 30, 4, 11);
  p.rect(11, 30, 4, 10, sk.clothDark);
  p.rect(18, 30, 4, 10, sk.clothDark);
  p.outline(9, 16, 14, 15);
  p.rect(9, 16, 14, 15, sk.cloth);
  p.rect(9, 16, 3, 15, sk.clothDark);
  p.rect(20, 16, 3, 15, sk.clothDark);
  p.rect(9, 28, 14, 3, P.leatherDark);
  p.rect(15, 28, 2, 3, sk.trim);
  if (view === 'front') {
    // 胸前纹章：法师是符文，行尸是破布，亡灵法师是紫晶
    p.rect(14, 20, 4, 4, sk.trim);
    p.rect(15, 21, 2, 2, sk.clothDark);
    p.line(11, 18, 11, 26, sk.trim, 1);
    p.line(21, 18, 21, 26, sk.trim, 1);
  } else {
    p.rect(12, 18, 8, 9, sk.clothDark);
    p.line(16, 18, 16, 27, sk.trim, 1);
  }
  if (zombie) {
    p.rect(10, 22, 3, 2, '#4a4038');
    p.rect(20, 25, 2, 4, P.blood);
  }
  p.rect(9, 16, 14, 1, c);
}

function drawHead(
  p: Painter,
  view: 'front' | 'back' | 'side',
  sk: Skin,
  hood: boolean,
  zombie: boolean,
): void {
  if (view === 'side') {
    // 侧脸自成一整套：兜帽/头发必须覆盖「整个头顶 + 额头」（和正面一样压到眉上），
    // 只把眼睛以下的右半张脸、鼻尖露出来。
    // ⚠️ 早期版本只画了左半 x=9..18 的后脑，头顶前部 x=18..22 一片皮肤露着，
    //    侧面看着像秃头 —— 别改回去，见 docs/DECISIONS.md D14。
    p.outline(10, 3, 12, 14);
    p.rect(10, 3, 12, 14, sk.skin);
    p.rect(10, 3, 4, 14, sk.skinDark);
    if (hood) {
      // 帽顶整幅 x=9..23 / y=2..11，和正面兜帽同宽同高；前沿不收，否则又露额头。
      p.outline(9, 2, 14, 9);
      p.rect(9, 2, 14, 9, sk.clothDark);
      p.rect(9, 2, 14, 2, sk.cloth); // 帽顶亮边
      p.rect(19, 9, 4, 1, sk.cloth); // 额前帽檐转折，压到眉上
      p.rect(9, 10, 3, 6, sk.clothDark); // 后脑垂布（侧视特有）
    } else {
      // 短发也铺满头顶：x=10..23，额前有发际，后脑留发脚。
      p.outline(10, 2, 13, 7);
      p.rect(10, 2, 13, 7, sk.hair);
      p.rect(10, 2, 13, 2, '#5e4634');
      p.rect(19, 7, 4, 2, sk.hair);
      p.rect(10, 8, 3, 8, sk.hair);
    }
    p.rect(20, 10, 3, 3, sk.skin); // 鼻尖（后画，压在帽檐前，形成侧脸轮廓）
    p.rect(19, 11, 2, 2, sk.eye);
    p.rect(18, 14, 4, 1, sk.skinDark);
    if (zombie) {
      p.rect(13, 8, 3, 1, P.blood);
      p.rect(20, 13, 2, 2, '#5c4a3a');
    }
    return;
  }

  p.outline(11, 5, 10, 12);
  p.rect(11, 5, 10, 12, sk.skin);
  p.rect(11, 5, 10, 3, sk.skinDark);
  if (hood) {
    // 兜帽压住额头，只露出下半张脸
    p.outline(9, 2, 14, 9);
    p.rect(9, 2, 14, 9, sk.clothDark);
    p.rect(9, 2, 14, 2, sk.cloth);
    p.rect(9, 9, 3, 6, sk.clothDark);
    p.rect(20, 9, 3, 6, sk.clothDark);
  } else {
    p.outline(10, 2, 12, 6);
    p.rect(10, 2, 12, 6, sk.hair);
    p.rect(10, 2, 12, 2, '#5e4634');
  }
  if (view === 'front') {
    p.rect(13, 11, 2, 2, sk.eye);
    p.rect(18, 11, 2, 2, sk.eye);
    p.rect(15, 14, 3, 1, sk.skinDark);
    if (zombie) {
      p.rect(12, 8, 3, 1, P.blood);
      p.rect(19, 13, 2, 2, '#5c4a3a');
    }
  } else {
    p.rect(10, 2, 12, 14, hood ? sk.clothDark : sk.hair);
    p.rect(11, 4, 10, 2, hood ? sk.cloth : '#5e4634');
  }
}

// ── 瓦片 / 物件 ─────────────────────────────────────────────────────────
function drawTile(p: Painter, kind: string, seed: number): void {
  const rng = makeRng(seed);
  const base: Record<string, string> = {
    grass: P.grass,
    dirt: P.dirt,
    stone: P.stone,
    water: P.water,
    floor: P.wood,
    wall: '#6a6259',
    road: '#8a7250',
    wallTop: '#736a5e',
  };
  p.rect(0, 0, 32, 32, base[kind]);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rng() * 32);
    const y = Math.floor(rng() * 32);
    const c = rng() < 0.5 ? P.grassDark : P.grassLight;
    switch (kind) {
      case 'grass':
        p.rect(x, y, 1, 2, rng() < 0.5 ? P.grassDark : P.grassLight);
        break;
      case 'dirt':
        p.rect(x, y, 2, 1, rng() < 0.5 ? '#6b543c' : '#8c7152');
        break;
      case 'stone':
        p.rect(x, y, 2, 2, rng() < 0.5 ? '#7d7d74' : '#98988d');
        break;
      case 'water':
        p.rect(x, y, 3, 1, rng() < 0.5 ? '#396683' : '#244760');
        break;
      case 'road':
        p.rect(x, y, 2, 1, rng() < 0.5 ? '#796245' : '#9b8160');
        break;
      case 'floor':
        p.rect(x, y, 3, 1, rng() < 0.5 ? P.woodDark : '#7d5738');
        break;
      case 'wall':
        p.rect(x, y, 3, 2, rng() < 0.5 ? '#5c554d' : '#7b7267');
        break;
      case 'wallTop':
        p.rect(x, y, 3, 1, rng() < 0.5 ? '#625a50' : '#877d70');
        break;
      default:
        p.rect(x, y, 1, 1, c);
    }
  }
  if (kind === 'floor') {
    for (let y = 0; y < 32; y += 8) p.rect(0, y, 32, 1, P.woodDark);
    for (let x = 0; x < 32; x += 16) p.rect(x, 0, 1, 32, '#563a24');
  }
  if (kind === 'wall' || kind === 'wallTop') {
    p.rect(0, 0, 32, 2, '#4a443c');
    for (let x = 0; x < 32; x += 16) p.rect(x, 0, 1, 32, '#4a443c');
    p.rect(0, 16, 32, 1, '#4a443c');
  }
  if (kind === 'wallTop') {
    // 前景层：墙顶瓦 + 朝下的阴影，实体被它压住下半身
    p.rect(0, 0, 32, 7, '#8a5b3a');
    p.rect(0, 0, 32, 2, '#a8754a');
    p.rect(0, 7, 32, 3, '#3a2b1e');
    p.rect(0, 10, 32, 22, 'rgba(20,14,10,0.42)');
  }
  if (kind === 'water') {
    p.rect(0, 0, 32, 1, '#1e3f55');
    p.rect(0, 31, 32, 1, '#1e3f55');
  }
}

function drawProp(p: Painter, kind: string, seed: number): void {
  const rng = makeRng(seed);
  switch (kind) {
    case 'tree': {
      p.rect(20, 34, 8, 26, P.woodDark);
      p.rect(22, 34, 4, 26, P.wood);
      for (let i = 0; i < 5; i++) {
        const cx = 10 + Math.floor(rng() * 28);
        const cy = 6 + Math.floor(rng() * 26);
        p.disc(
          cx,
          cy,
          10 + Math.floor(rng() * 5),
          i % 2 ? '#355230' : '#2c4529',
        );
      }
      p.disc(24, 22, 17, '#3d6038');
      p.disc(21, 18, 13, '#4a7040');
      for (let i = 0; i < 26; i++) {
        p.rect(
          8 + Math.floor(rng() * 32),
          6 + Math.floor(rng() * 28),
          2,
          2,
          '#5b8448',
        );
      }
      break;
    }
    case 'grave': {
      p.outline(4, 3, 16, 27, '#2e2b28');
      p.rect(4, 3, 16, 27, '#85857c');
      p.disc(12, 6, 8, '#85857c');
      p.rect(4, 3, 16, 2, '#9b9b90');
      p.rect(11, 9, 2, 13, '#5f5f57');
      p.rect(8, 13, 8, 2, '#5f5f57');
      p.rect(3, 27, 18, 4, '#4a5240');
      break;
    }
    case 'crate': {
      p.outline(3, 5, 26, 24);
      p.rect(3, 5, 26, 24, P.wood);
      p.rect(3, 5, 26, 3, '#8b633f');
      p.rect(3, 26, 26, 3, P.woodDark);
      p.line(4, 6, 27, 27, P.woodDark, 2);
      p.line(27, 6, 4, 27, P.woodDark, 2);
      p.rect(3, 5, 2, 24, P.woodDark);
      break;
    }
    case 'torch': {
      p.rect(6, 12, 4, 20, P.woodDark);
      p.rect(7, 12, 2, 20, P.wood);
      p.rect(4, 9, 8, 4, '#4a4038');
      p.disc(8, 6, 6, '#d0632a');
      p.disc(8, 5, 4, P.fire);
      p.disc(8, 4, 2, P.fireHot);
      break;
    }
    case 'rock': {
      p.disc(12, 16, 10, '#5c5b54');
      p.disc(10, 13, 7, '#7a7970');
      p.rect(7, 20, 10, 2, '#4a4943');
      break;
    }
    case 'mana': {
      p.outline(5, 3, 6, 12);
      p.rect(5, 3, 6, 12, '#4a7fc4');
      p.rect(5, 9, 6, 6, '#3563a8');
      p.rect(6, 1, 4, 3, '#b8925c');
      p.rect(6, 5, 2, 4, '#a8d8ff');
      break;
    }
    case 'health': {
      p.outline(5, 3, 6, 12);
      p.rect(5, 3, 6, 12, '#b64040');
      p.rect(5, 9, 6, 6, '#8d2a2a');
      p.rect(6, 1, 4, 3, '#b8925c');
      p.rect(6, 5, 2, 4, '#ff9a9a');
      break;
    }
  }
}

function drawWeapon(p: Painter, kind: string): void {
  if (kind === 'sword') {
    // 锚点在握把（16,28），剑尖朝上，旋转时绕手转。
    p.rect(13, 2, 6, 20, P.outline);
    p.rect(14, 2, 4, 20, '#c7ced4');
    p.rect(15, 2, 2, 20, '#eef2f4');
    p.rect(15, 0, 2, 3, '#eef2f4');
    p.rect(9, 21, 14, 3, P.gold);
    p.rect(8, 20, 3, 5, P.gold);
    p.rect(21, 20, 3, 5, P.gold);
    p.rect(14, 24, 4, 7, P.leatherDark);
    p.rect(13, 30, 6, 2, P.gold);
  } else {
    // 法杖：锚点 (16,38)，顶端宝石在 y=2。
    p.rect(14, 8, 4, 38, P.woodDark);
    p.rect(15, 8, 2, 38, P.wood);
    p.rect(12, 14, 8, 2, '#8b633f');
    p.rect(12, 30, 8, 2, '#8b633f');
    p.rect(11, 2, 10, 9, P.outline);
    p.rect(12, 3, 8, 7, '#6a4a86');
    p.disc(16, 6, 5, P.casterGlow);
    p.disc(16, 6, 2, '#e2c6ff');
    p.rect(10, 10, 3, 3, P.gold);
    p.rect(19, 10, 3, 3, P.gold);
  }
}

/**
 * 鞋贴图：按「材质 × 视角」出图，对应 goengine 的 `art.ShoeSprite(equip, isSide)`。
 * 命名 sprShoe<Mat>[Side]（我们去掉 spr 前缀），裸足另有 <Rig>ShoeBare 一类按肤色出图。
 * ⚠️ 侧视鞋是单独一张、有朝右的鞋头和靴筒，不能拿正视图凑合。
 */
const SHOE_COLORS: Record<
  string,
  { dark: string; mid: string; light: string; sole: string }
> = {
  bare: { dark: '#6f5541', mid: P.skin, light: '#e8c39e', sole: '#4a3527' },
  cloth: { dark: '#4a4038', mid: '#7c6a55', light: '#a08a6c', sole: '#332c25' },
  leather: {
    dark: P.leatherDark,
    mid: P.leather,
    light: '#9a7450',
    sole: '#2f2118',
  },
  sanctum: {
    dark: '#526c68',
    mid: '#adbda1',
    light: '#f0e8c4',
    sole: '#34483f',
  },
  iron: { dark: P.ironDark, mid: P.iron, light: '#d5dce0', sole: '#3d454b' },
  zombieBare: {
    dark: '#4a5c3d',
    mid: P.zombieSkin,
    light: '#a8bd8e',
    sole: '#33402a',
  },
};

export function shoeSpriteName(mat: string, side: boolean): string {
  return `shoe${mat[0].toUpperCase()}${mat.slice(1)}${side ? 'Side' : ''}`;
}

function drawShoe(p: Painter, mat: string, side: boolean): void {
  const c = SHOE_COLORS[mat] ?? SHOE_COLORS.cloth;
  const bare = mat === 'bare' || mat === 'zombieBare';
  if (side) {
    p.rect(1, bare ? 6 : 1, 7, bare ? 6 : 11, P.outline);
    p.rect(2, bare ? 7 : 2, 5, bare ? 4 : 8, c.dark);
    p.rect(3, 8, 8, 4, P.outline);
    p.rect(3, 9, 7, 2, c.mid);
    p.rect(8, 9, 2, 2, c.light);
    p.rect(1, 11, 10, 2, c.sole);
    if (!bare) {
      p.rect(2, 2, 5, 2, c.light);
      p.rect(3, 5, 4, 1, c.mid);
    }
    if (mat === 'iron') {
      p.rect(3, 4, 3, 4, c.mid);
      p.rect(3, 4, 1, 3, c.light);
    }
  } else {
    p.rect(2, bare ? 6 : 1, 8, bare ? 7 : 12, P.outline);
    p.rect(3, bare ? 7 : 2, 6, bare ? 4 : 9, c.dark);
    p.rect(3, 8, 6, 3, c.mid);
    p.rect(2, 11, 8, 2, c.sole);
    if (!bare) {
      p.rect(3, 2, 6, 2, c.light);
      p.rect(4, 5, 4, 1, c.mid);
    }
    if (mat === 'iron') {
      p.rect(4, 4, 4, 4, c.mid);
      p.rect(4, 4, 1, 4, c.light);
      p.rect(3, 9, 6, 1, c.light);
    }
    if (mat === 'leather') {
      p.rect(6, 5, 2, 2, '#d3b66d');
      p.rect(7, 6, 1, 1, c.dark);
    }
  }
}

function drawPart(p: Painter, kind: string): void {
  if (kind === 'foot') {
    // 兜底贴图：正常路径走 shoe<Mat>[Side]，这张只在没拿到装备组件时用。
    drawShoe(p, 'cloth', false);
  } else if (kind === 'hand') {
    // 6×7 手掌与袖口，原尺寸绘制，避免再缩到三个像素。
    p.rect(1, 0, 6, 8, P.outline);
    p.rect(1, 0, 6, 2, '#b6a57d');
    p.rect(2, 2, 4, 5, P.leatherDark);
    p.rect(2, 2, 3, 2, '#c09b70');
    p.rect(2, 5, 4, 1, '#9a7450');
    p.rect(5, 3, 2, 3, '#846443');
  } else if (kind === 'shadow') {
    p.disc(16, 8, 13, 'rgba(12,10,8,0.34)');
    p.disc(16, 8, 9, 'rgba(12,10,8,0.22)');
  } else if (kind === 'decal') {
    p.disc(16, 16, 9, 'rgba(110,26,26,0.55)');
    p.disc(9, 20, 3, 'rgba(110,26,26,0.5)');
    p.disc(23, 11, 2, 'rgba(110,26,26,0.45)');
  }
}

// ── 特效序列帧 ──────────────────────────────────────────────────────────
function drawFx(p: Painter, kind: string, frame: number, count: number): void {
  const t = frame / Math.max(1, count - 1);
  const c = p.w / 2;
  if (kind === 'slash') {
    // 刀光：一条随时间拉长、变淡的弧
    const r = 16 + t * 4;
    const a0 = -1.2 + t * 0.5;
    for (let i = 0; i <= 22; i++) {
      const a = a0 + (i / 22) * 2.2;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      p.rect(x, y, 2, 2, t < 0.6 ? '#fff2c8' : '#d8b878');
      if (i % 2 === 0)
        p.rect(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2, 2, '#e8c982');
    }
  } else if (kind === 'impact') {
    const r = 5 + t * 17;
    p.disc(c, c, r, t < 0.4 ? '#ffd27a' : '#d8672c');
    p.disc(c, c, r * 0.6, t < 0.5 ? '#fff3c0' : '#e8873c');
    if (t < 0.5) p.disc(c, c, r * 0.3, '#fffdf0');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + t;
      p.rect(
        c + Math.cos(a) * (r + 3),
        c + Math.sin(a) * (r + 3),
        2,
        2,
        '#ffb45a',
      );
    }
  } else if (kind === 'fireball') {
    const wob = Math.sin(frame * 1.6) * 1.5;
    p.disc(8 + wob, 8, 7, '#b4471e');
    p.disc(8 + wob, 8, 5, P.fire);
    p.disc(8 + wob, 8, 3, '#ffd06a');
    p.disc(8 + wob, 8, 1.5, P.fireHot);
    p.rect(0, 7, 3, 2, '#e07a2c');
  } else if (kind === 'shadow') {
    const wob = Math.cos(frame * 1.6) * 1.5;
    p.disc(8, 8 + wob, 7, '#3b245c');
    p.disc(8, 8 + wob, 5, P.shadow);
    p.disc(8, 8 + wob, 2, '#d7b6ff');
  } else if (kind === 'spark') {
    const r = 2 + t * 5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.rect(
        8 + Math.cos(a) * r,
        8 + Math.sin(a) * r,
        2,
        2,
        i % 2 ? P.fireHot : P.fire,
      );
    }
    p.disc(8, 8, Math.max(1, 3 - t * 2), '#fff2c8');
  } else if (kind === 'blood') {
    const r = 3 + t * 6;
    p.disc(12, 12, r, 'rgba(150,38,38,0.85)');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      p.disc(
        12 + Math.cos(a) * (r + 3),
        12 + Math.sin(a) * (r + 3),
        2 - t,
        'rgba(150,38,38,0.8)',
      );
    }
  }
}

// ── 规格表 ──────────────────────────────────────────────────────────────
function buildSpecs(): Spec[] {
  const out: Spec[] = [];
  const views = ['Front', 'Back', 'Side'] as const;
  const viewKey = { Front: 'front', Back: 'back', Side: 'side' } as const;

  for (const [family, sk] of Object.entries(SKINS)) {
    const zombie = family === 'zombie';
    const hood = family === 'hero' || family === 'caster';
    const prefix =
      family === 'hero' ? 'hero' : family === 'zombie' ? 'zombie' : 'caster';
    for (const v of views) {
      const view = viewKey[v];
      out.push({
        name: `${prefix}${v}Body`,
        w: 32,
        h: 48,
        draw: (p) => {
          drawBody(p, view, sk, zombie);
          detailBody(p, view, sk, zombie);
        },
      });
      out.push({
        name: `${prefix}${v}Head`,
        w: 32,
        h: 48,
        draw: (p) => {
          drawHead(p, view, sk, hood, zombie);
          detailHead(p, view, sk, hood, zombie);
        },
      });
    }
  }

  for (const kind of [
    'grass',
    'dirt',
    'stone',
    'water',
    'floor',
    'wall',
    'road',
    'wallTop',
  ]) {
    out.push({
      name: `tile${kind[0].toUpperCase()}${kind.slice(1)}`,
      w: 32,
      h: 32,
      draw: (p) => {
        drawTile(p, kind, hash(kind));
        detailTile(p, kind, hash(kind));
      },
    });
  }
  const propSizes: Record<string, [number, number]> = {
    tree: [96, 128],
    grave: [24, 32],
    crate: [32, 32],
    torch: [16, 32],
    rock: [24, 24],
    mana: [16, 16],
    health: [16, 16],
  };
  for (const [kind, [w, h]] of Object.entries(propSizes)) {
    const name =
      kind === 'mana' || kind === 'health'
        ? `pickup${kind[0].toUpperCase()}${kind.slice(1)}`
        : `prop${kind[0].toUpperCase()}${kind.slice(1)}`;
    out.push({
      name,
      w,
      h,
      draw: (p) => {
        if (kind === 'tree') {
          drawForestTree(p);
          return;
        }
        drawProp(p, kind, hash(kind));
        detailProp(p, kind, hash(kind));
      },
    });
  }
  out.push({
    name: 'weaponSword',
    w: 32,
    h: 32,
    draw: (p) => drawWeapon(p, 'sword'),
  });
  out.push({
    name: 'weaponStaff',
    w: 32,
    h: 48,
    draw: (p) => drawWeapon(p, 'staff'),
  });
  for (const kind of ['foot', 'hand'])
    out.push({
      name: `part${kind[0].toUpperCase()}${kind.slice(1)}`,
      w: kind === 'foot' ? 12 : 8,
      h: kind === 'foot' ? 14 : 8,
      draw: (p) => drawPart(p, kind),
    });
  // 鞋：5 种材质 × 2 个视角。换装只改数据（Equip.shoes），不改绘制代码。
  for (const mat of SHOE_MATERIALS) {
    for (const side of [false, true]) {
      out.push({
        name: shoeSpriteName(mat, side),
        w: 12,
        h: 14,
        draw: (q) => drawShoe(q, mat, side),
      });
    }
  }
  out.push({
    name: 'partShadow',
    w: 32,
    h: 16,
    draw: (p) => drawPart(p, 'shadow'),
  });
  out.push({
    name: 'decalBlood',
    w: 32,
    h: 32,
    draw: (p) => drawPart(p, 'decal'),
  });

  const fx: Record<string, [number, number]> = {
    slash: [48, 5],
    impact: [48, 6],
    fireball: [16, 4],
    shadow: [16, 4],
    spark: [16, 4],
    blood: [24, 3],
  };
  for (const [kind, [size, count]] of Object.entries(fx)) {
    const h = kind === 'slash' || kind === 'impact' ? 48 : size;
    for (let i = 0; i < count; i++) {
      const name = `${kind}_${String(i).padStart(3, '0')}`;
      out.push({ name, w: size, h, draw: (p) => drawFx(p, kind, i, count) });
    }
  }
  return out.concat(upgradeSpecs(drawProp, drawWeapon), explorationSpecs());
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 行式装箱：按高度降序，帧间留 2px gutter。 */
export function buildProceduralAtlas(): BuiltAtlas {
  const specs = buildSpecs().sort(
    (a, b) => b.h - a.h || a.name.localeCompare(b.name),
  );
  const ATLAS_W = 1024;
  const GUTTER = 2;
  // 先算排布，再一次性开 canvas，避免二次拷贝。
  const layout: { spec: Spec; x: number; y: number }[] = [];
  let x = GUTTER;
  let y = GUTTER;
  let rowH = 0;
  for (const spec of specs) {
    if (x + spec.w + GUTTER > ATLAS_W) {
      x = GUTTER;
      y += rowH + GUTTER;
      rowH = 0;
    }
    layout.push({ spec, x, y });
    x += spec.w + GUTTER;
    rowH = Math.max(rowH, spec.h);
  }
  const atlasH = Math.max(64, y + rowH + GUTTER);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = atlasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('拿不到 2D context');
  ctx.imageSmoothingEnabled = false;
  // 透明底；白点由 Texture.WHITE 兜底，不浪费一格贴图。
  const frames: Record<string, AtlasFrame> = {};
  for (const { spec, x, y } of layout) {
    const tile = document.createElement('canvas');
    tile.width = spec.w;
    tile.height = spec.h;
    const tc = tile.getContext('2d');
    if (!tc) continue;
    tc.imageSmoothingEnabled = false;
    spec.draw(new Painter(tc, spec.w, spec.h));
    ctx.drawImage(tile, x, y);
    frames[spec.name] = { x, y, w: spec.w, h: spec.h };
  }
  return { canvas, frames };
}

export { ANCHOR_Y };
