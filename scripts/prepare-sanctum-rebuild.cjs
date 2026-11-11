/** 重建圣域生成图：先半尺寸 / 限色 / 硬透明，再2倍最近邻；原稿不改。 */
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
      const canvas = (w, h) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
      };
      const colors = [
        '25382f',
        '34483c',
        '435b45',
        '4e704c',
        '617d55',
        '77915f',
        '8caa72',
        'adbb85',
        'c6ce9a',
        '3b4441',
        '505e54',
        '6e8072',
        '8d9b86',
        'acb6a0',
        'c3c6ac',
        'ded8af',
        'ede4c1',
        '574c34',
        '79653f',
        '99834e',
        'b29a5c',
        'c4ac68',
        'ddc17c',
        'efdaa1',
        '74533d',
        '9f7651',
        'bd986c',
        'd7b38b',
        'e8c69d',
        '493b31',
        '675240',
        '8d704e',
        '203b3e',
        '315157',
        '48676b',
        '5f7b7d',
        '344248',
        '718d88',
        '422c35',
        '623b41',
        '80484a',
        'a36350',
        'a38256',
        'c6b487',
        '423623',
        '594529',
      ].map((s) => [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)));
      const images = await Promise.all(
        urls.map(async (url) => {
          const im = new Image();
          im.src = url;
          await im.decode();
          const c = canvas(im.width, im.height),
            g = c.getContext('2d');
          g.drawImage(im, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height),
            corner = [...d.data.slice(0, 4)];
          // 原稿的明亮连通背景只从边缘剔除，不擦除封闭的象牙石雕 / 蜡烛。
          if (corner[3] > 200 && Math.min(...corner.slice(0, 3)) > 215) {
            const n = c.width * c.height,
              seen = new Uint8Array(n),
              q = new Int32Array(n);
            let head = 0,
              tail = 0;
            const push = (i) => {
              if (i < 0 || i >= n || seen[i]) return;
              seen[i] = 1;
              const at = i * 4,
                r = d.data[at],
                gg = d.data[at + 1],
                bb = d.data[at + 2];
              if (
                Math.min(r, gg, bb) > 210 &&
                Math.max(r, gg, bb) - Math.min(r, gg, bb) < 24
              )
                q[tail++] = i;
            };
            for (let x = 0; x < c.width; x++) {
              push(x);
              push((c.height - 1) * c.width + x);
            }
            for (let y = 0; y < c.height; y++) {
              push(y * c.width);
              push(y * c.width + c.width - 1);
            }
            while (head < tail) {
              const i = q[head++];
              d.data[i * 4 + 3] = 0;
              if (i % c.width) push(i - 1);
              if (i % c.width < c.width - 1) push(i + 1);
              push(i - c.width);
              push(i + c.width);
            }
            g.putImageData(d, 0, 0);
          }
          return { c, corner };
        }),
      );
      const [props, terrain, roof, inside] = images.map((v) => v.c),
        out = canvas(1024, 1120),
        og = out.getContext('2d'),
        frames = {};
      og.imageSmoothingEnabled = false;
      const hard = (c) => {
        const g = c.getContext('2d'),
          d = g.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i + 3] = d.data[i + 3] < 180 ? 0 : 255;
          if (!d.data[i + 3]) continue;
          let best = Infinity,
            near = colors[0];
          for (const col of colors) {
            const delta =
              (d.data[i] - col[0]) ** 2 +
              (d.data[i + 1] - col[1]) ** 2 +
              (d.data[i + 2] - col[2]) ** 2;
            if (delta < best) {
              best = delta;
              near = col;
            }
          }
          for (let k = 0; k < 3; k++) d.data[i + k] = near[k];
        }
        g.putImageData(d, 0, 0);
      };
      const put = (
        name,
        im,
        rect,
        x,
        y,
        w,
        h,
        mode = 'fit',
        ground = false,
      ) => {
        let [sx, sy, sw, sh] = rect;
        const src = canvas(Math.ceil(sw), Math.ceil(sh)),
          sg = src.getContext('2d');
        sg.drawImage(im, sx, sy, sw, sh, 0, 0, src.width, src.height);
        if (name === 'propAncientTree')
          sg.clearRect(
            (930 * props.width) / 1536,
            (780 * props.height) / 1024,
            (54 * props.width) / 1536,
            (244 * props.height) / 1024,
          );
        let l = 0,
          t = 0,
          r = src.width - 1,
          bottom = src.height - 1;
        if (mode !== 'tile') {
          const d = sg.getImageData(0, 0, src.width, src.height).data;
          l = src.width;
          t = src.height;
          r = 0;
          bottom = 0;
          for (let yy = 0; yy < src.height; yy++)
            for (let xx = 0; xx < src.width; xx++)
              if (d[(yy * src.width + xx) * 4 + 3] >= 180) {
                l = Math.min(l, xx);
                t = Math.min(t, yy);
                r = Math.max(r, xx);
                bottom = Math.max(bottom, yy);
              }
        }
        const c = canvas(w / 2, h / 2),
          g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        if (mode === 'tile') {
          g.fillStyle = ground;
          g.fillRect(0, 0, c.width, c.height);
        }
        const cw = r - l + 1,
          ch = bottom - t + 1,
          scale = Math.min((c.width - 2) / cw, (c.height - 1) / ch),
          dw = mode === 'fit' ? Math.round(cw * scale) : c.width,
          dh = mode === 'fit' ? Math.round(ch * scale) : c.height;
        g.drawImage(
          src,
          l,
          t,
          cw,
          ch,
          Math.round((c.width - dw) / 2),
          mode === 'fit' ? c.height - 1 - dh : 0,
          dw,
          dh,
        );
        // 橄榄叶偏向地图苔绿，象牙树干 / 金饰保持原色。
        if (name === 'propAncientTree') {
          const pixels = g.getImageData(0, 0, c.width, c.height);
          for (let i = 0; i < pixels.data.length; i += 4) {
            const r = pixels.data[i],
              gg = pixels.data[i + 1],
              bb = pixels.data[i + 2];
            if (gg >= r * 0.98 && gg > bb * 1.15 && gg > 60) {
              pixels.data[i] = Math.round(r * 0.88);
              pixels.data[i + 1] = Math.min(255, Math.round(gg * 1.06));
            }
          }
          g.putImageData(pixels, 0, 0);
        }
        hard(c);
        if (mode === 'tile') {
          g.globalCompositeOperation = 'destination-over';
          g.fillStyle = ground;
          g.fillRect(0, 0, c.width, c.height);
          g.globalCompositeOperation = 'source-over';
        }
        og.drawImage(c, x, y, w, h);
        frames[name] = { x, y, w, h };
      };
      const prx = props.width / 1536,
        pry = props.height / 1024,
        tx = terrain.width / 1536,
        ty = terrain.height / 1024,
        ix = inside.width / 1536,
        iy = inside.height / 1024;
      put(
        'cathedralRoof',
        roof,
        [0, 0, roof.width, roof.height],
        0,
        0,
        544,
        864,
        'stretch',
      );
      put(
        'cathedralInterior',
        inside,
        [0, 0, 512 * ix, 512 * iy],
        544,
        0,
        480,
        704,
        'stretch',
      );
      put(
        'propAncientTree',
        props,
        [0, 0, 984 * prx, 1024 * pry],
        544,
        704,
        320,
        352,
      );
      put(
        'propAltar',
        props,
        [984 * prx, 540 * pry, 552 * prx, 484 * pry],
        864,
        704,
        128,
        96,
      );
      put(
        'groundSacredRoots',
        terrain,
        [512 * tx, 512 * ty, 512 * tx, 512 * ty],
        0,
        864,
        256,
        128,
        'stretch',
      );
      put(
        'groundSacredGarden',
        terrain,
        [1024 * tx, 512 * ty, 512 * tx, 512 * ty],
        256,
        864,
        96,
        48,
      );
      for (const [name, col, row, base, index] of [
        ['tileSanctumPave0', 0, 0, '#6e8072', 0],
        ['tileSanctumPave1', 1, 0, '#6e8072', 1],
        ['tileSanctumGrass', 2, 0, '#4e704c', 2],
        ['tileSanctumPath', 0, 1, '#79653f', 3],
      ])
        put(
          name,
          terrain,
          [(col * 512 + 32) * tx, (row * 512 + 32) * ty, 460 * tx, 460 * ty],
          352 + index * 32,
          864,
          32,
          32,
          'tile',
          base,
        );
      put(
        'propChurchPew',
        inside,
        [512 * ix, 0, 512 * ix, 512 * iy],
        864,
        800,
        88,
        44,
      );
      put(
        'propChurchColumn',
        inside,
        [1024 * ix, 0, 512 * ix, 512 * iy],
        960,
        800,
        40,
        104,
      );
      put(
        'propChurchCandles',
        inside,
        [640 * ix, 512 * iy, 384 * ix, 512 * iy],
        992,
        904,
        32,
        48,
      );
      put(
        'propChurchAltar',
        inside,
        [0, 512 * iy, 600 * ix, 512 * iy],
        864,
        944,
        112,
        72,
      );
      put(
        'groundSacredMosaic',
        inside,
        [1024 * ix, 512 * iy, 512 * ix, 512 * iy],
        0,
        992,
        128,
        128,
      );
      return {
        png: out.toDataURL(),
        frames,
        inputs: images.map((v) => ({
          size: [v.c.width, v.c.height],
          corner: v.corner,
        })),
      };
    },
    [
      'sanctum-props-rebuilt',
      'sanctum-terrain-generated',
      'cathedral-exterior-generated',
      'cathedral-interior-generated',
    ].map(
      (n) =>
        'data:image/png;base64,' +
        fs.readFileSync(root + '/source/' + n + '.png').toString('base64'),
    ),
  );
  const entries = Object.entries(result.frames);
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const [a, f] = entries[i],
        [bb, g] = entries[j];
      if (
        f.x < g.x + g.w &&
        f.x + f.w > g.x &&
        f.y < g.y + g.h &&
        f.y + f.h > g.y
      )
        throw Error('素材布局重叠 ' + a + ' / ' + bb);
    }
  fs.writeFileSync(
    root + '/sanctum-rebuilt.png',
    Buffer.from(result.png.split(',')[1], 'base64'),
  );
  fs.writeFileSync(
    root + '/sanctum-rebuilt-frames.json',
    JSON.stringify(result.frames, null, 2) + '\n',
  );
  console.log({ inputs: result.inputs, frames: result.frames });
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
