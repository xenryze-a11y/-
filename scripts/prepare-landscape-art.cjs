/** 用户要求的生图→重度像素化：保留原稿，48 色/硬透明/半尺寸采样，再最近邻两倍。 */
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
  const page = await b.newPage();
  const result = await page.evaluate(
    async (urls) => {
      const canvas = (w, h) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
      };
      const palette = [
        '1c302b',
        '293d35',
        '374b3b',
        '435b45',
        '526d4b',
        '688356',
        '83966c',
        'a2ad7d',
        'c0c498',
        '505e54',
        '334146',
        '46595b',
        '5c7170',
        '7c8d84',
        'a1aaa0',
        'c4c7b0',
        'dedbc1',
        '6e8072',
        '352d29',
        '4c3b2c',
        '655036',
        '80683f',
        '9b8050',
        'b49960',
        'cbb577',
        'e6d095',
        '634535',
        '8d9b86',
        'ae8058',
        'acb6a0',
        '25464b',
        '386069',
        '54818a',
        '79aca8',
        'b4e3cc',
        '45364d',
        '60455f',
        '7c5b80',
        'a77baf',
        'c6a4cf',
        '3a3448',
        '554b68',
        '81728f',
        'a899b4',
        'a64c2c',
        'd77836',
        'edaa4d',
        'ffdda0',
      ].map((x) => [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)));
      const ims = await Promise.all(
        urls.map(async (src) => {
          const im = new Image();
          im.src = src;
          await im.decode();
          return im;
        }),
      );
      const output = canvas(1024, 768),
        og = output.getContext('2d'),
        frames = {};
      og.imageSmoothingEnabled = false;
      let ox = 0,
        oy = 0,
        row = 0;
      const put = (name, im, col, r, cols, rows, w, h, prop) => {
        const sw = im.width / cols,
          sh = im.height / rows,
          src = canvas(Math.floor(sw), Math.floor(sh)),
          sg = src.getContext('2d');
        sg.drawImage(im, col * sw, r * sh, sw, sh, 0, 0, src.width, src.height);
        let l = 0,
          t = 0,
          rr = src.width - 1,
          bb = src.height - 1;
        if (prop) {
          const d = sg.getImageData(0, 0, src.width, src.height);
          l = src.width;
          t = src.height;
          rr = 0;
          bb = 0;
          for (let y = 0; y < src.height; y++)
            for (let x = 0; x < src.width; x++) {
              const i = (y * src.width + x) * 4;
              if (d.data[i] > 180 && d.data[i + 1] < 65 && d.data[i + 2] < 65)
                d.data[i + 3] = 0;
              if (d.data[i + 3] >= 190) {
                l = Math.min(l, x);
                t = Math.min(t, y);
                rr = Math.max(rr, x);
                bb = Math.max(bb, y);
              }
            }
          sg.putImageData(d, 0, 0);
        }
        const small = canvas(w / 2, h / 2),
          g = small.getContext('2d');
        g.imageSmoothingEnabled = false;
        const scale = Math.min(
            (small.width - 2) / (rr - l + 1),
            (small.height - 2) / (bb - t + 1),
          ),
          dw = prop ? Math.round((rr - l + 1) * scale) : small.width,
          dh = prop ? Math.round((bb - t + 1) * scale) : small.height;
        g.drawImage(
          src,
          l,
          t,
          rr - l + 1,
          bb - t + 1,
          prop ? Math.floor((small.width - dw) / 2) : 0,
          prop ? small.height - 1 - dh : 0,
          dw,
          dh,
        );
        const d = g.getImageData(0, 0, small.width, small.height);
        if (!prop) {
          const w = small.width,
            h = small.height;
          for (let k = 0; k < 5; k++) {
            const blend = (a, b) => {
              const weight = 0.5 * (1 - k / 5);
              for (let ch = 0; ch < 3; ch++) {
                const av = d.data[a + ch],
                  bv = d.data[b + ch];
                d.data[a + ch] = av * (1 - weight) + bv * weight;
                d.data[b + ch] = bv * (1 - weight) + av * weight;
              }
            };
            for (let y = 0; y < h; y++)
              blend((y * w + k) * 4, (y * w + w - 1 - k) * 4);
            for (let x = 0; x < w; x++)
              blend((k * w + x) * 4, ((h - 1 - k) * w + x) * 4);
          }
        }
        const green = [
          'terrainMeadow',
          'terrainFlowers',
          'terrainForest',
          'terrainBlight',
          'terrainTerrace',
          'propTree',
          'propBlightTree',
          'propFungus',
        ].includes(name);
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i + 3] = d.data[i + 3] < 190 ? 0 : 255;
          if (!d.data[i + 3]) continue;
          if (
            green &&
            d.data[i + 1] > d.data[i] * 0.8 &&
            d.data[i + 1] > d.data[i + 2] * 1.22
          ) {
            d.data[i] *= 0.72;
            d.data[i + 1] *= 1.06;
          }
          let best = 1e9,
            color = palette[0];
          for (const p of palette) {
            const delta =
              (d.data[i] - p[0]) ** 2 +
              (d.data[i + 1] - p[1]) ** 2 +
              (d.data[i + 2] - p[2]) ** 2;
            if (delta < best) {
              best = delta;
              color = p;
            }
          }
          for (let k = 0; k < 3; k++) d.data[i + k] = color[k];
        }
        g.putImageData(d, 0, 0);
        if (ox + w > 1024) {
          ox = 0;
          oy += row + 2;
          row = 0;
        }
        og.drawImage(small, 0, 0, small.width, small.height, ox, oy, w, h);
        frames[name] = { x: ox, y: oy, w, h };
        ox += w + 2;
        row = Math.max(row, h);
      };
      const props = [
        ['landWaystone', 64, 88],
        ['landCamp', 64, 64],
        ['landChest', 64, 64],
        ['landVista', 80, 80],
        ['landShrine', 64, 88],
        ['propBlightTree', 96, 128],
        ['propRuinArch', 80, 112],
        ['propRuinPillar', 64, 96],
        ['propTree', 96, 128],
        ['propDeadTree', 96, 128],
        ['propFungus', 64, 48],
        ['propRuinChapel', 112, 144],
      ];
      props.forEach(([name, w, h], i) =>
        put(name, ims[0], i % 4, Math.floor(i / 4), 4, 3, w, h, true),
      );
      const grounds = [
        'terrainMeadow',
        'terrainEarth',
        'terrainFlowers',
        'terrainWater',
        'terrainForest',
        'terrainRoots',
        'terrainBlight',
        'terrainMud',
        'terrainRuin',
        'terrainSacred',
        'terrainRubble',
        'terrainTrail',
        'terrainCliff',
        'terrainCliffDark',
        'terrainStairs',
        'terrainTerrace',
      ];
      grounds.forEach((name, i) =>
        put(name, ims[1], i % 4, Math.floor(i / 4), 4, 4, 128, 128, false),
      );
      const crop = canvas(1024, oy + row),
        cg = crop.getContext('2d');
      cg.drawImage(output, 0, 0);
      return {
        png: crop.toDataURL(),
        frames,
        palette: palette.length,
        sourceSizes: ims.map((im) => [im.width, im.height]),
      };
    },
    ['landscape-props-generated.png', 'landscape-ground-generated.png'].map(
      (f) =>
        'data:image/png;base64,' +
        fs.readFileSync(root + '/source/' + f).toString('base64'),
    ),
  );
  fs.writeFileSync(
    root + '/landscape-pixel.png',
    Buffer.from(result.png.split(',')[1], 'base64'),
  );
  fs.writeFileSync(
    root + '/landscape-pixel-frames.json',
    JSON.stringify(result.frames, null, 2) + '\n',
  );
  console.log({
    frames: Object.keys(result.frames).length,
    palette: result.palette,
    sourceSizes: result.sourceSizes,
  });
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
