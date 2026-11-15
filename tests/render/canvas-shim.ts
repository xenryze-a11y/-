/**
 * 无头 Canvas 2D 软件实现——只为在 Node 里生成游戏画面 PNG，不追求完备。
 *
 * 覆盖 engine/art 与 game/*-art 实际用到的 API：
 *   fillRect / clearRect / drawImage(3·5·9 参) / save / restore / translate /
 *   rotate / scale / beginPath / moveTo / lineTo / rect / closePath / fill /
 *   clip / createRadialGradient / getImageData / putImageData /
 *   fillStyle(颜色或渐变) / globalAlpha /
 *   globalCompositeOperation(source-over·source-atop·destination-out) /
 *   imageSmoothingEnabled / width·height setter，以及 Image（data URL PNG 解码）。
 *
 * 内部存**预乘 alpha** 像素，导出 PNG 时由 png.ts 还原。
 * 未知 API 直接抛错——宁可当场发现，也不出一张悄悄缺东西的图。
 */
import { inflateSync } from 'node:zlib';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  transparent: '#00000000',
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  lime: '#00ff00',
  blue: '#0000ff',
};

function parseColor(css: string): Rgba {
  const raw = css.trim().toLowerCase();
  const hex = NAMED[raw] ?? raw;
  if (hex.startsWith('#')) {
    const body = hex.slice(1);
    const digit = (i: number): number => parseInt(body[i] + body[i], 16);
    if (body.length === 3 || body.length === 4)
      return {
        r: digit(0),
        g: digit(1),
        b: digit(2),
        a: body.length === 4 ? digit(3) : 255,
      };
    if (body.length === 6 || body.length === 8)
      return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16),
        a: body.length === 8 ? parseInt(body.slice(6, 8), 16) : 255,
      };
    throw new Error('不支持的十六进制颜色: ' + css);
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(raw);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN))
      throw new Error('不支持的颜色: ' + css);
    return {
      r: parts[0],
      g: parts[1],
      b: parts[2],
      a: parts.length > 3 ? Math.round(parts[3] * 255) : 255,
    };
  }
  throw new Error('不支持的颜色: ' + css);
}

