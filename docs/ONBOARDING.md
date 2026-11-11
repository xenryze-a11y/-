# 5 分钟上手

> 目标：跑起来 → 做出 4 个能立刻看到结果的改动 → 知道遇到问题去哪查。
> 不要求先读完架构，边做边查。做完再看 [DECISIONS.md](DECISIONS.md) 理解「为什么」。

## 0. 跑起来（1 分钟）

```bash
cd D:/go/ashen-vale
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。看到一片中世纪地图、模块化方块旅人、几只亡者 = 成功。

素材随源码自带，运行时不用下载。法杖原稿经 `generated-staves.ts` 处理，在上传 GPU 前合入同一图集；像素法术入口是 `pixel-spell-vfx.ts`，容量、配色和时序在 `spell-visuals.ts`。**操作以 [README.md](../README.md) 和 H 手册为准**：WASD 移动，左键使用，右键 / F 特殊技，空格翻滚，1–9 换快捷栏，E / Tab / B 背包与合成，第 9 格篮球召唤，X 用药，G 丢一个，Esc 暂停。手机自动显示摇杆与技能按钮。菜单「冒险存档」创建/继续正式角色，自动保存；「全武器试用」「祭坛试用」单独重开试用。存档实现见 [SAVES.md](SAVES.md)，后续顺序见 [ROADMAP.md](ROADMAP.md)。

## 1. 改一个数值（30 秒）

打开 [`src/game/data.ts`](../src/game/data.ts)，把 `CFG.player.speed` 从 `120` 改成 `240`，保存。Vite 热更新，按 WASD 会明显变快。

**这说明**：内容（数值）和规则（代码）是分开的，调手感不用碰系统逻辑。改回去。

同一文件里还集中了血量、冷却、火球伤害/爆炸半径、三种亡者的数值、刷怪数、地图尺寸——先在这里找，别急着改代码。

## 2. 改一个系统行为（1 分钟）

打开 `src/game/staff-data.ts` 的 `STAFF_PROFESSIONS.frost.skills.wave.cooldown`，把 `4.3` 临时改成 `2`。选择第 2 格霜晶杖，F 冰矛的冷却会明显更短。体验后改回去。

**这说明**：物品 / 法杖内容在 `items.ts / staff-data.ts`，技能判定在 `systems/profession.ts / staff-arts.ts`，计时推进在 `timers.ts`。新系统仍不能插到攻击判定之前。

## 3. 摸一下换装接缝（30 秒）

游戏里按 **`E`**，点击背包里的铁靴，再点击角色旁边的靴子装备位。手里的皮靴可以放回空格。快捷栏与背包共用一份 inventory Store。

然后打开 `src/game/armor.ts` 的 `ARMOR_COLORS`，把 `iron.mid` 改成 `'#ff00ff'`，保存 → 铁甲部件变成品红色。

**这说明**：玩家各部件使用 `block_<part>_<mat>_<view>` 帧，渲染层只读 Equip 材质；**换装不改骨架挂点**。旧怪物仍用 shoe<Mat>[Side]，新增套装看 [SANCTUARY.md](SANCTUARY.md)。

## 4. 加一个组件 + 一个系统（2 分钟）

照抄 [ECS.md](ECS.md)「加一个组件 + 一个系统」那节的中毒示例，三步：

1. `game/components.ts`：声明 `Poison`，加进 `C` / `Stores` / `createStores`。
2. 新建 `game/systems/poison.ts`，写一个 `updatePoison(ctx, dt)`。
3. `main.ts` 系统链里插一行 `updatePoison(ctx, fixed);`。

`npm run typecheck` 过了就成。**顺序很重要**：新系统放在 `updateProjectiles` 之后、`flush()` 之前；别放到 `tickTimers` 前面去。

## 改完自检

```bash
npm run typecheck && npm test && npm run build && npm run build:standalone
```

- 改了渲染 / 动画 / 贴图 → **必须打开画面看**，编译通过不代表画对了。
- 控制台不该有 `[atlas] 缺贴图 xxx` 或红色异常。
- 手感类改动从菜单进入全武器试用；冒险死亡后 R 读取最近存档，试用死亡后 R 重开。

## 常见任务速查

| 想做的事 | 第一站 | 细节文档 |
|---|---|---|
| 调手感 / 数值 / 刷怪量 | `game/data.ts` | README「想改点什么？」 |
| 加一种敌人行为 | `data.ts` → `spawn.ts` 的 `addMob` → `systems/ai.ts` | [ECS.md](ECS.md) |
| 加组件 / 系统 | `game/components.ts` + `game/systems/` + `main.ts` | [ECS.md](ECS.md) |
| 换武器 / 加技能 | `systems/control.ts` + `combat.ts` + `data.ts` | README |
| 换鞋 / 加装备材质 | `armor.ts` + `items.ts` + `block-art.ts`（玩家） | [ART.md](ART.md) |
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
| 换装没生效 | 检查 InventoryState 的 armor / boots、syncEquipment 与 Equip 材质是否一致 |
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


## 发给共创者或朋友

`npm run export:standalone` 从当前源码更新根目录「直接可以玩的 .HTML」。不要继续修改上传的历史单文件，也不要复制整包 Pixi 到 src。外部美术需要完整匹配当前图集，并通过 `?externalAtlas` 显式启用。

新入口：`items.ts`（内容）→ `inventory.ts` / `systems/magic.ts` / `loot.ts`（规则）→ `ui.ts` / `present.ts`（只读表现）。读 D15–D26 了解增强版的取舍。


篮球入口是 `items.ts` → `systems/basketball.ts` → `basketball-content / assets / vfx.ts`，切帧原理与素材来源见 [SUMMON.md](SUMMON.md)。调整穿戴先看 `FOOT_ANCHORS / HAND_ANCHORS` 和 12×14 鞋贴图；必须同时检查世界角色与背包 CPU 预览，详见 D22。


## 雷电法师与林地

菜单「探索古树祭坛」便于直接试玩新区域，向祭坛走近取得雷电法杖后解锁。Q 电场、F / 右键五段震荡、R 身后连射 + 周身高速环绕；其余四根法杖也各有三种职业技能，长剑与篮球的 F / 武技保留。职业状态在 `s.mage`，波列在 `s.wave`，`updateMage` 处理雷电，随后 `updateStaffArts` 处理四系区域、弹道、陨石和灼烧，再运行 summons。UI 不写冷却，环形 SVG 只读取剩余 / 总冷却。普通 / 巨树与图标原稿在 `assets/source`，运行时仅内嵌规范化小图。详见 [STORM_MAGE.md](STORM_MAGE.md)。

五系内容入口：`staff-data.ts` → `systems/profession.ts / staff-arts.ts` → `staff-arts-vfx.ts / staff-art.ts`。新图标以 CPU Canvas 截图传给 DOM，技能按钮共用真实冷却数据；技能与辅助键均无外部大框。祭坛和原区域相机倍率 / 高度相同。完整内容表见 [STAFF_PROFESSIONS.md](STAFF_PROFESSIONS.md)。


## 圣域和四部位装备

先读 [SANCTUARY.md](SANCTUARY.md)。区域 / 门洞 / NPC 坐标在 sanctuary-data.ts，地形在 grove.ts，教堂屋面和内饰在 sanctuary-art.ts / sanctuary-view.ts；普通树仍为程序绘制；神树 / 祭坛 / NPC使用generated-flame-sanctuary.ts加载的新重像素生成图，NPC4帧站立动画由renderer的只读时钟驱动，grove-art.ts加载原雷电图标。玩家骨架在 block-rig.ts，部件绘制在 block-art.ts，Sprite 复用在 block-avatar.ts；怪物仍用旧骨架。装备槽为 40 靴子、42 头盔、43 胸甲、44 护腿，41 仍是合成产出，不能复用。

C 发起近距离交谈，quests.ts 决定接受 / 复命 / 祝福 / 治疗；UI 只发 QuestCommand，所有对话期间冻结模拟和表现。打开背包试穿铁甲，或完成圣使 → 神父任务领取晨曦四件套。新旅途重置进度；仍未加入存档和联机。


## 三把新兵器

E打开背包，点「装备魔镰 / 装备弯刃 / 装备炎剑」交换到当前快捷格，再E关闭即可试玩；也能手动搬运存储区第19–21格。魔镰和炎剑各有 Q / F / R，弯刃仅左键普攻。内容入口 weapon-data.ts → systems/blades.ts → blade-vfx.ts；纯模拟组件见 ECS.md。修改持握先检查 BLADES 的 frame尺寸、grip与scale，不要另设UI预览挂点。生成素材规范和参考来源见 assets/README.md。


## 五连焰潮与新圣域素材

炎剑Q一次扣蓝 / 一次冷却，首波立即、后4波每0.18秒释放；waveLeft / waveTick / waveAngle / waveMultiplier保存在BladeState，方向和伤害倍率在施法时锁定，后续波从当前角色位置发出，换武器仍完成。容量须先预留5波，不能覆盖仍未完成的连发；暂停冻结。火焰特效、圣域帧布局和可选处理脚本见assets/README.md。新站立帧脚底基线固定；生成素材不能改变NPC碰撞或交谈规则。


## 圣域地面与7秒炎躯

新环境入口：sanctum-ground.ts（地面材质与花石位置）→ sanctum-rebuilt-art.ts（生成图覆盖与后备帧）→ renderer.rebuildGround（场景一次烘焙）。原稿与布局 / 规范化脚本见assets/README.md。普通树不变，新神树 / 祭坛取消通用椭圆阴影，根床只作地面装饰，不额外阻挡。

Q自动挥五下、每下发一浪；R七秒当前生命与上限翻倍，期间升级正确计入，到期按比例恢复。炎躯Back / Front附在同一玩家根容器，人物头脸位于后火焰上方，不要改回一整张FX顶层Sprite。所有冷却 / 待发波 / 临时生命 / 站立和火焰时钟仍随暂停冻结。
