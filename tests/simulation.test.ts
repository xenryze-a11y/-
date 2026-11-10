import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/engine/camera';
import { Level, Tile } from '../src/engine/level';
import { BTN } from '../src/engine/input';
import { fourDirection } from '../src/engine/facing';
import { buildScene } from '../src/game/spawn';
import {
  addItem,
  applyInventoryCommand,
  returnCursor,
  recipe,
  useSelected,
} from '../src/game/inventory';
import {
  applyDamage,
  meleeAttack,
  spawnProjectile,
} from '../src/game/systems/combat';
import { castSelected, updateFields } from '../src/game/systems/magic';
import { updateProjectiles } from '../src/game/systems/projectile';
import { updateRules, resetRules } from '../src/game/systems/rules';
import { updateAI } from '../src/game/systems/ai';
import { applyInput } from '../src/game/systems/control';
import { spawnDrop } from '../src/game/systems/loot';
import type { Ctx } from '../src/game/systems/context';

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
function mob(c: Ctx, x: number, y: number, hp = 250): number {
  const id = c.world.createAt(['mob', 'damageable'], x, y);
  c.s.radius.set(id, { r: 10 });
  c.s.health.set(id, { hp, max: hp, armor: 0 });
  c.s.facing.set(id, { angle: Math.PI });
  c.s.mob.set(id, {
    kind: 'shamble',
    speed: 0,
    aggro: 1000,
    atkRange: 16,
    atkCd: 100,
    dmg: 9,
    think: 1,
    attackAnim: 0,
    hurtFlash: 0,
    home: { x, y },
  });
  return id;
}
const inv = (c: Ctx) => c.s.inventory.get(c.player)!;
const player = (c: Ctx) => c.s.player.get(c.player)!;
const slot = (c: Ctx, index: number, right = false, shift = false) =>
  applyInventoryCommand(c, { type: 'slot', index, right, shift });
const select = (c: Ctx, index: number) =>
  applyInventoryCommand(c, { type: 'select', index });

