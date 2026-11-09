/**
 * 纯数据相机，不 import pixi（对应 goengine 的 engine/render/camera.go）。
 * pos = 屏幕正中央对准的世界点。抖动不写进 pos，否则会污染跟随与存档。
 */
import { clamp, smooth, vec, type Vec2 } from './math';

export class Camera {
  readonly pos: Vec2 = vec();
  w = 0;
  h = 0;
  zoom = 2;
  boundsW = 0;
  boundsH = 0;

  private shakeAmount = 0;
  private shakeTime = 0;
  private shakeSeed = 1;
  private shakeOffset: Vec2 = vec();

  /** k=9 与 Go 版一致。 */
  follow(target: Vec2, dt: number): void {
    const t = smooth(9, dt);
    this.pos.x += (target.x - this.pos.x) * t;
    this.pos.y += (target.y - this.pos.y) * t;
    this.clamp();
  }

  snap(target: Vec2): void {
    this.pos.x = target.x;
    this.pos.y = target.y;
    this.clamp();
  }

  private clamp(): void {
    const halfW = this.w / (2 * this.zoom);
    const halfH = this.h / (2 * this.zoom);
    // 地图比屏幕小就居中，别把镜头顶到角落露黑边。
    this.pos.x = this.boundsW <= halfW * 2 ? this.boundsW / 2 : clamp(this.pos.x, halfW, this.boundsW - halfW);
    this.pos.y = this.boundsH <= halfH * 2 ? this.boundsH / 2 : clamp(this.pos.y, halfH, this.boundsH - halfH);
  }

  shake(amount: number, time = 0.25): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  update(dt: number): void {
    if (this.shakeTime <= 0) {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
      this.shakeAmount = 0;
      return;
    }
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    // 用时间做确定性伪随机，不用 Math.random：同种子同结果。
    this.shakeSeed = (this.shakeSeed * 1664525 + 1013904223) >>> 0;
    const a = (this.shakeSeed / 4294967296) * Math.PI * 2;
    const b = (this.shakeSeed >>> 8) / 4294967296 * Math.PI * 2;
    const k = this.shakeAmount * (this.shakeTime / 0.25);
    this.shakeOffset.x = Math.cos(a) * k;
    this.shakeOffset.y = Math.sin(b) * k;
    if (this.shakeTime === 0) this.shakeAmount = 0;
  }

  /** 渲染层用它算容器偏移：把「相机中心 + 抖动」搬到屏幕中心。 */
  offset(): Vec2 {
    return {
      x: this.w / 2 - (this.pos.x + this.shakeOffset.x) * this.zoom,
      y: this.h / 2 - (this.pos.y + this.shakeOffset.y) * this.zoom,
    };
  }

  toScreen(p: Vec2): Vec2 {
    const o = this.offset();
    return { x: p.x * this.zoom + o.x, y: p.y * this.zoom + o.y };
  }

  toWorld(s: Vec2): Vec2 {
    const o = this.offset();
    return { x: (s.x - o.x) / this.zoom, y: (s.y - o.y) / this.zoom };
  }
}
