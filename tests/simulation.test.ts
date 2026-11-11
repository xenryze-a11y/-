import { test } from 'node:test';
import {
  castMage,
  updateMage,
  syncMageUnlock,
  mageEquipped,
} from '../src/game/systems/mage';
import { tickTimers } from '../src/game/systems/timers';
import { MAGE, MAGE_SKILLS, GROVE } from '../src/game/mage-data';
import { createGroveLevel } from '../src/game/grove';
import { LEGACY_HALO, sampleVisualTrack } from '../src/game/spell-visuals';
import { SKILL_IDS, BASKETBALL, BASKETBALL_SKILL } from '../src/game/items';
import {
  footPos,
  handRest,
  RIG,
  newLimbPose,
  updateWalk,
} from '../src/engine/animation';
import {
  SUMMON_ANIMATION,
  summonFrameAt,
} from '../src/game/basketball-content';
import { updateSummons } from '../src/game/systems/basketball';
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
  scene.s.inventory.get(scene.player)!.slots[2] = { id: 'storm', count: 1 };
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
  c.level.tiles[18 * c.level.w + 20] = Tile.WALL;
  meleeAttack(c, c.player, 0, Math.PI * 2, 62, 34);
  assert.equal(c.s.health.get(target)!.hp, 250);
  c.level.tiles[18 * c.level.w + 20] = Tile.GRASS;
  meleeAttack(c, c.player, 0, Math.PI * 2, 62, 34);
  assert.equal(c.s.health.get(target)!.hp, 216);
});
test('muzzle and swept projectile cannot spawn or tunnel through a nearby wall', () => {
  const c = arena();
  c.world.setPos(c.player, { x: 630, y: 600 });
  c.level.tiles[18 * c.level.w + 20] = Tile.WALL;
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
  c.level.tiles[18 * c.level.w + 20] = Tile.WALL;
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
  c.level.tiles[18 * c.level.w + 20] = Tile.WALL;
  c.s.facing.get(c.player)!.angle = 0;
  select(c, 4);
  castSelected(c, true);
  assert.ok(c.world.pos(c.player).x <= 630 && c.world.pos(c.player).x > 600);
  c.level.tiles[18 * c.level.w + 20] = Tile.GRASS;
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
  for (let y = 16; y <= 19; y++) c.level.tiles[y * c.level.w + 20] = Tile.WALL;
  const id = mob(c, 580, 600);
  c.s.mob.get(id)!.speed = 130;
  for (let i = 0; i < 300 && c.world.pos(id).x <= 680; i++) {
    c.world.time += 1 / 60;
    updateAI(c, 1 / 60);
  }
  assert.ok(c.world.pos(id).x > 680, JSON.stringify(c.world.pos(id)));
});

test('visual keyframes preserve legacy halo interpolation, bounds and stepped tracks', () => {
  assert.deepEqual(sampleVisualTrack([], 1), { scale: 1, alpha: 0 });
  assert.deepEqual(sampleVisualTrack(LEGACY_HALO, -10), {
    scale: 0.8,
    alpha: 1,
  });
  const middle = sampleVisualTrack(LEGACY_HALO, 12.5);
  assert.ok(Math.abs(middle.scale - 0.95) < 1e-10);
  assert.equal(middle.alpha, 0.5);
  assert.deepEqual(sampleVisualTrack(LEGACY_HALO, 100), {
    scale: 1.1,
    alpha: 0,
  });
  const stepped = [
    { frame: 0, scale: 1, alpha: 1, tween: false },
    { frame: 5, scale: 2, alpha: 0 },
  ];
  assert.deepEqual(sampleVisualTrack(stepped, 4.99), { scale: 1, alpha: 1 });
  assert.deepEqual(sampleVisualTrack(stepped, 5), { scale: 2, alpha: 0 });
});
test('every accepted spell emits serializable elemental stage metadata; rejected casts do not', () => {
  for (let index = 0; index < SKILL_IDS.length; index++)
    for (const special of [false, true]) {
      const c = arena();
      select(c, index);
      c.world.drain();
      castSelected(c, special);
      const event = c.world.drain().find((e) => e.kind === 'spell');
      assert.ok(event);
      assert.equal(event.element, SKILL_IDS[index]);
      assert.equal(event.stage, 'cast');
      assert.equal(event.special, special);
      assert.deepEqual(JSON.parse(JSON.stringify(event)), event);
      castSelected(c, special);
      assert.equal(c.world.drain().filter((e) => e.kind === 'spell').length, 0);
    }
  const c = arena();
  player(c).mana = 0;
  c.world.drain();
  castSelected(c);
  assert.equal(
    c.world.drain().some((e) => e.kind === 'spell'),
    false,
  );
});
test('projectile impacts retain the caster element and finish through deferred destruction', () => {
  for (const index of [0, 1, 3, 4]) {
    const c = arena();
    select(c, index);
    castSelected(c);
    c.world.drain();
    const id = c.s.projectile.owners[0];
    assert.ok(id);
    c.s.projectile.get(id)!.life = 0;
    updateProjectiles(c, 0);
    const hits = c.world
      .drain()
      .filter((e) => e.kind === 'spell' && e.stage === 'impact');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].element, SKILL_IDS[index]);
    assert.equal(c.world.isPendingDeath(id), true);
    assert.ok(c.s.projectile.get(id));
    c.world.flush();
    assert.equal(c.s.projectile.get(id), undefined);
  }
});

