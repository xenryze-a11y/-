# 贴图、图集与动画

这套 demo 的重点就是「移动动画 + 贴图」怎么组织。全部逻辑在 `engine/art.ts`、`engine/atlas.ts`、`engine/animation.ts`、`engine/renderer.ts`。

## 一、贴图命名即协议

```
<family><View><Part>      例：heroFrontBody / zombieSideHead / casterBackHead
tile<Material>            tileGrass / tileWall / tileWallTop
prop<Name>                propTree / propGrave / propTorch
pickup<Kind>              pickupMana / pickupHealth
weapon<Name>              weaponSword / weaponStaff
shoe<Mat>[Side]           shoeLeather / shoeIronSide / shoeZombieBareSide
part<Name>                partFoot（兜底）/ partHand / partShadow
<fx>_NNN                  slash_000..004 / impact_000..005 / fireball_000..003
```

| 项 | 约定 |
|---|---|
| `family` | `hero` / `zombie` / `caster`。换皮就加一套同名前缀的贴图，代码不用改 |
| `View` | 只有 `Front` / `Back` / `Side` **三套**。朝左 = `Side` 贴图 + 水平镜像，没有第四套、更没有 8 方向帧 |
| `Part` | `Body`（**只画躯干 + 裤腿**，不含手臂/鞋/手）/ `Head`（头 + 兜帽或头发）。兜帽/头发必须覆盖整个头顶和额头，见 D14。**斗篷部件当前不生成**（见 [DECISIONS.md](DECISIONS.md) D13） |
| 尺寸 | 人形部件统一 **32×48**，锚点 `(0.5, 30/48)` = 腰带行；这是部件内部锚点；WorldView 统一上移 12 局部像素，使脚底 / 影子中心与实体世界坐标对齐（D16） |
| 武器锚点 | 剑 `(0.5, 28/32)` 握把、玩家法杖 `(0.5, 48/64)` 握把，NPC 旧法杖仍为 `(0.5, 38/48)`，旋转绕手 |
| 瓦片 | 32×32，材质与通行性由同一个 `Tile` 枚举编码 |

`get(name)` 查不到贴图会返回 `Texture.WHITE` 并打一条 warning，**不会崩**：换皮漏一两张时能一眼看出是哪块白了，而不是整局黑屏。

> ⚠️ **`Side` 是独立画法，不是把正面裁一半**。侧视只画「朝右」一套：躯干 10px 宽（正面 14px）、后背压暗、**两腿前后错开且后腿只露一小截**；头是侧脸（鼻尖朝右、一只眼），但**兜帽/头发要和正面一样覆盖整个头顶 + 额头**（`x=9..23, y=2..11`），只露眼睛以下的右半张脸——不能只盖后脑左半，否则前额一片皮肤、看着像秃头（D14）。**不画手臂、不画靴子、不画斗篷**——它们会把侧视重新撑回正面那么宽，或者像背后挂了个方形背包。朝左由渲染层 `scale.x = -1` 镜像。
> 早期版本让侧视复用了正面的腿、还画了同色前臂和靴子，结果「侧面能看见两条正面一样的腿」「身体和脚太大」——默认鼠标方向恰好就是 Side，一进游戏就露馅。别改回去。

### 悬浮手脚（Go D43 的做法）

静态贴图里**只有躯干和裤腿**，手和鞋是运行时画上去的：

- `partFoot` = 6×5 的小矩形鞋，`partHand` = 6×6 的**方形像素块**（硬边、不圆滑）。都不要画成带高光的圆盘，放大后会像贴在身上的花/装甲板。
- 脚位置由 `footPos()` 的走路相位决定，鞋底落在裤脚下沿（`RIG.soleY = 12`）；鞋贴图 12×14，以 `13/14` 鞋底锚点落地，侧视不再额外缩小。
- 手位置 = `HAND_ANCHORS[view][i]` **三档离散锚点** + `handBob()` 摆动。这是 goengine **D52 之前**的版本：过对角线时手直接跳到另一组锚点，不做 360° 连续插值（用户要的「不平滑」旧版）。D52 之后 Go 才改成 `core.HandOffset` 极坐标插值，这里刻意不跟。
- 手臂段和腿段**根本不画**（D43：像素尺度下两段锥形像竹竿，比悬浮手脚更不像人）。武器跟着持械手（右手锚点）走。

