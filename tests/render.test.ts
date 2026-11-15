/**
 * 无头 Canvas shim 与 PNG 编解码的回归测试。
 *
 * 存在的意义：出图工具是「协作者的眼睛」。shim 一旦在某个 API 上静默出错，
 * 生成的画面会看起来正常但内容是错的——比不出图更糟。所以这里锁死每个 API
 * 的语义，尤其是与浏览器实现容易混淆的几处（floor vs round、预乘 alpha、
 * source-atop / destination-out）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShimCanvas,
  ShimImage,
  installShim,
  type PixelSource,
} from './render/canvas-shim';
import { encodePng } from './render/png';

installShim();

function make(w = 8, h = 8): { c: ShimCanvas; g: CanvasRenderingContext2D } {
  const c = new ShimCanvas();
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') as unknown as CanvasRenderingContext2D };
}

/** 统计不透明像素个数。 */
function opaque(c: ShimCanvas): number {
  let n = 0;
  for (let i = 3; i < c.data.length; i += 4) if (c.data[i] > 0) n++;
  return n;
}

test('fillRect 落在整数格上（floor 语义）', () => {
  const { c, g } = make();
  g.fillStyle = '#00ff00';
  g.fillRect(2, 2, 4, 4);
  assert.equal(opaque(c), 16);
  // (2,2) 起，不含 (6,*)
  const at = (x: number, y: number) => (y * 8 + x) * 4;
  assert.equal(c.data[at(1, 2) + 3], 0);
  assert.equal(c.data[at(2, 2) + 3], 255);
  assert.equal(c.data[at(5, 5) + 3], 255);
  assert.equal(c.data[at(6, 5) + 3], 0);
});

test('translate 后再 fillRect：设备坐标 = floor(user + offset)', () => {
  const { c, g } = make();
  g.fillStyle = '#ffffff';
  g.translate(3, 3);
  g.fillRect(0, 0, 2, 2);
  assert.equal(opaque(c), 4);
  const at = (x: number, y: number) => (y * 8 + x) * 4;
  assert.equal(c.data[at(3, 3) + 3], 255);
  assert.equal(c.data[at(4, 4) + 3], 255);
  assert.equal(c.data[at(2, 3) + 3], 0);
  assert.equal(c.data[at(5, 3) + 3], 0);
});

test('clearRect 把像素归零', () => {
  const { c, g } = make();
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 8, 8);
  g.clearRect(2, 2, 3, 3);
  assert.equal(opaque(c), 64 - 9);
});

test('globalAlpha 混合到源色上', () => {
  const { c, g } = make();
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 8, 8);
  g.globalAlpha = 0.5;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 2, 2);
  const at = (x: number, y: number) => (y * 8 + x) * 4;
  // 半黑叠在白底上 → 约 128 灰，alpha 仍 255
  assert.equal(c.data[at(0, 0) + 3], 255);
  assert.ok(Math.abs(c.data[at(0, 0)] - 128) <= 1, `got ${c.data[at(0, 0)]}`);
});

test('source-atop 只画在已有像素上', () => {
  const { c, g } = make();
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 4, 4); // 只有左上 4×4 有内容
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#ff0000';
  g.fillRect(0, 0, 8, 8);
  const at = (x: number, y: number) => (y * 8 + x) * 4;
  assert.equal(c.data[at(0, 0)], 255); // 红
  assert.equal(c.data[at(0, 0) + 1], 0);
  assert.equal(c.data[at(7, 7) + 3], 0); // 空白处仍空
});

test('destination-out 按源 alpha 擦除', () => {
  const { c, g } = make();
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 8, 8);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 2, 2);
  const at = (x: number, y: number) => (y * 8 + x) * 4;
  assert.equal(c.data[at(0, 0) + 3], 0);
  assert.equal(c.data[at(4, 4) + 3], 255);
});

