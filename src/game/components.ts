/**
 * 组件 = 纯数据（可序列化）。对应 goengine 的 engine/sim/world.go 里那 10 个 store。
 * ⚠️ 表现层的走路相位 / 混合 / 显示对象 **不放这里**，见 engine/renderer.ts 的 AvatarView。
 * 那条隔离保证「有没有渲染」不影响模拟结果，也是以后接服务端权威的前提。
 */
import type { Store, World } from '../engine/ecs';
import type { InventoryState } from './inventory';
import type { SkillId, ItemId, AbilityId } from './items';
import type { Vec2 } from '../engine/math';

export const TAG = {
  PLAYER: 'player',
  MOB: 'mob',
  PROJECTILE: 'projectile',
  SUMMON: 'summon',
  PROP: 'prop',
  PICKUP: 'pickup',
  /** 命中判定查 damageable 而不是 mob：木箱、墓碑也能被打。 */
  DAMAGEABLE: 'damageable',
} as const;

export const C = {
  RADIUS: 'radius',
  HEALTH: 'health',
  FACING: 'facing',
  PLAYER: 'player',
  MOB: 'mob',
  PROJECTILE: 'projectile',
  PROP: 'prop',
  PICKUP: 'pickup',
  DODGE: 'dodge',
  LOOK: 'look',
  EQUIP: 'equip',
  INVENTORY: 'inventory',
  FIELD: 'field',
  SUMMON: 'summon',
} as const;

export interface Radius {
  r: number;
}
export interface Health {
  hp: number;
  max: number;
  armor: number;
}
/** 连续弧度；身体朝哪和武器指哪是两件事，见 control.ts。 */
export interface Facing {
  angle: number;
}
export type Weapon = 'sword' | 'staff' | 'basketball';

export interface Player {
  weapon: Weapon;
  mana: number;
  maxMana: number;
  atkCd: number;
  castCd: number;
  /** 出手动画剩余秒数；渲染层用它算挥砍进度。 */
  attackAnim: number;
  castAnim: number;
  hurtFlash: number;
  invuln: number;
  kills: number;
  /** 本次挥砍的朝向，动画期间不跟着鼠标转，否则刀光会甩。 */
  swingAngle: number;
  skill: SkillId;
  cooldowns: Partial<Record<AbilityId, number>>;
  shield: number;
  shieldHp: number;
  noManaCd: number;
}

export type MobKind = 'shamble' | 'lunge' | 'caster';

export interface Mob {
  kind: MobKind;
  speed: number;
  aggro: number;
  atkRange: number;
  atkCd: number;
  dmg: number;
  think: number;
  attackAnim: number;
  hurtFlash: number;
  home: Vec2;
  slow?: number;
  frozen?: number;
  windup?: number;
  charge?: number;
}

export interface Projectile {
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  r: number;
  fromPlayer: boolean;
  owner: number;
  /** 'fireball' 命中会范围爆炸；'shadow' 是亡灵法师的暗影弹。 */
  kind: 'fireball' | 'shadow';
  element?: SkillId;
  pierce?: number;
  hit?: number[];
}

export interface Prop {
  sprite: string;
  w: number;
  h: number;
  blocks: boolean;
}

export interface Pickup {
  kind: ItemId;
  count: number;
  ignoreUntil?: number;
  fullNotice?: number;
  bob: number;
}

export interface Summon {
  owner: number;
  target: number;
  life: number;
  age: number;
  angle: number;
}

export interface SpellField {
  type: 'storm';
  r: number;
  life: number;
  tick: number;
  owner: number;
}

export interface Dodge {
  time: number;
  cd: number;
  invuln: number;
  dir: Vec2;
}

/** 渲染层只读：这个实体该用哪套贴图、多大、要不要血条。 */
/** 鞋材质。贴图名 = shoe<Mat>[Side]，见 engine/art.ts 的 shoeSpriteName。 */
export type ShoeMat = 'bare' | 'cloth' | 'leather' | 'iron' | 'zombieBare';

/** 可换装的部分。以后加护甲/头盔就往这里加字段，渲染层按材质拼贴图名。 */
export interface Equip {
  shoes: ShoeMat;
}

export interface Look {
  /** 人形贴图家族：hero / zombie / caster，对应 `<family><View><Part>`。 */
  family: string;
  scale: number;
  showHealth: boolean;
  /** 静态物件（树、墓碑）不参与走路相位。 */
  animated: boolean;
  /** 静态物件直接用这一张贴图，不再拆部件。 */
  staticSprite?: string;
}

export interface Stores {
  radius: Store<Radius>;
  health: Store<Health>;
  facing: Store<Facing>;
  player: Store<Player>;
  mob: Store<Mob>;
  projectile: Store<Projectile>;
  prop: Store<Prop>;
  pickup: Store<Pickup>;
  dodge: Store<Dodge>;
  look: Store<Look>;
  equip: Store<Equip>;
  inventory: Store<InventoryState>;
  field: Store<SpellField>;
  summon: Store<Summon>;
}

export function createStores(w: World): Stores {
  return {
    radius: w.register<Radius>(C.RADIUS),
    health: w.register<Health>(C.HEALTH),
    facing: w.register<Facing>(C.FACING),
    player: w.register<Player>(C.PLAYER),
    mob: w.register<Mob>(C.MOB),
    projectile: w.register<Projectile>(C.PROJECTILE),
    prop: w.register<Prop>(C.PROP),
    pickup: w.register<Pickup>(C.PICKUP),
    dodge: w.register<Dodge>(C.DODGE),
    look: w.register<Look>(C.LOOK),
    equip: w.register<Equip>(C.EQUIP),
    inventory: w.register<InventoryState>(C.INVENTORY),
    field: w.register<SpellField>(C.FIELD),
    summon: w.register<Summon>(C.SUMMON),
  };
}
