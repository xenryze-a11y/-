import { DUNGEONS } from './realm-data';
import { FRONTIER_NODES, frontierPaths } from './expedition-design';
import { segmentDistance } from './landscape-design';
import { newRoad } from './landscape-design';
/** 区域、地标、危险与奖励共用一张内容表，坐标单位为瓦片。 */
import type { Vec2 } from '../engine/math';
import type { ItemId } from './items';
export const WORLD = {
  width: 512,
  height: 384,
  fogCell: 128,
  sight: 260,
  interact: 76,
  discover: 215,
};
export type RegionId =
  | 'vale'
  | 'forest'
  | 'sanctum'
  | 'marsh'
  | 'highland'
  | 'waste';
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
  marsh: {
    name: '黑水湿地',
    levels: [10, 16],
    color: '#7bbcb5',
    hp: 2.6,
    damage: 2.0,
    description: '沿苇灯和栈道穿过岛地，夺回水寨可开通界石。',
  },
  highland: {
    name: '断崖高地',
    levels: [14, 20],
    color: '#a9becb',
    hp: 3.2,
    damage: 2.35,
    description: '石阶与隘口连接盆地，吊桥旁藏着回环近路。',
  },
  waste: {
    name: '魔裂荒原',
    levels: [18, 25],
    color: '#d4a17f',
    hp: 4,
    damage: 2.7,
    description: '黑曜裂谷围成战场，攻下前哨再深入裂隙之心。',
  },
} as const;
export function regionAt(p: Vec2): RegionId {
  const x = p.x / 32,
    y = p.y / 32;
  if (x >= 384) return 'waste';
  if (x >= 256 && y < 224) return 'highland';
  if (y >= 192) return 'marsh';
  if (x < 128 && y < 96)
    return x < 48 && y < 48 ? 'vale' : x >= 48 && y < 64 ? 'sanctum' : 'forest';
  if (x < 96 && y >= 96 && y < 160) return 'vale';
  return x >= 128 && y < 128 ? 'sanctum' : 'forest';
}

export type SiteKind =
  | 'waypoint'
  | 'camp'
  | 'vista'
  | 'cache'
  | 'shrine'
  | 'dungeon'
  | 'exit'
  | 'boss';
