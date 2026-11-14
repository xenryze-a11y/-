# 任务清单（动手之前先写这里）

> **流程约定**：每一批改动开工前，先把这一批的**验收标准**写进本文档；做完就在状态列打勾，
> 并记下实际落地的文件与提交。跨会话 continuation 靠这一页，不靠记忆。
>
> 没有写进本文档的批次不做；本文档里没写的细节，实现时按「最小改动 + 可测试」决定，做完补回来。

## 当前状态

- 代码基线：`origin/main` = 生存机制已完成版（存档 v4）；第 1 批已落地（存档 v5）。
- 分发产物：`直接可以玩的 .HTML` + `/sdcard/Download/KairDownloads/灰烬谷II-AshenVale-可直接游玩.html`。
- 自检命令：`npm run typecheck && npm test && npm run build && npm run export:standalone`。
- 出图命令：`npm run shot -- <场景> [输出路径]`，场景见 [RENDERING.md](RENDERING.md)。

---

## 工具批 · 无头出图（已完成）

**目标**：协作者（与助手）要能「亲眼」看到游戏画面，而不是只信类型检查与单元测试。
不装浏览器，自己在 Node 里实现最小 Canvas 2D + PNG 编解码，跑**真实的美术构建链**
（`buildProceduralAtlas()` + 全部 `*Art` 覆盖函数），再按 `renderer.ts` / `block-avatar.ts`
的规则把场景画出来导出 PNG。

### 验收标准

- [x] shim 覆盖 art 模块实际用到的全部 API；未实现的 API **抛错**而非静默出错图
- [x] `fillRect` 的 floor 语义、预乘 alpha、`source-atop` / `destination-out` 与浏览器一致
- [x] `Image` 能解 `?inline` 导入的 data URL PNG，因此生成素材（法杖 / 刀 / 火焰等）都能进来
- [x] 能在 Node 里完整重建运行时图集（398 帧）并逐帧校验非空、不越界
- [x] 能按 renderer 规则画地形分块（选帧 + 卡通描边），能按 blockPose 画角色骨架
- [x] 出图结果可被视觉模型读图核对（已验证第 1 批 HUD 相关素材与本批新图标）
- [x] 回归测试锁死上述语义（`tests/render.test.ts`，共 14 项）

### 落地

- 新增 `tests/render/canvas-shim.ts`（Canvas 2D 软件实现 + PNG 解码 + `document`/`Image` shim）
- 新增 `tests/render/png.ts`（无依赖 PNG 编码器，zlib deflate）
- 新增 `tests/render/shot.ts` + `run-shot.mjs`（场景：atlas / field / hero / items / staff / dump / probe）
- `package.json` 新增 `shot` 脚本
- 文档：`docs/RENDERING.md`、`TASKS.md`、`AGENTS.md`、`VALIDATION.md`
- **附带修的真 bug**：`item_rations` / `item_water` / `item_bandage` 三类物品在
  `art-upgrade.ts` 没有绘制分支，图标**全透明**（游戏三样东西看不见）。已补 food / drink /
  medical 三个分支，并由「全透明帧」断言锁死。
- **自检**：typecheck ✅、134/134 测试 ✅、build + standalone ✅

### 风险与限制

- shim 是**最小实现**：不支持 `stroke` / `fillText` / `measureText` / 线性渐变 / 阴影，
  用到就抛错（这是有意的：宁可失败也不出错图）。小地图的 `arc` / `strokeRect` 已单独支持。
- 出图只覆盖**世界渲染层**；HTML HUD 需要 DOM，不在本批范围内（HUD 改动仍靠数据断言 + 手动读档验证）。
- `hero` 场景里法杖较大且与身体重叠，这是忠实照抄 `block-avatar.ts` 的结果，不是 bug。

---

## 第 0 批 · 生存机制（已完成）

四条状态（饱食 / 水分 / 体温 / 疲劳）、流血与感染、负重、死亡掉落。
数值在 `src/game/data.ts` 的 `SURVIVAL`，规则在 `src/game/systems/survival.ts`，
存档 v4，旧档由 `restoreSave` 补满值。详见 [SURVIVAL.md](SURVIVAL.md) 与决策 D46。