### 鞋可以换装（对应 Go 的 `art.ShoeSprite`）

Go 版是 `sprShoe<Mat>[Side]`（bare / cloth / leather / iron），丧尸赤脚另按腐肉色出 `spr<Rig>ShoeBare[Side]`——**鞋是独立贴图，不画在身体里**，所以能换装。demo 用同一套接缝：

- **贴图**：`shoe<Mat>` / `shoe<Mat>Side`，材质见 `game/data.ts` 的 `SHOE_MATERIALS`（bare / cloth / leather / iron / zombieBare），5 材质 × 2 视角 = 10 张，由 `engine/art.ts` 的 `drawShoe` 自动生成。
- **数据**：`Equip.shoes`（`game/components.ts`）。渲染层每帧用 `shoeSpriteName(equip.shoes, view === 'side')` 拼名字换 texture，**换装不改任何绘制代码**。
- **交互**：玩家在背包靴子位换装；亡者出生时随机分配 `zombieBare`（腐肉色赤脚）或 `cloth`。HUD 显示当前鞋。
- **加新材质**：往 `SHOE_MATERIALS` 和 `SHOE_COLORS` 各加一项即可；想让玩家能换再加进 `PLAYER_SHOES` 和 `SHOE_LABEL`。
- ⚠️ **侧视鞋是单独一张**，有朝右的鞋头和靴筒，不能拿正视图凑合——这正是 Go 版命名里 `Side` 后缀特殊的原因（鞋子的命名不带视角前缀，而是加 `Side`）。
- `RIG.footScale` 控制鞋大小（当前 1）：太小会变成两个点，太大又会盖过裤腿。

## 二、图集

对应 Go 引擎 `backend/atlas.go`（D40）：

- 所有部件打进**一张** canvas → 一个 `TextureSource`，切出来的 `Texture` 只是 `frame` 不同，Pixi 才能批处理。
- 行式装箱、**按高度降序**（不排序会浪费一半空间）。
- 帧间留 **2px gutter**，等价于 Go 版 `rectUV` 的半像素内缩，防最近邻采样串到隔壁贴图。
- `scaleMode = 'nearest'`，像素画放大 2 倍才不糊。
- 地面预渲染成一张整图；墙是共享图集 `tileWallRaised0..3`（32×64）切帧的 Sprite，放入 entityLayer 与角色按脚底 Y 共用排序。不能再烘焙成最高层整张南墙。

### 换成真美术（推荐流程）

1. 控制台执行 `__ASHEN__.dumpAtlas()`，下载 `atlas.png` + `atlas.json`。这份 JSON 就是**当前所有帧的坐标清单和命名清单**，直接当美术模板。
2. 美术按同样名字、同样尺寸覆盖 `atlas.png`（帧之间留 ≥2px 空隙，别改名字）。
3. 把两个文件放进 `public/assets/`。
4. 用 `?externalAtlas` 刷新页面：启动时显式加载 `assets/atlas.json`，完整匹配当前帧清单才使用外部美术；缺帧整体回退内置图集。

`atlas.json` 格式：

```json
{
  "meta": { "image": "atlas.png", "size": { "w": 1024, "h": 512 }, "scale": 1 },
  "frames": {
    "heroFrontBody": { "x": 2, "y": 2, "w": 32, "h": 48 }
  },
  "anims": {
    "fireball": { "frames": ["fireball_000", "fireball_001"], "fps": 12, "loop": true, "scale": 1 }
  }
}
```

也兼容 Pixi 官方格式（`"name.png": { "frame": {x,y,w,h} }`），键名的 `.png` 后缀会自动去掉。`anims` 目前只是导出参考，运行时序列帧表在 `game/data.ts` 的 `FX_ANIMS`——要改帧率/帧序改那里。

