/** 生图原稿按四系列、Q/F/R 行裁切；Canvas 最近邻和有限色板。 */
const { chromium } = require('playwright'),
  fs = require('node:fs');
(async () => {
  const root = require('node:path').resolve(__dirname, '../src/game/assets'),
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
  const page = await browser.newPage();
  const data = await page.evaluate(
    async (source) => {
      const img = new Image();
      img.src = source;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 192;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 4; col++)
          g.drawImage(
            img,
            (col * img.width) / 4 + 4,
            (row * img.height) / 3 + 4,
            img.width / 4 - 8,
            img.height / 3 - 8,
            col * 64,
            row * 64,
            64,
            64,
          );
      const p = g.getImageData(0, 0, 256, 192);
      for (let i = 0; i < p.data.length; i += 4) {
        p.data[i + 3] = p.data[i + 3] < 110 ? 0 : 255;
        for (let k = 0; k < 3; k++)
          p.data[i + k] = Math.round(p.data[i + k] / 17) * 17;
      }
      g.putImageData(p, 0, 0);
      return c.toDataURL();
    },
    'data:image/png;base64,' +
      fs
        .readFileSync(root + '/source/all-staff-icons-generated.png')
        .toString('base64'),
  );
  fs.writeFileSync(
    root + '/staff-icons.png',
    Buffer.from(data.split(',')[1], 'base64'),
  );
  await browser.close();
})();