test('feet attach to the selected view rather than the previous movement vector', () => {
  const pose = newLimbPose();
  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];
  for (const view of ['front', 'back', 'side'] as const)
    for (let i = 0; i < 2; i++) {
      const rest = footPos(pose, RIG.hero, i, view, false);
      for (const dir of directions) {
        pose.dir = dir;
        assert.deepEqual(footPos(pose, RIG.hero, i, view, false), rest);
      }
      const mirrored = footPos(pose, RIG.hero, i, view, true);
      assert.equal(mirrored.x, -rest.x);
      assert.ok(Math.abs(handRest(view, i, false).x) <= 8);
    }
  updateWalk(pose, 600, 600, 1 / 60);
  const phase = pose.phase;
  updateWalk(pose, 600, 600, 1 / 60);
  assert.equal(pose.phase, phase);
  updateWalk(pose, 604, 600, 1 / 60);
  assert.ok(pose.phase > phase);
  for (let i = 0; i < 2; i++) {
    const foot = footPos(pose, RIG.hero, i, 'front', false);
    assert.ok(Math.abs(foot.x - [-3, 4][i]) <= 2.8);
  }
});
test('six video poses keep their measured frame durations across the exact loop boundary', () => {
  let time = 0;
  for (let i = 0; i < 6; i++) {
    assert.equal(summonFrameAt(time + SUMMON_ANIMATION.durations[i] / 2), i);
    time += SUMMON_ANIMATION.durations[i];
  }
  assert.ok(Math.abs(time - 0.366133) < 1e-9);
  assert.equal(summonFrameAt(time + 1e-8), 0);
  assert.equal(summonFrameAt(-0.001), 5);
  assert.equal(summonFrameAt(time * 20 + 0.1), summonFrameAt(0.1));
});
test('basketball summons exactly five, shares left/right cooldown and preserves mana on rejection', () => {
  const c = arena();
  select(c, 8);
  assert.equal(player(c).weapon, 'basketball');
  const before = player(c).mana;
  castSelected(c);
  assert.equal(c.s.summon.length, 5);
  assert.equal(player(c).mana, before - BASKETBALL_SKILL.cost);
  castSelected(c, true);
  assert.equal(c.s.summon.length, 5);
  assert.equal(player(c).mana, before - BASKETBALL_SKILL.cost);
  select(c, 0);
  select(c, 8);
  castSelected(c);
  assert.equal(c.s.summon.length, 5);
  for (let i = 0; i < 2; i++) {
    player(c).cooldowns.basketball = 0;
    player(c).mana = 100;
    castSelected(c);
  }
  assert.equal(c.s.summon.length, BASKETBALL.maxActive);
  player(c).cooldowns.basketball = 0;
  const mana = player(c).mana;
  castSelected(c);
  assert.equal(player(c).mana, mana);
  const d = arena();
  select(d, 8);
  player(d).mana = 0;
  castSelected(d);
  assert.equal(d.s.summon.length, 0);
});
test('homing summons follow a target and explode exactly once per entity with real area damage', () => {
  const c = arena(),
    enemy = mob(c, 735, 630, 1000);
  select(c, 8);
  castSelected(c);
  c.world.drain();
  for (let i = 0; i < 120; i++) {
    updateSummons(c, 1 / 60);
    c.world.flush();
  }
  assert.equal(c.s.summon.length, 0);
  assert.equal(
    c.s.health.get(enemy)!.hp,
    1000 - BASKETBALL.count * BASKETBALL.damage,
  );
  const bursts = c.world
    .drain()
    .filter((e) => e.kind === 'basketball' && e.stage === 'impact');
  assert.equal(bursts.length, 5);
  assert.ok(bursts.every((e) => e.x > 680 && e.y > 600));
});
test('summons sweep against walls and their explosions cannot damage through the same wall', () => {
  const c = arena();
  for (let y = 0; y < c.level.h; y++)
    c.level.tiles[y * c.level.w + 20] = Tile.WALL;
  const enemy = mob(c, 660, 600, 1000);
  c.s.facing.get(c.player)!.angle = 0;
  select(c, 8);
  castSelected(c);
  c.world.drain();
  updateSummons(c, 1);
  const bursts = c.world
    .drain()
    .filter((e) => e.kind === 'basketball' && e.stage === 'impact');
  assert.equal(bursts.length, 5);
  assert.ok(bursts.every((e) => e.x < 640));
  assert.equal(c.s.health.get(enemy)!.hp, 1000);
  assert.equal(c.s.summon.length, 5);
  assert.ok(c.s.summon.owners.every((id) => c.world.isPendingDeath(id)));
  c.world.flush();
  assert.equal(c.s.summon.length, 0);
});
test('summons reselect after a target disappears, serialize without browser state, and expire', () => {
  const c = arena(),
    first = mob(c, 740, 600),
    second = mob(c, 760, 650, 1000);
  select(c, 8);
  castSelected(c);
  c.world.destroy(first);
  c.world.flush();
  updateSummons(c, 0.2);
  assert.ok(c.s.summon.data.every((s) => s.target === second));
  assert.deepEqual(
    JSON.parse(JSON.stringify(c.s.summon.data)),
    c.s.summon.data,
  );
  c.world.destroy(second);
  c.world.flush();
  updateSummons(c, 3);
  assert.ok(c.s.summon.owners.every((id) => c.world.isPendingDeath(id)));
  c.world.flush();
  assert.equal(c.s.summon.length, 0);
});

