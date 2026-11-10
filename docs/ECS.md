# 自定义 ECS 使用手册

对应 Go 引擎 `engine/core/store.go`（决策 D9）。没有用任何 ECS 库，全部代码在 `src/engine/ecs.ts`，约 250 行，读完就能改。

## 最小心智模型

```ts
Entity = number          // 0 保留为 NONE，实体只是一个 ID，没有 Entity 类
Store<T>                 // 一种组件一张密集数组
World                    // 持有所有 Store + 标签 + 空间哈希 + 事件队列
System = (ctx, dt) => void  // 就是普通函数，遍历 Store 原地改
```

组件在 `src/game/components.ts` 统一声明，`createStores(world)` 一次注册，之后所有系统通过 `ctx.s.xxx` 拿带类型的 Store。

```ts
import { World } from '../engine/ecs';
import { createStores, TAG } from '../game/components';

const world = new World(12345);           // 种子决定 RNG，同种子同输入 = 同结果
const s = createStores(world);
const e = world.createAt([TAG.MOB, TAG.DAMAGEABLE], 100, 200);
s.health.set(e, { hp: 50, max: 50, armor: 0 });
s.facing.set(e, { angle: 0 });
```

## API 速查

| 方法 | 说明 |
|---|---|
| `world.create(tags?)` / `createAt(tags, x, y)` | 建实体；后者同时写位置 |
| `world.register<T>(key)` / `store<T>(key)` | 注册或取一张组件表 |
| `store.set / get / has / del / forEach / length` | 组件读写与零分配遍历 |
| `world.setPos(e, {x,y})` / `pos(e)` | **位置唯一入口**，同步空间哈希 |
| `world.hasTag / addTag / removeTag / withTag` | 标签；命中判定查 `damageable` 而不是 `mob` |
| `world.query(center, radius, tag)` | 空间哈希圆查询，返回候选集，精确判定交给调用方 |
| `world.destroy(e)` / `flush()` | 延迟销毁；每模拟步末调用一次 `flush()` |
| `world.emit(ev)` / `drain()` | 事件；**只有表现层调一次 `drain()`** |
| `world.rng()` | 种子随机，别用 `Math.random()` |

## 三条不能破的不变量

1. **Store.data 永远密集**。删除是「最后一个元素补位」，所以遍历顺序会变；需要稳定顺序时用 `world.withTag()`（它排序）。
2. **遍历 Store 时不能删**。补位会改别的实体下标。要删就 `world.destroy(e)` 排队，`flush()` 统一处理；新生成的实体当场可用。
3. **位置只经 `setPos` 改**。直接写 `world.pos(e).x = ...` 会让空间查询「时多时少」，而且很难查。

另外两条语义约束：
- **所有伤害走 `applyDamage()`**（`systems/combat.ts`），无敌帧检查在函数最前面。绕过它 = 翻滚被任意伤害穿透。
- **冷却必须在攻击判定之后推进**，见 `main.ts` 的系统链注释。

> 与 Go 版的一处有意取舍：Go 用 `[]int32` 做反查且**必须初始化为 -1**（0 是合法下标，忘了就全乱）；这里用 `Map<Entity, number>`，从根上消掉那个坑。demo 规模够用，实体上千再换稀疏数组。
>
> 另一处：Go 的组件是值副本，读出来改完必须 `SetPlayer(id, p)` 写回（它最常见的 bug）。TS 里组件是对象引用，天然没这个坑——但也意味着别把组件对象缓存到别处再整体替换。

## 一帧里发生什么

```
app.ticker (真实 dt)
  └─ input.snapshot()                    // 一帧一份可序列化快照，清边沿
     └─ FixedLoop.advance(realDT)       // 1/60 固定步长，最多补 5 步
        └─ 每个 step：
           applyInput      输入 → 朝向 / 移动 / 攻击 / 施法 / 翻滚
           tickTimers      冷却、动画计时、无敌帧、回蓝
           updateAI        索敌 / 追击 / 分离 / 近战
           updateProjectiles  移动 / 撞墙 / 命中 / 爆炸
           updateFields    雷暴生命周期 / 周期伤害
           updateMage      雷电法师电场 / 五段震荡 / 连射与环绕伤害
           updateSummons   篮球召唤追击 / 扫掠 / 引爆
           updateRules     拾取 / 补怪
           world.flush()   统一删除
     └─ present.consume(world.drain())  // 事件每帧只 Drain 一次
  └─ camera.follow / present.update / view.sync / hud.update   // 表现，只读 World
```

**注意 `applyInput` 与 `sync` 用的是两个 dt**：模拟用固定 `1/60`，表现用真实帧时间。走路相位按真实位移算，跨帧率结果一致。

