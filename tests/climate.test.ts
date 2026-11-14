import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/engine/camera';
import { Tile } from '../src/engine/level';
import { buildScene } from '../src/game/spawn';
import { SEASONS, SEASON_ORDER, ambientAt, comfortRange, isNight, seasonAt } from '../src/game/climate';
import {
  clothingCooling,
  clothingInsulation,
  comfortMax,
  comfortMin,
  type ArmorMat,
} from '../src/game/armor';
import { updateSurvival, survivalSpeed } from '../src/game/systems/survival';
import { captureSave, parseSave, restoreSave } from '../src/game/saves';
import type { Ctx } from '../src/game/systems/context';

/** 冬季起点：春 480 + 夏 600 + 秋 480。 */
const WINTER = 480 + 600 + 480;

function arena(): Ctx {
  const scene = buildScene();
  scene.s.prop.forEach((id, p) => {
    const pos = scene.world.pos(id);
    if (p.blocks) scene.level.removeBlocker(pos.x, pos.y);
  });
  for (const id of [...scene.world.alive])
    if (id !== scene.player) scene.world.destroy(id);
  scene.world.flush();
  scene.level.tiles.fill(Tile.GRASS);
  scene.world.setPos(scene.player, { x: 600, y: 600 });
  const camera = new Camera();
  camera.w = 1000;
  camera.h = 700;
  camera.boundsW = 1536;
  camera.boundsH = 1536;
  camera.snap({ x: 600, y: 600 });
  return {
    ...scene,
    camera,
    gameOver: false,
    debug: false,
    aimPointer: camera.toScreen({ x: 760, y: 600 }),
  };
}

function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

test('seasons cycle spring, summer, autumn, winter and back', () => {
  assert.equal(seasonAt(0), 'spring');
  const year = SEASON_ORDER.reduce((sum, id) => sum + SEASONS[id].length, 0);
  const seen: string[] = [];
  for (let t = 0; t < year; t += 30) {
    const season = seasonAt(t);
    if (seen.at(-1) !== season) seen.push(season);
  }
  assert.deepEqual(seen, ['spring', 'summer', 'autumn', 'winter']);
  assert.equal(seasonAt(year), 'spring');
  assert.equal(seasonAt(WINTER + 100), 'winter');
});

test('ambient temperature follows season, night, water and the fire', () => {
  const c = arena();
  c.world.time = WINTER + 70;
  assert.equal(isNight(c), true);
  const winterNight = ambientAt(c);

  c.world.time = 480 + 10;
  const summerDay = ambientAt(c);
  assert.ok(winterNight < summerDay);
  assert.equal(winterNight, SEASONS.winter.base - 10);
  assert.equal(summerDay, SEASONS.summer.base + 4);

  const pos = c.world.pos(c.player);
  const torch = c.world.createAt(['prop'], pos.x + 20, pos.y);
  c.s.prop.set(torch, { sprite: 'propTorch', w: 8, h: 24, blocks: false });
  c.world.time = WINTER + 70;
  assert.equal(ambientAt(c), winterNight + 40);

  c.world.destroy(torch);
  c.world.flush();
  const cx = Math.floor(pos.x / 32),
    cy = Math.floor(pos.y / 32);
  c.level.tiles[cy * c.level.w + cx] = Tile.WATER;
  assert.equal(ambientAt(c), winterNight - 10);
});

test('armor material sets insulation and the comfort band', () => {
  const eq = (mat: ArmorMat) => ({
    shoes: 'bare',
    head: mat,
    chest: mat,
    legs: mat,
  });
  assert.equal(clothingInsulation(eq('none')), 0);
  // 铁甲减伤高，但不如皮衣保暖。
  assert.ok(clothingInsulation(eq('iron')) < clothingInsulation(eq('leather')));
  // 毛皮最暖，但闷热。
  const furChest = { shoes: 'bare', head: 'none' as ArmorMat, chest: 'fur' as ArmorMat, legs: 'none' as ArmorMat };
  const leatherChest = { shoes: 'bare', head: 'none' as ArmorMat, chest: 'leather' as ArmorMat, legs: 'none' as ArmorMat };
  assert.ok(clothingInsulation(furChest) > clothingInsulation(leatherChest));
  assert.ok(comfortMin(furChest) < comfortMin(leatherChest));
  // 耐热：晨曦最好，毛皮最差。
  assert.ok(clothingCooling(eq('sanctum')) > clothingCooling(eq('iron')));
  assert.ok(comfortMax(eq('sanctum')) > comfortMax(eq('leather')));
  assert.ok(comfortMax(furChest) <= comfortMax(eq('leather')));
});

test('winter night drains warmth slower in fur than naked, and the fire recovers it', () => {
  const c = arena(),
    sv = c.s.survival.get(c.player)!,
    eq = c.s.equip.get(c.player)!;
  c.world.time = WINTER + 70;

  eq.head = 'none';
  eq.chest = 'none';
  eq.legs = 'none';
  eq.shoes = 'bare';
  sv.warmth = 100;
  for (let i = 0; i < 60; i++) updateSurvival(c, 1 / 60);
  const naked = sv.warmth;
  assert.ok(naked < 100);

  eq.head = 'fur';
  eq.chest = 'fur';
  eq.legs = 'fur';
  eq.shoes = 'leather';
  sv.warmth = 100;
  for (let i = 0; i < 60; i++) updateSurvival(c, 1 / 60);
  assert.ok(sv.warmth > naked);

  const pos = c.world.pos(c.player),
    torch = c.world.createAt(['prop'], pos.x + 20, pos.y);
  c.s.prop.set(torch, { sprite: 'propTorch', w: 8, h: 24, blocks: false });
  sv.warmth = 20;
  for (let i = 0; i < 60; i++) updateSurvival(c, 1 / 60);
  assert.ok(sv.warmth > 20);
});

test('summer day builds heat and cooler armor slows it', () => {
  const c = arena(),
    sv = c.s.survival.get(c.player)!,
    eq = c.s.equip.get(c.player)!;
  c.world.time = 480 + 10;

  eq.head = 'none';
  eq.chest = 'none';
  eq.legs = 'none';
  eq.shoes = 'bare';
  sv.heat = 0;
  for (let i = 0; i < 60; i++) updateSurvival(c, 1 / 60);
  const naked = sv.heat;
  assert.ok(naked > 0);
  sv.heat = 80;
  assert.ok(survivalSpeed(c) < 1);
  sv.heat = 0;

  eq.head = 'sanctum';
  eq.chest = 'sanctum';
  eq.legs = 'sanctum';
  eq.shoes = 'sanctum';
  sv.heat = 0;
  for (let i = 0; i < 60; i++) updateSurvival(c, 1 / 60);
  assert.ok(sv.heat < naked);
});

test('comfort range shown to the HUD follows the equipped armor', () => {
  const c = arena(),
    eq = c.s.equip.get(c.player)!;
  eq.chest = 'fur';
  const range = comfortRange(c);
  assert.ok(range.min < 0);
  eq.chest = 'none';
  assert.ok(comfortRange(c).min > range.min);
});

test('a v4 save without heat migrates to zero heat', () => {
  const c = arena();
  c.progress.mode = 'adventure';
  const record = captureSave(c),
    copy = structuredClone(record);
  copy.version = 4;
  const value = (copy.data.world.stores as Record<string, { value: { heat?: number } }[]>).survival[0].value;
  delete value.heat;
  copy.checksum = checksum(JSON.stringify(copy.data));
  const loaded = restoreSave(parseSave(JSON.stringify(copy)));
  assert.equal(loaded.s.survival.get(loaded.player)!.heat, 0);
});
