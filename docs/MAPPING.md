# 与 Go 引擎（goengine）的对照

> **关系说明**：本 demo 是 2026-11-09 对 `D:/go/goengine` 架构的一次**静态快照式移植**，不是 fork，也不是同步副本。Go 引擎后续更新（看板 S04 起还有很长的关键路径）不会自动同步到这里，也不需要同步——两条线各自演进。需要跟进某个新决策时，按本表找到对应 TS 文件，把「机制」搬过来，别整包复制代码。

调研基线：`goengine` 的 `master @ a2edd48`（S03 / D59）。

## 逐项对照

| Go 引擎 | TS demo | 搬了什么 / 没搬什么 |
|---|---|---|
| `engine/core/vec.go` | `engine/math.ts` | Vec2、角度、clamp、指数平滑、确定性 RNG。Go 全链路 float32，TS 用 number |
| `engine/core/store.go`（D9） | `engine/ecs.ts` | 密集数组 + 反查 + 零分配 forEach + 延迟销毁。反查改用 Map 消掉「index 必须初始化 -1」的坑 |
| `engine/sim/world.go` | `ecs.ts` + `game/components.ts` | 组件表按需注册（`createStores`），位置表单独持有；标签、空间哈希、`query`、事件队列、`setPos` 唯一入口都保留 |
| `engine/core/events.go` | `ecs.ts` `GameEvent` | 单向事件；只有 `present.ts` 一处 `drain()` |
| `engine/core/facing.go`（D52） | `engine/facing.ts` | **完全一致**：对角线分界、3 视角、朝左只镜像 |
| `engine/input/input.go` | `engine/input.ts` | 一帧可序列化快照、位掩码按钮、边沿/按住分离、连续 move 向量。摇杆没做（浏览器键鼠够用） |
| `engine/sim/control.go` | `game/systems/control.ts` | 优先级：翻滚 → 切武器 → 朝向 → 移动 → 攻击；半推慢走；Aim 优先；实际位移驱动动画 |
| `engine/sim/world.go` `Tick` | `systems/timers.ts` | 冷却/动画计时统一收在一处，且在攻击判定之后 |
| `engine/sim/ai.go` | `systems/ai.ts` | 索敌、脱战、三段行为（chase/dart/ranged → shamble/lunge/caster）、**两段式分离** |
| `engine/sim/combat.go` | `systems/combat.ts` + `projectile.ts` | 统一 `applyDamage`（无敌帧最前）、扇形角度判定、投射物撞墙/命中、火球范围爆炸 |
| `engine/level/level.go` | `engine/level.ts` | uint8 瓦片编码材质+通行、圆-AABB 最近点、分轴移动贴墙滑动、半格步进视线、地图边界当墙 |
| `engine/render/camera.go` | `engine/camera.ts` | `1-e^(-9dt)` 跟随、边界夹取、地图小于屏幕则居中、确定性抖动不写进 pos |
| `engine/render/draw.go` + `frame.go` | `engine/renderer.ts` + `layers.ts` | 图层号常量化、稳定排序。**偏离**：Go 每帧重建绘制指令，Pixi 用视图池复用显示对象 |
| `engine/render/backend/atlas.go`（D40） | `engine/atlas.ts` + `art.ts` | 一张图集、按名字查、行式装箱按高度降序、gutter 防串色、缺图降级白点 |
| `game/art/*` 命名协议（D27） | `docs/ART.md` | `<family><View><Part>`、文件名即贴图名、序列帧 `名字_NNN + JSON` |\n| `game/art/tables.go` `ShoeSprite` / `sprShoe<Mat>[Side]` | `art.ts` `shoeSpriteName` + `Equip.shoes` | 5 材质 × 2 视角独立出图，换装只改数据；`zombieBare` 对应 Go 的 `<Rig>ShoeBare` 按肤色出赤脚。侧视鞋单独一张带鞋头 |
| `game/scene/humanoid.go` + `scene.go`（D51/D52） | `engine/animation.ts` | **走路相位跟位移**、`blend` 平滑、骨架参数数据化、玩家/行尸两套参数 |
| `game/art/fxanim.go` | `animation.ts` `FxAnim` | 显式帧序、缺帧报错、只用于特效 |
| `game/scene/avatar.go` | `renderer.ts` `updateAvatar` | 部件合成顺序、锚点在腰带、脚/手按相位摆、出手 ease-out、受伤闪白、装填→改成血条 |
| `game/scene/layers.go` | `engine/layers.ts` | 世界层 0~29、伪 3D 靠背墙/前墙夹实体 |
| `game/game.go` 固定步长 | `engine/loop.ts` + `main.ts` | `1/60`、累加器、`MaxSteps=5`、系统顺序由引擎定 |
| `game/scene/consumeEvents` | `game/present.ts` | 事件扇出到特效/飘字/震屏，模拟层零改动 |
| `game/data/*.json` | `game/data.ts` | 「内容改数据、规则改代码」的原则保留；demo 阶段收成 TS 常量，可直接外置成 JSON |
| `game/touch.go` / `net` / `oto` / 存档 | — | **没搬**：单机浏览器 demo 不需要触摸摇杆、联机、音频、存档、无头 PNG 出图 |

## 有意偏离的地方

1. **渲染对象复用**：Go 的 `Scene.Build` 每帧产纯绘制指令，是因为后端是自己的软件光栅化 / GLES2；PixiJS 靠批处理，必须复用 Sprite。
2. **Zoom 可自由调**：Go 把 `Camera.Zoom` 钉死为 1 是跨架构确定性约束；这里 `CFG.camera.zoom = 2`，随便改。
3. **ECS 反查用 Map**、组件用引用语义：换掉了 Go 版两个高频 bug 来源（index -1、读副本忘写回）。
4. **程序化美术**：Go 的真源是 `game/assets/sprites/*.png`；这里为了「clone 下来就能跑」内置生成，但保留了完全一样的命名协议和替换接缝（放 `public/assets/` 即生效）。
5. **没有 8 方向/等距**：Go 的 T11（Z 轴 / 2.5D）本来就没实现，两边都还是俯视 2D + 图层伪 3D。要真等距，得同时改「方向输入 / 朝向归并 / 点击反变换 / 遮挡」四件事，别只改渲染。

## Go 引擎继续更新时怎么跟进

1. 看 `goengine/CHANGELOG.md` 和 `docs/decisions.md` 新增的 D 编号，判断改的是**机制**（`engine/*`）还是**这款游戏的内容**（`game/*`）。后者不用跟。
2. 按上表找到 TS 侧对应文件；机制类改动优先读 Go 的注释与 `docs/pitfalls.md`，那里写的是「为什么」，比代码更好搬。
3. 保持三条边界不变：模拟不认识 Pixi、表现层不写回 ECS、事件单向。搬新功能时如果这三条被破，多半是分层放错了。
4. demo 侧新增的东西如果「换题材也用得上」，放 `src/engine/`；否则放 `src/game/`——和 Go 的 `engine/` vs `game/` 判据一致。
