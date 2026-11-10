/** 复用项目已有 Vite 编译 TypeScript 测试，不要求全局 tsx / ts-node。 */
import { build } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temporary = await mkdtemp(join(tmpdir(), 'ashen-vale-tests-'));
try {
  const bundle = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: 'tests/simulation.test.ts',
      target: 'node20',
      write: false,
      minify: false,
      rollupOptions: { output: { format: 'es', inlineDynamicImports: true } },
    },
  });
  if (Array.isArray(bundle)) throw new Error('Expected a single test bundle');
  const entry = bundle.output.find(
    (output) => output.type === 'chunk' && output.isEntry,
  );
  if (!entry) throw new Error('Missing test bundle');
  const file = join(temporary, 'tests.mjs');
  await writeFile(file, entry.code);
  await import(pathToFileURL(file).href);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
