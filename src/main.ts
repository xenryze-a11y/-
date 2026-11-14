/** 组装层唯一控制系统顺序、暂停和命令分发；UI / 渲染都不写回 ECS。 */
import { Application, Graphics } from 'pixi.js';
import { TextureAtlas } from './engine/atlas';
import { Camera } from './engine/camera';
import { Input, BTN, type InputState } from './engine/input';
import { FixedLoop } from './engine/loop';
import { WorldView } from './engine/renderer';
import { dist } from './engine/math';
import {
  applyExplorationCommand,
  type ExplorationCommand,
} from './game/systems/exploration';
import { nearbyNpc } from './game/systems/quests';
import { CFG } from './game/data';
import { ensureEquipmentInstances } from './game/adventure';
import {
  SaveRepository,
  captureSave,
  parseSave,
  restoreSave,
  type SaveRecord,
} from './game/saves';
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
import { updateBlades } from './game/systems/blades';
import { updateStaffArts } from './game/systems/staff-arts';
import { castStaffAbility } from './game/systems/profession';
import { updateMage, castMage } from './game/systems/mage';
import { GROVE } from './game/mage-data';
import type { MageSkillId } from './game/mage-data';
import { updateSummons } from './game/systems/basketball';
import { updateRules } from './game/systems/rules';
import { updateSurvival } from './game/systems/survival';
import { spawnDeathStash, takeDeathStash } from './game/death-stash';
import type { Ctx } from './game/systems/context';

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('缺少 #app 容器');
  let graphicsMode: 'auto' | 'power' | 'fine' = 'auto';
  try {
    const stored = localStorage.getItem('ashen-vale.graphics');
    if (stored === 'power' || stored === 'fine') graphicsMode = stored;
  } catch {
    /* 存档不可用不妨碍画质选择 */
  }
  const resolution = (): number =>
    graphicsMode === 'power'
      ? 1
      : Math.min(
          devicePixelRatio || 1,
          graphicsMode === 'auto' && matchMedia('(pointer:coarse)').matches
            ? 1.5
            : 2,
        );
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x253b2d,
    antialias: false,
    resolution: resolution(),
    autoDensity: true,
    preference: 'webgl',
  });
  app.ticker.maxFPS = graphicsMode === 'power' ? 30 : 60;
  host.appendChild(app.canvas);
  const atlas = await TextureAtlas.load();
  document.getElementById('boot')?.remove();
  const camera = new Camera();
  camera.zoom = innerWidth < 600 ? CFG.camera.touchZoom : CFG.camera.zoom;
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
  const saves = new SaveRepository({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  });
  let activeSlot: number | null = null,
    uiReady = false,
    dirty = false,
    lastSavedTime = 0,
    lastSavedWall = 0,
    lastSaveError = '',
    lastSavedAt = '',
    combatUntilWall = 0;
  function processCommands(): void {
    if (commands.some((c) => c.type !== 'select')) dirty = true;
    for (const command of commands.splice(0))
      applyInventoryCommand(ctx, command);
    ensureEquipmentInstances(ctx);
  }
  function saveCurrent(): void {
    if (!uiReady || activeSlot === null || !ui.running || ctx.gameOver) return;
    processCommands();
    ctx.world.flush();
    const record = saves.writeScene(activeSlot, scene);
    lastSavedAt = record.savedAt;
    lastSavedTime = ctx.world.time;
    lastSavedWall = performance.now();
    dirty = false;
    lastSaveError = '';
  }
  function checkpoint(): void {
    try {
      saveCurrent();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '浏览器存储不可用';
      if (uiReady && message !== lastSaveError)
        ui.toast('自动保存失败 · 请在存档菜单导出备份');
      lastSaveError = message;
      lastSavedWall = performance.now();
    }
  }
  function setInventory(open: boolean): void {
    if (!ui.running || ctx.gameOver) return;
    processCommands();
    if (!open && !returnCursor(ctx)) return;
    ui.setInventory(open);
    pendingEdges = 0;
    loop.reset();
  }
  function installScene(next: Scene): void {
    scene = next;
    ctx = makeCtx(scene);
    view.setScene(scene);
    present.clear();
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
    dirty = false;
    lastSavedTime = ctx.world.time;
    lastSavedWall = performance.now();
    lastSaveError = '';
    lastSavedAt = '';
    if (ctx.s.inventory.get(ctx.player)!.cursor) ui.setInventory(true);
    // 死亡掉落的遗物堆：回到同一局时在原位生成。
    if (scene.progress.mode === 'adventure') {
      const stash = takeDeathStash(scene.progress.seed);
      if (stash) {
        spawnDeathStash(ctx, stash);
        view.sync(scene, 0);
        ui.toast('你回到了倒下之地 · 遗物仍在原处');
      }
    }
  }
  function restart(grove = false): void {
    checkpoint();
    activeSlot = null;
    const next = buildScene(CFG.seed + ++run * 7919);
    if (grove) next.world.setPos(next.player, { ...GROVE.start });
    installScene(next);
    ui.toast('武器试用 · 不覆盖冒险存档');
  }
  function loadRecord(slot: number, record: SaveRecord): void {
    const next = restoreSave(record);
    // 换槽先保存当前旅途；同槽读档是回退，不能先覆盖待读取的记录。
    if (activeSlot !== slot) checkpoint();
    activeSlot = slot;
    installScene(next);
    lastSavedAt = record.savedAt;
    ui.toast('已继续「' + next.progress.name + '」· 冷却与持续技能已恢复');
  }
  function exportRecord(slot: number | null): void {
    processCommands();
    ctx.world.flush();
    const record = slot === null ? captureSave(scene) : saves.read(slot).record;
    if (!record) throw new Error('此槽没有可导出的存档');
    const blob = new Blob([JSON.stringify(record)], {
        type: 'application/json',
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `灰烬谷-${record.data.progress.name.replace(/[^\p{L}\p{N}_-]/gu, '_')}-${record.savedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function explore(command: ExplorationCommand): void {
    if (
      !ui.running ||
      ctx.gameOver ||
      ui.menuOpen ||
      ui.inventoryOpen ||
      ctx.s.journal.get(ctx.player)?.talking
    )
      return;
    const result = applyExplorationCommand(ctx, command);
    dirty = true;
    input.reset();
    pendingEdges = 0;
    loop.reset();
    if (result.openMap) ui.setWorldMap(true);
    if (result.teleported) {
      ui.worldMap.close();
      camera.snap(ctx.world.pos(ctx.player));
      view.sync(scene, 0);
      view.applyCamera(camera);
      checkpoint();
    }
  }
  view.setScene(scene);
  camera.boundsW = scene.level.pixelW;
  camera.boundsH = scene.level.pixelH;
  camera.snap(scene.level.spawn);
  view.sync(scene, 0);
  view.applyCamera(camera);
  const ui: GameUI = new GameUI(atlas, input, () => ctx, {
    command: (cmd) => commands.push(cmd),
    inventory: setInventory,
    quest: (command) => {
      if (!ui.running || ui.menuOpen || ui.inventoryOpen) return;
      applyQuestCommand(ctx, command);
      dirty = true;
      input.reset();
      pendingEdges = 0;
      loop.reset();
    },
    interact: () => {
      if (ui.paused || ctx.gameOver) return;
      if (nearbyNpc(ctx)) applyQuestCommand(ctx, { type: 'talk' });
      else explore({ type: 'interact' });
      dirty = true;
      input.reset();
      pendingEdges = 0;
      loop.reset();
    },
    explore,
    graphics: () => {
      graphicsMode =
        graphicsMode === 'auto'
          ? 'power'
          : graphicsMode === 'power'
            ? 'fine'
            : 'auto';
      app.ticker.maxFPS = graphicsMode === 'power' ? 30 : 60;
      app.renderer.resize(innerWidth, innerHeight, resolution());
      try {
        localStorage.setItem('ashen-vale.graphics', graphicsMode);
      } catch {
        /* 不阻止设置 */
      }
      return graphicsMode === 'auto'
        ? '画质：自动'
        : graphicsMode === 'power'
          ? '画质：省电 30 帧'
          : '画质：精细';
    },
    graphicsLabel: () =>
      graphicsMode === 'auto'
        ? '画质：自动'
        : graphicsMode === 'power'
          ? '画质：省电 30 帧'
          : '画质：精细',
    restart,
    checkpoint,
    saves: {
      list: () => [0, 1, 2].map((slot) => saves.read(slot)),
      activeSlot: () => activeSlot,
      status: (): string =>
        activeSlot === null
          ? uiReady && ui.running
            ? '武器试用不会写入冒险存档'
            : '正式冒险自动保存 · 武器试用独立'
          : lastSaveError
            ? `第 ${activeSlot + 1} 槽 · 保存失败，请导出备份（${lastSaveError}）`
            : `第 ${activeSlot + 1} 槽 · ${lastSavedAt ? '已保存 ' + new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '尚未保存'}`,
      save: () => {
        if (activeSlot === null || ctx.gameOver)
          throw new Error('请先开始或继续一段冒险');
        try {
          saveCurrent();
        } catch {
          throw new Error('浏览器存储不可用或已满，请导出当前旅途备份');
        }
      },
      newGame: (slot, name) => {
        checkpoint();
        const next = buildScene(
          (Date.now() + ++run * 7919) >>> 0,
          'adventure',
          name,
        );
        activeSlot = slot;
        installScene(next);
        checkpoint();
        ui.toast(
          lastSaveError
            ? '当前旅途暂未保存 · 请从存档菜单导出备份'
            : `「${name}」启程 · 自动保存已开启`,
        );
      },
      load: (slot) => {
        const result = saves.read(slot);
        if (!result.record) throw new Error(result.error || '此槽还没有角色');
        loadRecord(slot, result.record);
        if (result.recovered) ui.toast('主存档损坏 · 已恢复上次有效备份');
      },
      export: exportRecord,
      import: (slot, raw) => {
        const record = parseSave(raw),
          next = restoreSave(record);
        if (activeSlot !== slot) checkpoint();
        saves.write(slot, record);
        activeSlot = slot;
        installScene(next);
        lastSavedAt = record.savedAt;
        ui.toast('导入成功 · 已继续这段旅途');
      },
    },
  });
  uiReady = true;
  window.addEventListener('pagehide', checkpoint);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      checkpoint();
      if (ui.running && !ctx.gameOver) ui.setMenu(true);
    }
  });
  window.addEventListener('resize', () => {
    app.renderer.resize(innerWidth, innerHeight, resolution());
    camera.w = app.screen.width;
    camera.h = app.screen.height;
    camera.zoom = innerWidth < 600 ? CFG.camera.touchZoom : CFG.camera.zoom;
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
        updateBlades(ctx, _fixed);
        updateSummons(ctx, _fixed);
        updateRules(ctx);
        updateSurvival(ctx, _fixed);
        ctx.world.flush();
        ensureEquipmentInstances(ctx);
      });
      const playerAt = ctx.world.pos(ctx.player);
      camera.zoom = innerWidth < 600 ? CFG.camera.touchZoom : CFG.camera.zoom;
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
    if (
      events.some((e) =>
        [
          'swing',
          'cast',
          'mage',
          'staffArt',
          'bladeArt',
          'hurt',
          'playerHurt',
        ].includes(e.kind),
      )
    )
      combatUntilWall = performance.now() + 1500;
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
    if (
      events.some(
        (e) =>
          e.kind === 'kill' ||
          e.kind === 'pickup' ||
          (e.kind === 'notice' && e.text?.startsWith('发现 ')),
      )
    )
      dirty = true;
    if (
      activeSlot !== null &&
      !ctx.gameOver &&
      performance.now() - lastSavedWall > 1000 &&
      ((dirty && (ui.paused || performance.now() > combatUntilWall)) ||
        ctx.world.time - lastSavedTime >= 20)
    )
      checkpoint();
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
    saves: {
      repository: saves,
      capture: () => captureSave(scene),
      restore: loadRecord,
      checkpoint,
      get activeSlot() {
        return activeSlot;
      },
      get error() {
        return lastSaveError;
      },
    },
    actions: {
      command: (cmd: InventoryCommand) => {
        applyInventoryCommand(ctx, cmd);
      },
      inventory: setInventory,
      explore,
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
