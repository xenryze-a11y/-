# 无头出图（在 Node 里生成游戏画面 PNG）

给协作者与助手用的「眼睛」：不装浏览器，也能看到游戏里到底画出了什么。

## 为什么需要它

- 类型检查与单元测试只能证明「代码自洽」，不能证明「画面正确」。
- 早期批次靠口头描述画面，结果出过 `item_rations` / `item_water` / `item_bandage
  图标全透明这种肉眼才看得见的问题（已由本工具抓出并修复）。
- 装 Chromium / Playwright 太重；本仓库选择自己实现最小 Canvas 2D。

## 用法

```bash
npm run shot -- atlas                      # 整张运行时图集
npm run shot -- field                      # 手工铺的地形块（每类瓦片都有）
npm run shot -- hero                       # 角色骨架 + 法杖 + 装备材质
npm run shot -- items                      # 所有 item_ 图标排成网格
npm run shot -- staff                      # 单帧 staff_ember
npm run shot -- dump                       # 把所有 block_* 部件帧逐张导出
npm run shot -- probe                      # 打印调试信息（shim 自检）
npm run shot -- field docs/shots/x.png     # 指定输出路径
```

默认输出到 `docs/shots/<场景>.png`。图是确定性的：同样的代码永远出同样的像素。

## 组成

| 文件 | 作用 |
| --- | --- |
| `tests/render/canvas-shim.ts` | Canvas 2D 软件实现（扫描线填充、预乘 alpha、变换栈、裁剪）、PNG 解码、`document.createElement('canvas')` 与 `Image` 全局 shim |
| `tests/render/png.ts` | PNG 编码器（RGBA8，node:zlib deflate，自带 CRC32） |
| `tests/render/shot.ts` | 复刻 `TextureAtlas.load()` 的覆盖链建图集，再按 `renderer.ts` / `block-avatar.ts` 的规则绘制各场景 |
| `tests/render/run-shot.mjs` | 入口：用 vite ssr 打包 `shot.ts` 后调用其 `render()` |

`tests/render.test.ts` 锁死语义（floor 取整、`source-atop`、`destination-out`、裁剪、
PNG 往返、以及「真实美术构建在 shim 上跑得出非空帧」的集成断言）。

## 关键约定（改渲染逻辑时必须同步）

1. **覆盖链要完整**：`buildRuntimeAtlas()` 必须依次调用
   `applyGeneratedStaves / applyBasketballAssets / applyGroveArt / applyStaffArt /
   applyGeneratedBlades / applyGeneratedScytheVfx / applyGeneratedFlameArt /
   applyGeneratedSanctuaryArt / applyRebuiltSanctumArt / applyLandscapeArt /
   applyCartoonSceneArt`——少一步就会漏掉那批生成素材，而出图看不出来。
2. **地面选帧规则**来自 `renderer.ts::syncGround`：
   `sanctumGroundFrame(x,y,tile)` → `landscapeGroundFrame(level,x,y)` → `TILE_SPRITE[tile]`，
   后两者用 `(x%4)*32 / (y%4)*32` 取 4×4 子块，并在其后调 `drawCartoonGroundEdges()`。
3. **角色骨架**来自 `blockPose(pose, eq, view, flip)`，部件按返回的 `z` 升序画，
   锚点 `p.ax/p.ay`、旋转 `p.rotation`、镜像 `p.sx` 都要照用；根节点缩放 = `(look.scale ?? 1) * 1.25`。
4. **武器**挂在 `hand1` 上，anchor y = `STAFF_FRAME.gripY / height`，
   待机旋转来自 `block-avatar.ts`（法杖正面 ≈ 0.16 rad）。

## 已知限制

- shim **不支持**：`stroke()`、`fillText()`、`measureText()`、线性渐变、阴影、
  `globalCompositeOperation` 的其它取值。用到会抛错——这是有意的，宁可失败也不出错图。
- 只覆盖**世界渲染层**。HTML HUD（状态条、背包格子）是 DOM，需要真浏览器；
  HUD 改动仍靠数据断言验证，或者用设备上的 Kair 截屏。
- 出图分辨率由场景常量决定（`hero` 为 260×420，`field` 为 1024×768），
  需要更大图就改 `shot.ts` 顶部的常量。

## 给下一位改这块的人

新增一个场景的最短路径：在 `shot.ts` 里加一个 `if (which === 'xxx') { ... save(out, c); return; }`
分支，再到 `run-shot.mjs` 的 `kind` 列表里登记名字。
