/**
 * 组件 = 纯数据（可序列化）。对应 goengine 的 engine/sim/world.go 里那 10 个 store。
 * ⚠️ 表现层的走路相位 / 混合 / 显示对象 **不放这里**，见 engine/renderer.ts 的 AvatarView。
 * 那条隔离保证「有没有渲染」不影响模拟结果，也是以后接服务端权威的前提。
 */
import type { BladeProfessionId } from './weapon-data';
import type { ArmorMat } from './armor';
import type { NpcKind } from './sanctuary-data';
import type { ElementStaffId } from './staff-data';
import type { MageSkillId } from './mage-data';
import type { Store, World } from '../engine/ecs';
import type { InventoryState } from './inventory';
import type { SkillId, ItemId, AbilityId } from './items';
import type { Vec2 } from '../engine/math';

export const TAG = {
  NPC: 'npc',
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
  BLADE: 'blade',
  RIFT: 'rift',
  RIFT_GROUP: 'riftGroup',
  FLAME_WAVE: 'flameWave',
  NPC: 'npc',
  JOURNAL: 'journal',
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
  MAGE: 'mage',
  WAVE: 'wave',
  STAFF_ZONE: 'staffZone',
  STAFF_SHOT: 'staffShot',
  METEOR: 'meteor',
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
export type Weapon =
  | 'sword'
  | 'staff'
  | 'basketball'
  | 'scythe'
  | 'sabre'
  | 'greatsword';

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
  burn?: number;
  burnTick?: number;
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
  barrage?: boolean;
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

export interface ProfessionState {
  unlocked: boolean;
  cooldowns: Record<MageSkillId, number>;
}
export interface MageState {
  schools: Record<ElementStaffId, ProfessionState>;
  unlocked: boolean;
  cooldowns: Record<MageSkillId, number>;
  fieldLeft: number;
  fieldTick: number;
  barrageLeft: number;
  barrageTick: number;
  barragePhase: number;
  orbitTick: number;
  orbitPhase: number;
}
export interface ThunderWave {
  owner: number;
  origin: Vec2;
  angle: number;
  next: number;
  tick: number;
  hit: number[];
}

export type StaffZoneKind =
  | 'embers'
  | 'meteors'
  | 'burn'
  | 'blizzard'
  | 'judgment'
  | 'singularity';
export interface StaffZone {
  owner: number;
  school: ElementStaffId;
  kind: StaffZoneKind;
  life: number;
  maxLife: number;
  tick: number;
  phase: number;
  radius: number;
}
export type StaffShotStyle = 'lance' | 'spear' | 'star' | 'blade';
export interface StaffShot {
  owner: number;
  school: ElementStaffId;
  style: StaffShotStyle;
  vx: number;
  vy: number;
  age: number;
  life: number;
  damage: number;
  radius: number;
  pierce: number;
  hit: number[];
  returning: boolean;
  target: number;
}
export interface FallingMeteor {
  owner: number;
  delay: number;
  maxDelay: number;
  radius: number;
  damage: number;
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
export type ShoeMat =
  | 'bare'
  | 'cloth'
  | 'leather'
  | 'iron'
  | 'zombieBare'
  | 'sanctum';

/** 可换装的部分。以后加护甲/头盔就往这里加字段，渲染层按材质拼贴图名。 */
export interface Equip {
  head?: ArmorMat;
  chest?: ArmorMat;
  legs?: ArmorMat;
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

export interface Npc {
  kind: NpcKind;
}
export interface Journal {
  stage: 'unmet' | 'purifying' | 'pilgrimage' | 'complete';
  killsAtStart: number;
  talking: number;
  level: number;
  xp: number;
}
export interface BladeState {
  schools: Record<BladeProfessionId, ProfessionState>;
  stormLeft: number;
  stormTick: number;
  stormAngle: number;
  infernoLeft: number;
  infernoTick: number;
  comboLeft: number;
  comboTick: number;
  comboPhase: number;
  comboAngle: number;
  comboMultiplier: number;
}
export interface RiftStrike {
  owner: number;
  kind: 'claw' | 'spike';
  age: number;
  windup: number;
  strikeAt: number;
  life: number;
  radius: number;
  damage: number;
  struck: boolean;
  group: number;
}
export interface RiftGroup {
  life: number;
  hit: number[];
  origin: Vec2;
}
export interface FlameWave {
  owner: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  radius: number;
  damage: number;
  hit: number[];
}
export interface Stores {
  blade: Store<BladeState>;
  rift: Store<RiftStrike>;
  riftGroup: Store<RiftGroup>;
  flameWave: Store<FlameWave>;
  npc: Store<Npc>;
  journal: Store<Journal>;
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
  mage: Store<MageState>;
  wave: Store<ThunderWave>;
  summon: Store<Summon>;
  staffZone: Store<StaffZone>;
  staffShot: Store<StaffShot>;
  meteor: Store<FallingMeteor>;
}

export function createStores(w: World): Stores {
  return {
    blade: w.register<BladeState>(C.BLADE),
    rift: w.register<RiftStrike>(C.RIFT),
    riftGroup: w.register<RiftGroup>(C.RIFT_GROUP),
    flameWave: w.register<FlameWave>(C.FLAME_WAVE),
    npc: w.register<Npc>(C.NPC),
    journal: w.register<Journal>(C.JOURNAL),
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
    mage: w.register<MageState>(C.MAGE),
    wave: w.register<ThunderWave>(C.WAVE),
    summon: w.register<Summon>(C.SUMMON),
    staffZone: w.register<StaffZone>(C.STAFF_ZONE),
    staffShot: w.register<StaffShot>(C.STAFF_SHOT),
    meteor: w.register<FallingMeteor>(C.METEOR),
  };
}
