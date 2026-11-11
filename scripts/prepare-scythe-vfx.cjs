/** 可选：按用户要求将生成特效原稿用 Canvas 最近邻规范化，原稿保持不动。 */
const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '../src/game/assets'),
    b = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
  const p = await b.newPage();
  const result = await p.evaluate(
    async (urls) => {
      const ims = await Promise.all(
        urls.map(async (url) => {
          const im = new Image();
          im.src = url;
          await im.decode();
          return im;
        }),
      );
      const [claw, fx] = ims;
      const out = document.createElement('canvas');
      out.width = 576;
      out.height = 448;
      const g = out.getContext('2d');
      g.imageSmoothingEnabled = false;
      const frames = {};
      const finish = (c) => {
        const ctx = c.getContext('2d'),
          d = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i + 3] = d.data[i + 3] < 150 ? 0 : 255;
          for (let k = 0; k < 3; k++)
            d.data[i + k] = Math.round(d.data[i + k] / 17) * 17;
        }
        ctx.putImageData(d, 0, 0);
      };
      const put = (name, x, y, w, h, im, sx, sy, sw, sh, scale = 1) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const dw = Math.round(w * scale),
          dh = Math.round(h * scale);
        ctx.drawImage(
          im,
          sx,
          sy,
          sw,
          sh,
          Math.round((w - dw) / 2),
          h - dh,
          dw,
          dh,
        );
        finish(c);
        g.drawImage(c, x, y);
        frames[name] = { x, y, w, h };
      };
      for (let i = 0; i < 6; i++)
        put(
          'demonClaw_' + i,
          i * 96,
          0,
          96,
          128,
          claw,
          ((i % 3) * claw.width) / 3,
          (Math.floor(i / 3) * claw.height) / 2,
          claw.width / 3,
          ((i < 3 ? 486 : 484) * claw.height) / 1024,
        );
      const sx = fx.width / 1536,
        sy = fx.height / 1024;
      for (let i = 0; i < 5; i++) {
        const full = i === 2;
        put(
          'demonSpike_' + i,
          i * 48,
          128,
          48,
          80,
          fx,
          (full ? 0 : 512) * sx,
          (full ? 452 : 688) * sy,
          512 * sx,
          (full ? 560 : 324) * sy,
          [0.3, 0.66, 1, 0.66, 0.2][i],
        );
      }
      put(
        'eldritchCircle',
        256,
        128,
        128,
        128,
        fx,
        24 * sx,
        0,
        480 * sx,
        452 * sy,
      );
      put(
        'eldritchCracks',
        384,
        128,
        128,
        128,
        fx,
        512 * sx,
        0,
        512 * sx,
        452 * sy,
      );
      put(
        'eldritchStorm',
        0,
        256,
        192,
        192,
        fx,
        1024 * sx,
        0,
        512 * sx,
        452 * sy,
      );
      put(
        'eldritchImpact',
        192,
        256,
        128,
        128,
        fx,
        1024 * sx,
        464 * sy,
        512 * sx,
        552 * sy,
      );
      return {
        png: out.toDataURL(),
        frames,
        sourceSizes: ims.map((im) => [im.width, im.height]),
      };
    },
    ['scythe-claw-generated', 'scythe-vfx-generated'].map(
      (n) =>
        'data:image/png;base64,' +
        fs.readFileSync(root + '/source/' + n + '.png').toString('base64'),
    ),
  );
  fs.writeFileSync(
    root + '/scythe-vfx.png',
    Buffer.from(result.png.split(',')[1], 'base64'),
  );
  fs.writeFileSync(
    root + '/scythe-vfx-frames.json',
    JSON.stringify(result.frames, null, 2) + '\n',
  );
  console.log({ sourceSizes: result.sourceSizes, frames: result.frames });
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
