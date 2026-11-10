/** 与源码同步可直接分发的 HTML，禁止手工补丁构建产物。 */
import { copyFile } from 'node:fs/promises';
await copyFile('dist-standalone/index.html', '直接可以玩的 .HTML');
console.log('已更新：直接可以玩的 .HTML');
