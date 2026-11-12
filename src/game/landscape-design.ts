/** 大尺度构图：曲线路网、开阔草甸、溪流和有明确阶梯入口的台地。单位瓦片。 */
export const LANDSCAPE_PATHS: number[][][] = [
  [
    [24, 88],
    [28, 103],
    [44, 117],
    [38, 128],
    [23, 135],
    [42, 147],
    [54, 129],
    [70, 129],
    [70, 145],
  ],
  [
    [44, 117],
    [60, 108],
    [79, 112],
    [98, 117],
    [120, 124],
    [151, 128],
    [163, 107],
  ],
  [
    [70, 145],
    [88, 151],
    [112, 145],
    [151, 153],
    [177, 150],
    [193, 163],
    [213, 164],
    [236, 178],
  ],
  [
    [151, 153],
    [137, 164],
    [117, 175],
  ],
  [
    [213, 164],
    [226, 152],
    [231, 152],
    [231, 136],
  ],
  [
    [110, 30],
    [134, 36],
    [148, 51],
    [162, 47],
    [178, 56],
    [196, 48],
    [211, 48],
    [211, 31],
  ],
  [
    [178, 56],
    [195, 75],
    [221, 80],
    [231, 101],
    [211, 118],
    [181, 109],
    [163, 107],
  ],
  [
    [151, 128],
    [151, 153],
  ],
];
export const TERRACES = [
  { x: 196, y: 17, w: 36, h: 31, gate: 211, side: 'south' },
  { x: 58, y: 135, w: 27, h: 21, gate: 70, side: 'north' },
  { x: 219, y: 124, w: 28, h: 25, gate: 231, side: 'south' },
] as const;
export function segmentDistance(
  x: number,
  y: number,
  a: number[],
  b: number[],
): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}
export function newRoad(x: number, y: number): boolean {
  for (const path of LANDSCAPE_PATHS)
    for (let i = 1; i < path.length; i++)
      if (segmentDistance(x, y, path[i - 1], path[i]) < 1.65) return true;
  return false;
}
export function riverCenter(y: number): number {
  return 91 + Math.sin((y - 98) * 0.075) * 10 + Math.sin(y * 0.021) * 8;
}
