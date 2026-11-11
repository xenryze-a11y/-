/** 区域、地标、危险与奖励共用一张内容表，坐标单位为瓦片。 */
import type { Vec2 } from '../engine/math';
import type { ItemId } from './items';
export const WORLD = {
  width: 128,
  height: 96,
  fogCell: 128,
  sight: 260,
  interact: 76,
  discover: 215,
};
export type RegionId = 'vale' | 'forest' | 'sanctum';
export const REGIONS = {
  vale: {
    name: '灰烬谷',
    levels: [1, 5],
    color: '#b9c89a',
    hp: 1,
    damage: 1,
    description: '沿旧镇道路寻找营地与补给，向南进入腐化林地。',
  },
  forest: {
    name: '腐化林地',
    levels: [5, 10],
    color: '#b09bce',
    hp: 1.65,
    damage: 1.45,
    description: '菌林与浅滩之间藏着旧兵器；主路连接南部驿站。',
  },
  sanctum: {
    name: '圣域遗迹',
    levels: [8, 14],
    color: '#e0c589',
    hp: 2.25,
    damage: 1.9,
    description: '神树庭院通向东方废墟，朝圣路与教堂内相对安全。',
  },
} as const;
export function regionAt(p: Vec2): RegionId {
  return p.x < 48 * 32 && p.y < 48 * 32
    ? 'vale'
    : p.x >= 48 * 32 && p.y < 64 * 32
      ? 'sanctum'
      : 'forest';
}
export type SiteKind = 'waypoint' | 'camp' | 'vista' | 'cache' | 'shrine';
export interface SiteDefinition {
  id: string;
  region: RegionId;
  name: string;
  kind: SiteKind;
  x: number;
  y: number;
  guards: number;
  xp: number;
  reward: { id: ItemId; count: number }[];
  description: string;
}
const site = (
  id: string,
  region: RegionId,
  name: string,
  kind: SiteKind,
  x: number,
  y: number,
  guards: number,
  xp: number,
  reward: SiteDefinition['reward'],
  description: string,
): SiteDefinition => ({
  id,
  region,
  name,
  kind,
  x,
  y,
  guards,
  xp,
  reward,
  description,
});
export const SITES: SiteDefinition[] = [
  site(
    'vale-waystone',
    'vale',
    '旧镇界石',
    'waypoint',
    25,
    26,
    0,
    0,
    [],
    '记录旧镇的回程坐标。先触碰其他界石，才能互相传送。',
  ),
  site(
    'vale-camp',
    'vale',
    '旅人营火',
    'camp',
    20,
    29,
    0,
    0,
    [],
    '附近安全时可歇息，恢复生命与法力。',
  ),
  site(
    'vale-watch',
    'vale',
    '断塔眺望台',
    'vista',
    35,
    16,
    0,
    14,
    [],
    '沿塔阶辨认旧镇的道路，揭开附近地图。',
  ),
  site(
    'vale-supply',
    'vale',
    '路旁遗箱',
    'cache',
    12,
    31,
    0,
    12,
    [
      { id: 'health', count: 3 },
      { id: 'wood', count: 8 },
    ],
    '商旅留下的补给箱。奖励只可领取一次。',
  ),
  site(
    'vale-crypt',
    'vale',
    '霜封墓园',
    'cache',
    12,
    12,
    2,
    28,
    [
      { id: 'frost', count: 1 },
      { id: 'mana', count: 3 },
    ],
    '唤醒墓园守卫，净化后取得霜晶法杖。',
  ),
  site(
    'vale-shrine',
    'vale',
    '失火的小圣龛',
    'shrine',
    35,
    38,
    2,
    30,
    [
      { id: 'iron_head', count: 1 },
      { id: 'herb', count: 6 },
    ],
    '击退盘踞的亡者，重燃圣龛。',
  ),
  site(
    'forest-waystone',
    'forest',
    '南林界石',
    'waypoint',
    25,
    60,
    0,
    0,
    [],
    '南部主路的回程坐标，连接广阔的菌林。',
  ),
  site(
    'forest-camp',
    'forest',
    '猎人旧营',
    'camp',
    16,
    73,
    0,
    0,
    [],
    '一处避风的废弃营地，追兵未散时不能休息。',
  ),
  site(
    'forest-shrine',
    'forest',
    '菌冠圣井',
    'shrine',
    38,
    81,
    3,
    48,
    [
      { id: 'ward', count: 1 },
      { id: 'crystal', count: 8 },
    ],
    '清除井边腐化，找回星辉法杖。',
  ),
  site(
    'forest-marsh',
    'forest',
    '沉舟浅滩',
    'cache',
    71,
    76,
    3,
    52,
    [
      { id: 'blink', count: 1 },
      { id: 'mana', count: 4 },
    ],
    '浅滩中的遗物由三名守卫看守。',
  ),
  site(
    'forest-watch',
    'forest',
    '枯枝观星台',
    'vista',
    100,
    84,
    0,
    28,
    [],
    '从高处辨认东部遗迹与林间岔路。',
  ),
  site(
    'forest-den',
    'forest',
    '裂根巢穴',
    'cache',
    113,
    71,
    4,
    70,
    [
      { id: 'scythe', count: 1 },
      { id: 'health', count: 4 },
    ],
    '深入裂根，击退守卫后取得魔域镰刀。',
  ),
  site(
    'sanctum-waystone',
    'sanctum',
    '朝圣界石',
    'waypoint',
    73,
    30,
    0,
    0,
    [],
    '神树庭院东侧的界石，通向东方遗迹。',
  ),
  site(
    'sanctum-memorial',
    'sanctum',
    '无名圣使碑',
    'vista',
    82,
    17,
    0,
    30,
    [],
    '碑文记载朝圣者的末路；揭开附近地图。',
  ),
  site(
    'sanctum-ruin',
    'sanctum',
    '熄日祭庭',
    'shrine',
    105,
    20,
    4,
    85,
    [
      { id: 'greatsword', count: 1 },
      { id: 'mana', count: 4 },
    ],
    '净化祭庭，取出封存的烬皇火焰大剑。',
  ),
  site(
    'sanctum-relic',
    'sanctum',
    '白骨圣匣',
    'cache',
    116,
    43,
    4,
    85,
    [
      { id: 'iron_chest', count: 1 },
      { id: 'iron_legs', count: 1 },
      { id: 'iron', count: 1 },
    ],
    '遗迹守卫看守着古老铁甲。',
  ),
  site(
    'sanctum-camp',
    'sanctum',
    '烛火驿站',
    'camp',
    81,
    48,
    0,
    0,
    [],
    '教堂东侧的休憩点，不会替代神父的祝福。',
  ),
  site(
    'sanctum-watch',
    'sanctum',
    '碎钟瞭望台',
    'vista',
    109,
    57,
    0,
    35,
    [],
    '借残留的钟声辨明南林归路。',
  ),
];
export const SITE_NAMES: Record<SiteKind, string> = {
  waypoint: '界石',
  camp: '营地',
  vista: '眺望',
  cache: '遗箱',
  shrine: '净化',
};
export const SITE_SPRITES: Record<SiteKind, string> = {
  waypoint: 'landWaystone',
  camp: 'landCamp',
  vista: 'landVista',
  cache: 'landChest',
  shrine: 'landShrine',
};
export function roadClearance(x: number, y: number): boolean {
  return (
    (Math.abs(x - 24.5 * 32) < 60 && y > 47 * 32) ||
    (Math.abs(y - 76.5 * 32) < 60 && x > 22 * 32) ||
    (Math.abs(x - 110.5 * 32) < 60 && y > 28 * 32) ||
    (Math.abs(y - 30.5 * 32) < 60 && x > 69 * 32)
  );
}