> ⚠️ 外部图集模式下 `dumpAtlas()` 会提示无需导出。想重新拿内置模板，先把 `public/assets/` 里的两个文件移走。

## 三、走路动画（最关键的一条）

**没有走路序列帧。** 角色是「3 视角静态部件贴图 + 运行时几何四肢」，鞋是 12×14、手是 8×8 独立贴图，位置由连续相位算出来。

```ts
// engine/animation.ts
WALK_STRIDE_WORLD = 26;                       // 每走 26 世界像素，相位推进 π
moved = dist(now, last);                      // 实际位移，不是输入向量
blend += (clamp(moved / dt / 50, 0, 1) - blend) * min(1, 14 * dt);
phase += moved / WALK_STRIDE_WORLD * PI;
```

`footPos` 先按当前视角取 `FOOT_ANCHORS` 对齐裤脚，再用实际位移推进的相位叠加小幅前后摆与抬脚；`handBob` 使用三档手位和较小摆幅，身体轻微起伏。不能再沿上次移动方向重排静止双脚（D22）。

**为什么相位跟位移不跟时间**（Go 版 D52 之后定下来的，踩过坑）：
- 走快走慢脚不打滑；
- 贴墙被挡住时 `moved = 0`，脚立刻停，不会原地踏步；
- 以后客户端不跑模拟、只收位置快照，动画照样对；
- `blend` 平滑过渡，起步/停步不瞬切。

所以 `renderer.ts` 的 `AvatarView` 只保存 `{last, phase, blend, dir}`，**从不读输入**，也从不写回 ECS。

### 骨架参数

`engine/animation.ts` 的 `RIG` 有三套（hero / zombie / caster）：

```ts
interface Rig {
  soleY, strideLen, liftMax, footScale,
  handAlong, handLift, handSide, armReach, handRadius, bodyBob
}
```

行尸是 `strideLen: 1.8, liftMax: 0.8`（蹭着走），玩家是 `2.8 / 1.6`（大步）。Go 版把这些放在 `rig/humanoid.json` 并支持热重载；这里收成常量，要外置就整体搬成 JSON，用「只覆盖写了的字段」的方式合并（别让缺字段变成 0）。

### 序列帧只给特效

`FX_ANIMS`（`game/data.ts`）显式列帧序，**不扫目录**；`fxFrame()` 缺帧直接抛错，否则动画「看着正常但会跳」。走路 60Hz 连续相位，特效 12~20 FPS，出手动画 0.22 秒，模拟固定 60Hz。

## 四、合成顺序与深度

一个角色是一个 `Container`，内部按 `LAYER` 常量排序：

```
影子(8) → 脚(9) → 身体(10) → 头(13) → 闪白层(14) → 武器(14) → 手(16) → 血条(29)
```

角色与角色之间 `zIndex = 世界 y`，脚底越靠下越后画（伪深度）。地面层在最下，墙体也在 entityLayer，以 `(瓦片行+1)×32` 的墙脚排序；人物站到墙前就画在墙前，墙遮住玩家时局部淡出。旧版最高层南墙做法已由 D16 替代。

`renderer.ts` 里所有 Sprite **按实体池复用**，每帧只改 `x/y/texture/tint/rotation/zIndex`。别改成每帧 `new Sprite`——Pixi 的批处理会直接失效。

## 五、受伤、出手、朝向的视觉细节

- **闪白**：复制一张和 body 同贴图的 Sprite，`blendMode='add'`，`alpha = hurtFlash * 4`，等价于 Go 版 shader 的 `vFlash` 向白插值。
- **出手**：`attackAnim` 从 0.22 秒倒数，进度用 ease-out `1-(1-t)²`，武器从 `aim - arc/2` 扫到 `aim + arc/2`；动画期间用 `swingAngle` 而不是当前鼠标角度，否则刀光会跟着甩。
- **朝向**：`facingView(angle)` 用 `|cos| > |sin|` 分界，斜着走不会频繁左右翻。朝左只 `scale.x = -1`，**绝不旋转**。
- **血条**：满血不画（一堆红条顶头上像帽子），挨打后才显示。


## 增强版帧与边界