test('drawImage 9 参切片拷贝', () => {
  const src = new ShimCanvas();
  src.width = 4;
  src.height = 4;
  const sg = src.getContext('2d');
  sg.fillStyle = '#123456';
  sg.fillRect(0, 0, 4, 4);

  const { c, g } = make();
  g.drawImage(src, 1, 1, 2, 2, 2, 2, 2, 2);
  const at = (x: number, y: number) => (y * 8 + x) * 4;
  assert.equal(c.data[at(2, 2)], 0x12);
  assert.equal(c.data[at(3, 3) + 3], 255);
  assert.equal(c.data[at(1, 2) + 3], 0);
});

test('drawImage 带变换时走逆变换路径', () => {
  const src = new ShimCanvas();
  src.width = 4;
  src.height = 4;
  const sg = src.getContext('2d');
  sg.fillStyle = '#abcdef';
  sg.fillRect(0, 0, 4, 4);

  const { c, g } = make();
  g.save();
  g.translate(2, 2);
  g.drawImage(src, 0, 0, 4, 4, 0, 0, 4, 4);
  g.restore();
  const at = (x: number, y: number) => (y * 8 + x) * 4;
  assert.equal(c.data[at(2, 2)], 0xab);
  assert.equal(c.data[at(5, 5) + 3], 255);
  assert.equal(c.data[at(1, 2) + 3], 0);
});

test('save/restore 完整还原状态', () => {
  const { g } = make();
  g.fillStyle = '#ffffff';
  g.translate(1, 1);
  g.save();
  g.fillStyle = '#ff0000';
  g.translate(2, 2);
  g.restore();
  assert.equal(g.fillStyle, '#ffffff');
  g.fillRect(0, 0, 1, 1); // 应画在 (1,1)
  const c = (g as unknown as { canvas: ShimCanvas }).canvas;
  const at = (x: number, y: number) => (y * 8 + x) * 4;
  assert.equal(c.data[at(1, 1) + 3], 255);
  assert.equal(c.data[at(0, 0) + 3], 0);
});

test('clip 限制后续填充范围', () => {
  const { c, g } = make();
  g.beginPath();
  g.rect(0, 0, 4, 4);
  g.clip();
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 8, 8);
  assert.equal(opaque(c), 16);
});

test('arc + fill 画出实心圆', () => {
  const { c, g } = make(32, 32);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(16, 16, 12, 0, Math.PI * 2);
  g.fill();
  const at = (x: number, y: number) => (y * 32 + x) * 4;
  assert.ok(c.data[at(16, 16) + 3] === 255, '圆心应实');
  assert.equal(c.data[at(2, 2) + 3], 0, '远离圆心应为空');
});

test('strokeRect 沿边框填一圈', () => {
  const { c, g } = make(20, 20);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.strokeRect(5, 5, 10, 10);
  const at = (x: number, y: number) => (y * 20 + x) * 4;
  assert.equal(c.data[at(4, 4) + 3], 255, '角点应有描边');
  assert.equal(c.data[at(4, 5) + 3], 255, '左边框应有描边');
  assert.equal(c.data[at(10, 10) + 3], 0, '内部不应被填');
});

test('createRadialGradient 插值颜色', () => {
  const { c, g } = make(10, 10);
  // 圆心放在像素中心 (4.5,4.5)，避免采样点偏移。
  const grad = g.createRadialGradient(4.5, 4.5, 0, 4.5, 4.5, 5);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 10, 10);
  const at = (x: number, y: number) => (y * 10 + x) * 4;
  assert.equal(c.data[at(4, 4)], 255, '中心应为白');
  const edge = c.data[at(9, 9)];
  assert.ok(edge < 40, `边缘应接近黑，实际 ${edge}`);
});

