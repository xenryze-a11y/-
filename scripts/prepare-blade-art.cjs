/** 可选素材重建：生成原稿保持不动，Canvas 组件裁切 / 最近邻 / 17色阶 / 硬透明。 */
const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '../src/game/assets'),
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
  const page = await browser.newPage();
  const sources = Object.fromEntries(
    [
      'blades-original-generated',
      'scythe-balanced-generated',
      'blade-icons-generated',
    ].map((k) => [
      k,
      'data:image/png;base64,' +
        fs.readFileSync(root + '/source/' + k + '.png').toString('base64'),
    ]),
  );
  const result = await page.evaluate(async (sources) => {
    const decode = async (key) => {
      const im = new Image();
      im.src = sources[key];
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.width;
      c.height = im.height;
      c.getContext('2d').drawImage(im, 0, 0);
      return c;
    };
    const [original, scythe, icons] = await Promise.all([
      decode('blades-original-generated'),
      decode('scythe-balanced-generated'),
      decode('blade-icons-generated'),
    ]);
    const crisp = (c) => {
      const g = c.getContext('2d'),
        d = g.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        d.data[i + 3] = d.data[i + 3] < 100 ? 0 : 255;
        for (let k = 0; k < 3; k++)
          d.data[i + k] = Math.round(d.data[i + k] / 17) * 17;
      }
      g.putImageData(d, 0, 0);
    };
    const isolate = (src, x0, x1, largest) => {
      const c = document.createElement('canvas');
      c.width = x1 - x0;
      c.height = src.height;
      const g = c.getContext('2d');
      g.drawImage(src, x0, 0, c.width, c.height, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height),
        n = c.width * c.height,
        labels = new Int32Array(n),
        queue = new Int32Array(n);
      let best = 0,
        bestSize = 0,
        label = 0;
      if (largest) {
        for (let pos = 0; pos < n; pos++) {
          if (labels[pos] || d.data[pos * 4 + 3] < 100) continue;
          label++;
          let head = 0,
            tail = 1;
          queue[0] = pos;
          labels[pos] = label;
          while (head < tail) {
            const at = queue[head++],
              x = at % c.width,
              y = Math.floor(at / c.width);
            for (
              let yy = Math.max(0, y - 1);
              yy <= Math.min(c.height - 1, y + 1);
              yy++
            )
              for (
                let xx = Math.max(0, x - 1);
                xx <= Math.min(c.width - 1, x + 1);
                xx++
              ) {
                const next = yy * c.width + xx;
                if (!labels[next] && d.data[next * 4 + 3] >= 100) {
                  labels[next] = label;
                  queue[tail++] = next;
                }
              }
          }
          if (tail > bestSize) {
            bestSize = tail;
            best = label;
          }
        }
        for (let pos = 0; pos < n; pos++)
          if (labels[pos] !== best) d.data[pos * 4 + 3] = 0;
        g.putImageData(d, 0, 0);
      }
      let left = c.width,
        right = 0,
        top = c.height,
        bottom = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++)
          if (d.data[(y * c.width + x) * 4 + 3] >= 100) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      return { canvas: c, left, right, top, bottom };
    };
    const pieces = [
      {
        id: 'scythe',
        src: isolate(scythe, 0, scythe.width, false),
        w: 72,
        h: 96,
        gx: 22,
        gy: 74,
        f: 0.78,
      },
      {
        id: 'sabre',
        src: isolate(original, 350, 660, true),
        w: 40,
        h: 56,
        gx: 13,
        gy: 45,
        f: 0.84,
      },
      {
        id: 'greatsword',
        src: isolate(original, 660, original.width, false),
        w: 48,
        h: 88,
        gx: 24,
        gy: 70,
        f: 0.84,
      },
    ];
    const out = document.createElement('canvas');
    out.width = 160;
    out.height = 96;
    const og = out.getContext('2d');
    og.imageSmoothingEnabled = false;
    const metadata = [];
    let offset = 0;
    for (const p of pieces) {
      const s = p.src,
        sw = s.right - s.left + 1,
        sh = s.bottom - s.top + 1,
        sourceGY = s.top + Math.round(sh * p.f),
        pixels = s.canvas
          .getContext('2d')
          .getImageData(0, 0, s.canvas.width, s.canvas.height).data;
      let total = 0,
        count = 0;
      for (let x = s.left; x <= s.right; x++)
        if (pixels[(sourceGY * s.canvas.width + x) * 4 + 3] >= 150) {
          total += x;
          count++;
        }
      const sourceGX = count ? total / count : (s.left + s.right) / 2,
        scale = Math.min((p.h - 4) / sh, (p.w - 4) / sw),
        dw = Math.round(sw * scale),
        dx = Math.round(p.gx - (sourceGX - s.left) * scale),
        c = document.createElement('canvas');
      c.width = p.w;
      c.height = p.h;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(
        s.canvas,
        s.left,
        s.top,
        sw,
        sourceGY - s.top,
        dx,
        2,
        dw,
        p.gy - 2,
      );
      g.drawImage(
        s.canvas,
        s.left,
        sourceGY,
        sw,
        s.bottom - sourceGY + 1,
        dx,
        p.gy,
        dw,
        p.h - p.gy - 2,
      );
      crisp(c);
      og.drawImage(c, offset, 0);
      metadata.push({
        id: p.id,
        x: offset,
        w: p.w,
        h: p.h,
        sourceBounds: [s.left, s.top, sw, sh],
        sourceGrip: [sourceGX, sourceGY],
        targetGrip: [p.gx, p.gy],
        drawX: dx,
        drawWidth: dw,
      });
      offset += p.w;
    }
    const ic = document.createElement('canvas');
    ic.width = 128;
    ic.height = 192;
    const ig = ic.getContext('2d');
    ig.imageSmoothingEnabled = false;
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 2; col++)
        ig.drawImage(
          icons,
          (col * icons.width) / 2 + 5,
          (row * icons.height) / 3 + 5,
          icons.width / 2 - 10,
          icons.height / 3 - 10,
          col * 64,
          row * 64,
          64,
          64,
        );
    crisp(ic);
    return { weapons: out.toDataURL(), icons: ic.toDataURL(), metadata };
  }, sources);
  for (const [key, file] of [
    ['weapons', 'blade-weapons.png'],
    ['icons', 'blade-icons.png'],
  ])
    fs.writeFileSync(
      root + '/' + file,
      Buffer.from(result[key].split(',')[1], 'base64'),
    );
  fs.writeFileSync(
    root + '/source/blade-normalization.json',
    JSON.stringify(result.metadata, null, 2) + '\n',
  );
  console.log(result.metadata);
  await browser.close();
})();
