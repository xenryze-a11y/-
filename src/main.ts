/** 组装层唯一控制系统顺序、暂停和命令分发；UI / 渲染都不写回 ECS。 */
import { Application, Graphics } from 'pixi.js';
import { TextureAtlas } from './engine/atlas';
import { Camera } from './engine/camera';
import { Input, BTN, type InputState } from './engine/input';
import { FixedLoop } from './engine/loop';
import { WorldView } from './engine/renderer';
import { dist } from './engine/math';
import { CFG } from './game/data';
import { GameUI } from './game/ui';
import {
  applyInventoryCommand,
  returnCursor,
  type InventoryCommand,
} from './game/inventory';
import { Presentation } from './game/present';
import { buildScene, type Scene } from './game/spawn';
import { applyInput } from './game/systems/control';
import { tickTimers } from './game/systems/timers';
import { updateAI } from './game/systems/ai';
import { updateProjectiles } from './game/systems/projectile';
import { updateFields, castSelected } from './game/systems/magic';
import { applyQuestCommand, type QuestCommand } from './game/systems/quests';
import { updateStaffArts } from './game/systems/staff-arts';
import { castStaffAbility } from './game/systems/profession';
import { updateMage, castMage } from './game/systems/mage';
import { GROVE } from './game/mage-data';
import type { MageSkillId } from './game/mage-data';
import { updateSummons } from './game/systems/basketball';
import { resetRules, updateRules } from './game/systems/rules';
import type { Ctx } from './game/systems/context';

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('缺少 #app 容器');
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x253b2d,
    antialias: false,
    resolution: Math.min(devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: 'webgl',
  });
  host.appendChild(app.canvas);
  const atlas = await TextureAtlas.load();
  document.getElementById('boot')?.remove();
  const camera = new Camera();
  camera.zoom = innerWidth < 600 ? 1.75 : CFG.camera.zoom;
  camera.w = app.screen.width;
  camera.h = app.screen.height;
  const view = new WorldView(atlas),
    present = new Presentation(view.fxLayer, view.decalLayer, atlas, camera),
    crosshair = new Graphics();
  app.stage.addChild(view.root, crosshair);
  const input = new Input(app.canvas);
  input.setPointerXY(app.screen.width / 2 + 80, app.screen.height / 2);
  const loop = new FixedLoop();
  let run = 0,
    scene: Scene = buildScene();
  const makeCtx = (s: Scene): Ctx => ({
    ...s,
    camera,
    gameOver: false,
    debug: false,
    aimPointer: { ...input.pointer },
  });
  let ctx = makeCtx(scene),
    pendingEdges = 0,
    fps = 60;
  const commands: InventoryCommand[] = [];
  function processCommands(): void {
    for (const command of commands.splice(0))
      applyInventoryCommand(ctx, command);
  }
  function setInventory(open: boolean): void {
    if (!ui.running || ctx.gameOver) return;
    processCommands();
    if (!open && !returnCursor(ctx)) return;
    ui.setInventory(open);
    pendingEdges = 0;
    loop.reset();
  }
  function restart(grove = false): void {
    scene = buildScene(CFG.seed + ++run * 7919);
    ctx = makeCtx(scene);
    if (grove) scene.world.setPos(scene.player, { ...GROVE.start });
    view.setScene(scene);
    present.clear();
    resetRules();
    camera.boundsW = scene.level.pixelW;
    camera.boundsH = scene.level.pixelH;
    camera.snap(scene.world.pos(scene.player));
    pendingEdges = 0;
    commands.length = 0;
    loop.reset();
    input.reset();
    ui.restarted();
    view.sync(scene, 0);
    view.applyCamera(camera);
  }
  view.setScene(scene);
  camera.boundsW = scene.level.pixelW;
  camera.boundsH = scene.level.pixelH;
  camera.snap(scene.level.spawn);
  view.sync(scene, 0);
  view.applyCamera(camera);
  const ui = new GameUI(atlas, input, () => ctx, {
    command: (cmd) => commands.push(cmd),
    inventory: setInventory,
    quest: (command) => {
      if (!ui.running || ui.menuOpen || ui.inventoryOpen) return;
      applyQuestCommand(ctx, command);
      input.reset();
      pendingEdges = 0;
      loop.reset();
    },
    restart,
  });
  window.addEventListener('resize', () => {
    camera.w = app.screen.width;
    camera.h = app.screen.height;
    camera.zoom = innerWidth < 600 ? 1.75 : CFG.camera.zoom;
  });
  app.ticker.add((ticker) => {
    const realDT = Math.min(ticker.deltaMS / 1000, 0.1);
    fps = fps * 0.9 + (1 / Math.max(realDT, 0.001)) * 0.1;
    processCommands();
    if (!ui.paused) {
      if (ui.touch && !input.aiming) {
        const pos = ctx.world.pos(ctx.player),
          id = ctx.world
            .query(pos, 230, 'mob')
            .filter(
              (e) =>
                !ctx.world.isPendingDeath(e) &&
                ctx.level.lineClear(pos, ctx.world.pos(e)),
            )
            .sort(
              (a, b) =>
                dist(pos, ctx.world.pos(a)) - dist(pos, ctx.world.pos(b)) ||
                a - b,
            )[0];
        const facing = ctx.s.facing.get(ctx.player)!.angle,
          aim = id
            ? ctx.world.pos(id)
            : {
                x: pos.x + Math.cos(facing) * 90,
                y: pos.y + Math.sin(facing) * 90,
              },
          screen = camera.toScreen(aim);
        input.setPointerXY(screen.x, screen.y);
      }
      const snap = input.snapshot();
      pendingEdges |= snap.pressed;
      loop.advance(realDT, (_fixed, index) => {
        const st: InputState = {
          ...snap,
          pressed: index === 0 ? pendingEdges : 0,
        };
        if (index === 0) pendingEdges = 0;
        if (st.pressed & BTN.DEBUG) ctx.debug = !ctx.debug;
        // 冷却在攻击之后；所有新系统都在投射物之后、flush 之前。
        applyInput(ctx, st, _fixed);
        tickTimers(ctx, _fixed);
        updateAI(ctx, _fixed);
        updateProjectiles(ctx, _fixed);
        updateFields(ctx, _fixed);
        updateMage(ctx, _fixed);
        updateStaffArts(ctx, _fixed);
        updateSummons(ctx, _fixed);
        updateRules(ctx);
        ctx.world.flush();
      });
      const playerAt = ctx.world.pos(ctx.player);
      camera.zoom = innerWidth < 600 ? 1.75 : CFG.camera.zoom;
      camera.follow(playerAt, realDT);
      camera.update(realDT);
      present.update(realDT);
      present.sync(scene, realDT);
      view.sync(scene, realDT);
    } else {
      input.reset();
      pendingEdges = 0;
      loop.reset();
    }
    // 队列只 drain 一次，两个只读表现消费者共享同一批事件。
    const events = ctx.world.drain();
    present.consume(events);
    ui.consume(events);
    camera.w = app.screen.width;
    camera.h = app.screen.height;
    view.applyCamera(camera);
    crosshair.clear();
    if (!ui.paused && !ui.touch) {
      const { x, y } = input.pointer;
      crosshair
        .circle(x, y, 4)
        .stroke({ width: 1, color: 0xe6ddbb, alpha: 0.65 });
      crosshair
        .moveTo(x - 10, y)
        .lineTo(x - 6, y)
        .moveTo(x + 6, y)
        .lineTo(x + 10, y)
        .moveTo(x, y - 10)
        .lineTo(x, y - 6)
        .moveTo(x, y + 6)
        .lineTo(x, y + 10)
        .stroke({ width: 1, color: 0xe6ddbb, alpha: 0.8 });
    }
    ui.update(ctx, realDT, fps);
  });
  (window as unknown as { __ASHEN__: unknown }).__ASHEN__ = {
    atlas,
    camera,
    renderer: view,
    present,
    app,
    input,
    ui,
    dumpAtlas: () => atlas.dump(),
    restart,
    actions: {
      command: (cmd: InventoryCommand) => {
        applyInventoryCommand(ctx, cmd);
      },
      inventory: setInventory,
      quest: (command: QuestCommand) => applyQuestCommand(ctx, command),
      cast: (special = false) => castSelected(ctx, special),
      mage: (ability: MageSkillId) => castMage(ctx, ability),
      staff: (ability: MageSkillId) => castStaffAbility(ctx, ability),
    },
    get world() {
      return ctx.world;
    },
    get scene() {
      return scene;
    },
    get ctx() {
      return ctx;
    },
    get inventory() {
      return ctx.s.inventory.get(ctx.player);
    },
  };
  console.info('[ashen-vale] 灰烬谷 II 源码版就绪。');
}
boot().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) {
    el.className = 'error';
    el.textContent = `启动失败：\n${err instanceof Error ? err.message : String(err)}`;
  }
});
