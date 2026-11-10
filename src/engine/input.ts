/**
 * 输入 = 一帧快照（可序列化 / 可回放 / 以后可换成网络包）。
 * 对应 goengine 的 engine/input/input.go：move 是长度 0~1 的连续向量，不是 8 向枚举。
 * 平台层只负责把键鼠变成 InputState，模拟层不认识 KeyboardEvent。
 */
import { clamp, norm, vec, type Vec2 } from './math';

export const BTN = {
  ATTACK: 1 << 0,
  CAST: 1 << 1,
  DODGE: 1 << 2,
  SWORD: 1 << 3,
  STAFF: 1 << 4,
  DEBUG: 1 << 5,
  RESTART: 1 << 6,
  SHOES: 1 << 7,
  USE: 1 << 8,
  DROP: 1 << 9,
  FIELD: 1 << 10,
  ULTIMATE: 1 << 11,
} as const;

export interface InputState {
  /** 方向及推力，长度 0~1（摇杆半推 = 线性慢走）。 */
  move: Vec2;
  /** 屏幕坐标下的鼠标位置；转世界方向由组装层用 Camera 做。 */
  pointer: Vec2;
  down: number;
  pressed: number;
  aimActive: boolean;
}

export class Input {
  private readonly keys = new Set<string>();
  private pressedBits = 0;
  private downBits = 0;
  readonly pointer: Vec2 = vec();
  private aimUntil = 0;
  private readonly touchAxis: Vec2 = vec();
  private touchActive = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onBlur);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!this.keys.has(k)) this.press(k);
    this.keys.add(k);
    if (
      [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(
        k,
      )
    )
      e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
    this.release(e.key.toLowerCase());
  };

  private onPointerMove = (e: PointerEvent): void => {
    const r = this.target.getBoundingClientRect();
    this.aimUntil = performance.now() + 1800;
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.onPointerMove(e);
    if (e.button === 0) this.set(BTN.ATTACK, true);
    if (e.button === 2) this.set(BTN.CAST, true);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) this.set(BTN.ATTACK, false);
    if (e.button === 2) this.set(BTN.CAST, false);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.downBits = 0;
    this.pressedBits = 0;
    this.touchActive = false;
    this.touchAxis.x = 0;
    this.touchAxis.y = 0;
  };

  private set(bit: number, isDown: boolean): void {
    if (isDown) {
      if (!(this.downBits & bit)) this.pressedBits |= bit;
      this.downBits |= bit;
    } else {
      this.downBits &= ~bit;
    }
  }

  reset(): void {
    this.onBlur();
  }
  setButton(bit: number, down: boolean): void {
    this.set(bit, down);
  }
  setPointerXY(x: number, y: number): void {
    this.pointer.x = x;
    this.pointer.y = y;
  }
  setTouchAxis(x: number, y: number): void {
    const length = Math.max(1, Math.hypot(x, y));
    this.touchAxis.x = x / length;
    this.touchAxis.y = y / length;
    this.touchActive = x !== 0 || y !== 0;
  }
  get aiming(): boolean {
    return performance.now() < this.aimUntil;
  }
  private keyBit(k: string): number {
    return k === ' '
      ? BTN.DODGE
      : k === 'f'
        ? BTN.CAST
        : k === 'x'
          ? BTN.USE
          : k === 'q'
            ? BTN.FIELD
            : k === 'r'
              ? BTN.ULTIMATE
              : k === 'g'
                ? BTN.DROP
                : k === 'f3'
                  ? BTN.DEBUG
                  : 0;
  }
  private press(k: string): void {
    const bit = this.keyBit(k);
    if (bit) this.set(bit, true);
  }
  private release(k: string): void {
    const bit = this.keyBit(k);
    if (bit) this.set(bit, false);
  }

  private axis(): Vec2 {
    if (this.touchActive) return { ...this.touchAxis };
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    const v = norm(vec(x, y));
    // 键盘没有半推，但保留接口：以后接触摸摇杆时把长度压到 0~1 即可慢走。
    return { x: clamp(v.x, -1, 1), y: clamp(v.y, -1, 1) };
  }

  /** 取一帧快照并清掉边沿。边沿每帧只消费一次，否则翻滚会每帧触发。 */
  snapshot(): InputState {
    const s: InputState = {
      move: this.axis(),
      pointer: { x: this.pointer.x, y: this.pointer.y },
      down: this.downBits,
      pressed: this.pressedBits,
      aimActive: this.aiming,
    };
    this.pressedBits = 0;
    return s;
  }

  /** 固定步长一帧内可能跑多个 step，后续 step 只保留按住状态。 */
  withoutEdges(s: InputState): InputState {
    return { ...s, pressed: 0 };
  }
}
