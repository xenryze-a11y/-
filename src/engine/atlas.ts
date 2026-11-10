/**
 * 图集加载与切帧。对应 goengine 的 backend/atlas.go + game/art/registry.go。
 *
 * 默认合成程序化场景与内嵌法杖；?externalAtlas 显式启用完整外部图集，缺帧整套回退。
 * 所有部件共享一个 TextureSource（一张图集），Pixi 才能批处理；切出来的 Texture 只是 frame 不同。
 * get() 查不到名字返回白点而不是抛错 —— 换皮时漏一两张不该让整局崩掉。
 */
import { Rectangle, Texture } from 'pixi.js';
import { buildProceduralAtlas, type AtlasFrame, type BuiltAtlas } from './art';
import { applyGroveArt } from '../game/grove-art';
import { applyBasketballAssets } from '../game/basketball-assets';
import { applyGeneratedStaves } from '../game/generated-staves';
import { FX_ANIMS } from '../game/data';

const BASE = import.meta.env.BASE_URL;

export interface AtlasJson {
  meta: {
    image: string;
    size: { w: number; h: number };
    scale?: number;
    note?: string;
  };
  frames: Record<string, AtlasFrame | { frame: AtlasFrame }>;
  anims?: Record<
    string,
    { frames: string[]; fps: number; loop: boolean; scale: number }
  >;
}

async function tryExternal(): Promise<BuiltAtlas | null> {
  if (
    location.protocol === 'file:' ||
    !new URLSearchParams(location.search).has('externalAtlas')
  )
    return null;
  try {
    const res = await fetch(`${BASE}assets/atlas.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const json = (await res.json()) as AtlasJson;
    const img = new Image();
    img.src = `${BASE}assets/${json.meta.image}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const frames: Record<string, AtlasFrame> = {};
    for (const [key, value] of Object.entries(json.frames)) {
      const name = key.replace(/\.(png|jpg|jpeg|webp)$/i, '');
      const f = 'frame' in value ? value.frame : value;
      frames[name] = { x: f.x, y: f.y, w: f.w, h: f.h };
    }
    console.info(`[atlas] 使用外部美术：${Object.keys(frames).length} 帧`);
    return { canvas, frames };
  } catch {
    return null;
  }
}

export class TextureAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly frames: Record<string, AtlasFrame>;
  readonly generatedStaves: boolean;
  readonly basketballAssetsReady: boolean;
  readonly groveArtReady: boolean;
  readonly sourceKind: 'procedural' | 'external';
  private readonly textures = new Map<string, Texture>();

  constructor(
    built: BuiltAtlas,
    sourceKind: 'procedural' | 'external',
    generatedStaves = false,
    basketballAssetsReady = false,
    groveArtReady = false,
  ) {
    this.canvas = built.canvas;
    this.frames = built.frames;
    this.sourceKind = sourceKind;
    this.generatedStaves = generatedStaves;
    this.basketballAssetsReady = basketballAssetsReady;
    this.groveArtReady = groveArtReady;
    const base = Texture.from(this.canvas);
    // 像素画必须最近邻，否则放大 2 倍会糊成一团。
    base.source.style.scaleMode = 'nearest';
    base.source.autoGenerateMipmaps = false;
    for (const [name, f] of Object.entries(this.frames)) {
      this.textures.set(
        name,
        new Texture({
          source: base.source,
          frame: new Rectangle(f.x, f.y, f.w, f.h),
        }),
      );
    }
  }

  static async load(): Promise<TextureAtlas> {
    const external = await tryExternal();
    const built = buildProceduralAtlas();
    const generated = await applyGeneratedStaves(built);
    const basketballReady = await applyBasketballAssets(built);
    const groveReady = await applyGroveArt(built);
    if (
      external &&
      Object.entries(built.frames).every(
        ([name, frame]) =>
          external.frames[name]?.w === frame.w &&
          external.frames[name]?.h === frame.h,
      )
    )
      return new TextureAtlas(external, 'external');
    if (external)
      console.warn(
        '[atlas] 外部图集帧清单或尺寸与当前版本不匹配，回退到完整内置图集',
      );
    console.info(
      '[atlas] 使用内置像素图集（程序化场景 + 内嵌法杖素材）（可用 __ASHEN__.dumpAtlas() 导出模板）',
    );
    return new TextureAtlas(
      built,
      'procedural',
      generated,
      basketballReady,
      groveReady,
    );
  }

  has(name: string): boolean {
    return this.textures.has(name);
  }

  get(name: string): Texture {
    const t = this.textures.get(name);
    if (!t) {
      if (name !== '__missing__')
        console.warn(`[atlas] 缺贴图 ${name}，降级为白点`);
      return Texture.WHITE;
    }
    return t;
  }

  /** 导出当前图集，作为真美术的模板。文件放到 public/assets/ 即自动生效。 */
  dump(): void {
    if (this.sourceKind !== 'procedural') {
      console.warn('[atlas] 当前用的是外部图集，无需导出');
      return;
    }
    const anims: Record<
      string,
      { frames: string[]; fps: number; loop: boolean; scale: number }
    > = {};
    for (const [k, a] of Object.entries(FX_ANIMS)) {
      anims[k] = {
        frames: [...a.frames],
        fps: a.fps,
        loop: a.loop,
        scale: a.scale,
      };
    }
    const json: AtlasJson = {
      meta: {
        image: 'atlas.png',
        size: { w: this.canvas.width, h: this.canvas.height },
        scale: 1,
        note: 'frames 的名字是协议，改名字要同步改代码；每帧之间留 2px 以上空隙防串色。',
      },
      frames: this.frames,
      anims,
    };
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      download(blob, 'atlas.png');
      download(
        new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
        'atlas.json',
      );
    }, 'image/png');
  }
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