test('grove extends east of the original town and keeps a clear altar route and real quest pickup', () => {
  const level = createGroveLevel(20261109);
  assert.equal(level.w, 96);
  assert.equal(level.h, 72);
  assert.ok(level.lineClear(level.spawn, GROVE.staff));
  for (let y = 0; y < 48; y++) assert.equal(level.at(95, y), Tile.WALL);
  const scene = buildScene();
  assert.equal(
    scene.s.inventory
      .get(scene.player)!
      .slots.some((item) => item?.id === 'storm'),
    false,
  );
  assert.ok(
    scene.s.prop.data.some(
      (p) => p.sprite === 'propAncientTree' && p.w === 320,
    ),
  );
  assert.ok(scene.s.prop.data.some((p) => p.sprite === 'propAltar'));
  const pickup = scene.s.pickup.owners.find(
    (id) => scene.s.pickup.get(id)?.kind === 'storm',
  );
  assert.ok(pickup);
  assert.deepEqual(scene.world.pos(pickup!), GROVE.staff);
});
test('storm staff pickup unlocks and equips the profession; full bags never unlock it prematurely', () => {
  const c = arena();
  inv(c).slots[2] = null;
  castMage(c, 'field');
  assert.equal(c.s.mage.get(c.player)!.unlocked, false);
  assert.equal(player(c).mana, 100);
  const drop = spawnDrop(c, 600, 600, 'storm');
  resetRules();
  updateRules(c);
  updateMage(c, 0);
  assert.ok(c.world.isPendingDeath(drop));
  assert.equal(c.s.mage.get(c.player)!.unlocked, true);
  assert.equal(inv(c).selected, 2);
  assert.equal(mageEquipped(c), true);
  const d = arena();
  inv(d).slots = Array.from({ length: 36 }, () => ({ id: 'stone', count: 64 }));
  const retained = spawnDrop(d, 600, 600, 'storm');
  updateRules(d);
  updateMage(d, 0);
  assert.equal(d.s.mage.get(d.player)!.unlocked, false);
  assert.equal(d.world.isPendingDeath(retained), false);
});
test('unlocking a staff in storage does not select a different hotbar slot by modulo', () => {
  const c = arena();
  inv(c).slots[2] = { id: 'wood', count: 1 };
  inv(c).slots[20] = { id: 'storm', count: 1 };
  select(c, 5);
  syncMageUnlock(c);
  assert.equal(c.s.mage.get(c.player)!.unlocked, true);
  assert.equal(inv(c).selected, 5);
  assert.equal(mageEquipped(c), false);
});
test('profession cooldowns survive weapon swaps, reject insufficient mana, and remain independent', () => {
  const c = arena();
  select(c, 2);
  castMage(c, 'field');
  const mage = c.s.mage.get(c.player)!;
  assert.equal(mage.cooldowns.field, MAGE_SKILLS.field.cooldown);
  assert.equal(mage.cooldowns.wave, 0);
  const before = player(c).mana;
  castMage(c, 'field');
  assert.equal(player(c).mana, before);
  select(c, 8);
  castMage(c, 'wave');
  assert.equal(mage.cooldowns.wave, 0);
  tickTimers(c, 1);
  assert.equal(mage.cooldowns.field, 8);
  select(c, 2);
  player(c).mana = 0;
  castMage(c, 'barrage');
  assert.equal(mage.cooldowns.barrage, 0);
  assert.equal(mage.barrageLeft, 0);
  player(c).mana = 100;
  castMage(c, 'wave');
  assert.equal(mage.cooldowns.field, 8);
  assert.equal(mage.cooldowns.wave, MAGE_SKILLS.wave.cooldown);
});
test('electric field follows the caster, has no orbs, and respects wall line of sight', () => {
  const c = arena();
  select(c, 2);
  const first = mob(c, 680, 600, 500);
  castMage(c, 'field');
  updateMage(c, 1 / 60);
  assert.equal(c.s.health.get(first)!.hp, 500 - MAGE.fieldDamage);
  assert.equal(c.s.projectile.length, 0);
  assert.equal(c.s.mage.get(c.player)!.barrageLeft, 0);
  c.world.setPos(c.player, { x: 800, y: 600 });
  const moved = mob(c, 860, 600, 500);
  updateMage(c, 0.5);
  assert.equal(c.s.health.get(first)!.hp, 500 - MAGE.fieldDamage);
  assert.ok(c.s.health.get(moved)!.hp < 500);
  const d = arena();
  d.level.tiles[18 * d.level.w + 20] = Tile.WALL;
  const hidden = mob(d, 660, 600, 500);
  select(d, 2);
  castMage(d, 'field');
  updateMage(d, 0.1);
  assert.equal(d.s.health.get(hidden)!.hp, 500);
});
test('thunder shockwave advances exactly five steps, hits each enemy once, and terminates at walls', () => {
  const c = arena();
  select(c, 2);
  c.s.facing.get(c.player)!.angle = 0;
  const enemy = mob(c, 700, 600, 500);
  castMage(c, 'wave');
  updateMage(c, 0.5);
  const strikes = c.world
    .drain()
    .filter(
      (e) => e.kind === 'mage' && e.ability === 'wave' && e.stage === 'impact',
    );
  assert.equal(strikes.length, 5);
  assert.deepEqual(
    strikes.map((e) => e.x),
    [638, 680, 722, 764, 806],
  );
  assert.equal(c.s.health.get(enemy)!.hp, 500 - MAGE.waveDamage);
  c.world.flush();
  assert.equal(c.s.wave.length, 0);
  const d = arena();
  select(d, 2);
  d.s.facing.get(d.player)!.angle = 0;
  for (let y = 0; y < d.level.h; y++)
    d.level.tiles[y * d.level.w + 22] = Tile.WALL;
  const behind = mob(d, 745, 600, 500);
  castMage(d, 'wave');
  updateMage(d, 0.5);
  assert.equal(
    d.world.drain().filter((e) => e.kind === 'mage' && e.stage === 'impact')
      .length,
    2,
  );
  assert.equal(d.s.health.get(behind)!.hp, 500);
});
test('ultimate repeatedly launches behind the caster while the separate orbit deals damage', () => {
  const c = arena();
  select(c, 2);
  c.s.facing.get(c.player)!.angle = 0;
  const close = mob(c, 650, 600, 500);
  castMage(c, 'barrage');
  updateMage(c, 1 / 60);
  const first = c.s.projectile.owners[0];
  assert.ok(c.world.pos(first).x < 600);
  assert.equal(c.s.projectile.get(first)!.vx, MAGE.orbSpeed);
  assert.equal(c.s.projectile.get(first)!.barrage, true);
  assert.ok(c.s.health.get(close)!.hp < 500);
  assert.ok(c.s.mage.get(c.player)!.orbitPhase > 0);
  for (let i = 0; i < 300; i++) {
    tickTimers(c, 1 / 60);
    updateMage(c, 1 / 60);
  }
  assert.equal(c.s.mage.get(c.player)!.barragePhase, MAGE.barrageShots);
  assert.equal(c.s.projectile.length, MAGE.barrageShots);
  assert.equal(c.s.mage.get(c.player)!.barrageLeft, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(c.s.mage.data)), c.s.mage.data);
});
test('rear orb spawn never crosses a rear wall and orb explosions cannot damage across a front wall', () => {
  const c = arena();
  select(c, 2);
  c.s.facing.get(c.player)!.angle = 0;
  for (let y = 0; y < c.level.h; y++)
    c.level.tiles[y * c.level.w + 17] = Tile.WALL;
  castMage(c, 'barrage');
  updateMage(c, 0.016);
  assert.equal(c.world.pos(c.s.projectile.owners[0]).x, 600);
  const d = arena();
  select(d, 2);
  d.s.facing.get(d.player)!.angle = 0;
  for (let y = 0; y < d.level.h; y++)
    d.level.tiles[y * d.level.w + 20] = Tile.WALL;
  const hidden = mob(d, 670, 600, 500);
  castMage(d, 'barrage');
  updateMage(d, 0.016);
  updateProjectiles(d, 1);
  assert.equal(d.s.health.get(hidden)!.hp, 500);
  const events = d.world
    .drain()
    .filter((e) => e.kind === 'mage' && e.stage === 'impact');
  assert.equal(events.length, 1);
  assert.ok(events[0].x < 640);
});

test('a short touch skill tap still aims at the supplied target after its pointer has released', () => {
  const c = arena();
  select(c, 2);
  c.s.facing.get(c.player)!.angle = Math.PI / 2;
  applyInput(
    c,
    {
      move: { x: 0, y: 0 },
      pointer: c.camera.toScreen({ x: 820, y: 600 }),
      down: 0,
      pressed: BTN.CAST,
      aimActive: false,
    },
    1 / 60,
  );
  assert.equal(c.s.facing.get(c.player)!.angle, 0);
  assert.equal(c.s.wave.data[0].angle, 0);
  assert.ok(c.s.mage.get(c.player)!.cooldowns.wave > 0);
});