`game/art-upgrade.ts` 为原帧补充像素细节，并通过 `upgradeSpecs` 在启动时加入同一张图集：

- `tileWallRaised0..3`：32×64 立体墙；底部落在墙脚，顶部向北投影。
- `item_<ItemId>`：40×40 背包 / 地面掉落共用图标；UI 从 CPU 图集截取 data URL，不新建 GPU 贴图。
- `staff_<SkillId>`：40×64，握把 Y=48；`missile_<SkillId>_<0..7>`：32×24，15 FPS。五系独立形状与调色板，避免用橙色火球乘蓝 tint。
- `partPropShadow` / `partGlow`：共享阴影 / 火光帧；随物件视图销毁，不烘焙进地面留下残影。

`fourDirection(angle,previous)` 只在视图里保留迟滞，不改连续 Facing.angle。手位仍是三档锚点，侧视仍是独立绘制 + 水平镜像，斗篷仍不生成。


## 内嵌法杖与像素法术

`assets/staves-generated.png` 是本次生成的五列透明原稿，顺序固定为 `SKILL_IDS`。启动时 `generated-staves.ts` 过滤透明噪点、按列裁切，以最近邻缩到 40×64，握柄对齐 Y=48；透明度二值化与 RGB 17 级距量化后，同一原稿生成 40×40 物品图标。全部切片成功才覆盖后备帧，解码失败整套保留程序化法杖。PNG 用 Vite `?inline` 内嵌，GPU 上传之前完成合成，仍只共享一个 TextureSource。更换原稿必须实际检查四方向握把和背包图标。

`PixelSpellVfx` 只读 Scene 并消费标量 `spell / ring / bolt` 事件。地面法阵进 decalLayer，粒子、结晶和闪电进 fxLayer；所有笔触使用 2×2 世界像素方块，不用平滑描边、模糊滤镜。投射物拖尾按实际位移采样。上限为 480 粒子、48 个 burst、32 条 bolt，超限回收最旧项；重开清空特效及位置缓存，暂停不推进表现时钟。

`spell-visuals.ts` 记录表现配色、容量、15 FPS 分段时钟和关键帧。`sampleVisualTrack` 区间采样与 `LEGACY_HALO` 的 26 帧光环时序迁自可确认的旧《圣剑联盟》源码，详见 [来源说明](../src/game/assets/README.md)。它们不参与伤害、冷却或模拟 RNG；不能在特效更新里扣血或写组件。外部图集必须同时匹配帧名与尺寸，旧 32×48 法杖图集不能套用新握把。


## 手脚与装备对位（D22）

`FOOT_ANCHORS` 按静态裤脚中心记录 front / back / side 两个落脚点。`footPos` 在锚点上叠加小幅步态，不能再沿上一次移动向量旋转双脚；原地转身时鞋子也必须换到当前视角。鞋保持原尺寸，鞋底锚点 Y=13/14；侧视 X=4.5/12 对齐靴筒，前 / 背视 X=1/2。近侧鞋放在 body 之上覆盖裤腿，侧视远脚保留在身后。

手掌取消 0.65 缩放，使用六像素宽的手掌与袖口，三档锚点的内侧与躯干相接；摆幅收小，持械手盖住武器握点。背包的 128×160 CPU 角色预览复用 `footRest / handRest / shoeSpriteName`，每次 inventory revision 更新真实鞋材质，不能只画一次身体后永远保留开局皮靴。

篮球素材：`summon_0..5` 是 48×48、透明、脚底锚点的用户视频切帧，按原始非等间隔时长循环；世界缩放 0.66，使召唤物约为玩家身高一半。`kunGlyph` 是新生成原稿归一化后的 32×32 像素“坤”字，每次爆炸散开 18 枚，复用最多 160 个 Sprite。所有帧在上传 GPU 前合入同一图集，来源见 [SUMMON.md](SUMMON.md)。


## 古树林地与职业栏

