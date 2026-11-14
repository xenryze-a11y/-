/**
 * 无头出图入口：用 vite ssr 打包 shot.ts，再调用它的 render()。
 *   node tests/render/run-shot.mjs <场景> [输出路径]
 */
import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const [, , which = 'hero', outArg] = process.argv;
const kind =
    which === 'atlas' ||
    which === 'field' ||
    which === 'probe' ||
    which === 'dump' ||
    which === 'staff' ||
    which === 'items'
      ? which
      : 'hero';
const out = outArg ?? `docs/shots/${kind}.png`;

const bundle = await build({
  configFile: false,
  logLevel: 'silent',
  root: ROOT,
  build: {
    ssr: 'tests/render/shot.ts',
    outDir: '.kair/tmp/shot',
    emptyOutDir: true,
    rollupOptions: { output: { format: 'es', entryFileNames: 'shot.mjs' } },
    target: 'node20',
  },
});
const list = Array.isArray(bundle?.output) ? bundle.output : null;
const entry = list && list.length ? list[0].fileName : null;
if (!entry) throw new Error('截图入口打包失败');

const { render } = await import(resolve(ROOT, '.kair/tmp/shot/', entry));
await render(kind, out);