// 新职业覆盖真正的伤害、碰撞、状态和生命周期，避免只验证图标换色。
import {
  castStaffAbility,
  professionState,
} from '../src/game/systems/profession';
import {
  updateStaffArts,
  syncElementUnlocks,
} from '../src/game/systems/staff-arts';
import {
  ELEMENT_STAVES,
  STAFF_ARTS,
  STAFF_PROFESSIONS,
  staffIconName,
} from '../src/game/staff-data';
import type { SkillId } from '../src/game/items';
function equipStaff(c: Ctx, school: SkillId): void {
  select(
    c,
    inv(c).slots.findIndex((item) => item?.id === school),
  );
  c.s.facing.get(c.player)!.angle = 0;
}
function artSteps(c: Ctx, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    tickTimers(c, 1 / 60);
    updateStaffArts(c, 1 / 60);
    c.world.flush();
  }
}
test('all five professions share Q/F/R but have fifteen distinct icons and independent cooldowns', () => {
  const c = arena(),
    names = new Set<string>();
  for (const school of SKILL_IDS) {
    for (const ability of MAGE_IDS_FOR_TEST)
      names.add(staffIconName(school, ability));
    equipStaff(c, school);
    player(c).mana = 100;
    castStaffAbility(c, 'field');
    assert.equal(
      professionState(c, school).cooldowns.field,
      STAFF_PROFESSIONS[school].skills.field.cooldown,
    );
    assert.equal(professionState(c, school).cooldowns.wave, 0);
  }
  assert.equal(names.size, 15);
  equipStaff(c, 'ember');
  const before = player(c).mana;
  castStaffAbility(c, 'field');
  assert.equal(player(c).mana, before);
  tickTimers(c, 1);
  assert.equal(professionState(c, 'ember').cooldowns.field, 7);
  select(c, 5);
  castStaffAbility(c, 'barrage');
  assert.equal(professionState(c, 'ember').cooldowns.barrage, 0);
});
const MAGE_IDS_FOR_TEST = ['field', 'wave', 'barrage'] as const;
test('obtaining each staff unlocks permanently even from storage, without selecting an unrelated slot', () => {
  for (const school of ELEMENT_STAVES) {
    const c = arena(),
      state = professionState(c, school);
    state.unlocked = false;
    const index = inv(c).slots.findIndex((i) => i?.id === school);
    inv(c).slots[index] = null;
    select(c, 5);
    syncElementUnlocks(c);
    assert.equal(state.unlocked, false);
    inv(c).slots[20] = { id: school, count: 1 };
    syncElementUnlocks(c);
    assert.equal(state.unlocked, true);
    assert.equal(inv(c).selected, 5);
    inv(c).slots[20] = null;
    syncElementUnlocks(c);
    assert.equal(state.unlocked, true);
  }
});
test('all new spells reject insufficient mana and capped effects without spending or starting cooldown', () => {
  for (const school of ELEMENT_STAVES) {
    const c = arena();
    equipStaff(c, school);
    player(c).mana = 0;
    for (const ability of MAGE_IDS_FOR_TEST) castStaffAbility(c, ability);
    assert.deepEqual(professionState(c, school).cooldowns, {
      field: 0,
      wave: 0,
      barrage: 0,
    });
    assert.equal(c.s.staffZone.length, 0);
    assert.equal(c.s.staffShot.length, 0);
  }
  const c = arena();
  equipStaff(c, 'frost');
  for (let i = 0; i < STAFF_ARTS.maxShots; i++) {
    const id = c.world.createAt([], 0, 0);
    c.s.staffShot.set(id, {
      owner: c.player,
      school: 'frost',
      style: 'spear',
      vx: 0,
      vy: 0,
      age: 0,
      life: 1,
      damage: 1,
      radius: 5,
      pierce: 0,
      hit: [],
      returning: false,
      target: 0,
    });
  }
  const mana = player(c).mana;
  castStaffAbility(c, 'wave');
  assert.equal(player(c).mana, mana);
  assert.equal(professionState(c, 'frost').cooldowns.wave, 0);
});
test('ember aura follows its owner, burns over time, and never burns through walls', () => {
  const c = arena();
  equipStaff(c, 'ember');
  const enemy = mob(c, 645, 600, 1000);
  castStaffAbility(c, 'field');
  updateStaffArts(c, 1 / 60);
  assert.equal(c.s.health.get(enemy)!.hp, 992);
  assert.ok(c.s.mob.get(enemy)!.burn! > 0);
  c.world.setPos(c.player, { x: 600, y: 630 });
  artSteps(c, 0.6);
  assert.ok(c.s.health.get(enemy)!.hp < 984);
  let z = 0;
  c.s.staffZone.forEach((id) => {
    z = id;
  });
  assert.deepEqual(c.world.pos(z), c.world.pos(c.player));
  artSteps(c, 7);
  assert.equal(c.s.staffZone.length, 0);
  assert.equal(c.s.mob.get(enemy)!.burn, 0);
  const d = arena();
  equipStaff(d, 'ember');
  for (let y = 0; y < d.level.h; y++)
    d.level.tiles[y * d.level.w + 20] = Tile.WALL;
  const hidden = mob(d, 680, 600);
  castStaffAbility(d, 'field');
  artSteps(d, 2);
  assert.equal(d.s.health.get(hidden)!.hp, 250);
  assert.equal(d.s.mob.get(hidden)!.burn || 0, 0);
});
test('three fire lances sweep walls, pierce visible targets and ignite them', () => {
  const c = arena();
  equipStaff(c, 'ember');
  const first = mob(c, 660, 600, 1000),
    second = mob(c, 710, 600, 1000);
  castStaffAbility(c, 'wave');
  assert.equal(c.s.staffShot.length, 3);
  artSteps(c, 0.4);
  assert.ok(c.s.health.get(first)!.hp < 1000);
  assert.ok(c.s.health.get(second)!.hp < 1000);
  assert.ok(c.s.mob.get(second)!.burn! > 0);
  const d = arena();
  equipStaff(d, 'ember');
  for (let y = 0; y < d.level.h; y++)
    d.level.tiles[y * d.level.w + 20] = Tile.WALL;
  const hidden = mob(d, 700, 600, 1000);
  castStaffAbility(d, 'wave');
  artSteps(d, 2);
  assert.equal(d.s.health.get(hidden)!.hp, 1000);
  assert.equal(d.s.staffShot.length, 0);
});
test('nine delayed meteors explode once each, leave damaging burn patches, and finish after switching staves', () => {
  const c = arena();
  equipStaff(c, 'ember');
  const enemy = mob(c, 760, 600, 2000);
  castStaffAbility(c, 'barrage');
  updateStaffArts(c, 1 / 60);
  assert.equal(c.s.meteor.length, 1);
  assert.equal(c.s.health.get(enemy)!.hp, 2000);
  equipStaff(c, 'frost');
  artSteps(c, 3.6);
  const hits = c.world
    .drain()
    .filter((e) => e.kind === 'staffArt' && e.ability === 'meteor');
  assert.equal(hits.length, 9);
  assert.ok(c.s.health.get(enemy)!.hp < 2000);
  assert.ok(c.s.staffZone.length > 0);
  artSteps(c, 4);
  assert.equal(c.s.meteor.length, 0);
  assert.equal(c.s.staffZone.length, 0);
});
test('frost nova freezes visible enemies; spear pierces a line; blizzard freezes without phantom initial damage', () => {
  const c = arena();
  equipStaff(c, 'frost');
  const first = mob(c, 665, 600, 1000),
    second = mob(c, 730, 600, 1000);
  castStaffAbility(c, 'field');
  assert.equal(c.s.health.get(first)!.hp, 980);
  assert.equal(c.s.mob.get(first)!.frozen, STAFF_ARTS.frost.freeze);
  castStaffAbility(c, 'wave');
  artSteps(c, 0.35);
  assert.equal(c.s.health.get(first)!.hp, 950);
  assert.equal(c.s.health.get(second)!.hp, 970);
  player(c).mana = 100;
  castStaffAbility(c, 'barrage');
  assert.equal(c.s.health.get(second)!.hp, 970);
  assert.equal(c.s.mob.get(second)!.frozen, 1);
  artSteps(c, 1);
  assert.ok(c.s.health.get(second)!.hp < 950);
  artSteps(c, 6);
  assert.equal(c.s.staffZone.length, 0);
});
test('ward shield actually absorbs damage and three stars retarget a vanished enemy', () => {
  const c = arena();
  equipStaff(c, 'ward');
  const hp = c.s.health.get(c.player)!.hp;
  castStaffAbility(c, 'field');
  applyDamage(c, c.player, 30, 0);
  assert.equal(c.s.health.get(c.player)!.hp, hp);
  assert.equal(player(c).shieldHp, 14);
  const first = mob(c, 730, 600, 1000);
  castStaffAbility(c, 'wave');
  assert.equal(c.s.staffShot.length, 3);
  const next = mob(c, 755, 620, 1000);
  c.world.destroy(first);
  c.world.flush();
  artSteps(c, 0.9);
  assert.ok(c.s.health.get(next)!.hp < 1000);
  artSteps(c, 3);
  assert.equal(c.s.staffShot.length, 0);
});
test('judgment grants a shield and heals only while its owner is inside the field', () => {
  const c = arena();
  equipStaff(c, 'ward');
  c.aimPointer = c.camera.toScreen({ x: 690, y: 600 });
  const hp = c.s.health.get(c.player)!;
  hp.hp = 50;
  const enemy = mob(c, 700, 600, 1000);
  castStaffAbility(c, 'barrage');
  artSteps(c, 0.6);
  assert.ok(hp.hp > 50);
  assert.equal(player(c).shieldHp, 50);
  assert.ok(c.s.health.get(enemy)!.hp < 1000);
  c.world.setPos(c.player, { x: 400, y: 600 });
  const before = hp.hp;
  artSteps(c, 1);
  assert.equal(hp.hp, before);
  assert.ok(
    c.world
      .drain()
      .filter((e) => e.kind === 'staffArt' && e.ability === 'pillar').length >=
      3,
  );
});
test('phase blink stops before a wall and emits two separate end pulses without crossing terrain', () => {
  const c = arena();
  equipStaff(c, 'blink');
  for (let y = 0; y < c.level.h; y++)
    c.level.tiles[y * c.level.w + 20] = Tile.WALL;
  const hidden = mob(c, 690, 600);
  castStaffAbility(c, 'field');
  assert.ok(c.world.pos(c.player).x < 640 - 10);
  assert.ok(c.world.pos(c.player).x > 600);
  assert.ok(player(c).invuln > 0);
  assert.equal(c.s.health.get(hidden)!.hp, 250);
  assert.equal(
    c.world
      .drain()
      .filter((e) => e.kind === 'staffArt' && e.ability === 'blink').length,
    2,
  );
});
test('void blades hit once per outward and return leg, then disappear near the owner', () => {
  const c = arena();
  equipStaff(c, 'blink');
  const enemy = mob(c, 690, 600, 1000);
  castStaffAbility(c, 'wave');
  artSteps(c, 0.4);
  assert.equal(c.s.health.get(enemy)!.hp, 976);
  artSteps(c, 0.65);
  assert.equal(c.s.health.get(enemy)!.hp, 952);
  assert.equal(c.s.staffShot.length, 0);
});
test('singularity pulls through collision-safe motion, collapses once, and serializes without presentation objects', () => {
  const c = arena();
  equipStaff(c, 'blink');
  const enemy = mob(c, 830, 600, 2000);
  castStaffAbility(c, 'barrage');
  artSteps(c, 1);
  assert.ok(c.world.pos(enemy).x < 800);
  const before = c.s.health.get(enemy)!.hp;
  artSteps(c, 3.2);
  assert.ok(
    c.s.health.get(enemy)!.hp <= before - STAFF_ARTS.blink.collapseDamage,
  );
  assert.equal(c.s.staffZone.length, 0);
  const events = c.world.drain();
  assert.equal(
    events.filter((e) => e.kind === 'staffArt' && e.ability === 'collapse')
      .length,
    1,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(c.s.mage.data)), c.s.mage.data);
  const d = arena();
  equipStaff(d, 'blink');
  for (let y = 0; y < d.level.h; y++)
    d.level.tiles[y * d.level.w + 24] = Tile.WALL;
  const hidden = mob(d, 810, 600, 2000);
  castStaffAbility(d, 'barrage');
  artSteps(d, 5);
  assert.equal(d.s.health.get(hidden)!.hp, 2000);
  assert.deepEqual(d.world.pos(hidden), { x: 810, y: 600 });
});

