# 法杖素材与旧项目适配来源

## 本次法杖原稿

`staves-generated.png` 是按用户本次“生图翻新法杖、保持像素风”请求生成的透明原稿，1983×793 RGBA。原稿保留不改；五列依次为余烬、霜晶、风暴、星辉、虚空。生成方向：中古奇幻像素装备，直立完整杖身，火焰 / 雪晶 / 雷电叉 / 翡翠光环 / 黑曜石月牙五种杖头，无人物、无文字、无背景。

运行处理在 `../generated-staves.ts`：按列排除低透明噪点、最近邻缩放、握柄分段对齐、硬透明和 RGB 色阶量化，再合入 `staff_*` 与 `item_*`。原稿用 `?inline` 编译内嵌，不使用生成服务 URL，也不增加运行时网络请求。原稿不是人物四方向切图；角色仍用现有独立正 / 背 / 侧视部件及左向镜像。

## 已确认的旧技能代码

来源仓库：[xenryze-a11y/demo](https://github.com/xenryze-a11y/demo)，`gh-pages` 分支，固定提交 `02856f09415250282da81b005fa3c9c333e0e36c`。该提交网页标题为《圣剑联盟 · 实机交互复刻 Demo》。这里只读参考，未向旧仓库写入任何代码。

- [src/native-rig.js](https://github.com/xenryze-a11y/demo/blob/02856f09415250282da81b005fa3c9c333e0e36c/src/native-rig.js) 中 `nativeSample`：适配为 `../spell-visuals.ts` 的 `sampleVisualTrack`，保留帧区间查找、线性补间、禁用补间和边界钳制；去掉骨骼、图片路径与其余变换字段。
- [src/native-effects.js](https://github.com/xenryze-a11y/demo/blob/02856f09415250282da81b005fa3c9c333e0e36c/src/native-effects.js) 的 `skill20101_add / sgskill_h`：26 帧循环，frame 0→25 缩放 0.8→1.1、透明度 255→0。适配为 `LEGACY_HALO`，用于雷暴呼吸环及扩散环透明度；本游戏重新绘制符文和像素形状。

没有复制旧项目的角色图片、技能图片或整套战斗系统。用户描述的“魔女主角、四方向行走、技能切图”的 RPG 尚未在目前可访问的仓库 / 分支中确认；不把上述《圣剑联盟》误标为该游戏。
