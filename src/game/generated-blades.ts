/** 生图兵器经 Canvas 像素化的小图，启动时覆盖后备帧，全部共用原图集。 */
import type { BuiltAtlas } from '../engine/art';
import weaponsURL from './assets/blade-weapons.png?inline';
import iconsURL from './assets/blade-icons.png?inline';
import { BLADES, BLADE_IDS, combatIconName } from './weapon-data';
import { MAGE_IDS } from './mage-data';
export async function applyGeneratedBlades(
  atlas: BuiltAtlas,
): Promise<boolean> {
  try {
    const decode = async (url: string) => {
        const im = new Image();
        im.src = url;
        await im.decode();
        return im;
      },
      [weapons, icons] = await Promise.all([
        decode(weaponsURL),
        decode(iconsURL),
      ]),
      patches: { canvas: HTMLCanvasElement; name: string }[] = [];
    let offset = 0;
    for (const id of BLADE_IDS) {
      const def = BLADES[id],
        c = document.createElement('canvas');
      c.width = def.width;
      c.height = def.height;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(
        weapons,
        offset,
        0,
        def.width,
        def.height,
        0,
        0,
        def.width,
        def.height,
      );
      patches.push({ canvas: c, name: def.frame });
      offset += def.width;
      const icon = document.createElement('canvas');
      icon.width = 40;
      icon.height = 40;
      const ig = icon.getContext('2d')!;
      ig.imageSmoothingEnabled = false;
      const scale = 35 / Math.max(def.width, def.height);
      ig.drawImage(
        c,
        Math.round((40 - def.width * scale) / 2),
        Math.round((40 - def.height * scale) / 2),
        Math.round(def.width * scale),
        Math.round(def.height * scale),
      );
      patches.push({ canvas: icon, name: 'item_' + id });
      if (id === 'greatsword')
        for (let frame = 0; frame < 4; frame++) {
          const flame = document.createElement('canvas');
          flame.width = c.width;
          flame.height = c.height;
          const fg = flame.getContext('2d')!;
          fg.drawImage(c, 0, 0);
          const data = fg.getImageData(0, 0, c.width, c.height);
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++) {
              const index = (y * c.width + x) * 4;
              if (
                data.data[index + 3] &&
                data.data[index] > 180 &&
                data.data[index + 1] > 50 &&
                data.data[index + 2] < 150 &&
                (x * 7 + y * 3 + frame) % 5 === 0
              ) {
                data.data[index + 1] = Math.min(
                  255,
                  data.data[index + 1] + (frame % 2 ? 17 : -17),
                );
              }
            }
          fg.putImageData(data, 0, 0);
          patches.push({ canvas: flame, name: 'weaponGreatsword_' + frame });
        }
    }
    for (let col = 0; col < 2; col++)
      for (let row = 0; row < 3; row++) {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        c.getContext('2d')!.drawImage(
          icons,
          col * 64,
          row * 64,
          64,
          64,
          0,
          0,
          64,
          64,
        );
        patches.push({
          canvas: c,
          name: combatIconName(
            col === 0 ? 'scythe' : 'greatsword',
            MAGE_IDS[row],
          ),
        });
      }
    for (const p of patches) {
      const f = atlas.frames[p.name];
      if (!f || f.w !== p.canvas.width || f.h !== p.canvas.height)
        throw Error('兵器帧规格不符：' + p.name);
    }
    const g = atlas.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const p of patches) {
      const f = atlas.frames[p.name];
      g.clearRect(f.x, f.y, f.w, f.h);
      g.drawImage(p.canvas, f.x, f.y);
    }
    return true;
  } catch (error) {
    console.warn('[art] 生成兵器解码失败，保留完整后备图', error);
    return false;
  }
}