`grove-trees.png` 是程序规范化的 416×352 透明素材：左侧 96×128 为普通树，右侧 320×352 为巨树。原始生图在 `assets/source/trees-generated.png`，使用最近邻、硬透明和 17 级距色阶。`mage-icons.png` 为三枚 64×64 图标，原稿与规范化工具一起保留；普通 npm build 直接使用已处理素材，不需要 Playwright。

树以 `(h-2)/h` 底部锚点对齐世界树根，碰撞只占树干；巨树和祭坛不参与破坏，普通树仍可掉落古木。树冠遮挡按各帧真实宽高淡出，不能把巨树烘焙到地面最上层。

电场只画电弧与地面电网；大招才显示 5 个固定复用的电球 Sprite，同时后方不断生成独立电球投射物。波列的五次命中事件按段播放，起手环不额外画成第六道震荡。`MageVfx` 的 burst / 粒子上限 48 / 256，全部清理和显示时钟留在表现层。

职业按钮用生图图标的 CPU 截帧 data URL，世界仍只上传一张图集。冷却外圈为 SVG，读取 `remaining / cooldown` 设置 dashoffset，满环即就绪；图标不自带时间和定时器。Q 电场、F 震荡、R 天幕，辅助键用文字按钮。祭坛恢复原区域镜头：桌面 zoom=2、窄屏 1.75，跟随玩家位置，不做林地专用前移。


## 五系技能图标与大招

新增 `skill_<ember|frost|ward|blink>_<field|wave|barrage>` 十二枚 64×64；雷电保留 skill_field / skill_wave / skill_barrage。四列三行原稿由 prepare-staff-icons.cjs 经 Canvas 最近邻、硬透明和 17 色阶规范化为 staff-icons.png。staff-art.ts 先合并 CPU atlas，再上传 GPU；artFlameLance=48×20、artMeteor=48×72，为程序化像素帧。原稿保留 source，运行包只内嵌小图。

staff-arts-vfx.ts 分层绘制火环 / 陨火、冰晶暴雪、六柱星辉和黑洞坍缩，池上限 burst64、粒子384。陨石 Sprite 的高度由模拟落地延迟只读投影；星弹追踪和飞刃回旋由模拟决定方向，拖尾不参与碰撞。技能与使用、背包等按钮保留各自圆形轮廓，去除整体大底框。


## 程序化圣域与模块化方块旅人

本次用户要求覆盖 D8 / D22 的玩家悬浮手脚方案，怪物保持旧实现。block-rig.ts 提供纯数据部件姿态，block-avatar.ts 复用 Sprite，UI 预览直接调用同一 blockPose。block_<part>_<material>_<front|back|side>：head24×24、body24×20、arm6×17、hand6×6、leg8×14、boot10×9。臂端与手、腿端与鞋、手与武器共用挂点；步态仍只读取实际位移，正背侧独立、左向镜像。套装颜色在 armor.ts，新增材质不应复制新骨架。

sanctuary-art.ts 生成 96×128 普通树、320×352 神树（由 groveSpecs 调用）、544×864 教堂屋面和480×704 内部地面；屋顶覆盖真实480×704占地，外部 alpha=1，内部目标 .035。主屋面在 FX 之上以遮住内部特效；floor 和内部实体仅入内可见。北 / 南门都是实际碰撞开口，屋顶不作为碰撞。完整建筑由双塔、中央尖塔、横翼、天窗、飞扶壁、玫瑰窗和门廊构成；内部家具各自按脚底深度排序。

生成树图不再被运行包引用，原稿仅保留为历史参考。程序化树、教堂、NPC 和玩家部件仍在启动时合入同一 TextureSource；场景地面烘焙沿用既有独立纹理，不逐个物体上传。


## 魔域镰刀、月弧弯刃和烬皇炎剑

三件生成原稿保留于 assets/source，运行只内嵌 blade-weapons.png 与 blade-icons.png。prepare-blade-art.cjs 以浏览器 Canvas 裁透明边、最近邻缩放、硬透明和17级距量化，握点由 weapon-data.ts 统一提供：镰刀72×96 / (22,74)，弯刃40×56 / (13,45)，大剑48×88 / (24,70)。待机镰刀竖持，攻击再跟随方向；不能把放大整个 Sprite 当成加厚刀刃。背包图标也来自同一规范化素材。

