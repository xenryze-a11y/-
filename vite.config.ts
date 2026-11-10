import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 两套构建产物：
 *  - `npm run build`            → dist/，常规多 chunk ESM，适合开发/部署。
 *  - `npm run build:standalone` → dist-standalone/，把 JS/CSS 全部内联进**单个 index.html**。
 *
 * 为什么要单文件：常规产物是 `<script type="module" src=...>`，`file://` 双击打开时
 * 会被 CORS 挡住（页面卡在「正在生成图集…」）。内联后没有任何外部请求，朋友双击
 * 就能玩，不用装 Node、不用起服务器、不用 GitHub 账号。见 docs/DECISIONS.md D15。
 */
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    base: './',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
    },
    build: {
      target: 'es2022',
      outDir: standalone ? 'dist-standalone' : 'dist',
      emptyOutDir: true,
      ...(standalone
        ? {
            // PixiJS 8 会动态 import renderer 分片；不合并就会留下外部 chunk，
            // file:// 下照样加载失败。
            cssCodeSplit: false,
            assetsInlineLimit: 100_000_000,
            rollupOptions: { output: { inlineDynamicImports: true } },
          }
        : {}),
    },
    plugins: standalone ? [viteSingleFile()] : [],
  };
});
