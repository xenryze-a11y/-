const { chromium } = require('playwright'),
  fs = require('node:fs');
(async () => {
  const root = require('node:path').resolve(__dirname, '../src/game/assets'),
    frames = JSON.parse(fs.readFileSync(root + '/landscape-pixel-frames.json')),
    source =
      'data:image/png;base64,' +
      fs.readFileSync(root + '/landscape-pixel.png').toString('base64');
  const b = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const p = await b.newPage();
  const result = await p.evaluate(
    async ({ source, frames }) => {
      const im = new Image();
      im.src = source;
      await im.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 176;
      canvas.height = 144;
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      const output = {};
      let x = 0;
      for (const name of ['landShrine', 'propRuinChapel']) {
        const f = frames[name];
        g.drawImage(im, f.x, f.y, f.w, f.h, x, 0, f.w, f.h);
        output[name] = { x, y: 0, w: f.w, h: f.h };
        x += f.w;
      }
      return {
        image: canvas.toDataURL('image/png').split(',')[1],
        frames: output,
      };
    },
    { source, frames },
  );
  fs.writeFileSync(
    root + '/landscape-retained.png',
    Buffer.from(result.image, 'base64'),
  );
  fs.writeFileSync(
    root + '/landscape-retained-frames.json',
    JSON.stringify(result.frames, null, 2) + '\n',
  );
  console.log(
    'Retained bytes',
    fs.statSync(root + '/landscape-retained.png').size,
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