六个技能图标64×64，以 skill_<scythe|greatsword>_<field|wave|barrage> 命名，读取真实冷却环。按用户最新要求，魔爪 / 地刺 / 法阵 / 旋风 / 冲击环改为生成素材，再由 prepare-scythe-vfx.cjs 最近邻规范化到 scythe-vfx.png（576×448），布局见 scythe-vfx-frames.json。魔爪6帧96×128、地刺5帧48×80，按模拟预兆时间选帧，出土前隐藏。每个 rift 都有自己的眼纹符文法阵与地裂；40组池化的圆阵 / 裂纹 Sprite 共用原图集，避免每帧重画17套复杂 Graphics。BladeVfx 的风暴虚影、流焰三斩、火焰护体和粒子只读状态；burst64、粒子320、虚影镰刀3、连斩残影3，上限不随反复施法增长。

造型参考、原稿与处理元数据见 assets/README.md 和 source/blade-normalization.json；没有把网上参考图片作为游戏贴图。


## 炎剑生成特效与圣域重像素化（最新）

flame-vfx.png包含六帧96×80焰潮、三种128×128重斩、三帧128×128炎躯；BladeVfx固定6个斩光Sprite与1个护体Sprite，火焰伤害仍由模拟负责。护体留空中心，不能遮住人物；三斩的挥剑残影保留真实武器图。神树 / 祭坛为新生成素材，普通树和教堂仍程序绘制，这替代前文对所有树的旧限定。

sanctuary-generated.png中的神树320×352、祭坛128×96、圣使96×112和神父48×64使用更强像素处理：先绘到半分辨率，匹配32种地图色，再2倍最近邻放大。两位NPC各4帧，脚底为圣使94 / 神父60，4FPS只读站立循环；不额外上下飘动。原稿、布局JSON与prepare-flame-sanctuary.cjs一起保存，默认构建不需要Playwright。武器持握约放大18%，仅改scale并保留原grip，不更改角色骨架 / 攻击范围。


## 圣域整体重建与分层炎躯（最新）

新增4张生成原稿：sanctum-props-rebuilt、sanctum-terrain-generated、cathedral-exterior-generated、cathedral-interior-generated。prepare-sanctum-rebuild.cjs以半尺寸、46色、硬透明和2倍最近邻输出sanctum-rebuilt.png及15帧JSON，验证矩形无重叠后写出。内容包含新神树 / 祭坛、教堂屋面 / 内地面 / 四种家具、四种32×32地面、根床、花石、太阳纹镶嵌。白色连通背景仅从图像边缘剔除，保留象牙石雕。运行最后覆盖原图集，旧原稿仅存档；普通树仍程序绘制。

sanctum-ground.ts只选择显示材质，避开旧城镇、水和墙，保留碰撞 / 两个门洞；地面和低花石 / 根床随场景地面一次烘焙。神树 / 祭坛不再套partPropShadow，树根以原脚底锚点接入根床，不靠暗色椭圆假装落地。教堂保持外部隐藏NPC、进入揭顶 / 离开遮蔽的同一规则。

炎躯生成帧在CPU图集分为Back / Front：分界行86，后景放入玩家BlockAvatar根容器z1，前缘z30，头部和身体仍在中间，全部随人物按脚底排序。不能把整张护体图盖在FX顶层遮住头脸。Q每0.18秒自动挥一次，挥击动画0.16秒，五次交替挥向锁定角，各自配一波；火浪Sprite放大1.3，模拟半径56。


## 三域探索帧

`game/exploration-art.ts` 提供 landWaystone/Camp/Chest/Vista/Shrine 及 Active 帧、propBlightTree、propRuinArch 和两张区域地面帧，统一加入现有图集。脚底/深度与既有 Prop 相同，激活和完成只在 WorldView 切材质帧，不改位置或物理。腐树复用遮挡淡出；拱门是可穿越的装饰，不在视觉门洞中间加阻挡。区域地面覆盖避开墙、水、道路、室内与原神树地面。