test('36 shared slots: split, move and shift transfer conserve stack quantities', () => {
  const c = arena();
  assert.equal(inv(c).slots.length, 36);
  slot(c, 9, true);
  assert.equal(inv(c).cursor?.count, 4);
  slot(c, 13, true);
  slot(c, 9);
  assert.equal(inv(c).slots[9]?.count, 7);
  assert.equal(inv(c).slots[13]?.count, 1);
  assert.equal(inv(c).cursor, null);
  slot(c, 8, false, true);
  assert.equal(inv(c).slots[8], null);
  assert.equal(
    inv(c)
      .slots.filter((x) => x?.id === 'wood')
      .reduce((sum, x) => sum + x!.count, 0),
    8,
  );
});
test('full bags preserve remainder, partial merges and held stack on rejected close', () => {
  const c = arena();
  inv(c).slots = Array.from({ length: 36 }, () => ({ id: 'stone', count: 64 }));
  assert.equal(addItem(inv(c).slots, 'herb', 3), 3);
  inv(c).slots[3]!.count = 61;
  assert.equal(addItem(inv(c).slots, 'stone', 5), 2);
  assert.equal(inv(c).slots[3]!.count, 64);
  inv(c).cursor = { id: 'herb', count: 4 };
  assert.equal(returnCursor(c), false);
  assert.equal(inv(c).cursor?.count, 4);
  inv(c).slots[2] = null;
  assert.equal(returnCursor(c), true);
  assert.equal(inv(c).slots[2]?.count, 4);
});
test('crafting consumes one per occupied cell; incompatible/full cursor consumes nothing', () => {
  const c = arena();
  inv(c).craft = [
    { id: 'herb', count: 3 },
    { id: 'crystal', count: 2 },
    null,
    null,
  ];
  assert.deepEqual(recipe(inv(c)), { id: 'mana', count: 2 });
  inv(c).cursor = { id: 'mana', count: 63 };
  applyInventoryCommand(c, { type: 'craft' });
  assert.equal(inv(c).craft[0]?.count, 3);
  inv(c).cursor = null;
  applyInventoryCommand(c, { type: 'craft' });
  assert.deepEqual(inv(c).cursor, { id: 'mana', count: 2 });
  assert.equal(inv(c).craft[0]?.count, 2);
  assert.equal(inv(c).craft[1]?.count, 1);
  inv(c).craft = [
    { id: 'planks', count: 1 },
    { id: 'planks', count: 1 },
    { id: 'planks', count: 1 },
    { id: 'planks', count: 1 },
  ];
  assert.deepEqual(recipe(inv(c)), { id: 'crate', count: 1 });
});
test('equipment swaps update the real component and iron boots reduce incoming damage', () => {
  const c = arena();
  slot(c, 11);
  slot(c, 40);
  slot(c, 11);
  assert.equal(c.s.equip.get(c.player)?.shoes, 'iron');
  assert.equal(inv(c).slots[11]?.id, 'leather');
  const hp = c.s.health.get(c.player)!;
  applyDamage(c, c.player, 10, 0);
  assert.equal(hp.hp, 112);
  applyDamage(c, c.player, 10, 0);
  assert.equal(
    hp.hp,
    112,
    'hurt invulnerability prevents overlapping frame damage',
  );
});
test('potions do not consume at full health; supply opening is atomic when bag is full', () => {
  const c = arena();
  select(c, 6);
  useSelected(c);
  assert.equal(inv(c).slots[6]?.count, 5);
  c.s.health.get(c.player)!.hp = 80;
  useSelected(c);
  assert.equal(c.s.health.get(c.player)!.hp, 120);
  assert.equal(inv(c).slots[6]?.count, 4);
  inv(c).slots = Array.from({ length: 36 }, () => ({ id: 'stone', count: 64 }));
  inv(c).slots[0] = { id: 'crate', count: 2 };
  select(c, 0);
  useSelected(c);
  assert.equal(inv(c).slots[0]?.count, 2);
  assert.ok(!inv(c).slots.some((x) => x?.id === 'health' || x?.id === 'mana'));
});
test('supercover ray detects thin walls and diagonal corners in both directions', () => {
  const l = new Level(12, 12);
  l.tiles.fill(Tile.GRASS);
  l.tiles[5 * 12 + 5] = Tile.WALL;
  for (const [a, b] of [
    [
      { x: 159, y: 159 },
      { x: 161, y: 161 },
    ],
    [
      { x: 140, y: 170 },
      { x: 220, y: 170 },
    ],
  ]) {
    assert.equal(l.lineClear(a, b), false);
    assert.equal(l.lineClear(b, a), false);
  }
  assert.equal(l.lineClear({ x: 145, y: 145 }, { x: 145, y: 145 }), true);
  assert.equal(l.lineClear({ x: 145, y: 145 }, { x: 145, y: 150 }), true);
});
test('melee cannot hit across a wall, and hits after the same wall is removed', () => {
  const c = arena();
  c.world.setPos(c.player, { x: 622, y: 600 });
  const target = mob(c, 684, 600);
  c.level.tiles[18 * 48 + 20] = Tile.WALL;
  meleeAttack(c, c.player, 0, Math.PI * 2, 62, 34);
  assert.equal(c.s.health.get(target)!.hp, 250);
  c.level.tiles[18 * 48 + 20] = Tile.GRASS;
  meleeAttack(c, c.player, 0, Math.PI * 2, 62, 34);
  assert.equal(c.s.health.get(target)!.hp, 216);
});
test('muzzle and swept projectile cannot spawn or tunnel through a nearby wall', () => {
  const c = arena();
  c.world.setPos(c.player, { x: 630, y: 600 });
  c.level.tiles[18 * 48 + 20] = Tile.WALL;
  const id = spawnProjectile(c, c.player, 0, 'fireball', 30000, 30, true);
  assert.ok(c.world.pos(id).x < 640);
  const target = mob(c, 700, 600);
  updateProjectiles(c, 1 / 60);
  assert.ok(c.world.isPendingDeath(id));
  assert.equal(c.s.health.get(target)!.hp, 250);
});
test('fire splash respects walls while damaging visible neighbours', () => {
  const c = arena();
  const visible = mob(c, 614, 620),
    hidden = mob(c, 678, 600);
  c.level.tiles[18 * 48 + 20] = Tile.WALL;
  const id = spawnProjectile(c, c.player, 0, 'fireball', 500, 30, true);
  c.world.setPos(id, { x: 630, y: 600 });
  c.s.projectile.get(id)!.element = 'ember';
  updateProjectiles(c, 1 / 30);
  assert.ok(c.s.health.get(visible)!.hp < 250);
  assert.equal(c.s.health.get(hidden)!.hp, 250);
});
test('storm chains three distinct visible targets with diminishing damage', () => {
  const c = arena(),
    targets = [mob(c, 660, 600), mob(c, 700, 620), mob(c, 730, 640)];
  c.s.facing.get(c.player)!.angle = 0;
  select(c, 2);
  castSelected(c);
  assert.deepEqual(
    targets.map((id) => c.s.health.get(id)!.hp),
    [223, 227, 231],
  );
});
test('nova freezes, shield absorbs damage, per-staff cooldown prevents swap reset', () => {
  const c = arena(),
    target = mob(c, 660, 600);
  select(c, 1);
  castSelected(c, true);
  assert.ok(c.s.mob.get(target)!.frozen! > 0);
  select(c, 3);
  player(c).mana = 100;
  castSelected(c, true);
  assert.equal(player(c).shieldHp, 44);
  const hp = c.s.health.get(c.player)!.hp;
  applyDamage(c, c.player, 10, 0);
  assert.equal(c.s.health.get(c.player)!.hp, hp);
  assert.equal(player(c).shieldHp, 34);
  select(c, 0);
  select(c, 3);
  const mana = player(c).mana;
  castSelected(c, true);
  assert.equal(player(c).mana, mana);
});
test('blink stops before walls; storm field damages on ticks and expires through flush', () => {
  const c = arena();
  c.level.tiles[18 * 48 + 20] = Tile.WALL;
  c.s.facing.get(c.player)!.angle = 0;
  select(c, 4);
  castSelected(c, true);
  assert.ok(c.world.pos(c.player).x <= 630 && c.world.pos(c.player).x > 600);
  c.level.tiles[18 * 48 + 20] = Tile.GRASS;
  select(c, 2);
  player(c).mana = 100;
  castSelected(c, true);
  assert.equal(c.s.field.length, 1);
  const fieldId = c.s.field.owners[0],
    at = c.world.pos(fieldId),
    target = mob(c, at.x + 20, at.y);
  updateFields(c, 0.1);
  assert.ok(c.s.health.get(target)!.hp < 250);
  updateFields(c, 4);
  assert.ok(c.world.isPendingDeath(fieldId));
  c.world.flush();
  assert.equal(c.s.field.length, 0);
});
test('destroyed props remove blockers and yield material without counting as monster kills', () => {
  const c = arena(),
    id = c.world.createAt(['prop', 'damageable'], 642, 600);
  c.level.addBlocker(642, 600, 9);
  c.s.radius.set(id, { r: 9 });
  c.s.health.set(id, { hp: 28, max: 28, armor: 0 });
  c.s.prop.set(id, { sprite: 'propTree', w: 48, h: 64, blocks: true });
  applyDamage(c, id, 34, c.player);
  assert.ok(c.world.isPendingDeath(id));
  assert.equal(c.level.blocked(642, 600, 9), false);
  assert.equal(player(c).kills, 0);
  assert.equal(c.s.pickup.data.find((x) => x.kind === 'wood')?.count, 3);
});
test('loot remains on ground when full, then merges after space is freed', () => {
  const c = arena();
  resetRules();
  const id = spawnDrop(c, 600, 600, 'herb', 3);
  inv(c).slots = Array.from({ length: 36 }, () => ({ id: 'stone', count: 64 }));
  updateRules(c);
  assert.equal(c.world.isPendingDeath(id), false);
  assert.equal(c.s.pickup.get(id)!.count, 3);
  inv(c).slots[4] = null;
  updateRules(c);
  assert.equal(inv(c).slots[4]?.id, 'herb');
  assert.equal(inv(c).slots[4]?.count, 3);
  assert.ok(c.world.isPendingDeath(id));
});
test('half joystick input produces half speed and stationary dodge uses facing', () => {
  const c = arena();
  const pointer = c.camera.toScreen({ x: 800, y: 600 });
  applyInput(
    c,
    { move: { x: 0.5, y: 0 }, pointer, down: 0, pressed: 0, aimActive: false },
    1,
  );
  assert.equal(c.world.pos(c.player).x, 660);
  applyInput(
    c,
    {
      move: { x: 0, y: 0 },
      pointer,
      down: 0,
      pressed: BTN.DODGE,
      aimActive: false,
    },
    1 / 60,
  );
  assert.equal(c.s.dodge.get(c.player)!.time, 0.22);
  applyInput(
    c,
    { move: { x: 0, y: 0 }, pointer, down: 0, pressed: 0, aimActive: false },
    1 / 60,
  );
  assert.ok(c.world.pos(c.player).x > 660);
  const previous = fourDirection(0);
  assert.equal(fourDirection(Math.PI / 4 + 0.05, previous), previous);
  assert.equal(fourDirection(Math.PI / 2, previous), Math.PI / 2);
});
test('monster goal field routes around walls and cannot strike through them', () => {
  const c = arena();
  c.world.setPos(c.player, { x: 700, y: 600 });
  for (let y = 16; y <= 19; y++) c.level.tiles[y * 48 + 20] = Tile.WALL;
  const id = mob(c, 580, 600);
  c.s.mob.get(id)!.speed = 130;
  for (let i = 0; i < 300 && c.world.pos(id).x <= 680; i++) {
    c.world.time += 1 / 60;
    updateAI(c, 1 / 60);
  }
  assert.ok(c.world.pos(id).x > 680, JSON.stringify(c.world.pos(id)));
});
