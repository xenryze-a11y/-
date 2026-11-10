/**
 * 自定义 ECS。对应 goengine 的 engine/core/store.go（决策 D9：密集数组 + index 反查）。
 *
 * 三条不变量（改之前先读）：
 *  1. 每个 Store 的 data 永远密集，删除用「最后一个补位」；
 *  2. 遍历 Store 时不能删除（补位会改别人的下标）→ 用 world.destroy() 延迟销毁；
 *  3. 位置只能经 world.setPos() 改，它同步维护空间哈希。
 *
 * 与 Go 版的一点取舍：Go 用 []int32 且必须初始化为 -1（0 是合法下标），
 * 这里用 Map<Entity, number> 从根上消掉那个坑，代价是每次查组件一次哈希。
 * demo 规模下完全够用；真要上千实体再换回稀疏数组。
 */
import { makeRng, type Vec2 } from './math';

export type Entity = number;
export const NONE: Entity = 0;

export class Store<T> {
  readonly data: T[] = [];
  readonly owners: Entity[] = [];
  private readonly index = new Map<Entity, number>();

  set(e: Entity, value: T): void {
    const i = this.index.get(e);
    if (i === undefined) {
      this.index.set(e, this.data.length);
      this.data.push(value);
      this.owners.push(e);
    } else {
      this.data[i] = value;
    }
  }

  get(e: Entity): T | undefined {
    const i = this.index.get(e);
    return i === undefined ? undefined : this.data[i];
  }

  has(e: Entity): boolean {
    return this.index.has(e);
  }

  del(e: Entity): void {
    const i = this.index.get(e);
    if (i === undefined) return;
    const last = this.data.length - 1;
    if (i !== last) {
      this.data[i] = this.data[last];
      this.owners[i] = this.owners[last];
      this.index.set(this.owners[i], i);
    }
    this.data.pop();
    this.owners.pop();
    this.index.delete(e);
  }

  get length(): number {
    return this.data.length;
  }

  /** 原地遍历，零分配。⚠️ 回调里不许 del / destroy。 */
  forEach(fn: (e: Entity, value: T) => void): void {
    for (let i = 0; i < this.data.length; i++) fn(this.owners[i], this.data[i]);
  }
}

/** 事件：模拟层只产事件，表现层（特效/飘字/震屏）只消费。对应 core.Event。 */
export interface GameEvent {
  kind:
    | 'swing'
    | 'cast'
    | 'spell'
    | 'basketball'
    | 'mage'
    | 'impact'
    | 'hurt'
    | 'playerHurt'
    | 'kill'
    | 'dodge'
    | 'noMana'
    | 'spawn'
    | 'pickup'
    | 'notice'
    | 'ring'
    | 'bolt';
  element?: string;
  ability?: string;
  stage?: 'cast' | 'impact';
  special?: boolean;
  entity?: Entity;
  x: number;
  y: number;
  angle?: number;
  amount?: number;
  text?: string;
  color?: string;
  life?: number;
  x2?: number;
  y2?: number;
}

/**
 * 空间哈希。每个实体只插一个格子，所以查询不需要去重
 *（Go 版踩过：加 seen map 去重比线性扫描还慢，见 pitfalls #5）。
 */
class Spatial {
  private readonly cell = 256;
  private readonly buckets = new Map<string, Set<Entity>>();

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }

  private bucket(k: string): Set<Entity> {
    let b = this.buckets.get(k);
    if (!b) {
      b = new Set<Entity>();
      this.buckets.set(k, b);
    }
    return b;
  }

  move(e: Entity, from: Vec2, to: Vec2): void {
    const a = this.key(from.x, from.y);
    const b = this.key(to.x, to.y);
    if (a === b) return;
    this.buckets.get(a)?.delete(e);
    this.bucket(b).add(e);
  }

  add(e: Entity, p: Vec2): void {
    this.bucket(this.key(p.x, p.y)).add(e);
  }

  remove(e: Entity, p: Vec2): void {
    this.buckets.get(this.key(p.x, p.y))?.delete(e);
  }

  /** 圆形范围查询。返回的是候选集，精确判定交给调用方。 */
  query(center: Vec2, radius: number, tag: string, w: World): Entity[] {
    const out: Entity[] = [];
    const minX = Math.floor((center.x - radius) / this.cell);
    const maxX = Math.floor((center.x + radius) / this.cell);
    const minY = Math.floor((center.y - radius) / this.cell);
    const maxY = Math.floor((center.y + radius) / this.cell);
    const r2 = radius * radius;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const b = this.buckets.get(`${cx},${cy}`);
        if (!b) continue;
        for (const e of b) {
          if (!w.hasTag(e, tag)) continue;
          const p = w.positions.get(e);
          if (!p) continue;
          const dx = p.x - center.x;
          const dy = p.y - center.y;
          if (dx * dx + dy * dy <= r2) out.push(e);
        }
      }
    }
    return out;
  }
}

