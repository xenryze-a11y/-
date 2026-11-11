# 法杖素材与旧项目适配来源

## 本次法杖原稿

`staves-generated.png` 是按用户本次“生图翻新法杖、保持像素风”请求生成的透明原稿，1983×793 RGBA。原稿保留不改；五列依次为余烬、霜晶、风暴、星辉、虚空。生成方向：中古奇幻像素装备，直立完整杖身，火焰 / 雪晶 / 雷电叉 / 翡翠光环 / 黑曜石月牙五种杖头，无人物、无文字、无背景。

运行处理在 `../generated-staves.ts`：按列排除低透明噪点、最近邻缩放、握柄分段对齐、硬透明和 RGB 色阶量化，再合入 `staff_*` 与 `item_*`。原稿用 `?inline` 编译内嵌，不使用生成服务 URL，也不增加运行时网络请求。原稿不是人物四方向切图；角色仍用现有独立正 / 背 / 侧视部件及左向镜像。

## 已确认的旧技能代码

来源仓库：[xenryze-a11y/demo](https://github.com/xenryze-a11y/demo)，`gh-pages` 分支，固定提交 `02856f09415250282da81b005fa3c9c333e0e36c`。该提交网页标题为《圣剑联盟 · 实机交互复刻 Demo》。这里只读参考，未向旧仓库写入任何代码。

- [src/native-rig.js](https://github.com/xenryze-a11y/demo/blob/02856f09415250282da81b005fa3c9c333e0e36c/src/native-rig.js) 中 `nativeSample`：适配为 `../spell-visuals.ts` 的 `sampleVisualTrack`，保留帧区间查找、线性补间、禁用补间和边界钳制；去掉骨骼、图片路径与其余变换字段。
- [src/native-effects.js](https://github.com/xenryze-a11y/demo/blob/02856f09415250282da81b005fa3c9c333e0e36c/src/native-effects.js) 的 `skill20101_add / sgskill_h`：26 帧循环，frame 0→25 缩放 0.8→1.1、透明度 255→0。适配为 `LEGACY_HALO`，用于雷暴呼吸环及扩散环透明度；本游戏重新绘制符文和像素形状。

没有复制旧项目的角色图片、技能图片或整套战斗系统。用户描述的“魔女主角、四方向行走、技能切图”的 RPG 尚未在目前可访问的仓库 / 分支中确认；不把上述《圣剑联盟》误标为该游戏。


## 篮球召唤素材

`summon-dance.png` 来自用户本轮上传视频的一个完整循环，六帧透明切片；`kun-generated.png` 为本轮按用户要求新生成的像素“坤”字原稿。切帧时间、命令、来源哈希与游戏播放约定见 [docs/SUMMON.md](../../../docs/SUMMON.md)。两者用 `?inline` 内嵌并合入同一图集，不加载视频、不播放录屏音轨。


## 古树和雷电职业图标

`source/trees-generated.png`、`source/mage-icons-generated.png` 为本轮新生成的像素原稿，分别包含普通 / 巨大古树与电场 / 五段震荡 / 连射环绕大招三图标。没有使用游戏品牌 Logo 或下载现成技能图片。`grove-trees.png`、`mage-icons.png` 是供运行时内嵌的小图；生成原稿不进入运行包。规范化脚本为 `scripts/prepare-grove-art.cjs`，使用浏览器 Canvas 最近邻缩放、硬透明与限制色阶；默认构建不依赖该脚本。内容与切片约定见 [STORM_MAGE.md](../../../docs/STORM_MAGE.md)。

## 四系十二技能图标

`source/all-staff-icons-generated.png` 是新生成的 1448×1086 像素原稿，列为 ember / frost / ward / blink，行为 Q / F / R。`scripts/prepare-staff-icons.cjs` 通过浏览器 Canvas 最近邻、硬透明和 17 级距量化得到 `staff-icons.png`（256×192）。原稿不进运行包；图标在 `staff-art.ts` 合入唯一图集，十二帧与原雷电三帧共组成十五技能。未声称来自尚未确认的魔女 RPG。

## 当前树与圣域改为程序绘制

按用户最新要求，普通树和神树不再使用 grove-trees.png。该小图与 source/trees-generated.png 仅保留历史参考，运行包不导入它们。sanctuary-art.ts 提供树、哥特教堂、圣使、神父和家具的程序化像素绘制；block-art.ts 按材质生成四方向装备部件，无新增生图素材。grove-art.ts 的内嵌加载仅保留原雷电职业图标。


## 三件兵器与六枚技能图标（2026-11-11）

source/blades-original-generated.png 是透明三武器原稿，本次仅取弯刃与火焰大剑。source/scythe-balanced-generated.png 是用户指出初版不协调后重新生成的独立镰刀原稿；被否定的过宽版本未入库。source/blade-icons-generated.png 为2列×3行：左列风暴 / 魔爪 / 地刺，右列焰潮 / 三斩 / 炎躯，全部原创生成。

造型研究实际查看了 [Jonathan Kirtz 的 Darksiders 2 武器进阶展示](https://www.jkirtz.com/darksiders-2-gallery) 与 [Dead Cells: Return to Castlevania 实机评测中的镰刀截图](https://www.consolecreatures.com/review-dead-cells-return-to-castlevania/)。仅参考长柄、连续渐细月牙刃和小尺寸可读轮廓；没有复制或打包网页图片，没有把参考图作为生成输入。

scripts/prepare-blade-art.cjs 使用浏览器 Canvas：裁掉透明边、弯刃取最大连通alpha组件以排除邻列刀尖、最近邻按握点分段对齐、alpha100门槛硬透明、RGB17级距量化。输出 blade-weapons.png（160×96）与 blade-icons.png（128×192），source/blade-normalization.json记录原始边界、源握点和目标握点，原稿保持不改。运行时 generated-blades.ts 在上传原图集前覆盖武器、物品图标、火焰4帧和6技能图标；失败保留完整程序后备。原稿不进运行包，不增加网络下载。默认构建不依赖Playwright；可选素材重建脚本需要该工具。


## 魔镰生成特效（替换程序化初版）

用户认为程序魔爪 / 地刺与法阵不好看、不明显后，新增 source/scythe-claw-generated.png 和 source/scythe-vfx-generated.png，均为1536×1024透明生成原稿，未使用网页参考图作为输入。前者3列×2行：初露 / 半升 / 张爪 / 抓握 / 回落 / 消失；后者为粗亮双圈符文阵、地裂、三刃旋风、全高与半高骨刺、冲击环。原稿保持不改。

prepare-scythe-vfx.cjs 以 Canvas 固定格裁切，魔爪各格保持同一根部基线，地刺按相位处理为五帧；最近邻、alpha150硬透明、RGB17级距量化输出 scythe-vfx.png（576×448）与 scythe-vfx-frames.json。运行前校验15帧名 / 尺寸 / 边界，整组覆盖原图集；原稿不进包，scytheVfxReady可检查解码状态，程序绘制仅为后备。符文比初版加粗提亮，预兆时基本亮度提高；独立小阵、大招总阵、地裂、旋风与冲击使用固定Sprite池，暂停 / 重开不改变伤害规则。


## 炎剑特效、NPC站立与圣域重像素化（2026-11-11最新）

source/flame-vfx-generated.png（1086×1448，3列4行）为新生成的六帧焰潮、三种流焰重斩、三帧火焰护体。source/sanctuary-npcs-generated.png（1774×887，4列2行）为圣使 / 神父各4帧站立原稿，source/sacred-grove-generated.png（1536×1024）为独立神树与祭坛。全部原创生成，没有下载现成游戏素材；原稿保持不动。

prepare-flame-sanctuary.cjs使用浏览器Canvas固定格裁切，火焰最近邻 / alpha160硬透明 / RGB17级距量化，输出flame-vfx.png（576×336）。NPC每一行共用裁切边界，保持脚底固定；NPC和地标先以半分辨率绘制，匹配32种苔绿 / 灰石 / 象牙 / 旧金地图色，再2倍最近邻放大，输出sanctuary-generated.png（512×528）。神树裁切剔除右下邻列祭坛残边。各自*-frames.json记录布局，运行前全帧尺寸校验后覆盖原图集，失败保留程序后备。旧trees-generated.png / grove-trees.png仍仅历史存档，新运行使用本节的新素材；原稿不进包。
