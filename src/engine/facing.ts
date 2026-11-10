/**
 * 朝向：唯一判据。对应 goengine 的 engine/core/facing.go（决策 D52 / D51）。
 *
 * 模拟层是连续弧度（鼠标/摇杆任意角度），表现层才归并成 3 套贴图 + 1 次镜像：
 *   front / back / side，朝左 = side 贴图 + scale.x = -1。
 * 分界线刻意放在对角线：|cos| > |sin| 判 side，斜着走不会频繁左右翻。
 * ⚠️ 朝左绝不旋转 180°，否则帽子、法杖、脸的光源都会跟着翻过去。
 */

import { angleDiff } from './math';

/** 对角边界加少量迟滞，防止鼠标沿分界线晃动时左右闪图；不改模拟瞄准角。 */
export function fourDirection(angle: number, previous?: number): number {
  return previous === undefined ||
    Math.abs(angleDiff(angle, previous)) > Math.PI / 4 + 0.12
    ? Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
    : previous;
}

export type View = 'front' | 'back' | 'side';

export interface FacingView {
  view: View;
  flip: boolean;
}

export function facingView(a: number): FacingView {
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (Math.abs(c) > Math.abs(s)) return { view: 'side', flip: c < 0 };
  return { view: s > 0 ? 'front' : 'back', flip: false };
}

/** 贴图名 = 家族 + 视角 + 部件。命名即协议，见 docs/ART.md。 */
export function spriteName(family: string, view: View, part: string): string {
  const v = view[0].toUpperCase() + view.slice(1);
  return `${family}${v}${part}`;
}