## 加一个组件 + 一个系统（完整示例）

例：给亡者加「中毒」持续伤害。

**1. 组件**：`src/game/components.ts`

```ts
export interface Poison { left: number; dps: number; }
// C 里加 POISON: 'poison'，Stores 里加 poison: Store<Poison>
// createStores 里加 poison: w.register<Poison>(C.POISON)
```

**2. 系统**：新建 `src/game/systems/poison.ts`

```ts
import { applyDamage } from './combat';
import type { Ctx } from './context';

export function updatePoison(ctx: Ctx, dt: number): void {
  ctx.s.poison.forEach((e, ps) => {
    if (ctx.world.isPendingDeath(e)) return;
    ps.left -= dt;
    applyDamage(ctx, e, ps.dps * dt, ctx.player);
    if (ps.left <= 0) ctx.s.poison.del(e);   // ✅ 组件删除可以直接 del，不是销毁实体
  });
}
```

**3. 接线**：`src/main.ts` 的系统链里，放在 `updateProjectiles` 之后、`flush()` 之前：

```ts
updatePoison(ctx, fixed);
```

**4. 表现（可选）**：`src/game/present.ts` 的 `consume()` 里加一个事件分支，飘个绿字。**模拟层不用改**。

## 常见坑

- `store.forEach((e, v) => ...)` 里调 `world.destroy(e)` 是安全的（延迟），调 `store.del(e)` **不安全**（补位）。
- `world.query` 返回的是「圆内候选」，仍要自己判半径 + 半径、角度、阵营。
- 新建投射物要把 `owner` 排除出命中列表，否则出膛就打自己。
- 事件里别放对象引用，只放标量与坐标：以后要跨网络/存档序列化。
- 表现状态（相位、上一帧位置、特效计时、渲染时钟）放渲染层的 `Map<Entity, View>`，**不要塞进组件**。


## 增强版：背包、技能场与暂停

- `Stores.inventory` 保存玩家 36 格、2×2 合成格、手持堆栈、靴子位和当前快捷栏；`game/items.ts` 是物品与技能内容表。
- DOM 仅发 `InventoryCommand`。main 在模拟前分发，暂停时仍允许背包命令；关包先调用 `returnCursor`，剩余物品放不下则不关闭。
- `Stores.field` 保存雷暴的半径、剩余生命和 tick；`updateFields` 在 `updateProjectiles` 后、`flush` 前运行。`slow/frozen/windup` 是 Mob 模拟状态。
- 新事件 `ring/bolt/notice` 只含标量与坐标，主循环仍只有一次 `world.drain()`，Presentation 与 UI 只读消费同一数组。
- 表现层不能临时改 Facing.angle 来挑贴图。可视四方向、局部墙体淡出和粒子时间都留在视图 / Presentation。
- 菜单、背包、手册暂停整个固定步长链，并清空输入边沿及触控轴，避免恢复时补打或继续冲刺。

`npm test` 覆盖堆栈守恒、满包不吞物、合成扣料、装备减伤、墙体视线、投射物扫掠、技能冷却 / 护盾 / 冰冻 / 闪烁、场生命周期与 AI 绕墙。


## 篮球召唤组件

`Summon = {owner,target,life,age,angle}` 注册在 `s.summon`，新实体带 `TAG.SUMMON`，显示信息仍在 Look。`systems/basketball.ts` 在 fields 之后、rules / flush 之前推进：索敌与转向 → 4 像素分段移动 → 撞墙 / 命中 / 到期范围伤害 → 标量 basketball 事件 → destroy 排队。没有 DOM、Pixi、视频对象或定时回调。角色视频帧与生成字粒子的时钟只在表现层；左右键共享 `player.cooldowns.basketball`。


## 雷电职业组件

`MageState` 保存本局解锁、三技能独立 cooldown、随身电场剩余 / tick、大招剩余 / 连射 tick / 已发射数、环绕相位 / 命中 tick。环绕相位参与碰撞，所以属于模拟；渲染只读取。`ThunderWave` 保存起点、方向、下一段索引、tick 与已命中的 ID 数组，伤害不依赖动画播放。

`syncMageUnlock` 只在真实获得 storm 物品后解锁。快捷栏内可直接选中法杖；在背包里时不能用选中下标取模误选其他物品。释放时再次检查选中的物品必须为 storm。换武器、丢下法杖不重置本局解锁或冷却；已释放法术继续完成，新一局全部重置。

`mage` 标量事件只携带 ability / stage / 坐标 / 朝向。电球复用投射物扫掠，barrage 标记决定范围爆炸；后方出生点不可越墙。`s.wave` 删除仍须 destroy → flush。