export class World {
  private nextId: Entity = 1;
  readonly alive = new Set<Entity>();
  readonly tags = new Map<Entity, Set<string>>();
  readonly positions = new Store<Vec2>();
  private readonly spatial = new Spatial();
  private readonly stores = new Map<string, Store<unknown>>();
  private readonly pending: Entity[] = [];
  private events: GameEvent[] = [];

  /** 模拟累计时间（秒）。表现层不要用它驱动动画，动画有自己的时钟。 */
  time = 0;
  /** 种子随机：同种子 + 同输入 = 同结果。表现层的抖动别用 Math.random。 */
  readonly rng: () => number;

  constructor(seed = 1) {
    this.rng = makeRng(seed >>> 0);
  }

  /** 注册/取一个组件表。key 与 components.ts 里的常量一致。 */
  register<T>(key: string): Store<T> {
    let s = this.stores.get(key) as Store<T> | undefined;
    if (!s) {
      s = new Store<T>();
      this.stores.set(key, s as Store<unknown>);
    }
    return s;
  }

  store<T>(key: string): Store<T> {
    return this.register<T>(key);
  }

  create(tags: string[] = []): Entity {
    const e = this.nextId++;
    this.alive.add(e);
    this.tags.set(e, new Set(tags));
    return e;
  }

  createAt(tags: string[], x: number, y: number): Entity {
    const e = this.create(tags);
    this.setPos(e, { x, y });
    return e;
  }

  hasTag(e: Entity, tag: string): boolean {
    return this.tags.get(e)?.has(tag) ?? false;
  }

  addTag(e: Entity, tag: string): void {
    this.tags.get(e)?.add(tag);
  }

  removeTag(e: Entity, tag: string): void {
    this.tags.get(e)?.delete(tag);
  }

  /** 位置唯一入口：同步空间哈希。直接改 positions.get(e).x 会让查询结果时多时少。 */
  setPos(e: Entity, p: Vec2): void {
    const old = this.positions.get(e);
    if (old) {
      this.spatial.move(e, old, p);
      old.x = p.x;
      old.y = p.y;
    } else {
      this.positions.set(e, { x: p.x, y: p.y });
      this.spatial.add(e, p);
    }
  }

  pos(e: Entity): Vec2 {
    const p = this.positions.get(e);
    if (!p) throw new Error(`entity ${e} has no Position`);
    return p;
  }

  /** 删除要延迟到遍历结束，否则补位会打乱其它实体下标。 */
  destroy(e: Entity): void {
    if (!this.alive.has(e)) return;
    this.pending.push(e);
  }

  isPendingDeath(e: Entity): boolean {
    return this.pending.includes(e);
  }

  flush(): void {
    if (this.pending.length === 0) return;
    for (const e of this.pending) {
      const p = this.positions.get(e);
      if (p) this.spatial.remove(e, p);
      this.positions.del(e);
      for (const s of this.stores.values()) s.del(e);
      this.tags.delete(e);
      this.alive.delete(e);
    }
    this.pending.length = 0;
  }

  withTag(tag: string): Entity[] {
    const out: Entity[] = [];
    for (const e of this.alive) if (this.hasTag(e, tag)) out.push(e);
    return out.sort((a, b) => a - b);
  }

  /** 空间查询：命中判定统一走这里，别自己全表扫。 */
  query(center: Vec2, radius: number, tag: string): Entity[] {
    return this.spatial.query(center, radius, tag, this);
  }

  emit(ev: GameEvent): void {
    this.events.push(ev);
  }

  /** 只有一处 Drain（表现层），对应 Go 的 Scene.consumeEvents。 */
  drain(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