export interface SiteDefinition {
  id: string;
  zone?: 'mine' | 'roots' | 'jail';
  destination?: 'mine' | 'roots' | 'jail';
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
const FRONTIER_PATHS = frontierPaths();
const ROAD_BUCKETS = new Map<string, [number[], number[]][]>();
for (const path of FRONTIER_PATHS)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    for (
      let y = Math.floor((Math.min(a[1], b[1]) - 3) / 32);
      y <= Math.floor((Math.max(a[1], b[1]) + 3) / 32);
      y++
    )
      for (
        let x = Math.floor((Math.min(a[0], b[0]) - 3) / 32);
        x <= Math.floor((Math.max(a[0], b[0]) + 3) / 32);
        x++
      ) {
        const key = x + ':' + y,
          bucket = ROAD_BUCKETS.get(key) || [];
        bucket.push([a, b]);
        ROAD_BUCKETS.set(key, bucket);
      }
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
SITES.push(
  site(
    'vale-southstone',
    'vale',
    '南谷界石',
    'waypoint',
    44,
    117,
    0,
    0,
    [],
    '新谷地的回程界石，沿溪流与旧镇相连。',
  ),
  site(
    'vale-orchard',
    'vale',
    '风花旧果园',
    'camp',
    23,
    135,
    0,
    0,
    [],
    '果树围拢着一处温暖营地。',
  ),
  site(
    'vale-terrace',
    'vale',
    '白岩眺台',
    'vista',
    70,
    145,
    0,
    30,
    [],
    '沿石阶登上台地，远眺溪谷。',
  ),
  site(
    'vale-mill',
    'vale',
    '溪畔旧磨坊',
    'cache',
    79,
    112,
    2,
    42,
    [
      { id: 'sabre', count: 1 },
      { id: 'health', count: 4 },
    ],
    '沿溪寻找遗箱，清除看守后取得月弧弯刃。',
  ),
  site(
    'forest-deepstone',
    'forest',
    '幽林界石',
    'waypoint',
    151,
    153,
    0,
    0,
    [],
    '密林深处的界石，连接远方的归路。',
  ),
  site(
    'forest-hollow',
    'forest',
    '萤菌树洞',
    'camp',
    117,
    175,
    0,
    0,
    [],
    '菌光映照的猎人歇脚地。',
  ),
  site(
    'forest-depths',
    'forest',
    '沉根祀庭',
    'shrine',
    213,
    164,
    4,
    90,
    [
      { id: 'crystal', count: 16 },
      { id: 'health', count: 4 },
    ],
    '越过根桥与暗溪，清除腐化守卫。',
  ),
  site(
    'forest-highwatch',
    'forest',
    '暮色林冠台',
    'vista',
    231,
    136,
    0,
    45,
    [],
    '沿坡道走上高处，记录林间支路。',
  ),
  site(
    'sanctum-farstone',
    'sanctum',
    '远庭界石',
    'waypoint',
    162,
    47,
    0,
    0,
    [],
    '东方台地的回程坐标。',
  ),
  site(
    'sanctum-highcourt',
    'sanctum',
    '苍穹祭台',
    'shrine',
    211,
    31,
    4,
    100,
    [
      { id: 'mana', count: 8 },
      { id: 'crystal', count: 16 },
    ],
    '经石阶走上祭台，唤醒并击退守卫。',
  ),
  site(
    'sanctum-rose',
    'sanctum',
    '蔷薇废庭',
    'vista',
    221,
    80,
    0,
    45,
    [],
    '残拱与花圃围成一处静谧眺望点。',
  ),
  site(
    'sanctum-vault',
    'sanctum',
    '长阶圣藏',
    'cache',
    163,
    107,
    4,
    95,
    [
      { id: 'basketball', count: 1 },
      { id: 'mana', count: 5 },
    ],
    '沿长阶与回廊找到藏匣，取出坤影篮球。',
  ),
);
// 三十处新区地点保留独立内容ID，界石中的守卫据点需清理后激活。
for (const [id, region, name, kind, x, y, guards] of FRONTIER_NODES)
  SITES.push(
    site(
      id,
      region,
      name,
      kind,
      x,
      y,
      guards,
      kind === 'waypoint' || kind === 'camp' ? 0 : 45 + guards * 15,
      kind === 'cache'
        ? [
            { id: 'health', count: 4 },
            { id: 'mana', count: 4 },
            { id: 'crystal', count: 6 },
          ]
        : [],
      kind === 'waypoint' && guards
        ? '夺回据点后激活界石，建立安全落脚点。'
        : '沿主路与回环寻找此地，奖励只结算一次。',
    ),
  );
for (const [id, name, region, x, y, destination] of [
  ['vale-mine', '废弃矿洞', 'vale', 83, 132, 'mine'],
  ['forest-roots', '腐根洞窟', 'forest', 141, 173, 'roots'],
  ['sanctum-jail', '旧城地牢', 'sanctum', 183, 98, 'jail'],
] as const)
  SITES.push({
    ...site(
      id,
      region,
      name,
      'dungeon',
      x,
      y,
      0,
      0,
      [],
      '进入独立地下城；探索、敌人与已领宝箱会保留。',
    ),
    destination,
  });
for (const [zone, region, name] of [
  ['mine', 'vale', '矿井'],
  ['roots', 'forest', '腐根'],
  ['jail', 'sanctum', '地牢'],
] as const) {
  SITES.push({
    ...site(
      zone + '-exit',
      region,
      '返回地表',
      'exit',
      10,
      12,
      0,
      0,
      [],
      '返回进入前的地表入口。',
    ),
    zone,
  });
  SITES.push({
    ...site(
      zone + '-cache',
      region,
      name + '侧室遗箱',
      'cache',
      22,
      55,
      2,
      65,
      [
        { id: 'health', count: 4 },
        { id: 'crystal', count: 5 },
      ],
      '探索岔路取得遗物。',
    ),
    zone,
  });
  SITES.push({
    ...site(
      zone + '-warden',
      region,
      name + '守卫核心',
      'boss',
      62,
      60,
      4,
      160,
      [
        { id: 'mana', count: 5 },
        { id: 'crystal', count: 12 },
      ],
      '清除核心守卫并领取奖励，回环门将开启。',
    ),
    zone,
  });
}
export const SURFACE_SITES = SITES.filter((s) => !s.zone);
export function sitesForZone(zone?: string): SiteDefinition[] {
  return SITES.filter((s) => (s.zone || 'overworld') === (zone || 'overworld'));
}
export const SITE_NAMES: Record<SiteKind, string> = {
  waypoint: '界石',
  camp: '营地',
  vista: '眺望',
  cache: '遗箱',
  shrine: '净化',
  dungeon: '地下城',
  exit: '出口',
  boss: '核心守卫',
};
export const SITE_SPRITES: Record<SiteKind, string> = {
  waypoint: 'landWaystone',
  camp: 'landCamp',
  vista: 'landVista',
  cache: 'landChest',
  shrine: 'landShrine',
  dungeon: 'propDungeonPortal',
  exit: 'propDungeonPortal',
  boss: 'landShrine',
};
export function roadClearance(x: number, y: number): boolean {
  const xx = x / 32,
    yy = y / 32;
  const old =
    xx < 128 &&
    yy < 96 &&
    ((Math.abs(xx - 24.5) < 1.9 && yy > 47) ||
      (Math.abs(yy - 76.5) < 1.9 && xx > 22) ||
      (Math.abs(xx - 110.5) < 1.9 && yy > 28) ||
      (Math.abs(yy - 30.5) < 1.9 && xx > 69));
  return (
    old ||
    (xx < 256 && yy < 192 && newRoad(xx, yy)) ||
    (
      ROAD_BUCKETS.get(Math.floor(xx / 32) + ':' + Math.floor(yy / 32)) || []
    ).some(([a, b]) => segmentDistance(xx, yy, a, b) < 2.7)
  );
}

export function regionForZone(zone: string | undefined, p: Vec2): RegionId {
  return zone && zone !== 'overworld'
    ? DUNGEONS[zone as keyof typeof DUNGEONS].region
    : regionAt(p);
}