test('getImageData / putImageData 往返', () => {
  const a = make(4, 4);
  a.g.fillStyle = '#336699';
  a.g.fillRect(0, 0, 4, 4);
  const img = a.g.getImageData(1, 1, 2, 2);
  assert.equal(img.width, 2);
  assert.deepEqual(
    [...img.data.slice(0, 4)],
    [0x33, 0x66, 0x99, 255],
  );
  const b = make(4, 4);
  b.g.putImageData(img, 2, 2);
  const at = (x: number, y: number) => (y * 4 + x) * 4;
  assert.equal(b.c.data[at(2, 2)], 0x33);
  assert.equal(b.c.data[at(0, 0) + 3], 0);
});

test('PNG 编码 → ShimImage 解码 像素一致', () => {
  const { c, g } = make(16, 16);
  // 含半透明与不透明两种像素，验证预乘往返不串色。
  g.fillStyle = '#ff0000';
  g.fillRect(0, 0, 8, 16);
  g.globalAlpha = 0.5;
  g.fillStyle = '#0000ff';
  g.fillRect(8, 0, 8, 16);
  const png = encodePng(c.data, c.width, c.height);
  assert.equal(png.readUInt32BE(0), 0x89504e47, 'PNG 魔数');

  const url =
    'data:image/png;base64,' + png.toString('base64');
  const img = new ShimImage();
  img.src = url;
  assert.equal(img.width, 16);
  assert.equal(img.height, 16);
  const at = (x: number, y: number) => (y * 16 + x) * 4;
  assert.equal(img.data[at(0, 0)], 255, '红通道');
  assert.equal(img.data[at(0, 0) + 3], 255);
  // 半透蓝叠在空底上：直通 alpha≈128；shim 内部存预乘，所以蓝通道也≈128。
  assert.ok(Math.abs(img.data[at(12, 8) + 3] - 128) <= 1);
  assert.ok(Math.abs(img.data[at(12, 8) + 2] - 128) <= 2);
});

test('未知 API 抛错而不是静默出错', () => {
  const { g } = make();
  assert.throws(() => g.fillText('x', 0, 0), /未实现/);
  assert.throws(() => g.stroke(), /未实现/);
});

test('ShimCanvas 尺寸 setter 生效', () => {
  const c = new ShimCanvas();
  c.width = 10;
  c.height = 20;
  assert.equal(c.width, 10);
  assert.equal(c.height, 20);
  assert.equal(c.data.length, 10 * 20 * 4);
});

test('installShim 装好 document.createElement("canvas")', () => {
  const c = document.createElement('canvas') as unknown as ShimCanvas;
  assert.ok(c instanceof ShimCanvas);
});

// ── 集成：shim 能跑真实的美术构建代码（不静默出错） ─────────────────
test('buildProceduralAtlas 在 shim 上产出非空帧', async () => {
  const { buildProceduralAtlas } = await import('../src/engine/art');
  const built = buildProceduralAtlas();
  for (const name of [
    'block_head_iron_side',
    'block_body_leather_front',
    'staff_ember',
    'terrainMeadow',
    'partShadow',
  ])
    assert.ok(built.frames[name], `缺帧 ${name}`);

  // 逐帧校验：边界内、尺寸为正。
  const empty: string[] = [];
  for (const [name, f] of Object.entries(built.frames)) {
    assert.ok(f.w > 0 && f.h > 0, `${name} 尺寸异常`);
    assert.ok(
      f.x >= 0 && f.y >= 0 && f.x + f.w <= built.canvas.width,
      `${name} 越界`,
    );
    let opaqueCount = 0;
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const i = ((f.y + y) * built.canvas.width + (f.x + x)) * 4;
        if (built.canvas.data[i + 3] > 0) opaqueCount++;
      }
    if (!opaqueCount) empty.push(name);
  }
  // 空帧说明该贴图在浏览器里同样不可见（真实 bug，不是 shim 差异）。
  console.info('[render] 全透明帧:', empty.join(', ') || '(无)');
  assert.deepEqual(empty, [], '存在全透明帧');
});
