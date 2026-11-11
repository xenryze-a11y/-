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
