# 增强版验证记录

## 本地命令

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run export:standalone
```

类型检查、16 项无浏览器回归、常规构建、单文件构建均通过。「直接可以玩的 .HTML」与 `dist-standalone/index.html` 逐字节相同，由导出脚本复制，无手工产物补丁。lockfile 只把 registry.npmmirror.com 下载地址替换为官方 registry.npmjs.org，版本与 integrity 哈希保持不变。

## 浏览器流程

使用 Chromium + Playwright 在生产预览上验证，并实际检查了开发版画面：

- 桌面 1440×900：菜单暂停、E 背包暂停、右键拆分、材料入格、合成取出、堆叠回收、铁靴换装、数字 / 滚轮切快捷栏、静止翻滚。
- 对 renderer.sync 前后的组件 / 位置 / 世界时间做 JSON 对比，数据完全一致，渲染没有写回 ECS。
- 玩家位于墙后时，局部墙透明度约 0.22；移到墙前恢复约 1.0，角色脚底深度大于墙脚深度。
- 触屏 390×844 / 844×390：快捷栏点选、冰霜技能、背包拆分与放置、关包返还鼠标堆栈、横屏双栏布局无横向溢出。
- 单文件独立文档在网络禁用时启动并打开 36 格背包，HTTP(S) 外部请求为 0。

受管测试浏览器禁止 `file://`，所以离线用独立内嵌文档验证，未声称直接通过双击测试。文件不含外部 JS/CSS 依赖；离线分发仍建议使用现代支持 WebGL 的浏览器。

## 自动回归覆盖

`tests/simulation.test.ts`：堆栈守恒、满包与手持物品、合成扣料 / 满堆拒绝、装备减伤 / 无敌帧、药水与补给箱原子操作、supercover 视线、近战穿墙防护、发射点与高速扫掠、爆炸视线、连锁闪电、冻结 / 护盾 / 独立冷却、闪烁 / 雷暴生命周期、物件移除碰撞与掉落、满包后拾取、线性半推 / 静止翻滚 / 四方向迟滞、AI 绕墙。

截图见 README 的 `docs/screenshot.png`。规则入口见 `items.ts`、`inventory.ts` 与 `systems/magic.ts`；架构取舍见 D15–D19。
