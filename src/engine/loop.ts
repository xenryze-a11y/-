/**
 * 固定步长 1/60 + 累加器 + MaxSteps=5（对应 goengine 的 game.go:36-37）。
 * 变步长会让「同种子同输入必然同结果」失效；不封顶会卡 → 补 → 更卡死亡螺旋。
 */
export const FIXED_DT = 1 / 60;
export const MAX_STEPS = 5;

export class FixedLoop {
  private acc = 0;

  /** 重开一局时清掉累加器，别把上一局的残留时间带进新世界。 */
  reset(): void {
    this.acc = 0;
  }

  advance(realDT: number, step: (dt: number, stepIndex: number) => void): void {
    // 切后台回来 dt 可能是好几秒，先夹住再进累加器。
    this.acc += Math.min(realDT, 0.25);
    let n = 0;
    while (this.acc >= FIXED_DT && n < MAX_STEPS) {
      this.acc -= FIXED_DT;
      step(FIXED_DT, n);
      n++;
    }
    if (n === MAX_STEPS) this.acc = 0;
  }
}