import {
  SANCTUARY,
  inCathedral,
  onCathedral,
} from '../src/game/sanctuary-data';
import {
  applyQuestCommand,
  questProgress,
  canTalk,
  nearbyNpc,
  grantXp,
  levelRequirement,
} from '../src/game/systems/quests';
import { armorReduction, fullSet } from '../src/game/armor';
import { blockPose, BLOCK_RIG } from '../src/game/block-rig';
function addNpc(
  c: Ctx,
  kind: 'herald' | 'priest',
  x: number,
  y: number,
): number {
  const id = c.world.createAt(['npc'], x, y);
  c.s.npc.set(id, { kind });
  return id;
}
test('expanded sacred grounds remove both old seam walls and the nearby east wall, with two real cathedral doors', () => {
  const c = arena(),
    l = createGroveLevel(20261109),
    r = SANCTUARY.cathedral;
  assert.equal(l.w, 96);
  assert.equal(l.h, 72);
  for (let y = 1; y < 47; y++) {
    assert.notEqual(l.at(47, y), Tile.WALL);
    assert.notEqual(l.at(71, y), Tile.WALL);
  }
  for (let x = 1; x < 47; x++) assert.notEqual(l.at(x, 47), Tile.WALL);
  assert.equal(l.blocked(r.x + 16, r.y + 160, 10), true);
  assert.equal(
    l.blocked(SANCTUARY.northDoor.x, SANCTUARY.northDoor.y, 10),
    false,
  );
  assert.equal(
    l.blocked(SANCTUARY.southDoor.x, SANCTUARY.southDoor.y, 10),
    false,
  );
  assert.equal(
    l.lineClear({ x: r.x - 20, y: r.y + 140 }, { x: r.x + 70, y: r.y + 140 }),
    false,
  );
  assert.equal(l.lineClear({ x: 1936, y: 1040 }, { x: 1936, y: 1620 }), true);
  assert.equal(inCathedral({ x: 1936, y: 1040 }), false);
  assert.equal(inCathedral({ x: 1936, y: 1125 }), true);
  assert.equal(inCathedral(SANCTUARY.northDoor), true);
  assert.equal(inCathedral(SANCTUARY.southDoor), true);
  assert.ok(onCathedral({ x: 1936, y: 1500 }));
  const scene = buildScene();
  let pos = { x: 1936, y: 1000 };
  for (let i = 0; i < 310; i++) pos = scene.level.move(pos, 0, 2, 10);
  assert.equal(pos.y, 1620);
  assert.equal(scene.s.npc.length, 2);
  assert.ok(
    scene.s.prop.data.filter((p) => p.sprite === 'propChurchPew').length === 8,
  );
  assert.equal(c.s.journal.get(c.player)!.stage, 'unmet');
});
test('four equipment slots reject wrong parts without losing cursor items and update actual damage reduction', () => {
  const c = arena();
  slot(c, 15);
  const cursor = JSON.stringify(inv(c).cursor);
  slot(c, 43);
  assert.equal(JSON.stringify(inv(c).cursor), cursor);
  assert.equal(inv(c).armor.head, null);
  slot(c, 42);
  assert.equal(c.s.equip.get(c.player)!.head, 'iron');
  for (const [bag, equip] of [
    [16, 43],
    [17, 44],
    [11, 40],
  ]) {
    slot(c, bag);
    slot(c, equip);
    slot(c, bag);
  }
  assert.equal(fullSet(c.s.equip.get(c.player)), 'iron');
  assert.equal(armorReduction(c.s.equip.get(c.player)), 6);
  const hp = c.s.health.get(c.player)!;
  applyDamage(c, c.player, 12, 0);
  assert.equal(hp.hp, 108 + 6);
  slot(c, 42);
  assert.equal(c.s.equip.get(c.player)!.head, 'none');
  assert.equal(fullSet(c.s.equip.get(c.player)), null);
  assert.equal(armorReduction(c.s.equip.get(c.player)), 5);
});
test('only complete dawn equipment grants bonus mana regeneration; mixed sets keep their normal armor', () => {
  const c = arena(),
    eq = c.s.equip.get(c.player)!;
  Object.assign(eq, {
    head: 'sanctum',
    chest: 'sanctum',
    legs: 'sanctum',
    shoes: 'sanctum',
  });
  player(c).mana = 10;
  tickTimers(c, 1);
  assert.equal(player(c).mana, 21);
  eq.head = 'iron';
  tickTimers(c, 1);
  assert.equal(player(c).mana, 30);
  assert.equal(fullSet(eq), null);
  assert.equal(armorReduction(eq), 6);
});
test('modular armor preserves shoulder/wrist and hip/sole connections across walking, casting and all four directions', () => {
  const eq = {
      shoes: 'iron',
      head: 'iron',
      chest: 'iron',
      legs: 'iron',
    } as const,
    pose = newLimbPose();
  pose.blend = 1;
  for (const view of ['front', 'back', 'side'] as const)
    for (const flip of [false, true])
      for (const phase of [0, 0.7, 1.4, 3.2, 5]) {
        pose.phase = phase;
        const parts = blockPose(pose, eq, view, flip, 0.8, 0.7),
          other = blockPose(pose, { shoes: 'bare' }, view, flip, 0.8, 0.7);
        assert.deepEqual(
          parts.map(({ frame, ...part }) => part),
          other.map(({ frame, ...part }) => part),
        );
        for (let i = 0; i < 2; i++) {
          const arm = parts.find((p) => p.part === 'arm' + i)!,
            hand = parts.find((p) => p.part === 'hand' + i)!,
            leg = parts.find((p) => p.part === 'leg' + i)!,
            foot = parts.find((p) => p.part === 'foot' + i)!;
          assert.ok(
            Math.abs(
              Math.hypot(hand.x - arm.x, hand.y - arm.y) - BLOCK_RIG.armLength,
            ) < 0.00001,
          );
          assert.ok(
            Math.abs(
              Math.hypot(foot.x - leg.x, foot.y - leg.y) -
                BLOCK_RIG.legLength * leg.sy,
            ) < 0.00001,
          );
        }
      }
});
test('NPC conversation requires distance, wall visibility and the same building interior', () => {
  const c = arena(),
    id = addNpc(c, 'herald', 650, 600);
  assert.equal(nearbyNpc(c), id);
  applyQuestCommand(c, { type: 'talk', npc: id });
  assert.equal(c.s.journal.get(c.player)!.talking, id);
  applyQuestCommand(c, { type: 'close' });
  c.level.tiles[18 * c.level.w + 20] = Tile.WALL;
  assert.equal(canTalk(c, id), false);
  applyQuestCommand(c, { type: 'talk', npc: id });
  assert.equal(c.s.journal.get(c.player)!.talking, 0);
  c.world.setPos(c.player, { x: 1936, y: 1080 });
  c.world.setPos(id, { x: 1936, y: 1150 });
  assert.equal(canTalk(c, id), false);
  c.world.setPos(c.player, { x: 1936, y: 1130 });
  assert.equal(canTalk(c, id), true);
});
test('herald quest counts only kills after acceptance, advances by real combat, and cannot be claimed twice', () => {
  const c = arena(),
    herald = addNpc(c, 'herald', 650, 600),
    j = c.s.journal.get(c.player)!;
  player(c).kills = 5;
  applyQuestCommand(c, { type: 'talk', npc: herald });
  applyQuestCommand(c, { type: 'accept' });
  assert.equal(j.stage, 'purifying');
  assert.equal(j.talking, 0);
  assert.equal(questProgress(c), 0);
  applyQuestCommand(c, { type: 'talk', npc: herald });
  applyQuestCommand(c, { type: 'report' });
  assert.equal(j.stage, 'purifying');
  applyQuestCommand(c, { type: 'close' });
  for (let i = 0; i < 3; i++) {
    const enemy = mob(c, 700 + i * 20, 600, 1);
    applyDamage(c, enemy, 50, c.player);
  }
  c.world.flush();
  assert.equal(questProgress(c), 3);
  applyQuestCommand(c, { type: 'talk', npc: herald });
  applyQuestCommand(c, { type: 'report' });
  assert.equal(j.stage, 'pilgrimage');
  assert.equal(j.level, 2);
  const before = JSON.stringify(j);
  applyQuestCommand(c, { type: 'report' });
  assert.equal(JSON.stringify(j), before);
});
test('priest reward is atomic when bags are full, grants four real armor items once and restores stats', () => {
  const c = arena(),
    priest = addNpc(c, 'priest', 1936, 1648),
    j = c.s.journal.get(c.player)!;
  j.stage = 'pilgrimage';
  c.world.setPos(c.player, { x: 1936, y: 1600 });
  inv(c).slots = inv(c).slots.map(() => ({ id: 'wood', count: 64 }));
  applyQuestCommand(c, { type: 'talk', npc: priest });
  const before = JSON.stringify(inv(c));
  applyQuestCommand(c, { type: 'bless' });
  assert.equal(j.stage, 'pilgrimage');
  assert.equal(JSON.stringify(inv(c)), before);
  for (let i = 32; i < 36; i++) inv(c).slots[i] = null;
  player(c).mana = 1;
  c.s.health.get(c.player)!.hp = 1;
  applyQuestCommand(c, { type: 'bless' });
  assert.equal(j.stage, 'complete');
  assert.deepEqual(
    inv(c)
      .slots.slice(32)
      .map((i) => i?.id),
    ['sanctum_head', 'sanctum_chest', 'sanctum_legs', 'sanctum_boots'],
  );
  assert.equal(player(c).mana, player(c).maxMana);
  assert.equal(c.s.health.get(c.player)!.hp, c.s.health.get(c.player)!.max);
  const saved = JSON.stringify({ inv: inv(c), j });
  applyQuestCommand(c, { type: 'bless' });
  assert.equal(JSON.stringify({ inv: inv(c), j }), saved);
  assert.deepEqual(JSON.parse(JSON.stringify(j)), j);
});
test('experience levels use rising thresholds and raise real maximum health and mana', () => {
  const c = arena(),
    j = c.s.journal.get(c.player)!;
  grantXp(c, levelRequirement(1) + levelRequirement(2) + 4);
  assert.equal(j.level, 3);
  assert.equal(j.xp, 4);
  assert.equal(c.s.health.get(c.player)!.max, 132);
  assert.equal(player(c).maxMana, 106);
  assert.ok(
    c.world
      .drain()
      .some((e) => e.kind === 'notice' && e.text?.includes('等级 3')),
  );
});

