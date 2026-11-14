/** 存档只保存纯模拟数据，不保存 Pixi、输入、镜头、对话窗口和粒子。 */
import { World, type WorldSnapshot } from '../engine/ecs';
import { Level, type LevelSnapshot } from '../engine/level';
import { createStores, C, TAG } from './components';
import { ITEMS } from './items';
import { SURVIVAL } from './data';
import { createProgress } from './adventure';
import { initializeExploration } from './exploration-world';
import { SITES, WORLD } from './world-data';
import { ensureEquipmentInstances, type AdventureProgress } from './adventure';
import type { Scene } from './spawn';

export const SAVE_VERSION = 5;
export const SAVE_LIMIT = 2_000_000;
export const SAVE_PREFIX = 'ashen-vale.save.v1.';
export interface SaveData {
  world: WorldSnapshot;
  level: LevelSnapshot;
  player: number;
  progress: AdventureProgress;
}
export interface SaveRecord {
  format: 'ashen-vale';
  version: number;
  savedAt: string;
  checksum: string;
  data: SaveData;
}
export interface SlotResult {
  record?: SaveRecord;
  recovered?: boolean;
  error?: string;
}
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 校验码用来发现损坏，不用作反作弊。导入仍须通过独立的完整结构校验。 */
function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
type Check = (value: unknown) => boolean;
const number: Check = (v) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e9;
const uint: Check = (v) =>
  number(v) && Number.isInteger(v) && (v as number) >= 0;
const bool: Check = (v) => typeof v === 'boolean';
const text: Check = (v) => typeof v === 'string' && v.length <= 100;
const key: Check = (v) =>
  typeof v === 'string' &&
  /^[a-zA-Z0-9_:\-.]{1,100}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
const one =
  (...values: unknown[]): Check =>
  (v) =>
    values.includes(v);
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);
const array =
  (check: Check, max = 5000, length?: number): Check =>
  (v) =>
    Array.isArray(v) &&
    v.length <= max &&
    (length === undefined || v.length === length) &&
    v.every(check);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const shape =
  (fields: Record<string, Check>): Check =>
  (v) =>
    object(v) &&
    Object.keys(v).every((k) => Object.hasOwn(fields, k)) &&
    Object.entries(fields).every(([k, check]) => check(v[k]));
const dictionary =
  (keys: string[], check: Check): Check =>
  (v) =>
    object(v) &&
    Object.keys(v).every((k) => keys.includes(k)) &&
    Object.values(v).every(check);
const nums = (names: string): Record<string, Check> =>
  Object.fromEntries(
    names
      .split(' ')
      .filter(Boolean)
      .map((k) => [
        k,
        /angle/i.test(k)
          ? (v: unknown) => number(v) && Math.abs(v as number) <= 10000
          : number,
      ]),
  );
const vec = shape(nums('x y'));
const ids = array(uint, 5000);
const itemId = one(...Object.keys(ITEMS));
const armorMat = one('none', 'leather', 'iron', 'sanctum', 'fur');
const element = one('ember', 'frost', 'storm', 'ward', 'blink');
const cooldowns = shape(nums('field wave barrage'));
const profession = shape({ unlocked: bool, cooldowns });
const instance = shape({
  uid: key,
  upgrade: (v) => uint(v) && (v as number) <= 50,
  affixes: array(shape({ id: key, value: number }), 12),
  runes: dictionary(['field', 'wave', 'barrage'], key),
});
const stack: Check = (v) =>
  v === null ||
  (shape({ id: itemId, count: uint, instance: optional(instance) })(v) &&
    object(v) &&
    (v.count as number) > 0 &&
    (v.count as number) <= ITEMS[v.id as keyof typeof ITEMS].stack);
