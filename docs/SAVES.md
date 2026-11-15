# 冒险存档 v3（兼容 v1 / v2）

入口：`game/saves.ts`（格式/校验/本地仓库）、`game/adventure.ts`（世界进度/逐件身份）、`game/save-menu.ts`（只读面板）、`main.ts`（事务与生命周期）。UI 不写 ECS，模拟不访问浏览器存储。

## 快照与时间

`World.snapshot()` 要求已经 flush，返回可独立修改的纯数据，保留 Entity ID、Alive/Store 顺序、标签、位置、组件、下一个 ID、模拟时钟和 RNG 内部状态。`restore()` 仅装入空世界，使用 `setPos` 重建空间索引，不回放历史表现事件。Level 独立记录瓦片、南墙、出生点和全部阻挡体。

世界时间与所有冷却/持续效果原样保存，离线时间不推进。五连焰潮保留排队计数、挥砍索引、锁定方向和已发实体，炎躯保留剩余秒数、翻倍标志与实际 HP/max，读档不重新释放技能。瞬时粒子/飘字/镜头震动不存；持久法术实体由新视图继续呈现。NPC 对话重进时关闭，任务阶段与奖励结算保留。背包光标和合成格均保存，读档时有手持物品自动开包。

`AdventureProgress.nextRespawn` 替代模块级刷怪计时器，切局不共用时钟。`nextEquipmentId` 给不可堆叠物品分配 `<seed>:<counter>`；ItemStack 和 Pickup 带同一实例，不能在移格/丢弃时只复制 itemId/count。

## 本地槽与导入

键为 `ashen-vale.save.v1.0` 至 `.2`，一次 `setItem` 写入 current + backup。相同内容不挤掉上一份不同版本；写入失败保留旧键。主记录校验失败才尝试备份。文件含 format/version/savedAt/checksum/data，校验码只检测损坏，不能替代结构验证或用作反作弊。

导入上限 2 MB；替换活动世界前检查版本、已知组件、数量/有限数值、实体唯一性、归属、地图尺寸、背包/装备槽、物品 ID、装备实例唯一性及临时生命状态。先在隔离世界验证，再安装新 Scene；非法文件不覆盖槽位。覆盖已有槽需面板内明确确认。

自动保存间隔为 20 秒游戏时间；物品命令或任务/掉落事件使存档变脏，最多每秒保存一次，暂停/背包/pagehide/visibilitychange 会立即尝试。关闭页面无法保证浏览器一定发送生命周期事件，因此不依赖退出事件作为唯一保存方式。死亡不覆盖活档。自动保存失败会提示并在菜单持续显示，当前冒险仍可导出。

## 后续版本

新增需要持久化的组件后，要更新 `saves.ts` 的白名单结构与跨组件约束，并决定是否增加 SAVE_VERSION/提供迁移。不能忽略未知组件继续读旧格式。正式冒险和试用由 progress.mode 区分，只有冒险能写槽；不能只凭预留字段宣称探索/宝箱/首领/词缀玩法已完成。

回归：`tests/saves.test.ts` 覆盖快照/RNG/空间索引、冷却和所有武器技能续接、炎躯升级与到期、五次挥击、奖励不重领、装备移动与拾回、三槽备份、配额失败和非法文件。浏览器补充刷新续玩、JSON 下载上传、覆盖确认、触屏、窄横屏、离线单文件。


## 本阶段验收

2026-11-12：typecheck、86 项模拟回归、普通构建和单文件导出均通过。生产构建浏览器实测通过刷新续玩、移动与光标物品恢复、炎躯生命和冷却续接、JSON 下载后导入另一槽、三槽独立、覆盖取消、非法导入拒绝、试用隔离、390×844/844×390 布局。离线包在禁网和不可用存储环境下仍能导出当前角色；测试过程无脚本异常。

界面实机：[桌面存档](adventure-saves-desktop.png)、[手机存档](adventure-saves-mobile.png)。


## v2 三域迁移

本地键继续使用原 `ashen-vale.save.v1.*`，格式版本单独记录。parseSave 同时校验 v1 和 v2；恢复 v1 时先保留原实体/组件/RNG，再扩展 Level 并初始化探索内容，下一次保存输出 v2。v2 地图为 128×96，新增进度字段 worldVersion、discovered、waypoints、startedSites、trackedSite、lastRegion、campReadyAt、travelReadyAt；Prop.landmark 与 Mob.site 只允许已知内容 ID。迷雾沿用 explored，遗箱/眺望点沿用 openedChests，圣龛沿用 purified。具体规则及测试夹具说明见 [WORLD_EXPLORATION.md](WORLD_EXPLORATION.md)。


## v3 四倍扩图与保存优化

v3为256×192，CLIFF/STAIRS真实瓦片，worldVersion=3，支持30地点/6界石；v1/v2完整恢复后再扩图，原坐标、实体、奖励和装备保留。原本地键不变。writeScene仅用于本游戏同步捕获并已校验的快照，外部JSON仍走parseSave/restoreSave/write。验证缓存以原始存储字符串为键，读取返回独立JSON副本；外部改记录不会污染缓存。失败写入不能更新缓存，也不能挤掉旧备份。详见 [景观与性能](LANDSCAPES_AND_PERFORMANCE.md)。

## v4 六域与独立地下城

v4主世界512×384、worldVersion=4；progress.zone为overworld/mine/roots/jail，休眠地图放在SaveData.journey.layers，returnAt与returnTracked保留返回位置和原追踪。当前角色只在活动世界存在，休眠世界完全删除玩家实体和组件；导入对每层注入唯一角色进行完整隔离验证，拒绝活动层重复/未知层/角色副本/缺失返回地图。

serializeSave在本地槽与导出时将每层tiles/southWalls编码为rle1，parseSave先做有界解压，再验证完整数据的原校验码，返回普通SaveRecord。captureSave与模拟仍使用原数组。读取缓存返回正常快照，备份也压缩，失败写入保留旧档。文件上限8MB，解压每层不超过512×384格、至多三休眠层，实际层尺寸严格校验为主世界或80×80。v1–v3完整恢复后再扩图；原槽位键保持不变。细节及回归见 [六域远征](ARPG_EXPEDITION.md)。
