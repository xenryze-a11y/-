/**
 * 极简 PNG 编码器（RGBA8，无依赖，只有 node:zlib）。
 * 输入是 canvas-shim 的**预乘 alpha** 像素，导出时还原为直通 alpha。
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const body = Buffer.concat([head, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([body, crc]);
}

export function encodePng(
  premultiplied: Uint8ClampedArray,
  width: number,
  height: number,
): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4,
        di = rowStart + 1 + x * 4;
      const a = premultiplied[si + 3];
      if (a === 0 || a === 255) {
        raw[di] = premultiplied[si];
        raw[di + 1] = premultiplied[si + 1];
        raw[di + 2] = premultiplied[si + 2];
        raw[di + 3] = a;
      } else {
        // 预乘 → 直通
        const k = 255 / a;
        raw[di] = Math.min(255, Math.round(premultiplied[si] * k));
        raw[di + 1] = Math.min(255, Math.round(premultiplied[si + 1] * k));
        raw[di + 2] = Math.min(255, Math.round(premultiplied[si + 2] * k));
        raw[di + 3] = a;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
