/** 手动素材规范化工具：需要 Playwright / Chromium；不参与游戏构建依赖。 */
const { chromium } = require('playwright'),
  fs = require('node:fs');
(async () => {
  const root =
      require('node:path').resolve(__dirname, '../src/game/assets') + '/',
    b = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
  const p = await b.newPage();
  const images = {
    trees: fs
      .readFileSync(root + 'source/trees-generated.png')
      .toString('base64'),
    icons: fs
      .readFileSync(root + 'source/mage-icons-generated.png')
      .toString('base64'),
  };
  const result = await p.evaluate(async (sources) => {
    const image = async (data) => {
      const i = new Image();
      i.src = 'data:image/png;base64,' + data;
      await i.decode();
      return i;
    };
    const crisp = (c) => {
      const g = c.getContext('2d'),
        p = g.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < p.data.length; i += 4) {
        p.data[i + 3] = p.data[i + 3] < 110 ? 0 : 255;
        for (let k = 0; k < 3; k++)
          p.data[i + k] = Math.round(p.data[i + k] / 17) * 17;
      }
      g.putImageData(p, 0, 0);
    };
    const trees = await image(sources.trees),
      src = document.createElement('canvas');
    src.width = trees.width;
    src.height = trees.height;
    const sg = src.getContext('2d');
    sg.drawImage(trees, 0, 0);
    const pixels = sg.getImageData(0, 0, src.width, src.height).data;
    const output = document.createElement('canvas');
    output.width = 416;
    output.height = 352;
    const g = output.getContext('2d');
    g.imageSmoothingEnabled = false;
    const regions = [
        [0, Math.round(trees.width * 0.4), 0, 96, 128],
        [Math.round(trees.width * 0.4), trees.width, 96, 320, 352],
      ],
      bounds = [];
    for (const [start, end, tx, w, h] of regions) {
      let left = end,
        right = start,
        top = trees.height,
        bottom = 0;
      for (let y = 0; y < trees.height; y++)
        for (let x = start; x < end; x++)
          if (pixels[(y * trees.width + x) * 4 + 3] >= 110) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      const sw = right - left + 1,
        sh = bottom - top + 1,
        scale = Math.min((w - 4) / sw, (h - 4) / sh),
        dw = Math.round(sw * scale),
        dh = Math.round(sh * scale);
      g.drawImage(
        src,
        left,
        top,
        sw,
        sh,
        tx + Math.floor((w - dw) / 2),
        h - dh - 2,
        dw,
        dh,
      );
      bounds.push({ left, right, top, bottom, dw, dh });
    }
    crisp(output);
    const icons = await image(sources.icons),
      ic = document.createElement('canvas');
    ic.width = 192;
    ic.height = 64;
    const ig = ic.getContext('2d');
    ig.imageSmoothingEnabled = false;
    for (let k = 0; k < 3; k++)
      ig.drawImage(
        icons,
        (k * icons.width) / 3 + 4,
        4,
        icons.width / 3 - 8,
        icons.height - 8,
        k * 64,
        0,
        64,
        64,
      );
    crisp(ic);
    return { trees: output.toDataURL(), icons: ic.toDataURL(), bounds };
  }, images);
  for (const key of ['trees', 'icons'])
    fs.writeFileSync(
      root + (key === 'trees' ? 'grove-trees.png' : 'mage-icons.png'),
      Buffer.from(result[key].split(',')[1], 'base64'),
    );
  console.log(result.bounds);
  await b.close();
})();