const schema: Record<string, Check> = {
  [C.RADIUS]: shape(nums('r')),
  [C.HEALTH]: shape(nums('hp max armor')),
  [C.FACING]: shape(nums('angle')),
  [C.PLAYER]: shape({
    ...nums(
      'mana maxMana atkCd castCd attackAnim castAnim hurtFlash invuln kills swingAngle shield shieldHp noManaCd',
    ),
    weapon: one(
      'sword',
      'staff',
      'basketball',
      'scythe',
      'sabre',
      'greatsword',
    ),
    skill: element,
    cooldowns: dictionary(
      ['ember', 'frost', 'storm', 'ward', 'blink', 'basketball'],
      number,
    ),
  }),
  [C.MOB]: shape({
    site: optional(one(...SITES.map((s) => s.id))),
    ...nums('speed aggro atkRange atkCd dmg think attackAnim hurtFlash'),
    ...Object.fromEntries(
      'slow frozen burn burnTick windup charge'
        .split(' ')
        .map((k) => [k, optional(number)]),
    ),
    kind: one('shamble', 'lunge', 'caster'),
    home: vec,
  }),
  [C.PROJECTILE]: shape({
    ...nums('vx vy life dmg r owner'),
    fromPlayer: bool,
    kind: one('fireball', 'shadow'),
    element: optional(element),
    pierce: optional(number),
    hit: optional(ids),
    barrage: optional(bool),
  }),
  [C.PROP]: shape({
    landmark: optional(one(...SITES.map((s) => s.id))),
    sprite: key,
    ...nums('w h'),
    blocks: bool,
  }),
  [C.PICKUP]: shape({
    kind: itemId,
    ...nums('count bob'),
    ignoreUntil: optional(number),
    fullNotice: optional(number),
    instance: optional(instance),
  }),
  [C.DODGE]: shape({ ...nums('time cd invuln'), dir: vec }),
  [C.LOOK]: shape({
    family: one(
      'hero',
      'zombie',
      'caster',
      'prop',
      'pickup',
      'npc',
      'fx',
      'summon',
    ),
    scale: number,
    showHealth: bool,
    animated: bool,
    staticSprite: optional(key),
  }),
  [C.EQUIP]: shape({
    shoes: one('bare', 'cloth', 'leather', 'iron', 'zombieBare', 'sanctum'),
    head: optional(armorMat),
    chest: optional(armorMat),
    legs: optional(armorMat),
  }),
  [C.INVENTORY]: shape({
    slots: array(stack, 36, 36),
    craft: array(stack, 4, 4),
    boots: stack,
    armor: shape({ head: stack, chest: stack, legs: stack }),
    cursor: stack,
    selected: (v) => uint(v) && (v as number) < 9,
    revision: uint,
  }),
  [C.NPC]: shape({ kind: one('herald', 'priest') }),
  [C.JOURNAL]: shape({
    stage: one('unmet', 'purifying', 'pilgrimage', 'complete'),
    ...nums('killsAtStart talking level xp'),
  }),
  [C.FIELD]: shape({ type: one('storm'), ...nums('r life tick owner') }),
  [C.MAGE]: shape({
    schools: shape({
      ember: profession,
      frost: profession,
      ward: profession,
      blink: profession,
    }),
    unlocked: bool,
    cooldowns,
    ...nums(
      'fieldLeft fieldTick barrageLeft barrageTick barragePhase orbitTick orbitPhase',
    ),
  }),
  [C.WAVE]: shape({ ...nums('owner angle next tick'), origin: vec, hit: ids }),
  [C.STAFF_ZONE]: shape({
    ...nums('owner life maxLife tick phase radius'),
    school: element,
    kind: one(
      'embers',
      'meteors',
      'burn',
      'blizzard',
      'judgment',
      'singularity',
    ),
  }),
  [C.STAFF_SHOT]: shape({
    ...nums('owner vx vy age life damage radius pierce target'),
    school: element,
    style: one('lance', 'spear', 'star', 'blade'),
    hit: ids,
    returning: bool,
  }),
  [C.METEOR]: shape(nums('owner delay maxDelay radius damage')),
  [C.SUMMON]: shape(nums('owner target life age angle')),
  [C.BLADE]: shape({
    schools: shape({ scythe: profession, greatsword: profession }),
    infernoVitality: bool,
    ...nums(
      'waveLeft waveSwingLeft waveSwingIndex waveTick waveAngle waveMultiplier stormLeft stormTick stormAngle infernoLeft infernoTick comboLeft comboTick comboPhase comboAngle comboMultiplier',
    ),
  }),
  [C.RIFT]: shape({
    ...nums('owner age windup strikeAt life radius damage group'),
    kind: one('claw', 'spike'),
    struck: bool,
  }),
  [C.RIFT_GROUP]: shape({ life: number, hit: ids, origin: vec }),
  [C.FLAME_WAVE]: shape({
    ...nums('owner vx vy life age radius damage'),
    hit: ids,
  }),
  [C.SURVIVAL]: shape({
    ...nums('hunger thirst warmth fatigue bleed infection dot warned'),
    // v4 没有暑热；旧档在 restoreSave 里补 0。
    heat: optional(number),
  }),
};