import { updateBlades, castBladeAbility } from '../src/game/systems/blades';
import {
  BLADE_MAGIC,
  BLADES,
  riftFrame,
  type BladeId,
} from '../src/game/weapon-data';
const equipBlade = (c: Ctx, id: BladeId) =>
  applyInventoryCommand(c, { type: 'equip', id });
function bladeSteps(c: Ctx, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    tickTimers(c, 1 / 60);
    updateBlades(c, 1 / 60);
    c.world.flush();
  }
}
test('quick weapon equip swaps with the selected hotbar slot without losing items or accepting a held cursor', () => {
  const c = arena(),
    before = inv(c)
      .slots.filter(Boolean)
      .map((i) => i!.id)
      .sort();
  equipBlade(c, 'scythe');
  assert.equal(inv(c).slots[0]?.id, 'scythe');
  assert.equal(inv(c).slots[18]?.id, 'ember');
  assert.equal(player(c).weapon, 'scythe');
  equipBlade(c, 'sabre');
  assert.equal(player(c).weapon, 'sabre');
  assert.deepEqual(
    inv(c)
      .slots.filter(Boolean)
      .map((i) => i!.id)
      .sort(),
    before,
  );
  slot(c, 9);
  const snapshot = JSON.stringify(inv(c));
  equipBlade(c, 'greatsword');
  assert.equal(JSON.stringify(inv(c)), snapshot);
  assert.equal(player(c).weapon, 'sabre');
});
test('sabre has no Q/F/R special skills, while fast basic attacks deal real melee damage', () => {
  const c = arena();
  equipBlade(c, 'sabre');
  c.s.facing.get(c.player)!.angle = 0;
  const target = mob(c, 640, 600, 1000),
    mana = player(c).mana;
  for (const a of MAGE_IDS_FOR_TEST) castStaffAbility(c, a);
  castSelected(c, true);
  assert.equal(player(c).mana, mana);
  assert.equal(c.s.rift.length, 0);
  assert.equal(c.s.flameWave.length, 0);
  assert.equal(c.s.blade.get(c.player)!.stormLeft, 0);
  castSelected(c);
  assert.equal(c.s.health.get(target)!.hp, 1000 - BLADES.sabre.damage);
  assert.equal(player(c).atkCd, BLADES.sabre.cooldown);
  castSelected(c);
  assert.equal(c.s.health.get(target)!.hp, 981);
});
test('blade professions have independent cooldowns and reject insufficient mana or capped summons before spending', () => {
  const c = arena();
  equipBlade(c, 'scythe');
  castStaffAbility(c, 'field');
  const scythe = c.s.blade.get(c.player)!.schools.scythe;
  assert.equal(scythe.cooldowns.field, 8);
  equipBlade(c, 'greatsword');
  assert.equal(professionState(c, 'greatsword').cooldowns.field, 0);
  player(c).mana = 0;
  for (const a of MAGE_IDS_FOR_TEST) castStaffAbility(c, a);
  assert.deepEqual(professionState(c, 'greatsword').cooldowns, {
    field: 0,
    wave: 0,
    barrage: 0,
  });
  equipBlade(c, 'scythe');
  assert.equal(scythe.cooldowns.field, 8);
  player(c).mana = 100;
  for (let i = 0; i < BLADE_MAGIC.maxRifts; i++) {
    const id = c.world.createAt([], 400, 400);
    c.s.rift.set(id, {
      owner: c.player,
      kind: 'spike',
      age: 0,
      windup: 0.5,
      strikeAt: 0.7,
      life: 2,
      radius: 25,
      damage: 1,
      struck: false,
      group: 0,
    });
  }
  castStaffAbility(c, 'wave');
  assert.equal(player(c).mana, 100);
  assert.equal(scythe.cooldowns.wave, 0);
  castStaffAbility(c, 'barrage');
  assert.equal(player(c).mana, 100);
  assert.equal(scythe.cooldowns.barrage, 0);
});
test('scythe storm follows its owner after switching weapons and cannot deal damage across a wall', () => {
  const c = arena();
  equipBlade(c, 'scythe');
  const first = mob(c, 650, 600, 1000);
  castStaffAbility(c, 'field');
  updateBlades(c, 1 / 60);
  assert.equal(c.s.health.get(first)!.hp, 990);
  equipBlade(c, 'sabre');
  c.world.setPos(c.player, { x: 740, y: 600 });
  const next = mob(c, 800, 600, 1000);
  bladeSteps(c, 0.3);
  assert.ok(c.s.health.get(next)!.hp < 1000);
  bladeSteps(c, 4);
  assert.equal(c.s.blade.get(c.player)!.stormLeft, 0);
  const d = arena();
  equipBlade(d, 'scythe');
  for (let y = 0; y < d.level.h; y++)
    d.level.tiles[y * d.level.w + 20] = Tile.WALL;
  const hidden = mob(d, 675, 600);
  castStaffAbility(d, 'field');
  bladeSteps(d, 2);
  assert.equal(d.s.health.get(hidden)!.hp, 250);
});
test('claw begins as an unstruck magic circle, emerges before one actual grasp hit, and pulls toward the fissure', () => {
  const c = arena();
  equipBlade(c, 'scythe');
  c.s.facing.get(c.player)!.angle = 0;
  const target = mob(c, 785, 600, 1000);
  castStaffAbility(c, 'wave');
  assert.equal(c.s.rift.length, 1);
  let r = c.s.rift.data[0];
  assert.equal(r.struck, false);
  assert.equal(riftFrame('claw', r.age, r.windup), -1);
  bladeSteps(c, 0.49);
  assert.equal(c.s.health.get(target)!.hp, 1000);
  assert.equal(r.struck, false);
  equipBlade(c, 'sabre');
  bladeSteps(c, 0.31);
  assert.equal(c.s.health.get(target)!.hp, 946);
  assert.ok(c.s.mob.get(target)!.frozen! > 0);
  assert.ok(c.world.pos(target).x < 785);
  bladeSteps(c, 0.3);
  assert.equal(c.s.health.get(target)!.hp, 946);
  assert.equal(
    c.world
      .drain()
      .filter((e) => e.kind === 'bladeArt' && e.ability === 'clawHit').length,
    1,
  );
  bladeSteps(c, 2);
  assert.equal(c.s.rift.length, 0);
});
test('claw spawn and its grasp obey wall visibility even when the target cursor lies beyond a wall', () => {
  const c = arena();
  equipBlade(c, 'scythe');
  c.s.facing.get(c.player)!.angle = 0;
  for (let y = 0; y < c.level.h; y++)
    c.level.tiles[y * c.level.w + 20] = Tile.WALL;
  const hidden = mob(c, 670, 600, 1000);
  castStaffAbility(c, 'wave');
  const point = c.world.pos(c.s.rift.owners[0]);
  assert.ok(point.x < 640);
  bladeSteps(c, 1.2);
  assert.equal(c.s.health.get(hidden)!.hp, 1000);
  assert.deepEqual(c.world.pos(hidden), { x: 670, y: 600 });
});
test('ground spikes form a center and four cardinal lines with per-spike circles and one hit per enemy per cast', () => {
  const c = arena();
  equipBlade(c, 'scythe');
  c.s.facing.get(c.player)!.angle = 0;
  const overlap = mob(c, 778, 600, 1000);
  castStaffAbility(c, 'barrage');
  assert.equal(c.s.rift.length, 17);
  assert.equal(c.s.riftGroup.length, 1);
  const coords = c.s.rift.owners.map((id) => c.world.pos(id));
  for (const [x, y] of [
    [760, 456],
    [904, 600],
    [760, 744],
    [616, 600],
  ])
    assert.ok(
      coords.some(
        (p) => Math.abs(p.x - x) < 0.001 && Math.abs(p.y - y) < 0.001,
      ),
    );
  assert.equal(c.s.health.get(overlap)!.hp, 1000);
  bladeSteps(c, 1.5);
  assert.equal(c.s.health.get(overlap)!.hp, 960);
  assert.equal(
    c.world
      .drain()
      .filter((e) => e.kind === 'bladeArt' && e.ability === 'spikeHit').length,
    17,
  );
  bladeSteps(c, 3);
  assert.equal(c.s.rift.length, 0);
  assert.equal(c.s.riftGroup.length, 0);
});
test('each spike arm stops at a wall and its damage cannot leak through that wall', () => {
  const c = arena();
  equipBlade(c, 'scythe');
  c.s.facing.get(c.player)!.angle = 0;
  for (let y = 0; y < c.level.h; y++)
    c.level.tiles[y * c.level.w + 25] = Tile.WALL;
  const hidden = mob(c, 840, 600, 1000);
  castStaffAbility(c, 'barrage');
  assert.equal(c.s.rift.length, 14);
  assert.ok(c.s.rift.owners.every((id) => c.world.pos(id).x < 800));
  bladeSteps(c, 2);
  assert.equal(c.s.health.get(hidden)!.hp, 1000);
});
test('flame wave pierces each visible enemy once, ignites targets and sweeps against walls without tunneling', () => {
  const c = arena();
  equipBlade(c, 'greatsword');
  c.s.facing.get(c.player)!.angle = 0;
  const first = mob(c, 675, 600, 1000),
    second = mob(c, 755, 620, 1000);
  castStaffAbility(c, 'field');
  bladeSteps(c, 0.7);
  assert.equal(c.s.health.get(first)!.hp, 970);
  assert.equal(c.s.health.get(second)!.hp, 970);
  assert.ok(c.s.mob.get(first)!.burn! > 0);
  bladeSteps(c, 1);
  assert.equal(c.s.flameWave.length, 0);
  const d = arena();
  equipBlade(d, 'greatsword');
  d.s.facing.get(d.player)!.angle = 0;
  for (let y = 0; y < d.level.h; y++)
    d.level.tiles[y * d.level.w + 20] = Tile.WALL;
  const hidden = mob(d, 680, 600);
  castStaffAbility(d, 'field');
  updateBlades(d, 1);
  d.world.flush();
  assert.equal(d.s.health.get(hidden)!.hp, 250);
  assert.equal(d.s.flameWave.length, 0);
});
test('three flowing cleaves occur at distinct times with a locked cast direction and stronger third strike', () => {
  const c = arena();
  equipBlade(c, 'greatsword');
  c.s.facing.get(c.player)!.angle = 0;
  const enemy = mob(c, 665, 600, 1000),
    behind = mob(c, 550, 600, 1000);
  castStaffAbility(c, 'wave');
  assert.equal(c.s.health.get(enemy)!.hp, 1000);
  bladeSteps(c, 0.1);
  assert.equal(c.s.health.get(enemy)!.hp, 977);
  c.s.facing.get(c.player)!.angle = Math.PI;
  bladeSteps(c, 0.3);
  assert.equal(c.s.health.get(enemy)!.hp, 949);
  bladeSteps(c, 0.4);
  assert.equal(c.s.health.get(enemy)!.hp, 907);
  assert.equal(c.s.health.get(behind)!.hp, 1000);
  const events = c.world
    .drain()
    .filter((e) => e.kind === 'bladeArt' && e.ability?.startsWith('combo'));
  assert.deepEqual(
    events.map((e) => e.ability),
    ['combo0', 'combo1', 'combo2'],
  );
  assert.ok(events.every((e) => e.angle === 0));
  bladeSteps(c, 1);
  assert.equal(c.s.blade.get(c.player)!.comboLeft, 0);
});
test('inferno is a real six-second self buff with boosted sword damage and incoming reduction after switching', () => {
  const c = arena();
  equipBlade(c, 'greatsword');
  c.s.facing.get(c.player)!.angle = 0;
  const enemy = mob(c, 655, 600, 1000);
  castStaffAbility(c, 'barrage');
  assert.equal(c.s.blade.get(c.player)!.infernoLeft, 6);
  castSelected(c);
  assert.equal(c.s.health.get(enemy)!.hp, 951);
  equipBlade(c, 'sabre');
  applyDamage(c, c.player, 20, 0);
  assert.equal(c.s.health.get(c.player)!.hp, 104);
  bladeSteps(c, 0.5);
  assert.ok(c.s.health.get(enemy)!.hp < 951);
  bladeSteps(c, 6);
  assert.equal(c.s.blade.get(c.player)!.infernoLeft, 0);
  player(c).invuln = 0;
  applyDamage(c, c.player, 20, 0);
  assert.equal(c.s.health.get(c.player)!.hp, 84);
});
test('a released Q touch edge aims the directional flame wave at the supplied target', () => {
  const c = arena();
  equipBlade(c, 'greatsword');
  c.s.facing.get(c.player)!.angle = 0;
  applyInput(
    c,
    {
      move: { x: 0, y: 0 },
      pointer: c.camera.toScreen({ x: 600, y: 750 }),
      down: 0,
      pressed: BTN.FIELD,
      aimActive: false,
    },
    1 / 60,
  );
  assert.equal(c.s.flameWave.length, 1);
  assert.ok(Math.abs(c.s.flameWave.data[0].vx) < 0.001);
  assert.ok(c.s.flameWave.data[0].vy > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(c.s.blade.data)), c.s.blade.data);
});