/** 径向渐变：art-upgrade 的光晕用（中心亮 → 边缘透明）。 */
class RadialGradient {
  readonly stops: { pos: number; c: Rgba }[] = [];
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly r0: number,
    readonly x1: number,
    readonly y1: number,
    readonly r1: number,
  ) {}
  addColorStop(pos: number, color: string): void {
    this.stops.push({ pos, c: parseColor(color) });
    this.stops.sort((a, b) => a.pos - b.pos);
  }
  at(u: number, v: number): Rgba {
    const span = this.r1 - this.r0 || 1;
    const t = Math.min(
      1,
      Math.max(0, (Math.hypot(u - this.x0, v - this.y0) - this.r0) / span),
    );
    const stops = this.stops;
    if (!stops.length) return { r: 0, g: 0, b: 0, a: 0 };
    let i = 0;
    while (i < stops.length - 1 && stops[i + 1].pos < t) i++;
    const a = stops[i],
      b = stops[Math.min(i + 1, stops.length - 1)];
    const k = b.pos === a.pos ? 0 : (t - a.pos) / (b.pos - a.pos);
    return {
      r: Math.round(a.c.r + (b.c.r - a.c.r) * k),
      g: Math.round(a.c.g + (b.c.g - a.c.g) * k),
      b: Math.round(a.c.b + (b.c.b - a.c.b) * k),
      a: Math.round(a.c.a + (b.c.a - a.c.a) * k),
    };
  }
}

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}
function invert(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (!det) throw new Error('不可逆变换');
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

interface State {
  m: Matrix;
  fill: string | RadialGradient;
  alpha: number;
  gco: string;
  clip: Uint8Array | null;
}

interface SubPath {
  pts: number[];
  closed: boolean;
}

/** 可作为 drawImage 源的像素载体。 */
export interface PixelSource {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ImageDataShim {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export class ShimContext {
  private readonly stack: State[] = [];
  private s: State = {
    m: { ...IDENTITY },
    fill: '#000000',
    alpha: 1,
    gco: 'source-over',
    clip: null,
  };
  private subpaths: SubPath[] = [];
  private current: [number, number] | null = null;
  // 通用属性：出图用不到，但代码会赋值，存下来避免崩。
  strokeStyle = '#000';
  lineWidth = 1;
  font = '10px sans-serif';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  lineCap = 'butt';
  lineJoin = 'miter';
  miterLimit = 10;
  shadowBlur = 0;
  shadowColor = 'transparent';
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  filter = 'none';

  constructor(readonly canvas: ShimCanvas) {}

  // ── 状态 ────────────────────────────────────────────────
  get fillStyle(): string | RadialGradient {
    return this.s.fill;
  }
  set fillStyle(v: string | RadialGradient) {
    this.s.fill = v;
  }
  get globalAlpha(): number {
    return this.s.alpha;
  }
  set globalAlpha(v: number) {
    this.s.alpha = v;
  }
  get globalCompositeOperation(): string {
    return this.s.gco;
  }
  set globalCompositeOperation(v: string) {
    this.s.gco = v;
  }
  imageSmoothingEnabled = true;

  save(): void {
    this.stack.push({
      ...this.s,
      m: { ...this.s.m },
    });
  }
  restore(): void {
    const prev = this.stack.pop();
    if (!prev) throw new Error('restore 超出 save');
    this.s = prev;
  }
  translate(x: number, y: number): void {
    const m = this.s.m;
    m.e += m.a * x + m.c * y;
    m.f += m.b * x + m.d * y;
  }
  scale(sx: number, sy: number): void {
    const m = this.s.m;
    m.a *= sx;
    m.b *= sx;
    m.c *= sy;
    m.d *= sy;
  }
  rotate(rad: number): void {
    const m = this.s.m,
      cos = Math.cos(rad),
      sin = Math.sin(rad);
    const a = m.a * cos + m.c * sin,
      b = m.b * cos + m.d * sin,
      c = m.a * -sin + m.c * cos,
      d = m.b * -sin + m.d * cos;
    m.a = a;
    m.b = b;
    m.c = c;
    m.d = d;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.s.m = { a, b, c, d, e, f };
  }

  // ── 路径 ────────────────────────────────────────────────
  beginPath(): void {
    this.subpaths = [];
    this.current = null;
  }
  moveTo(x: number, y: number): void {
    this.subpaths.push({ pts: [x, y], closed: false });
    this.current = [x, y];
  }
  lineTo(x: number, y: number): void {
    if (!this.current) return this.moveTo(x, y);
    const last = this.subpaths[this.subpaths.length - 1];
    last.pts.push(x, y);
    this.current = [x, y];
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.subpaths.push({
      pts: [x, y, x + w, y, x + w, y + h, x, y + h],
      closed: true,
    });
    this.current = [x, y];
  }
  closePath(): void {
    const last = this.subpaths[this.subpaths.length - 1];
    if (last) last.closed = true;
  }

  /** 路径 → 设备空间扫描线（非零环绕）遮罩。 */
  private rasterize(): { mask: Uint8Array; x0: number; y0: number; w: number; h: number } | null {
    const m = this.s.m;
    const pts: number[][] = [];
    for (const sp of this.subpaths) {
      const dev: number[] = [];
      for (let i = 0; i < sp.pts.length; i += 2) {
        const [x, y] = apply(m, sp.pts[i], sp.pts[i + 1]);
        dev.push(x, y);
      }
      pts.push(dev);
    }
    if (!pts.length) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of pts)
      for (let i = 0; i < p.length; i += 2) {
        minX = Math.min(minX, p[i]);
        maxX = Math.max(maxX, p[i]);
        minY = Math.min(minY, p[i + 1]);
        maxY = Math.max(maxY, p[i + 1]);
      }
    const x0 = Math.max(0, Math.floor(minX)),
      y0 = Math.max(0, Math.floor(minY)),
      x1 = Math.min(this.canvas.width, Math.ceil(maxX)),
      y1 = Math.min(this.canvas.height, Math.ceil(maxY));
    if (x1 <= x0 || y1 <= y0) return null;
    const w = x1 - x0,
      h = y1 - y0,
      mask = new Uint8Array(w * h);
    // 收集边（设备空间），逐扫描线求交。
    const edges: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const p of pts) {
      const n = p.length / 2;
      if (n < 3) continue; // 线段没有面积
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n; // fill 隐式闭合每个子路径
        edges.push({
          x0: p[i * 2],
          y0: p[i * 2 + 1],
          x1: p[j * 2],
          y1: p[j * 2 + 1],
        });
      }
    }
    for (let y = y0; y < y1; y++) {
      const sy = y + 0.5,
        xs: { x: number; wind: number }[] = [];
      for (const e of edges) {
        if (e.y0 === e.y1) continue;
        if (sy < Math.min(e.y0, e.y1) || sy >= Math.max(e.y0, e.y1)) continue;
        const t = (sy - e.y0) / (e.y1 - e.y0);
        xs.push({ x: e.x0 + (e.x1 - e.x0) * t, wind: e.y1 > e.y0 ? 1 : -1 });
      }
      xs.sort((a, b) => a.x - b.x);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i].wind;
        if (!wind) continue;
        const from = Math.max(x0, Math.ceil(xs[i].x - 0.5)),
          to = Math.min(x1, Math.ceil(xs[i + 1].x - 0.5));
        for (let x = from; x < to; x++) mask[(y - y0) * w + (x - x0)] = 1;
      }
    }
    return { mask, x0, y0, w, h };
  }

  fill(): void {
    const r = this.rasterize();
    if (!r) return;
    const inv = invert(this.s.m);
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const i = y * r.w + x;
        if (!r.mask[i]) continue;
        const [u, v] = apply(inv, r.x0 + x + 0.5, r.y0 + y + 0.5);
        const c =
          typeof this.s.fill === 'string'
            ? parseColor(this.s.fill)
            : this.s.fill.at(u, v);
        this.blend((r.y0 + y) * this.canvas.width + (r.x0 + x), c);
      }
  }

  clip(): void {
    const r = this.rasterize();
    if (!r) return;
    const w = this.canvas.width,
      h = this.canvas.height,
      prev = this.s.clip,
      next = prev ? new Uint8Array(prev) : new Uint8Array(w * h);
    const idx = (px: number, py: number): number => py * w + px;
    for (let y = r.y0; y < r.y0 + r.h; y++)
      for (let x = r.x0; x < r.x0 + r.w; x++) {
        if (!r.mask[(y - r.y0) * r.w + (x - r.x0)]) next[idx(x, y)] = 0;
        else if (!prev) next[idx(x, y)] = 1;
      }
    this.s.clip = next;
  }

  // ── 像素操作 ────────────────────────────────────────────
  private blend(px: number, c: Rgba, scale = 1): void {
    const clip = this.s.clip;
    if (clip && !clip[px]) return;
    const sa = (c.a / 255) * this.s.alpha * scale;
    if (sa <= 0) return;
    const i = px * 4,
      d = this.canvas.data;
    const da = d[i + 3] / 255;
    const sr = c.r * sa,
      sg = c.g * sa,
      sb = c.b * sa;
    let or: number,
      og: number,
      ob: number,
      oa: number;
    switch (this.s.gco) {
      case 'source-atop':
        if (d[i + 3] === 0) return;
        or = sr * da + d[i] * (1 - sa);
        og = sg * da + d[i + 1] * (1 - sa);
        ob = sb * da + d[i + 2] * (1 - sa);
        oa = da;
        break;
      case 'destination-out':
        or = d[i] * (1 - sa);
        og = d[i + 1] * (1 - sa);
        ob = d[i + 2] * (1 - sa);
        oa = da * (1 - sa);
        break;
      default: // source-over（预乘）
        or = sr + d[i] * (1 - sa);
        og = sg + d[i + 1] * (1 - sa);
        ob = sb + d[i + 2] * (1 - sa);
        oa = sa + da * (1 - sa);
    }
    d[i] = or;
    d[i + 1] = og;
    d[i + 2] = ob;
    d[i + 3] = oa * 255;
  }

  /** 用户空间矩形 → 设备像素（逆变换逐点判定）。 */
  private fillUserRect(x: number, y: number, w: number, h: number, clear: boolean): void {
    const m = this.s.m;
    // 纯平移快路径（图集构建的主路径）：device = round(user) + e/f。
    if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1) {
      const ox = Math.round(m.e),
        oy = Math.round(m.f);
      const x0 = Math.floor(x + ox),
        y0 = Math.floor(y + oy),
        x1 = Math.floor(x + w + ox),
        y1 = Math.floor(y + h + oy);
      const W = this.canvas.width,
        H = this.canvas.height,
        color =
          clear || typeof this.s.fill !== 'string'
            ? null
            : parseColor(this.s.fill);
      const clip = this.s.clip;
      for (let py = Math.max(0, y0); py < Math.min(H, y1); py++)
        for (let px = Math.max(0, x0); px < Math.min(W, x1); px++) {
          if (clip && !clip[py * W + px]) continue;
          if (clear) {
            const i = (py * W + px) * 4;
            this.canvas.data[i] = 0;
            this.canvas.data[i + 1] = 0;
            this.canvas.data[i + 2] = 0;
            this.canvas.data[i + 3] = 0;
          } else if (color) this.blend(py * W + px, color);
        }
      // 带 transform 的渐变矩形仍走通用路径。
      if (clear || color) return;
    }
    const inv = invert(m);
    const corners = [
      apply(m, x, y),
      apply(m, x + w, y),
      apply(m, x + w, y + h),
      apply(m, x, y + h),
    ];
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
    const maxX = Math.min(this.canvas.width, Math.ceil(Math.max(...corners.map((c) => c[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
    const maxY = Math.min(this.canvas.height, Math.ceil(Math.max(...corners.map((c) => c[1]))));
    const W = this.canvas.width;
    for (let py = minY; py < maxY; py++)
      for (let px = minX; px < maxX; px++) {
        const [u, v] = apply(inv, px + 0.5, py + 0.5);
        if (u < x || u >= x + w || v < y || v >= y + h) continue;
        if (clear) {
          if (this.s.clip && !this.s.clip[py * W + px]) continue;
          const i = (py * W + px) * 4;
          this.canvas.data[i] = 0;
          this.canvas.data[i + 1] = 0;
          this.canvas.data[i + 2] = 0;
          this.canvas.data[i + 3] = 0;
        } else {
          const c =
            typeof this.s.fill === 'string'
              ? parseColor(this.s.fill)
              : this.s.fill.at(u, v);
          this.blend(py * W + px, c);
        }
      }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.fillUserRect(x, y, w, h, false);
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.fillUserRect(x, y, w, h, true);
  }

  drawImage(src: PixelSource, ...args: number[]): void {
    let sx = 0,
      sy = 0,
      sw = src.width,
      sh = src.height,
      dx: number,
      dy: number,
      dw: number,
      dh: number;
    if (args.length === 2) {
      [dx, dy] = args;
      dw = sw;
      dh = sh;
    } else if (args.length === 4) {
      [dx, dy, dw, dh] = args;
    } else if (args.length === 8) {
      [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    } else throw new Error('drawImage 参数个数不支持: ' + args.length);
    const m = this.s.m;
    // 纯平移 + 1:1：直接拷贝（图集装箱的主路径）。
    if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && sw === dw && sh === dh) {
      const W = this.canvas.width,
        H = this.canvas.height;
      const ox = Math.round(dx + m.e),
        oy = Math.round(dy + m.f);
      const clip = this.s.clip,
        alpha = this.s.alpha,
        gco = this.s.gco;
      for (let y = 0; y < sh; y++) {
        const ty = oy + y;
        if (ty < 0 || ty >= H) continue;
        for (let x = 0; x < sw; x++) {
          const tx = ox + x;
          if (tx < 0 || tx >= W) continue;
          const di = (ty * W + tx) * 4,
            si = ((sy + y) * src.width + sx + x) * 4;
          if (clip && !clip[ty * W + tx]) continue;
          const sa = (src.data[si + 3] / 255) * alpha;
          if (sa <= 0) continue;
          const d = this.canvas.data;
          const da = d[di + 3] / 255;
          const sr = src.data[si] * sa,
            sg = src.data[si + 1] * sa,
            sb = src.data[si + 2] * sa;
          let or: number,
            og: number,
            ob: number,
            oa: number;
          if (gco === 'source-atop') {
            if (d[di + 3] === 0) continue;
            or = sr * da + d[di] * (1 - sa);
            og = sg * da + d[di + 1] * (1 - sa);
            ob = sb * da + d[di + 2] * (1 - sa);
            oa = da;
          } else if (gco === 'destination-out') {
            or = d[di] * (1 - sa);
            og = d[di + 1] * (1 - sa);
            ob = d[di + 2] * (1 - sa);
            oa = da * (1 - sa);
          } else {
            or = sr + d[di] * (1 - sa);
            og = sg + d[di + 1] * (1 - sa);
            ob = sb + d[di + 2] * (1 - sa);
            oa = sa + da * (1 - sa);
          }
          d[di] = or;
          d[di + 1] = og;
          d[di + 2] = ob;
          d[di + 3] = oa * 255;
        }
      }
      return;
    }
    // 通用：设备 bbox 内逆变换判定。
    const corners = [
      apply(m, dx, dy),
      apply(m, dx + dw, dy),
      apply(m, dx + dw, dy + dh),
      apply(m, dx, dy + dh),
    ];
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
    const maxX = Math.min(this.canvas.width, Math.ceil(Math.max(...corners.map((c) => c[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
    const maxY = Math.min(this.canvas.height, Math.ceil(Math.max(...corners.map((c) => c[1]))));
    const inv = invert(m),
      W = this.canvas.width;
    for (let py = minY; py < maxY; py++)
      for (let px = minX; px < maxX; px++) {
        const [u, v] = apply(inv, px + 0.5, py + 0.5);
        if (u < dx || u >= dx + dw || v < dy || v >= dy + dh) continue;
        const sxp = Math.floor(sx + ((u - dx) * sw) / dw),
          syp = Math.floor(sy + ((v - dy) * sh) / dh);
        if (sxp < 0 || syp < 0 || sxp >= src.width || syp >= src.height)
          continue;
        const si = (syp * src.width + sxp) * 4,
          di = (py * W + px) * 4;
        const sa = (src.data[si + 3] / 255) * this.s.alpha;
        if (sa <= 0) continue;
        const clip = this.s.clip;
        if (clip && !clip[py * W + px]) continue;
        const d = this.canvas.data,
          da = d[di + 3] / 255;
        const sr = src.data[si] * sa,
          sg = src.data[si + 1] * sa,
          sb = src.data[si + 2] * sa;
        let or: number,
          og: number,
          ob: number,
          oa: number;
        if (this.s.gco === 'source-atop') {
          if (d[di + 3] === 0) continue;
          or = sr * da + d[di] * (1 - sa);
          og = sg * da + d[di + 1] * (1 - sa);
          ob = sb * da + d[di + 2] * (1 - sa);
          oa = da;
        } else if (this.s.gco === 'destination-out') {
          or = d[di] * (1 - sa);
          og = d[di + 1] * (1 - sa);
          ob = d[di + 2] * (1 - sa);
          oa = da * (1 - sa);
        } else {
          or = sr + d[di] * (1 - sa);
          og = sg + d[di + 1] * (1 - sa);
          ob = sb + d[di + 2] * (1 - sa);
          oa = sa + da * (1 - sa);
        }
        d[di] = or;
        d[di + 1] = og;
        d[di + 2] = ob;
        d[di + 3] = oa * 255;
      }
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): RadialGradient {
    return new RadialGradient(x0, y0, r0, x1, y1, r1);
  }

  /** 读原始像素（规范上忽略裁剪与合成），返回直通 alpha。 */
  getImageData(x: number, y: number, w: number, h: number): ImageDataShim {
    const W = this.canvas.width,
      out = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++)
      for (let col = 0; col < w; col++) {
        const sx = x + col,
          sy = y + row,
          si = (sy * W + sx) * 4,
          di = (row * w + col) * 4;
        if (sx < 0 || sy < 0 || sx >= W || sy >= this.canvas.height) continue;
        const a = this.canvas.data[si + 3];
        if (a === 0 || a === 255) {
          out[di] = this.canvas.data[si];
          out[di + 1] = this.canvas.data[si + 1];
          out[di + 2] = this.canvas.data[si + 2];
          out[di + 3] = a;
        } else {
          const k = 255 / a;
          out[di] = Math.min(255, Math.round(this.canvas.data[si] * k));
          out[di + 1] = Math.min(255, Math.round(this.canvas.data[si + 1] * k));
          out[di + 2] = Math.min(255, Math.round(this.canvas.data[si + 2] * k));
          out[di + 3] = a;
        }
      }
    return { data: out, width: w, height: h };
  }

  /** 直写像素：忽略变换、裁剪与合成模式（规范如此）。 */
  putImageData(img: ImageDataShim, dx: number, dy: number): void {
    const W = this.canvas.width,
      H = this.canvas.height;
    for (let row = 0; row < img.height; row++)
      for (let col = 0; col < img.width; col++) {
        const tx = dx + col,
          ty = dy + row;
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const si = (row * img.width + col) * 4,
          di = (ty * W + tx) * 4,
          a = img.data[si + 3];
        this.canvas.data[di] = Math.round((img.data[si] * a) / 255);
        this.canvas.data[di + 1] = Math.round((img.data[si + 1] * a) / 255);
        this.canvas.data[di + 2] = Math.round((img.data[si + 2] * a) / 255);
        this.canvas.data[di + 3] = a;
      }
  }

  /** 明确拒绝出图用不到的 API，避免静默出错图。 */
  private unsupported(name: string): never {
    throw new Error('无头 Canvas 未实现: ' + name);
  }
  stroke(): void {
    this.unsupported('stroke');
  }
  fillText(): void {
    this.unsupported('fillText');
  }
  measureText(): never {
    return this.unsupported('measureText');
  }

  // ── 小地图专用（arc / strokeRect）：渲染器本体的地面分块不需要，但 UI 需要 ──
  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    const pts: number[] = [];
    const steps = Math.max(8, Math.ceil(r * 4));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    this.subpaths.push({ pts, closed: true });
    this.current = [pts[0], pts[1]];
  }

  /** 只用于 stroked rect：按中心线向外/内扩半个线宽填充。 */
  strokeRect(x: number, y: number, w: number, h: number): void {
    const half = Math.max(0.5, this.lineWidth / 2);
    const prev = this.s.fill;
    this.s.fill = this.strokeStyle;
    const m = this.s.m;
    if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1) {
      for (const [rx, ry, rw, rh] of [
        [x - half, y - half, w + half * 2, half],
        [x - half, y + h, w + half * 2, half],
        [x - half, y, half, h],
        [x + w, y, half, h],
      ])
        this.fillRect(rx, ry, rw, rh);
    } else {
      for (const [rx, ry, rw, rh] of [
        [x - half, y - half, w + half * 2, half],
        [x - half, y + h, w + half * 2, half],
        [x - half, y, half, h],
        [x + w, y, half, h],
      ]) {
        this.beginPath();
        this.rect(rx, ry, rw, rh);
        this.fill();
      }
    }
    this.s.fill = prev;
  }
}

export class ShimCanvas {
  private _w = 0;
  private _h = 0;
  private _data = new Uint8ClampedArray(0);
  private _ctx: ShimContext | null = null;

  get width(): number {
    return this._w;
  }
  set width(v: number) {
    this._w = Math.max(0, v | 0);
    this.alloc();
  }
  get height(): number {
    return this._h;
  }
  set height(v: number) {
    this._h = Math.max(0, v | 0);
    this.alloc();
  }
  /** 预乘 RGBA 像素。 */
  get data(): Uint8ClampedArray {
    return this._data;
  }
  private alloc(): void {
    this._data = new Uint8ClampedArray(this._w * this._h * 4);
  }
  getContext(kind: string): ShimContext {
    if (kind !== '2d') throw new Error('只实现了 2d context');
    return (this._ctx ??= new ShimContext(this));
  }
}

/**
 * PNG 解码（8-bit，color type 6/2/3，非隔行）。生成素材都是 prepare 脚本
 * 输出的标准 PNG，够用；不支持的格式直接抛错，不猜。
 */
function decodePng(buffer: Buffer): PixelSource {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47)
    throw new Error('不是 PNG');
  let offset = 8,
    width = 0,
    height = 0,
    bitDepth = 0,
    colorType = 0,
    interlace = 0,
    palette: Buffer | null = null,
    transparency: Buffer | null = null;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset),
      type = buffer.toString('ascii', offset + 4, offset + 8),
      data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') transparency = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || interlace !== 0)
    throw new Error(`不支持的 PNG 格式: bitDepth=${bitDepth} interlace=${interlace}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : -1;
  if (channels < 0) throw new Error('不支持的 PNG colorType: ' + colorType);
  const raw = inflateSync(Buffer.concat(idat)),
    stride = width * channels,
    pixels = Buffer.alloc(stride * height);
  // 逐行去滤波。
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++],
      rowStart = y * stride,
      prevStart = rowStart - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src++],
        a = i >= channels ? pixels[rowStart + i - channels] : 0,
        b = y > 0 ? pixels[prevStart + i] : 0,
        c = y > 0 && i >= channels ? pixels[prevStart + i - channels] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c,
            pa = Math.abs(p - a),
            pb = Math.abs(p - b),
            pc = Math.abs(p - c);
          value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error('未知 PNG 滤波: ' + filter);
      }
      pixels[rowStart + i] = value & 0xff;
    }
  }
  // 转直通 RGBA 再预乘（shim 内部约定）。
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const si = i * channels,
      di = i * 4;
    let r: number, g: number, b: number, a: number;
    if (colorType === 6) {
      r = pixels[si];
      g = pixels[si + 1];
      b = pixels[si + 2];
      a = pixels[si + 3];
    } else if (colorType === 2) {
      r = pixels[si];
      g = pixels[si + 1];
      b = pixels[si + 2];
      a = 255;
    } else {
      const index = pixels[si];
      if (!palette || index * 3 + 2 >= palette.length)
        throw new Error('PNG 调色板缺失');
      r = palette[index * 3];
      g = palette[index * 3 + 1];
      b = palette[index * 3 + 2];
      a = transparency && index < transparency.length ? transparency[index] : 255;
    }
    out[di] = Math.round((r * a) / 255);
    out[di + 1] = Math.round((g * a) / 255);
    out[di + 2] = Math.round((b * a) / 255);
    out[di + 3] = a;
  }
  return { width, height, data: out };
}

/** data URL PNG 解码器：`?inline` 导入 + await image.decode() 的无头替身。 */
export class ShimImage implements PixelSource {
  width = 0;
  height = 0;
  data = new Uint8ClampedArray(0);
  private _src = '';
  get src(): string {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    const prefix = 'data:image/png;base64,';
    if (!value.startsWith(prefix))
      throw new Error('无头 Image 只支持 data URL PNG: ' + value.slice(0, 64));
    const decoded = decodePng(Buffer.from(value.slice(prefix.length), 'base64'));
    this.width = decoded.width;
    this.height = decoded.height;
    this.data = decoded.data;
  }
  decode(): Promise<this> {
    if (!this.width) throw new Error('Image.decode: src 尚未设置或解码失败');
    return Promise.resolve(this);
  }
}

/** 安装全局 document / Image（art 模块用它们建 canvas 与解码素材）。 */
export function installShim(): void {
  const g = globalThis as { document?: unknown; Image?: unknown };
  if (!g.document)
    g.document = {
      createElement(tag: string): ShimCanvas {
        if (tag === 'canvas') return new ShimCanvas();
        throw new Error('无头环境不支持 createElement: ' + tag);
      },
    };
  if (!g.Image) g.Image = ShimImage;
}
installShim();