function fail(message: string): never {
  throw new Error(message);
}
function validate(
  data: unknown,
  version = SAVE_VERSION,
): asserts data is SaveData {
  if (
    !shape({ world: object, level: object, player: uint, progress: object })(
      data,
    )
  )
    fail('存档结构不完整');
  const d = data as SaveData;
  if (
    !shape({
      seed: (v) =>
        typeof v === 'number' &&
        Number.isInteger(v) &&
        v >= 0 &&
        v <= 0xffffffff,
      mode: one('adventure'),
      name: (v) =>
        text(v) && (v as string).length > 0 && (v as string).length <= 20,
      nextEquipmentId: uint,
      nextRespawn: number,
      explored: array(key),
      openedChests: array(key),
      purified: array(key),
      bosses: array(key),
      ...(version === 1
        ? {}
        : {
            worldVersion: one(version === 2 ? 2 : 3),
            discovered: array(one(...SITES.map((s) => s.id)), SITES.length),
            waypoints: array(
              one(
                ...SITES.filter((s) => s.kind === 'waypoint').map((s) => s.id),
              ),
              6,
            ),
            startedSites: array(
              one(...SITES.filter((s) => s.guards > 0).map((s) => s.id)),
              SITES.length,
            ),
            trackedSite: one('', ...SITES.map((s) => s.id)),
            lastRegion: one('', 'vale', 'forest', 'sanctum'),
            campReadyAt: number,
            travelReadyAt: number,
          }),
    })(d.progress)
  )
    fail('角色进度数据无效');
  if (
    !shape({
      w: one(version === 1 ? 96 : version === 2 ? 128 : WORLD.width),
      h: one(version === 1 ? 72 : version === 2 ? 96 : WORLD.height),
      tiles: array(
        version < 3 ? one(0, 1, 2, 3, 4, 5, 6) : one(0, 1, 2, 3, 4, 5, 6, 7, 8),
        version === 1
          ? 6912
          : version === 2
            ? 12288
            : WORLD.width * WORLD.height,
        version === 1
          ? 6912
          : version === 2
            ? 12288
            : WORLD.width * WORLD.height,
      ),
      southWalls: array(
        one(0, 1),
        version === 1
          ? 6912
          : version === 2
            ? 12288
            : WORLD.width * WORLD.height,
        version === 1
          ? 6912
          : version === 2
            ? 12288
            : WORLD.width * WORLD.height,
      ),
      spawn: vec,
      blockers: array(shape(nums('x y r')), 5000),
      revision: uint,
    })(d.level)
  )
    fail('地图数据无效');
  if (
    !shape({
      nextId: uint,
      time: (v) => number(v) && (v as number) >= 0,
      rng: (v) =>
        typeof v === 'number' &&
        Number.isInteger(v) &&
        v >= 0 &&
        v <= 0xffffffff,
      entities: array(
        shape({
          id: uint,
          tags: array(one(...Object.values(TAG)), 10),
          position: optional(vec),
        }),
        5000,
      ),
      stores: object,
    })(d.world)
  )
    fail('世界数据无效');
  const entities = new Set<number>();
  for (const entity of d.world.entities) {
    if (!entity.id || entities.has(entity.id) || entity.id >= d.world.nextId)
      fail('实体编号重复或无效');
    entities.add(entity.id);
    if (
      entity.position &&
      (entity.position.x < 0 ||
        entity.position.y < 0 ||
        entity.position.x > d.level.w * 32 ||
        entity.position.y > d.level.h * 32)
    )
      fail('实体位置越界');
  }
  // v4 加入生存组件。旧档不在这里补数据：validate 一旦改动 data，record 的校验码就会失效，
  // 而 restoreSave 会再 parse 一次。缺省值交给 restoreSave 在新世界上补。
  if (
    Object.keys(d.world.stores).length !==
    Object.keys(schema).length - (version < 4 ? 1 : 0)
  )
    fail('组件版本不匹配');
  for (const [name, entries] of Object.entries(d.world.stores)) {
    const check = schema[name];
    if (
      !Object.hasOwn(schema, name) ||
      !array(shape({ id: uint, value: check }), 5000)(entries)
    )
      fail(`组件数据无效：${name}`);
    const owners = new Set<number>();
    for (const entry of entries) {
      if (!entities.has(entry.id) || owners.has(entry.id)) fail('组件归属无效');
      owners.add(entry.id);
    }
  }
  const value = (name: string): unknown =>
    d.world.stores[name].find((e) => e.id === d.player)?.value;
  for (const name of [
    C.RADIUS,
    C.HEALTH,
    C.FACING,
    C.PLAYER,
    C.DODGE,
    C.LOOK,
    C.EQUIP,
    C.INVENTORY,
    C.JOURNAL,
    C.MAGE,
    C.BLADE,
    ...(version >= 4 ? [C.SURVIVAL] : []),
  ])
    if (!value(name)) fail('缺失角色组件');
  if (
    d.world.stores.player.length !== 1 ||
    d.world.stores.inventory.length !== 1 ||
    d.world.stores.journal.length !== 1
  )
    fail('角色数量无效');
  const hero = d.world.entities.find((e) => e.id === d.player);
  if (!hero?.position || !hero.tags.includes(TAG.PLAYER)) fail('缺失角色位置');
  // 先在隔离世界恢复，再检查跨组件约束，绝不触碰正在玩的局。
  const world = new World();
  const s = createStores(world);
  world.restore(d.world);
  const inv = s.inventory.get(d.player)!,
    hp = s.health.get(d.player)!,
    p = s.player.get(d.player)!;
  if (
    hp.hp <= 0 ||
    hp.max <= 0 ||
    hp.hp > hp.max ||
    p.maxMana <= 0 ||
    p.mana < 0 ||
    p.mana > p.maxMana
  )
    fail('角色生命或法力无效');
  const sv = s.survival.get(d.player);
  if (
    sv &&
    [sv.hunger, sv.thirst, sv.warmth, sv.heat, sv.fatigue].some(
      (v) => v < 0 || v > SURVIVAL.max,
    )
  )
    fail('生存状态无效');
  const blade = s.blade.get(d.player)!;
  if (blade.infernoVitality !== blade.infernoLeft > 0)
    fail('火焰护体状态不一致');
  if (inv.boots && ITEMS[inv.boots.id].kind !== 'boots') fail('靴子装备位无效');
  for (const slot of ['head', 'chest', 'legs'] as const)
    if (inv.armor[slot] && ITEMS[inv.armor[slot]!.id].armorSlot !== slot)
      fail('护甲装备位无效');
  const seen = new Set<string>();
  const equipment = (
    id: keyof typeof ITEMS,
    holder: { instance?: { uid: string } },
  ): void => {
    if (ITEMS[id].stack !== 1) {
      if (holder.instance) fail('材料包含装备身份');
      return;
    }
    const uid = holder.instance?.uid;
    const prefix = `${d.progress.seed}:`;
    if (
      !uid ||
      seen.has(uid) ||
      !uid.startsWith(prefix) ||
      !/^[1-9][0-9]*$/.test(uid.slice(prefix.length)) ||
      Number(uid.slice(prefix.length)) >= d.progress.nextEquipmentId
    )
      fail('装备身份重复或无效');
    seen.add(uid);
  };
  for (const item of [
    ...inv.slots,
    ...inv.craft,
    inv.boots,
    ...Object.values(inv.armor),
    inv.cursor,
  ])
    if (item) equipment(item.id, item);
  s.pickup.forEach((_id, pickup) => {
    if (
      !Number.isInteger(pickup.count) ||
      pickup.count < 1 ||
      pickup.count > ITEMS[pickup.kind].stack
    )
      fail('掉落数量无效');
    equipment(pickup.kind, pickup);
  });
  const positioned = new Set(
    d.world.entities.filter((e) => e.position).map((e) => e.id),
  );
  const requireStores = (id: number, names: string[], tag?: string): void => {
    if (
      names.some((name) => !world.store(name).has(id)) ||
      (tag && !world.hasTag(id, tag))
    )
      fail('实体组件组合不完整');
  };
  s.mob.forEach((id) =>
    requireStores(id, [C.HEALTH, C.RADIUS, C.FACING], TAG.MOB),
  );
  s.pickup.forEach((id) => requireStores(id, [C.LOOK], TAG.PICKUP));
  s.npc.forEach((id) => requireStores(id, [C.LOOK, C.RADIUS], TAG.NPC));
  s.prop.forEach((id, prop) =>
    requireStores(id, prop.blocks ? [C.LOOK, C.RADIUS] : [C.LOOK], TAG.PROP),
  );
  s.projectile.forEach((id, p) => {
    requireStores(id, [C.LOOK], TAG.PROJECTILE);
    if (Math.hypot(p.vx, p.vy) > 3000 || p.r < 0 || p.r > 500)
      fail('弹道数据越界');
  });
  s.flameWave.forEach((_id, wave) => {
    if (Math.hypot(wave.vx, wave.vy) > 3000) fail('焰潮速度越界');
  });
  s.staffShot.forEach((_id, shot) => {
    if (Math.hypot(shot.vx, shot.vy) > 3000) fail('法术速度越界');
  });
  s.look.forEach((_id, look) => {
    if (look.scale <= 0 || look.scale > 10) fail('角色大小无效');
  });
  s.radius.forEach((_id, radius) => {
    if (radius.r < 0 || radius.r > 500) fail('碰撞范围无效');
  });
  for (const [name, entries] of Object.entries(d.world.stores)) {
    for (const entry of entries) {
      if (!positioned.has(entry.id)) fail('实体缺失位置');
      if (
        name === C.RIFT &&
        (entry.value as { group: number }).group &&
        !s.riftGroup.has((entry.value as { group: number }).group)
      )
        fail('地裂法术组缺失');
    }
  }
}

