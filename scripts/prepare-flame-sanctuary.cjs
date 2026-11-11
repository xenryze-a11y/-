/** 生成原稿保持不动：特效最近邻，人物 / 地标先减半分辨率，再2倍硬像素放大。 */
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
      const [flame, npcs, grove] = ims;
      const palette = [
        '#25382f',
        '#34483c',
        '#435b45',
        '#4e704c',
        '#617d55',
        '#77915f',
        '#8caa72',
        '#adbb85',
        '#c6ce9a',
        '#3b4441',
        '#505e54',
        '#6e8072',
        '#8d9b86',
        '#acb6a0',
        '#c3c6ac',
        '#ded8af',
        '#ede4c1',
        '#574c34',
        '#79653f',
        '#99834e',
        '#b29a5c',
        '#c4ac68',
        '#ddc17c',
        '#efdaa1',
        '#74533d',
        '#9f7651',
        '#bd986c',
        '#d7b38b',
        '#e8c69d',
        '#493b31',
        '#675240',
        '#8d704e',
      ].map((s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)));
      const canvas = (w, h) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
      };
      const hard = (c, limited = false) => {
        const g = c.getContext('2d'),
          d = g.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i + 3] = d.data[i + 3] < 160 ? 0 : 255;
          if (!d.data[i + 3]) continue;
          if (limited) {
            let nearest = palette[0],
              best = Infinity;
            for (const q of palette) {
              const delta =
                (d.data[i] - q[0]) ** 2 +
                (d.data[i + 1] - q[1]) ** 2 +
                (d.data[i + 2] - q[2]) ** 2;
              if (delta < best) {
                best = delta;
                nearest = q;
              }
            }
            for (let k = 0; k < 3; k++) d.data[i + k] = nearest[k];
          } else
            for (let k = 0; k < 3; k++)
              d.data[i + k] = Math.round(d.data[i + k] / 17) * 17;
        }
        g.putImageData(d, 0, 0);
      };
      const crop = (im, x, y, w, h) => {
        const c = canvas(Math.ceil(w), Math.ceil(h)),
          g = c.getContext('2d');
        g.drawImage(im, x, y, w, h, 0, 0, c.width, c.height);
        hard(c);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let l = c.width,
          r = 0,
          t = c.height,
          bot = 0;
        for (let yy = 0; yy < c.height; yy++)
          for (let xx = 0; xx < c.width; xx++)
            if (d[(yy * c.width + xx) * 4 + 3]) {
              l = Math.min(l, xx);
              r = Math.max(r, xx);
              t = Math.min(t, yy);
              bot = Math.max(bot, yy);
            }
        return { c, l, r, t, b: bot };
      };
      const fx = canvas(576, 336),
        fg = fx.getContext('2d'),
        ff = {};
      fg.imageSmoothingEnabled = false;
      const put = (name, x, y, w, h, sx, sy, sw, sh) => {
        const c = canvas(w, h),
          g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(flame, sx, sy, sw, sh, 2, 2, w - 4, h - 4);
        hard(c);
        fg.drawImage(c, x, y);
        ff[name] = { x, y, w, h };
      };
      for (let i = 0; i < 6; i++)
        put(
          'bladeFlameWave_' + i,
          i * 96,
          0,
          96,
          80,
          ((i % 3) * flame.width) / 3,
          (Math.floor(i / 3) * flame.height) / 4,
          flame.width / 3,
          flame.height / 4,
        );
      for (let i = 0; i < 3; i++) {
        put(
          'bladeFlameSlash_' + i,
          i * 128,
          80,
          128,
          128,
          (i * flame.width) / 3,
          flame.height / 2,
          flame.width / 3,
          flame.height / 4,
        );
        put(
          'bladeInferno_' + i,
          i * 128,
          208,
          128,
          128,
          (i * flame.width) / 3,
          (flame.height * 3) / 4,
          flame.width / 3,
          flame.height / 4,
        );
      }
      const art = canvas(512, 528),
        ag = art.getContext('2d'),
        af = {};
      ag.imageSmoothingEnabled = false;
      for (let row = 0; row < 2; row++) {
        const cells = Array.from({ length: 4 }, (_, i) =>
          crop(
            npcs,
            (i * npcs.width) / 4,
            (row * npcs.height) / 2,
            npcs.width / 4,
            npcs.height / 2,
          ),
        );
        const bounds = {
          l: Math.min(...cells.map((c) => c.l)),
          r: Math.max(...cells.map((c) => c.r)),
          t: Math.min(...cells.map((c) => c.t)),
          b: Math.max(...cells.map((c) => c.b)),
        };
        const w = row ? 48 : 96,
          h = row ? 64 : 112,
          bw = w / 2,
          bh = h / 2,
          foot = row ? 30 : 47,
          margin = 2,
          sw = bounds.r - bounds.l + 1,
          sh = bounds.b - bounds.t + 1,
          scale = Math.min((bw - margin * 2) / sw, (foot - margin) / sh),
          dw = Math.round(sw * scale),
          dh = Math.round(sh * scale);
        for (let i = 0; i < 4; i++) {
          const c = canvas(bw, bh),
            g = c.getContext('2d');
          g.imageSmoothingEnabled = false;
          g.drawImage(
            cells[i].c,
            bounds.l,
            bounds.t,
            sw,
            sh,
            Math.round((bw - dw) / 2),
            foot - dh,
            dw,
            dh,
          );
          hard(c, true);
          const x = i * w,
            y = row ? 112 : 0,
            name = (row ? 'npcPriest_' : 'npcHerald_') + i;
          ag.drawImage(c, x, y, w, h);
          af[name] = { x, y, w, h };
        }
      }
      const putCoarse = (name, rect, x, y, w, h) => {
        const s = crop(grove, ...rect);
        if (name === 'propAncientTree')
          s.c
            .getContext('2d')
            .clearRect(1000 * sx, 550 * sy, 40 * sx, 474 * sy);
        const bw = w / 2,
          bh = h / 2,
          c = canvas(bw, bh),
          g = c.getContext('2d'),
          sw = s.r - s.l + 1,
          sh = s.b - s.t + 1,
          scale = Math.min((bw - 4) / sw, (bh - 3) / sh),
          dw = Math.round(sw * scale),
          dh = Math.round(sh * scale);
        g.imageSmoothingEnabled = false;
        g.drawImage(
          s.c,
          s.l,
          s.t,
          sw,
          sh,
          Math.round((bw - dw) / 2),
          bh - 1 - dh,
          dw,
          dh,
        );
        hard(c, true);
        ag.drawImage(c, x, y, w, h);
        af[name] = { x, y, w, h };
      };
      const sx = grove.width / 1536,
        sy = grove.height / 1024;
      putCoarse(
        'propAncientTree',
        [0, 0, 1040 * sx, 1024 * sy],
        0,
        176,
        320,
        352,
      );
      putCoarse(
        'propAltar',
        [1008 * sx, 555 * sy, 528 * sx, 469 * sy],
        336,
        192,
        128,
        96,
      );
      return {
        fx: fx.toDataURL(),
        art: art.toDataURL(),
        ff,
        af,
        sizes: ims.map((im) => [im.width, im.height]),
      };
    },
    [
      'flame-vfx-generated',
      'sanctuary-npcs-generated',
      'sacred-grove-generated',
    ].map(
      (n) =>
        'data:image/png;base64,' +
        fs.readFileSync(root + '/source/' + n + '.png').toString('base64'),
    ),
  );
  for (const [key, file, frames] of [
    ['fx', 'flame-vfx', result.ff],
    ['art', 'sanctuary-generated', result.af],
  ]) {
    fs.writeFileSync(
      root + '/' + file + '.png',
      Buffer.from(result[key].split(',')[1], 'base64'),
    );
    fs.writeFileSync(
      root + '/' + file + '-frames.json',
      JSON.stringify(frames, null, 2) + '\n',
    );
  }
  console.log({
    sizes: result.sizes,
    flameFrames: result.ff,
    sanctuaryFrames: result.af,
  });
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
