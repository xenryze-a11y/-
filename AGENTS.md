# AGENTS.md — 改这个项目之前先读

> 给 AI 和新接手的开发者。没有上一次会话的记忆，所以下面每一条都是必要的。
> 仿 `goengine/AGENTS.md` 的作用：把「改之前必须知道」压成一页。

## 这是什么

中世纪生存 demo（灰烬谷 / Ashen Vale）：**TypeScript + PixiJS 8 + 自己写的 ECS**，俯视 2D，无枪支（长剑 / 法杖 / 火球）。

架构参考 `D:/go/goengine`，但**是独立项目**：放在 `D:/go/ashen-vale`，与 Go 仓库并列。Go 引擎会继续更新，两边各自演进；**不要改 goengine 里的任何文件**，也不要把 Go 代码整包复制进来。逐项对照见 [docs/MAPPING.md](docs/MAPPING.md)。

## 动手之前：先写 [docs/TASKS.md](docs/TASKS.md)

每一批改动开工前，先把这一批的**验收标准**写进任务清单；做完打勾并记下落地文件与提交。
跨会话 continuation 靠这一页，不靠记忆；没有写进清单的批次不做。

## 第一件事：跑起来，别靠猜画面

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

改任何渲染 / 动画 / 贴图相关的东西，**必须打开画面看结果**。控制台里：

- `__ASHEN__.dumpAtlas()` — 导出 `atlas.png` + `atlas.json` 美术模板
- `__ASHEN__.world` / `.scene` / `.ctx` — 直接查 ECS 状态
- `__ASHEN__.restart()` — 重开一局

**没有浏览器时**（比如纯净容器）：用仓库自带的无头出图，在 Node 里重建完整运行时图集并导出 PNG，
再把图交给视觉模型目视核对。

```bash
npm run shot -- atlas     # 整张图集（1024×3070）
npm run shot -- field     # 多类地形选帧 + 卡通描边
npm run shot -- hero      # blockPose 骨架 + 法杖
npm run shot -- items     # 全部物品图标网格
```

用法、覆盖链约定与已知限制见 [docs/RENDERING.md](docs/RENDERING.md)。**改渲染逻辑时要同步改
`tests/render/shot.ts`**——两边的绘制规则是逐条对拷的，对不上就是 bug。

美术随源码自带：程序化场景与内嵌像素法杖启动时合成一张图集，clone 下来就能跑，无运行时素材下载。生图原稿与处理约定见 `src/game/assets/README.md`。

## 按这个顺序读

| 顺序 | 文档 | 解决什么 |
|---|---|---|
| 1 | [docs/ONBOARDING.md](docs/ONBOARDING.md) | 5 分钟跑通 + 做出第一个改动 |
| 2 | [docs/DECISIONS.md](docs/DECISIONS.md) | **为什么**这么设计，哪些坑别改回去 |
| 3 | [README.md](README.md) | 操作、目录、7 条核心设计、改动速查 |
| 4 | [docs/ECS.md](docs/ECS.md) | 加组件 / 加系统、三条不变量 |
| 5 | [docs/ART.md](docs/ART.md) | 贴图命名、图集、走路相位、换装 |
| 6 | [docs/MAPPING.md](docs/MAPPING.md) | 与 Go 引擎逐项对照、Go 更新时怎么跟进 |
| 7 | [docs/SURVIVAL.md](docs/SURVIVAL.md) | 生存机制：饱食 / 体温 / 负重 / 创伤 / 死亡掉落 |
| 8 | [docs/CLIMATE.md](docs/CLIMATE.md) | 季节气温、衣物保暖 / 耐热、毛皮斗篷 |
| 9 | [docs/TASKS.md](docs/TASKS.md) | **任务清单：下一批做什么、验收标准**（开工前先写这里） |
| 10 | [docs/RENDERING.md](docs/RENDERING.md) | 无头出图：没浏览器怎么看到画面 |

## 五条不能破

1. **模拟不认识 Pixi，表现层只读 `World`，从不写回 ECS**。走路相位、特效、渲染时钟都在渲染层。加表现只改 `game/present.ts`。
2. **系统顺序在 `main.ts` 定死**：`applyInput（攻击判定）→ tickTimers（冷却）→ updateAI → updateProjectiles → updateFields → updateMage → updateStaffArts → updateBlades → updateSummons → updateRules → updateSurvival → flush`。冷却必须在攻击判定**之后**推进，否则同一帧能打两次。
3. **位置只经 `world.setPos()`**（同步空间哈希）；**删除只经 `world.destroy()`**（排队到 `flush`）。遍历 Store 时不能删。
4. **走路相位跟「实际位移」**，不跟时间、不读输入向量。贴墙不踏步、慢走不打滑、以后接联机才对。
5. **四方向仍为 front / back / side + 左向镜像**。玩家按用户最新要求改为 `block-rig / block-avatar` 模块化方块骨架，头、躯干、单节臂 / 腿、手与鞋独立；套装只换材质帧，不改挂点。旧怪物仍使用悬浮手脚，侧视独立绘制；不能把正面两腿复用为侧面，也不能让 UI 预览另造一套骨架。


## 改之前先问：`engine/` 还是 `game/`？

判据只有一句：**换一个题材还需要它吗？** 需要 → `src/engine/`；只在这款游戏成立 → `src/game/`。

| 内容 | 放哪 |
|---|---|
| 数值、刷怪数、材质清单 | `game/data.ts` / `game/items.ts` / `game/sanctuary-data.ts`（**内容即数据**，别硬编码进逻辑） |
| 规则（判定、冷却、AI） | `src/game/systems/` 或 `src/engine/` 的通用部分 |
| 表现（特效、HUD、配色） | `src/game/` |
| 机制（碰撞、存储、相机数学） | `src/engine/` |

## 改完自检

```bash
npm run typecheck && npm test && npm run build && npm run build:standalone
```

然后：

1. 渲染 / 动画改动 → 打开画面确认，别只看编译过了。
2. 新踩的坑 → 写进 `docs/DECISIONS.md`（记**为什么**，不记「是什么」）。
3. 新约定 → 同步进 `ONBOARDING.md` / `ART.md` / `ECS.md` 的对应节。
4. 中文注释、英文标识符；注释写「为什么」和被否决的做法。