export function captureSave(scene: Scene, now = new Date()): SaveRecord {
  if (scene.progress.mode !== 'adventure') fail('试用模式不写入冒险存档');
  ensureEquipmentInstances(scene);
  const data = {
    world: scene.world.snapshot(),
    level: scene.level.snapshot(),
    player: scene.player,
    progress: structuredClone(scene.progress),
  };
  // 对话是窗口状态，重进时在原地继续，不重开已完成的对话事务。
  for (const entry of data.world.stores[C.JOURNAL])
    (entry.value as { talking: number }).talking = 0;
  validate(data);
  return {
    format: 'ashen-vale',
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    data,
    checksum: checksum(JSON.stringify(data)),
  };
}
export function parseSave(raw: string): SaveRecord {
  if (raw.length > SAVE_LIMIT) fail('文件过大，请选择灰烬谷存档');
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    fail('文件不是有效的 JSON 存档');
  }
  if (!object(record) || record.format !== 'ashen-vale')
    fail('这不是灰烬谷存档');
  if (
    record.version !== 1 &&
    record.version !== 2 &&
    record.version !== 3 &&
    record.version !== 4 &&
    record.version !== SAVE_VERSION
  )
    fail('存档版本不兼容，请使用对应版本的游戏');
  if (
    !shape({
      format: one('ashen-vale'),
      version: one(1, 2, 3, 4, SAVE_VERSION),
      savedAt: text,
      checksum: text,
      data: object,
    })(record) ||
    !Number.isFinite(Date.parse(record.savedAt as string))
  )
    fail('存档信息损坏');
  if (record.checksum !== checksum(JSON.stringify(record.data)))
    fail('存档校验失败，文件可能已损坏');
  validate(record.data, record.version as number);
  return record as unknown as SaveRecord;
}
export function restoreSave(record: SaveRecord): Scene {
  // 所有调用路径都经过校验，即使来自调试接口也不能绕过。
  const data = parseSave(JSON.stringify(record)).data;
  const world = new World();
  const s = createStores(world);
  world.restore(data.world);
  const scene = {
    world,
    s,
    level: Level.restore(data.level),
    player: data.player,
    progress:
      record.version === 1
        ? {
            ...createProgress(
              data.progress.seed,
              'adventure',
              data.progress.name,
            ),
            ...structuredClone(data.progress),
            worldVersion: 0,
          }
        : structuredClone(data.progress),
  };
  initializeExploration(scene);
  // v1–v3 没有生存组件：在新世界上补满值，避免玩家一读档就挨饿。
  if (!s.survival.has(data.player))
    s.survival.set(data.player, {
      hunger: SURVIVAL.max,
      thirst: SURVIVAL.max,
      warmth: SURVIVAL.max,
      heat: 0,
      fatigue: SURVIVAL.max,
      bleed: 0,
      infection: 0,
      dot: 0,
      warned: 0,
    });
  // v4 没有暑热字段：补 0，避免老存档一读档就中暑。
  const sv = s.survival.get(data.player)!;
  if (typeof sv.heat !== 'number') sv.heat = 0;
  return scene;
}