**落地**：`components.ts` / `data.ts` / `inventory.ts` / `items.ts` / `systems/survival.ts` /
`systems/combat.ts` / `systems/control.ts` / `systems/magic.ts` / `systems/blades.ts` /
`death-stash.ts` / `saves.ts` / `spawn.ts` / `ui.ts` / `ui-template.ts` / `ui.css` / `main.ts`。
**验收**：typecheck ✅、109/109 测试 ✅、build + standalone ✅。

---

## 第 1 批 · 衣物保暖 / 耐热 + 季节气温（已完成）

**目标**：现在穿铁甲和穿皮衣在雪夜里没区别，夏天也不会热。要做到 RimWorld / PZ 那种
「穿对了衣服才能出门」的体感。

**方案**：方案 B——抗寒与暑热分成两条 0–100 状态；新增毛皮斗篷（胸甲位 `fur` 材质）。
完整公式与数值见 [CLIMATE.md](CLIMATE.md)，决策见 D47。

### 要做的事

1. **舒适温度区间**（核心公式，最终实现）
   ```
   抗寒 = 各部位 insulation 之和（含鞋）
   耐热 = 各部位 cooling 之和（含鞋）
   舒适区间 = [ 5 − 抗寒 × 1.2 , 25 + 耐热 × 2 ]   （摄氏）
   ```
   低于下限 → 抗寒以「低几度 × 0.055 / 秒」下降；高于上限 → 暑热同速率上升；
   区间内两条以 1.2 / 秒回安全值。原计划的公式（-10 + 抗寒×2）在冬夜过严，已调整。

2. **衣物属性**：`armor.ts` 新增 `ARMOR_THERMAL: Record<ArmorMat, {insulation, cooling}>`，
   并提供 `clothingInsulation(eq)` / `clothingCooling(eq)`。材质差异：
   - 皮革：保暖好、耐热差
   - 铁甲：减伤高但**不保暖**（零下冻得更快）
   - 晨曦：均衡，套装另给一点耐寒
   - 新增 `fur` 材质「毛皮」：高保暖、零减伤，用**胸甲位**（`fur_chest`）落地

3. **新物品**：`fur_chest` 毛皮斗篷。需要 `ARMOR_COLORS.fur` 与 `block-art` 配色支持；
   掉落来源暂定：怪物低概率 / 后续批次再加专门来源。

4. **季节**：`春 / 夏 / 秋 / 冬` 循环，基础气温 `春 +12 / 夏 +28 / 秋 +12 / 冬 -8`，
   时长 480 / 600 / 480 / 720 秒。**由 `world.time` 推导，不存字段**（原计划存
   `AdventureProgress`，但时间已经进存档，推导更省一次迁移）。

5. **环境气温** = 季节基础 + 天气修正（第 2 批再加）+ 昼夜偏移（白天 +4 / 夜晚 −10）。
   水域附近额外 −10，营火 / 火把旁 +40（局部微气候）。

6. **HUD**：四条细条旁加一行「气温 −12°」，低温 / 高温时变色；状态条下方提示
   「穿得太薄」/「太热」。

### 验收标准

- [x] 无装备在冬夜体温持续下降，且掉得比夏天白天快
- [x] 穿皮革比赤身明显减缓，毛皮最好；铁甲**不如**皮衣保暖
- [x] 夏天晴天会过热（体温下降的反向惩罚）
- [x] 体温变化速率随温差增大，不是固定值
- [x] 季节跨局保留（由 world.time 推导，无需额外字段）；旧存档能正常加载
- [x] 测试：`tests/climate.test.ts`，覆盖公式、材质差异、季节推进、存档迁移

### 落地

- 新增 `src/game/climate.ts`（季节 / 昼夜 / 微环境 / 环境气温 / 舒适区间）
- `armor.ts`：新增 `fur` 材质、`ARMOR_THERMAL` / `SHOE_THERMAL`、`comfortMin/Max`、
  `clothingInsulation/Cooling`
