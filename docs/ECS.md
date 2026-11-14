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
           updateStaffArts 其余四系的区域 / 弹道 / 陨石 / 灼烧
           updateBlades 魔镰风暴 / 邪阵破土 / 流焰弹道 / 连斩 / 炎躯
           updateSummons   篮球召唤追击 / 扫掠 / 引爆
           updateRules     拾取 / 补怪
           updateSurvival  饱食 / 水分 / 体温 / 疲劳 / 创伤 / 负重
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


## 其余四系职业

MageState.schools 分别保存 ember / frost / ward / blink 的 unlocked 和三项 cooldown，雷电原字段保留。profession.ts 提供统一释放入口与只读查询。StaffZone 保存 owner / school / kind / life / tick / phase / radius；StaffShot 保存速度、生命周期、伤害、穿透次数、已命中列表与回旋状态；FallingMeteor 保存延迟和爆炸参数，均为纯数据。灼烧计时存在 Mob.burn / burnTick。

updateStaffArts 顺序为解锁扫描 → 扫掠弹道 → 陨石落地 → 区域 / 牵引 / 坍缩 → 灼烧。独立 Store 不在遍历中删除。不同法杖可同时留下效果；区域≤28、弹道≤48、陨石≤18，超额施法不消耗法力、不启动冷却。表现只读这些状态和 staffArt 标量事件。详见 STAFF_PROFESSIONS.md。


## NPC、任务、升级和四部位装备

Npc 只含 kind，无 damageable 标签；Journal 保存 stage / killsAtStart / talking / level / xp。QuestCommand 由组装层调用 quests.ts，先验证距离、视线和建筑内外一致；UI 不直接设置阶段或奖励。击杀出口给经验，任务给经验 / 四件套；领取时在副本上按存储格优先试放四件，全部成功才提交，重复领取无效。等级阈值和属性成长集中于 sanctuary-data.ts。

InventoryState 新增 armor.head / chest / legs，保留 boots、合成与36格；装备格索引 42 / 43 / 44，40仍为鞋，41仅用于合成产出。Equip 新增材质字段，护甲减伤统一进入 applyDamage；晨曦完整套装回蓝只在 tickTimers 推进。

建筑的墙 / 门是 Level 瓦片，家具和 NPC 注册阻挡，屋面透明不改变碰撞。inCathedral 统一决定内外状态，SanctuaryView / renderer 只读此函数来隐藏屋顶和内部实体；对话规则也使用同一界限，不能从墙外透视神父后直接领取奖励。


## 新兵器组件

`BladeState` 保存魔镰 / 炎剑各自三项冷却、风暴和炎躯计时，以及锁定方向的三斩进度；`RiftStrike` 保存预兆 / 破土 / 命中 / 消退时间；`RiftGroup.hit` 使同次十字地刺对每敌只命中一次；`FlameWave` 保存扫掠速度和穿透去重。`updateBlades` 位于 staffArts 之后、summons 之前，不依赖 Pixi 或动画回调。换武器不取消已释放效果，暂停冻结整条模拟链。上限 rift40 / group4 / wave8，超额不扣蓝。

InventoryCommand 的 `equip` 是守恒交换：只选择已持有武器，若在存储区则与当前快捷格交换；手持光标有物品时拒绝。UI 的三个试玩换装按钮不创造物品。弯刃没有职业或主动技能。


炎剑焰潮现在是5波连发：BladeState.waveLeft / waveTick / waveAngle / waveMultiplier记录尚未发射的波数、间隔、锁定方向和施法倍率。施法时预留完整5波容量（maxWaves8），有未完成连发或容量不足则原子拒绝，不扣法力、不启动冷却；首波立即，随后4波由updateBlades每0.18秒推进。各波独立穿透去重、墙体扫掠、到期删除；换武器后继续，暂停冻结，不使用浏览器定时器。


炎剑新增waveSwingLeft / waveSwingIndex，使每波都配一次0.16秒自动挥击，共5次 / 每0.18秒交替；普通攻击 / F不能中断未完成的同武器挥击，换武器已释放波仍完成。infernoVitality标记当前生命 / 上限是否已翻倍，7秒到期以当前比例缩回，不叠乘、不恢复旧血量、不复活；升级时生命成长按同一倍率计入，结束后保留完整基础升级。伤害与灼烧规则不交给视觉帧。


## 持久化边界

World.snapshot/restore 保存纯组件、实体分配器和 RNG 状态，快照前必须 flush；restore 只面向空世界，经 setPos 重建空间索引。Level 同步保存真实阻挡；刷怪计时属于 Scene.progress，不再使用跨局模块变量。新增组件须同步存档白名单与版本，见 [SAVES.md](SAVES.md)。不能把 Pixi 显示对象或输入状态放进快照。


探索仍在 updateRules 阶段推进，不改固定系统顺序。Prop.landmark / Mob.site 绑定稳定内容 ID；发现、迷雾、休息与传送计时属于 Scene.progress。互动由 UI 发 ExplorationCommand，组装层调用 applyExplorationCommand；地图/地标视图只读，不得直接授予奖励、移动角色或清除迷雾。v2 加字段时同步存档白名单与 v1 迁移。


大地图新增 CLIFF=7（阻挡及视线遮挡）、STAIRS=8（可通行），保存v3，Level恢复要重建阻挡体空间桶。渲染分块/裁剪/画质不写模拟；远处AI休眠以世界距离判断，不读渲染可见性。保存自有Scene可以走writeScene减少重复检查；write和导入仍按完整格式验证，缓存不能向外暴露可变的内部记录。
