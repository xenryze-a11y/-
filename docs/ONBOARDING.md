# 5 分钟上手

> 目标：跑起来 → 做出 4 个能立刻看到结果的改动 → 知道遇到问题去哪查。
> 不要求先读完架构，边做边查。做完再看 [DECISIONS.md](DECISIONS.md) 理解「为什么」。

## 0. 跑起来（1 分钟）

```bash
cd D:/go/ashen-vale
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。看到一片中世纪地图、蓝色法袍的法师、几只亡者 = 成功。

零美术依赖，不用下载素材。**按键表在 [README.md](../README.md)「操作」**：WASD 移动、鼠标瞄准、左键攻击、右键特殊技、空格翻滚、`1`/`2` 换武器、`B` 换鞋、`R` 重开、`F3` 调试。

## 1. 改一个数值（30 秒）

打开 [`src/game/data.ts`](../src/game/data.ts)，把 `CFG.player.speed` 从 `120` 改成 `240`，保存。Vite 热更新，按 WASD 会明显变快。

**这说明**：内容（数值）和规则（代码）是分开的，调手感不用碰系统逻辑。改回去。

同一文件里还集中了血量、冷却、火球伤害/爆炸半径、三种亡者的数值、刷怪数、地图尺寸——先在这里找，别急着改代码。

## 2. 改一个系统行为（1 分钟）

打开 [`src/game/systems/ai.ts`](../src/game/systems/ai.ts)，找到 `lunge` 那段：

```ts
if (m.think > 0 && m.think < 0.28 && d < m.aggro) speed *= 2.3;
```

把 `2.3` 改成 `4`，保存。疾行者冲刺会明显更凶。

**这说明**：AI 是普通函数 `(ctx, dt) => void`，遍历 `Store` 原地改，没有框架魔法。系统链在 [`src/main.ts`](../src/main.ts) 里，一眼能看全。

## 3. 摸一下换装接缝（30 秒）

游戏里按 **`B`**：脚上的鞋在 赤脚 / 布鞋 / 皮靴 / 铁靴 之间循环，HUD 会显示当前鞋。

然后打开 [`src/engine/art.ts`](../src/engine/art.ts) 的 `SHOE_COLORS`，把 `iron` 的 `mid` 从 `P.iron` 改成 `'#ff00ff'`，保存 → 铁靴变成品红色。

**这说明**：鞋是独立贴图 `shoe<Mat>[Side]`，渲染层按 `Equip.shoes` 拼名字换 texture，**换装只改数据，不改绘制代码**。加一种材质要动哪几处，见 [ART.md](ART.md)「鞋可以换装」。

## 4. 加一个组件 + 一个系统（2 分钟）

照抄 [ECS.md](ECS.md)「加一个组件 + 一个系统」那节的中毒示例，三步：

1. `game/components.ts`：声明 `Poison`，加进 `C` / `Stores` / `createStores`。
2. 新建 `game/systems/poison.ts`，写一个 `updatePoison(ctx, dt)`。
3. `main.ts` 系统链里插一行 `updatePoison(ctx, fixed);`。

`npm run typecheck` 过了就成。**顺序很重要**：新系统放在 `updateProjectiles` 之后、`flush()` 之前；别放到 `tickTimers` 前面去。

## 改完自检

```bash
npm run typecheck && npm run build
```

- 改了渲染 / 动画 / 贴图 → **必须打开画面看**，编译通过不代表画对了。
- 控制台不该有 `[atlas] 缺贴图 xxx` 或红色异常。
- 手感类改动按 `R` 重开一局再看（地图种子会换，但数值立刻生效）。

## 常见任务速查

| 想做的事 | 第一站 | 细节文档 |
|---|---|---|
| 调手感 / 数值 / 刷怪量 | `game/data.ts` | README「想改点什么？」 |
| 加一种敌人行为 | `data.ts` → `spawn.ts` 的 `addMob` → `systems/ai.ts` | [ECS.md](ECS.md) |
| 加组件 / 系统 | `game/components.ts` + `game/systems/` + `main.ts` | [ECS.md](ECS.md) |
| 换武器 / 加技能 | `systems/control.ts` + `combat.ts` + `data.ts` | README |
| 换鞋 / 加装备材质 | `data.ts` 的 `SHOE_MATERIALS` + `art.ts` 的 `SHOE_COLORS` | [ART.md](ART.md) |
| 调走路姿态 / 脚大小 | `engine/animation.ts` 的 `RIG` | [ART.md](ART.md) |
| 换整套美术 | 控制台 `__ASHEN__.dumpAtlas()` → 改 PNG → 放 `public/assets/` | [ART.md](ART.md) |
| 加特效 / 飘字 / 音效 | 只改 `game/present.ts` | [ECS.md](ECS.md)「事件」 |
| 改地图生成 | `engine/level.ts` 的 `generate()` | README |
| 跟着 Go 引擎更新 | — | [MAPPING.md](MAPPING.md) |

## 卡住了？

| 症状 | 先查 |
|---|---|
| 画面出现白块 / 黑块 | 控制台 `[atlas] 缺贴图 xxx`；贴图名拼错，命名协议见 [ART.md](ART.md) |
| 按键偶尔没反应 | 边沿 `pressed` 一帧只在第一个模拟步消费；检查 `input.ts` 的 `press/release` 是否成对 |
| 角色贴墙还在原地踏步 | 走路相位读成输入向量了；必须比较前后两帧**实际位置** |
| 同一帧打出两次攻击 | 冷却推进被放到了攻击判定之前，看 `main.ts` 系统链 |
| 侧面又出现两条正面并排的腿 | 有人把 front 的绘制复用到 Side；见 [DECISIONS.md](DECISIONS.md) D7 |
| 换装没生效 | `Equip.shoes` 没设（新建实体时容易漏），渲染层会兜底成 `cloth` |
| 查询命中时多时少 | 直接改了 `world.pos(e).x`；位置只能经 `world.setPos()` |

调试接口：控制台 `__ASHEN__.world`（所有实体）、`.ctx`（当前系统上下文）、`.scene`（地图与 stores）、`.restart()`。

## 文档地图

| 文档 | 什么时候读 |
|---|---|
| [ONBOARDING.md](ONBOARDING.md) | 第一次拿到项目，就是现在 |
| [DECISIONS.md](DECISIONS.md) | 想改某个「看起来很怪」的写法之前——先确认它不是踩过坑才这么写的 |
| [README.md](../README.md) | 操作、目录、7 条核心设计、改动速查 |
| [ECS.md](ECS.md) | 加组件 / 系统、理解不变量与一帧顺序 |
| [ART.md](ART.md) | 贴图、图集、动画、换装 |
| [MAPPING.md](MAPPING.md) | 和 Go 引擎对照、Go 后续更新怎么跟进 |
| [../AGENTS.md](../AGENTS.md) | 用 AI 辅助开发时的第一入口（五条不能破） |
