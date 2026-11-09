# 灰烬谷 · Ashen Vale

一个能直接跑、能直接改的中世纪生存 demo：**TypeScript + PixiJS 8 + 自定义 ECS**，俯视 2D，移动/朝向/贴图/动画/战斗/AI 都是完整逻辑，不是静态展示。

题材是《僵尸毁灭工程》的体验借鉴，但换成中世纪：**没有枪支**，武器是长剑与法杖，法术是火球与暗影弹，敌人是行尸、疾行者和亡灵法师。

架构照搬 `D:/go/goengine` 的模拟/表现分层与动画方案，逐项对照见 [docs/MAPPING.md](docs/MAPPING.md)。**这是独立项目**：放在 `D:/go/ashen-vale`，与 `goengine` 并列，没有改动 Go 仓库一个字节，Go 引擎后续怎么更新都不影响它。

![运行画面](docs/screenshot.png)

## 新来的？先看这里

| 你想 | 读 |
|---|---|
| 5 分钟跑通、做出第一个改动 | **[docs/ONBOARDING.md](docs/ONBOARDING.md)** ← 第一次来读这个 |
| 改某个「看着别扭」的写法之前 | **[docs/DECISIONS.md](docs/DECISIONS.md)**（决策记录 / 防回退清单，写的是「为什么」） |
| 用 AI 辅助开发 | **[AGENTS.md](AGENTS.md)**（一页硬规则，AI 会先读它） |

只想玩：`npm i && npm run dev`，然后看下面的「操作」。

## 跑起来

需要 Node ≥ 20（本机 22.22.2 验证通过）。

```bash
cd D:/go/ashen-vale
npm install
npm run dev        # http://127.0.0.1:5173
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器，改代码热更新 |
| `npm run typecheck` | 只做 TS 类型检查 |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览构建产物 |

**零美术依赖**：所有贴图在浏览器里程序化画好并打进一张图集，把目录拷给朋友后 `npm i && npm run dev` 就能看到画面，不用下载素材，也不会有 404。

## 操作

| 输入 | 动作 |
|---|---|
| `WASD` / 方向键 | 移动（8 向连续向量，斜向不加速） |
| 鼠标 | 瞄准（身体朝鼠标，脚下方向由实际位移决定） |
| 左键（可按住） | 当前武器普攻：剑 = 130° 扇形挥砍；法杖 = 火球（范围爆炸） |
| 右键 | 特殊技：剑 = 360° 旋风斩；法杖 = 三连火球（耗蓝更多） |
| `空格` | 翻滚，带无敌帧和冷却 |
| `1` / `2` | 换长剑 / 法杖 |
| `B` | 循环换鞋：赤脚 / 布鞋 / 皮靴 / 铁靴（换装接缝示例） |
| `R` | 重开一局（换一张种子地图） |
| `F3` | 调试信息（FPS / 实体数 / 模拟时间 / 坐标） |

控制台里 `__ASHEN__.dumpAtlas()` 会下载 `atlas.png` + `atlas.json`；`__ASHEN__.world` / `.scene` / `.ctx` 可以直接查 ECS 状态。

## 目录

```
src/
  main.ts                 组装 + 主循环（系统顺序在这里定死）
  engine/                 换一个题材还能用的部分
    math.ts               Vec2 / 角度 / 确定性 RNG
    ecs.ts                World / Store / 空间哈希 / 事件队列
    facing.ts             连续弧度 → 3 套视角 + 镜像（唯一朝向判据）
    layers.ts             图层常量
    input.ts              键鼠 → 可序列化 InputState
    camera.ts             平滑跟随 / 边界夹取 / 确定性抖动
    loop.ts               固定步长 1/60 + 累加器 + MaxSteps
    level.ts              瓦片地图 / 圆-AABB 碰撞 / 分轴移动 / 视线
    animation.ts          走路相位 / 骨架参数 / 序列帧特效
    art.ts                程序化像素画 + 行式装箱生成图集
    atlas.ts              图集加载、切帧、按名字查、导出模板
    renderer.ts           ECS → Pixi 显示对象（对象池，只读 World）
  game/                   这款游戏才有的部分
    data.ts               全部数值（内容即数据）
    spawn.ts              建世界：地图 / 玩家 / 亡者 / 物件
    components.ts         组件与标签定义
    present.ts            事件 → 特效 / 飘字 / 震屏
    hud.ts                血条 / 法力 / 准星 / 提示
    systems/              context / control / timers / ai / combat / projectile / rules
