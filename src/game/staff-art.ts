/** 四系图标、炎枪与陨石：上传 GPU 前合并，不新增 TextureSource。 */
import type { BuiltAtlas, Spec } from '../engine/art';
import iconsURL from './assets/staff-icons.png?inline';
import { ELEMENT_STAVES, STAFF_PROFESSIONS, staffIconName } from './staff-data';
import { MAGE_IDS } from './mage-data';
export function staffSpecs(): Spec[] {
  const specs: Spec[] = [];
  for (const school of ELEMENT_STAVES)
    for (const ability of MAGE_IDS)
      specs.push({
        name: staffIconName(school, ability),
        w: 64,
        h: 64,
        draw: (p) => {
          p.rect(0, 0, 64, 64, '#17232c');
          p.ring(32, 32, 23, 3, STAFF_PROFESSIONS[school].color);
        },
      });
  specs.push({
    name: 'artFlameLance',
    w: 48,
    h: 20,
    draw: (p) => {
      p.line(3, 10, 34, 10, '#882f28', 12);
      p.line(12, 10, 38, 10, '#dd662f', 8);
      p.line(22, 10, 44, 10, '#ffbb55', 6);
      p.line(30, 10, 45, 10, '#ffeeaa', 2);
      p.line(34, 4, 46, 10, '#ffcc66', 2);
      p.line(34, 16, 46, 10, '#ffcc66', 2);
      p.rect(3, 3, 9, 3, '#bb4422');
      p.rect(0, 14, 15, 3, '#bb4422');
    },
  });
  specs.push({
    name: 'artMeteor',
    w: 48,
    h: 72,
    draw: (p) => {
      p.line(8, 5, 26, 54, '#77332f', 16);
      p.line(12, 12, 26, 54, '#cc5533', 12);
      p.line(15, 19, 26, 54, '#ff9933', 8);
      p.disc(27, 54, 15, '#883333');
      p.disc(27, 54, 12, '#dd6633');
      p.disc(29, 56, 9, '#ffcc55');
      p.disc(30, 58, 5, '#ffffbb');
      p.rect(8, 17, 4, 8, '#ffbb55');
      p.rect(20, 3, 3, 10, '#cc5533');
    },
  });
  return specs;
}
export async function applyStaffArt(atlas: BuiltAtlas): Promise<boolean> {
  try {
    const image = new Image();
    image.src = iconsURL;
    await image.decode();
    const g = atlas.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let col = 0; col < ELEMENT_STAVES.length; col++)
      for (let row = 0; row < MAGE_IDS.length; row++) {
        const f =
          atlas.frames[staffIconName(ELEMENT_STAVES[col], MAGE_IDS[row])];
        if (!f || f.w !== 64 || f.h !== 64) throw Error('职业图标规格不符');
        g.clearRect(f.x, f.y, 64, 64);
        g.drawImage(image, col * 64, row * 64, 64, 64, f.x, f.y, 64, 64);
      }
    return true;
  } catch (error) {
    console.warn('[art] 四系图标回退', error);
    return false;
  }
}
