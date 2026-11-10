/** 视频循环与表现参数；不含 DOM / Pixi，模拟可独立运行。 */
export const SUMMON_ANIMATION = {
  width: 48,
  height: 48,
  // 用户 VFR 视频中 native 2→5→6→7→8→9→13 的原始时间差。
  durations: [0.065255, 0.051734, 0.067622, 0.063867, 0.051544, 0.066111],
};
export function summonFrameAt(time: number): number {
  const duration = SUMMON_ANIMATION.durations.reduce((sum, n) => sum + n, 0);
  let cursor = ((time % duration) + duration) % duration;
  for (let i = 0; i < SUMMON_ANIMATION.durations.length; i++) {
    if (cursor < SUMMON_ANIMATION.durations[i]) return i;
    cursor -= SUMMON_ANIMATION.durations[i];
  }
  return 0;
}
export const BASKETBALL_VISUAL = {
  scale: 0.66,
  maxGlyphs: 160,
  glyphsPerBurst: 18,
};