/** 一个槽位一次原子写入，内含当前版和上次有效版；存储失败不破坏旧记录。 */
export class SaveRepository {
  private readonly cache = new Map<
    number,
    { raw: string; record: string; recovered?: boolean }
  >();
  constructor(private readonly storage: SaveStorage) {}
  read(slot: number): SlotResult {
    try {
      const raw = this.storage.getItem(this.key(slot));
      if (!raw) return {};
      const cached = this.cache.get(slot);
      if (cached?.raw === raw)
        return {
          record: JSON.parse(cached.record) as SaveRecord,
          recovered: cached.recovered,
        };
      const remember = (
        record: SaveRecord,
        recovered?: boolean,
      ): SlotResult => {
        this.cache.set(slot, {
          raw,
          record: JSON.stringify(record),
          recovered,
        });
        return { record, recovered };
      };
      const value: unknown = JSON.parse(raw);
      if (!object(value)) fail('存档槽损坏');
      try {
        return remember(parseSave(String(value.current)));
      } catch (error) {
        if (typeof value.backup === 'string') {
          try {
            return remember(parseSave(value.backup), true);
          } catch {
            /* 显示主档错误 */
          }
        }
        throw error;
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : '无法读取存档' };
    }
  }
  write(slot: number, record: SaveRecord): void {
    const checked = parseSave(JSON.stringify(record));
    this.commit(slot, checked);
  }
  /** 自有快照已由 captureSave 校验，避免同一固定步连续重建三次世界。 */
  writeScene(slot: number, scene: Scene): SaveRecord {
    const record = captureSave(scene);
    this.commit(slot, record);
    return record;
  }
  private commit(slot: number, record: SaveRecord): void {
    const current = JSON.stringify(record);
    const previous = this.read(slot).record;
    if (previous?.checksum === record.checksum) return;
    const raw = JSON.stringify({
      current,
      backup: previous ? JSON.stringify(previous) : null,
    });
    this.storage.setItem(this.key(slot), raw);
    this.cache.set(slot, { raw, record: current });
  }

  private key(slot: number): string {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) fail('只有三个存档位');
    return SAVE_PREFIX + slot;
  }
}