- `items.ts`：新增 `fur_chest` 毛皮斗篷
- `components.ts` / `spawn.ts` / `saves.ts`：`Survival.heat`，存档升 v5（旧档补 0）
- `systems/survival.ts`：抗寒 / 暑热改由舒适区间驱动；负重与其余规则不变
- `combat.ts`：毛皮斗篷掉落（约 2%）
- `ui.ts` / `ui-template.ts` / `ui.css`：暑热细条 + 气温行
- 文档：`docs/CLIMATE.md`、`DECISIONS.md` D47、`TASKS.md`、`README.md`、`AGENTS.md`
- **自检**：typecheck ✅、115/115 测试 ✅、build + standalone ✅

### 风险

- ~~体温双向还是两条独立~~ → 已选**方案 B**：抗寒 + 暑热分开，不动现有 HUD 与存档结构。
- 后续天气批次要注意：`validate` 不得改动传入的 `data`；新增状态字段时用 `optional` + `restoreSave` 补默认。

---

## 第 2 批 · 天气系统

**目标**：天气驱动环境气温，并加入「淋湿」。

### 要做的事

1. `Weather = 'clear' | 'cloud' | 'rain' | 'snow' | 'storm'`，按世界时间确定性转换
   （用 `world.rng()`，状态存 `AdventureProgress`）。
2. 天气修正：晴 +0 / 阴 −4 / 雨 −8 / 雪 −14 / 风暴 −18（第 1 批的环境气温公式直接加这一项）。
3. **淋湿**：雨中且不在建筑内 → `wet` 计时累加；`wet > 0` 时寒冷流失 ×2，靠近火堆快速擦干。
   雪天同样累积。`wet` 进 `Survival` 组件。
4. 火堆 / 火把在雨、风暴下回暖效果减半。
5. 表现（只改 `present.ts`，模拟层零改动）：雨 / 雪粒子、地面湿痕、建筑内不淋湿。
6. HUD：天气图标 + 名称，与气温同一行。

### 验收标准

- [ ] 同一季节下，雨天的体温下降明显快于晴天
- [ ] 淋湿状态可查、可恢复，且会随靠近火堆消退
- [ ] 天气跨局保留，读档后不重置
- [ ] 表现粒子不影响模拟结果（无头测试里跑 60 秒，帧率无关）
- [ ] 测试覆盖天气转换、淋湿加倍、火堆恢复

---

## 第 3 批 · 极端事件与 NPC 反应

**目标**：让气候真正成为玩法压力，而不只是数值。

### 要做的事

1. 极端事件：**暴风雪**（冬季概率）、**热浪**（夏季概率），持续若干分钟，
   气温额外 −25 / +20，并伴随可见表现。
2. 营地避寒：暴风雪中在室内或营火旁才能稳定回温；事件期间营地休息有额外恢复。
3. NPC 反应：圣使 / 神父对话按季节与天气变化（只改文案表，不改规则）。
4. 可选加分项：雪地脚印（表现层）、追踪玩法。

### 验收标准

- [ ] 事件有预告（HUD 提示），有开始与结束
- [ ] 事件期间出门成本明显高于平时
- [ ] 事件不破坏存档校验与读档恢复
- [ ] 文案与事件状态一致，不出现「夏天说下雪」

---

## 通用约束（每批都要守）

- 模拟层只发事件，表现层只读 `World`，从不写回 ECS。
- 位置只经 `world.setPos()`；删除只经 `world.destroy()` + `flush()`。
- 新系统插在 `updateRules` 之后、`flush()` 之前；冷却仍在攻击判定之后推进。
- 新增组件必须同步 `saves.ts` 的 schema、`SAVE_VERSION` 与迁移；
  `validate` 不得改动传入的 `data`（会破坏校验码）。
- 内容即数据：数值进 `data.ts` / `items.ts` / `armor.ts`，不硬编码进逻辑。
- 每批完成跑完整自检，并在本文档更新状态。
