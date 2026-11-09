# AGENTS.md — 改这个项目之前先读

> 给 AI 和新接手的开发者。没有上一次会话的记忆，所以下面每一条都是必要的。
> 仿 `goengine/AGENTS.md` 的作用：把「改之前必须知道」压成一页。

## 这是什么

中世纪生存 demo（灰烬谷 / Ashen Vale）：**TypeScript + PixiJS 8 + 自己写的 ECS**，俯视 2D，无枪支（长剑 / 法杖 / 火球）。

架构参考 `D:/go/goengine`，但**是独立项目**：放在 `D:/go/ashen-vale`，与 Go 仓库并列。Go 引擎会继续更新，两边各自演进；**不要改 goengine 里的任何文件**，也不要把 Go 代码整包复制进来。逐项对照见 [docs/MAPPING.md](docs/MAPPING.md)。

## 第一件事：跑起来，别靠猜画面

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

改任何渲染 / 动画 / 贴图相关的东西，**必须打开画面看结果**。控制台里：

- `__ASHEN__.dumpAtlas()` — 导出 `atlas.png` + `atlas.json` 美术模板
- `__ASHEN__.world` / `.scene` / `.ctx` — 直接查 ECS 状态
- `__ASHEN__.restart()` — 重开一局

零美术依赖：贴图在浏览器里程序化生成并打进一张图集，clone 下来就能跑，不会有 404。

## 按这个顺序读

| 顺序 | 文档 | 解决什么 |
|---|---|---|
| 1 | [docs/ONBOARDING.md](docs/ONBOARDING.md) | 5 分钟跑通 + 做出第一个改动 |
| 2 | [docs/DECISIONS.md](docs/DECISIONS.md) | **为什么**这么设计，哪些坑别改回去 |
| 3 | [README.md](README.md) | 操作、目录、7 条核心设计、改动速查 |
| 4 | [docs/ECS.md](docs/ECS.md) | 加组件 / 加系统、三条不变量 |
| 5 | [docs/ART.md](docs/ART.md) | 贴图命名、图集、走路相位、换装 |
| 6 | [docs/MAPPING.md](docs/MAPPING.md) | 与 Go 引擎逐项对照、Go 更新时怎么跟进 |

## 五条不能破

1. **模拟不认识 Pixi，表现层只读 `World`，从不写回 ECS**。走路相位、特效、渲染时钟都在渲染层。加表现只改 `game/present.ts`。
2. **系统顺序在 `main.ts` 定死**：`applyInput（攻击判定）→ tickTimers（冷却）→ updateAI → updateProjectiles → updateRules → flush`。冷却必须在攻击判定**之后**推进，否则同一帧能打两次。
3. **位置只经 `world.setPos()`**（同步空间哈希）；**删除只经 `world.destroy()`**（排队到 `flush`）。遍历 Store 时不能删。
4. **走路相位跟「实际位移」**，不跟时间、不读输入向量。贴墙不踏步、慢走不打滑、以后接联机才对。
5. **`Side` 是独立画法，手脚是运行时悬浮的，鞋按材质换装**：不要把正面的并排腿、同色手臂、靴子塞回侧视贴图，不要给手做 360° 连续插值；侧视**兜帽/头发要盖满整个头顶和额头**（和正面同宽），只盖后脑左半会变成秃头。

## 改之前先问：`engine/` 还是 `game/`？

判据只有一句：**换一个题材还需要它吗？** 需要 → `src/engine/`；只在这款游戏成立 → `src/game/`。

| 内容 | 放哪 |
|---|---|
| 数值、刷怪数、材质清单 | `game/data.ts`（**内容即数据**，别硬编码进逻辑） |
| 规则（判定、冷却、AI） | `src/game/systems/` 或 `src/engine/` 的通用部分 |
| 表现（特效、HUD、配色） | `src/game/` |
| 机制（碰撞、存储、相机数学） | `src/engine/` |

## 改完自检

```bash
npm run typecheck && npm run build
```

然后：

1. 渲染 / 动画改动 → 打开画面确认，别只看编译过了。
2. 新踩的坑 → 写进 `docs/DECISIONS.md`（记**为什么**，不记「是什么」）。
3. 新约定 → 同步进 `ONBOARDING.md` / `ART.md` / `ECS.md` 的对应节。
4. 中文注释、英文标识符；注释写「为什么」和被否决的做法。