docs/
  ONBOARDING.md           5 分钟上手（第一次来读这个）
  DECISIONS.md            决策记录 / 防回退清单（为什么这么设计）
  ECS.md                  ECS API 与「加一个系统」示例
  ART.md                  贴图命名协议、换美术、走路相位、换装
  MAPPING.md              与 Go 引擎逐项对照（含后续同步方式）
AGENTS.md                  AI 协作入口：改之前先读的一页
```

## 从 Go 引擎搬过来的设计（改之前先看这 7 条）

1. **输入是连续向量，视觉只有 4 向**。`facing.ts` 用对角线分界把弧度归成 `front / back / side`，朝左只做 `scale.x = -1`，**绝不旋转 180°**（帽子、法杖、脸的光源会跟着翻）。
2. **走路相位跟位移，不跟时间**。`phase += moved / 26 * π`，`blend` 由实际速度平滑得到。所以慢走不打滑、被墙挡住脚会停、以后客户端不跑模拟也画得对。表现层只读「上一帧位置」，不读输入。
3. **一张图集、按名字查**。所有部件共用一个 `TextureSource`；帧间留 2px gutter 防最近邻串色；查不到贴图降级白点不崩。
4. **密集数组 ECS + 延迟销毁**。`Store.data` 永远密集（删除用末尾补位），遍历时不能删 → `world.destroy()` 排队，`flush()` 统一处理。位置只能经 `world.setPos()` 改，它同步空间哈希。
5. **固定步长 1/60 + MaxSteps=5**，模拟与渲染帧率解耦，同种子同输入必然同结果。
6. **系统顺序是引擎定的**：`applyInput（攻击判定）→ tickTimers（冷却）→ updateAI → updateProjectiles → updateRules → flush`。冷却必须在攻击判定之后推进，否则同一帧能打两次。
7. **模拟只发事件，表现只消费**。`World.emit()` → `Presentation.consume()` 是唯一一处 `drain()`。走路相位、特效、渲染时钟全在渲染层，从不写回 ECS。

## 想改点什么？

| 想做的事 | 改哪里 |
|---|---|
| 调数值（血量、速度、冷却、火球伤害、刷怪数） | `src/game/data.ts` |
| 加一种敌人行为 | `data.ts` 加配置 → `spawn.ts` 里 `addMob` → `systems/ai.ts` 加分支 |
| 加一个组件 | `game/components.ts`（见 [docs/ECS.md](docs/ECS.md)） |
| 加一个系统 | `src/game/systems/` 新建文件，在 `main.ts` 的系统链里插一行 |
| 换武器 / 加技能 | `systems/control.ts`（输入分支）+ `combat.ts`（判定）+ `data.ts`（数值） |
| 换贴图 / 换成真美术 | [docs/ART.md](docs/ART.md)，或 `__ASHEN__.dumpAtlas()` 导出模板 |
| 加一种鞋 / 装备材质 | `data.ts` 的 `SHOE_MATERIALS` + `art.ts` 的 `SHOE_COLORS`（见 [docs/ART.md](docs/ART.md)） |
| 调走路姿态 | `engine/animation.ts` 的 `RIG`，以及 `renderer.ts` 的脚/手落点 |
| 改地图生成 | `engine/level.ts` 的 `generate()` + `game/data.ts` 的 `spawn` |
| 加一种表现（音效、成就、粒子） | 只改 `game/present.ts`，模拟层不用动 |

## 已知边界

- 单机 demo，没有存档、联机、服务端权威；但分层是按「以后能接」留的（输入可序列化、事件单向、表现层不写回）。
- 地图、美术都是程序化生成的占位品质，重点是逻辑和接缝，不是美术。
- Pixi 版刻意**复用显示对象**（Go 版每帧重建绘制指令），所以渲染层有视图池，别改成每帧 new Sprite。
- `public/assets/` 目前是空的；放进去 `atlas.png` + `atlas.json` 会自动覆盖内置美术。

上手路径：[docs/ONBOARDING.md](docs/ONBOARDING.md) → [docs/DECISIONS.md](docs/DECISIONS.md) → [docs/ECS.md](docs/ECS.md) / [docs/ART.md](docs/ART.md) / [docs/MAPPING.md](docs/MAPPING.md)。
