/**
 * 组装层：把引擎层和游戏层接起来，并定死「一帧里发生什么」的顺序。
 * 对应 goengine 的 game/game.go Advance + Scene.Build。
 *
 * World.Step 的系统顺序是引擎定的，不由游戏层自己拼：
 *   applyInput（攻击判定） → tickTimers（冷却） → updateAI → updateProjectiles → rules → flush
 * 冷却必须在攻击判定之后推进，否则同一帧能打两次。
 */
import { Application } from 'pixi.js';
import { TextureAtlas } from './engine/atlas';
import { Camera } from './engine/camera';
import { Input, BTN, type InputState } from './engine/input';
import { FixedLoop } from './engine/loop';
import { WorldView } from './engine/renderer';
import { CFG } from './game/data';
import { Hud } from './game/hud';
import { Presentation } from './game/present';
import { buildScene, type Scene } from './game/spawn';
import { applyInput } from './game/systems/control';
import { tickTimers } from './game/systems/timers';
import { updateAI } from './game/systems/ai';
import { updateProjectiles } from './game/systems/projectile';
import { resetRules, updateRules } from './game/systems/rules';
import type { Ctx } from './game/systems/context';

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  const bootEl = document.getElementById('boot');
  if (!host) throw new Error('缺少 #app 容器');

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x10140f,
    antialias: false,
    resolution: 1,
    autoDensity: true,
  });
  host.appendChild(app.canvas);
  bootEl?.remove();

  const atlas = await TextureAtlas.load();
  const camera = new Camera();
  camera.zoom = CFG.camera.zoom;
  camera.w = app.screen.width;
  camera.h = app.screen.height;

  const view = new WorldView(atlas);
  const hud = new Hud();
  const present = new Presentation(view.fxLayer, view.decalLayer, atlas, camera);
  app.stage.addChild(view.root, hud.root);

  const input = new Input(app.canvas);
  // 鼠标还没动过时给一个默认瞄准点，否则角色会一直朝屏幕左上角。
  input.pointer.x = app.screen.width / 2 + 80;
  input.pointer.y = app.screen.height / 2;
  const loop = new FixedLoop();

  let run = 0;
  let scene: Scene = buildScene();
  const makeCtx = (s: Scene): Ctx => ({
    world: s.world, s: s.s, level: s.level, camera, player: s.player, gameOver: false, debug: false,
  });
  let ctx = makeCtx(scene);
  view.setScene(scene);
  camera.boundsW = scene.level.pixelW;
  camera.boundsH = scene.level.pixelH;
  camera.snap(scene.level.spawn);

  let pendingEdges = 0;
  let fps = 60;

  function restart(): void {
    run++;
    scene = buildScene(CFG.seed + run * 7919);
    ctx = makeCtx(scene);
    view.setScene(scene);
    present.clear();
    resetRules();
    camera.boundsW = scene.level.pixelW;
    camera.boundsH = scene.level.pixelH;
    camera.snap(scene.level.spawn);
    pendingEdges = 0;
    loop.reset();
  }

  window.addEventListener('resize', () => {
    camera.w = app.screen.width;
    camera.h = app.screen.height;
  });

  app.ticker.add((ticker) => {
    const realDT = Math.min(ticker.deltaMS / 1000, 0.1);
    fps = fps * 0.9 + (1 / Math.max(realDT, 1e-3)) * 0.1;
    const snap = input.snapshot();
    // 边沿要留到真正跑了一个模拟步才清，否则高刷屏上会丢按键。
    pendingEdges |= snap.pressed;

    if (pendingEdges & BTN.RESTART) restart();
    if (pendingEdges & BTN.DEBUG) ctx.debug = !ctx.debug;
    const gameplayEdges = pendingEdges & ~(BTN.RESTART | BTN.DEBUG);

    loop.advance(realDT, (fixed, stepIndex) => {
      const st: InputState = { ...snap, pressed: stepIndex === 0 ? gameplayEdges : 0 };
      if (stepIndex === 0) pendingEdges = 0;
      applyInput(ctx, st, fixed);
      tickTimers(ctx, fixed);
      updateAI(ctx, fixed);
      updateProjectiles(ctx, fixed);
      updateRules(ctx);
      ctx.world.flush();
    });
    // 事件每帧 Drain 一次，只有表现层消费。
    present.consume(ctx.world.drain());

    camera.w = app.screen.width;
    camera.h = app.screen.height;
    camera.follow(ctx.world.pos(ctx.player), realDT);
    camera.update(realDT);
    present.update(realDT);
    view.sync(scene, realDT);
    view.applyCamera(camera);
    hud.update(ctx, snap, fps, app.screen.width, app.screen.height);
  });

  // 给朋友调试用：控制台里 __ASHEN__.dumpAtlas() 导出美术模板。
  (window as unknown as { __ASHEN__: unknown }).__ASHEN__ = {
    atlas,
    camera,
    dumpAtlas: (): void => atlas.dump(),
    restart,
    get world() { return ctx.world; },
    get scene() { return scene; },
    get ctx() { return ctx; },
  };
  console.info('[ashen-vale] 就绪。__ASHEN__.dumpAtlas() 可导出图集模板。');
}

boot().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) {
    el.className = 'error';
    el.textContent = `启动失败：\n${err instanceof Error ? err.message : String(err)}`;
  }
});
