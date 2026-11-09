/**
 * 图层号只在这里定义。对应 goengine 的 game/scene/layers.go。
 * 角色内部各部件按这些常量排序；角色与角色之间再按世界 y 排（伪深度）。
 */
export const LAYER = {
  GROUND: 0,
  DECAL: 2,
  SHADOW: 8,
  FEET: 9,
  BODY: 10,
  ARMOR: 11,
  HEAD: 13,
  WEAPON: 14,
  HANDS: 16,
  WALL_FRONT: 18,
  ROOF: 19,
  FX: 27,
  FLOAT: 28,
  LABEL: 29,
  HUD: 30,
} as const;
