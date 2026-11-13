/** DOM 是表现层：读取 ECS 快照，发输入/背包命令，从不直接改组件。 */
import { newLimbPose } from '../engine/animation';
import { blockPose } from './block-rig';
import { armorReduction, fullSet } from './armor';
import { NPCS, inCathedral } from './sanctuary-data';
import {
  nearbyNpc,
  dialogue,
  questObjective,
  levelRequirement,
  type QuestCommand,
} from './systems/quests';
import { BTN, type Input } from '../engine/input';
import type { TextureAtlas } from '../engine/atlas';
import type { GameEvent } from '../engine/ecs';
import { WorldMapUI } from './world-map-ui';
import { drawExplorationMap, regionCaption } from './exploration-map';
import { REGIONS, regionAt } from './world-data';
import {
  nearbySite,
  worldSites,
  type ExplorationCommand,
} from './systems/exploration';
import { MAGE_IDS, type MageSkillId } from './mage-data';
import {
  COMBAT_PROFESSIONS,
  combatIconName,
  type CombatProfessionId,
} from './weapon-data';
import { selectedProfession, professionState } from './systems/profession';
import { ITEMS, ABILITIES, isAbility, type ItemId } from './items';
import {
  getSlot,
  recipe,
  type InventoryState,
  type ItemStack,
  type InventoryCommand,
} from './inventory';
import type { Ctx } from './systems/context';
import { UI_TEMPLATE } from './ui-template';
import { DUNGEONS } from './realm-data';
import { bindMobileStick } from './mobile-stick';
import { bindLandscapeButtons } from './mobile-display';
import { SaveMenu, type SaveActions } from './save-menu';
import './ui.css';
import './mage-ui.css';
import './sanctuary-ui.css';
import './save-ui.css';

export interface UIActions {
  command(command: InventoryCommand): void;
  inventory(open: boolean): void;
  restart(grove?: boolean): void;
  quest(command: QuestCommand): void;
  interact(): void;
  graphics(): string;
  graphicsLabel(): string;
  view(): string;
  viewLabel(): string;
  explore(command: ExplorationCommand): void;
  saves: SaveActions;
  checkpoint(): void;
}
export class GameUI {
  readonly saves: SaveMenu;
  readonly worldMap: WorldMapUI;
  readonly element = document.createElement('div');
  running = false;
  menuOpen = true;
  inventoryOpen = false;
  touch = matchMedia('(pointer:coarse)').matches;
  private releaseStick: () => void = () => {};
  private helpOpen = false;
  private split = false;
  private quick = false;
  private toastTime = 0;
  private lastInventory?: InventoryState;
  private lastRevision = -1;
  private mapTime = 0;
  private deathShown = false;
  private pointerX = innerWidth / 2;
  private pointerY = innerHeight / 2;
  private icons: Record<ItemId, string> = {} as Record<ItemId, string>;
  constructor(
    private readonly atlas: TextureAtlas,
    private readonly input: Input,
    private readonly context: () => Ctx,
    private readonly actions: UIActions,
  ) {
    this.element.id = 'av2';
    this.element.innerHTML = UI_TEMPLATE;
    document.body.appendChild(this.element);
    this.saves = new SaveMenu(this.element, actions.saves);
    this.worldMap = new WorldMapUI(this.element, context, actions.explore);
    this.makeIcons();
    this.makeMageIcons();
    this.preview();
    this.events();
    bindLandscapeButtons(this.element, (message) => this.toast(message));
    this.setTouch(this.touch);
    this.q('#av-quality-button').textContent = actions.graphicsLabel();
    this.q('#av-view-button').textContent = actions.viewLabel();
    this.renderInventory();
    this.setMenu(true);
  }
  get paused(): boolean {
    return (
      !this.running ||
      this.menuOpen ||
      this.inventoryOpen ||
      this.helpOpen ||
      this.saves.opened ||
      this.worldMap.opened ||
      !!this.context().s.journal.get(this.context().player)?.talking
    );
  }
  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.element.querySelector<T>(selector)!;
  }
  private get inventory(): InventoryState {
    return this.context().s.inventory.get(this.context().player)!;
  }
  private makeIcons(): void {
    for (const id of Object.keys(ITEMS) as ItemId[]) {
      const frame = this.atlas.frames['item_' + id],
        c = document.createElement('canvas');
      c.width = 40;
      c.height = 40;
      c.getContext('2d')!.drawImage(
        this.atlas.canvas,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        0,
        0,
        40,
        40,
      );
      this.icons[id] = c.toDataURL();
    }
  }
  private iconSchool?: CombatProfessionId;
  private lastStaff: CombatProfessionId = 'ember';
  private makeMageIcons(school: CombatProfessionId = 'ember'): void {
    if (this.iconSchool === school) return;
    this.iconSchool = school;
    for (const id of MAGE_IDS) {
      const frame = this.atlas.frames[combatIconName(school, id)],
        canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      canvas
        .getContext('2d')!
        .drawImage(this.atlas.canvas, frame.x, frame.y, 64, 64, 0, 0, 64, 64);
      this.q<HTMLImageElement>(`[data-mage="${id}"] img`).src =
        canvas.toDataURL();
    }
  }
  private updateMageHUD(ctx: Ctx): void {
    const player = ctx.s.player.get(ctx.player)!,
      selected = selectedProfession(ctx);
    if (selected) this.lastStaff = selected;
    const school = selected || this.lastStaff,
      state = professionState(ctx, school),
      role = COMBAT_PROFESSIONS[school],
      active = !!selected && state.unlocked;
    this.makeMageIcons(school);
    this.q('#av-combat').style.setProperty('--school-accent', role.color);
    const held = this.inventory.slots[this.inventory.selected]?.id,
      sabre = held === 'sabre';
    this.q('#av-utilities [data-action=cast]').hidden =
      !!selected || !['sword', 'basketball'].includes(held || '');
    this.q('#av-utilities').classList.toggle('av-utils-weapon', !selected);
    this.q('#av-class-skills').hidden = !active;
    this.q('#av-class-skills').setAttribute(
      'aria-label',
      role.name + '专属三技能',
    );
    this.q('#av-class-hint').hidden = active;
    this.q<HTMLButtonElement>('#av-class-hint').disabled = sabre;
    this.q('#av-class-hint').textContent = sabre
      ? '月弧弯刃 · 无主动技能'
      : state.unlocked
        ? '装备技能武器 · Q / F / R'
        : '古树祭坛 · 寻找雷电法杖';
    this.q('#av-class-caption').textContent = sabre
      ? 'CURVED SABRE · 月弧弯刃'
      : active
        ? role.title + ' · ' + role.name
        : state.unlocked
          ? '武器秘技 · Q / F / R'
          : 'ANCIENT GROVE · 古树祭坛';
    for (const id of MAGE_IDS) {
      const button = this.q<HTMLButtonElement>(`[data-mage="${id}"]`),
        remaining = state.cooldowns[id],
        def = role.skills[id],
        ratio = Math.min(1, Math.max(0, remaining / def.cooldown)),
        circumference = 2 * Math.PI * 32;
      const ring = button.querySelector<SVGCircleElement>('.av-ring-progress')!;
      ring.style.strokeDasharray = String(circumference);
      ring.style.strokeDashoffset = String(circumference * ratio);
      button.classList.toggle('cooling', remaining > 0);
      button.classList.toggle('ready', remaining <= 0);
      button.classList.toggle('no-mana', player.mana < def.cost);
      button.disabled = !active || remaining > 0 || player.mana < def.cost;
      button.querySelector('.av-mage-key')!.textContent =
        def.key + ' · ' + def.short;
      button.querySelector('.av-mage-count')!.textContent =
        remaining > 0
          ? remaining >= 10
            ? String(Math.ceil(remaining))
            : remaining.toFixed(1)
          : '';
      button.title =
        def.name + ' · ' + def.description + ' · ' + def.cost + ' 法力';
      button.setAttribute(
        'aria-label',
        `${def.name}，${def.key}，${remaining > 0 ? '冷却 ' + remaining.toFixed(1) + ' 秒' : '已就绪'}，${def.cost} 法力`,
      );
      button.dataset.remaining = String(remaining);
      button.dataset.school = school;
    }
    const hp = ctx.s.health.get(ctx.player)!;
    this.q('#av-health-orb').style.setProperty(
      '--fill',
      String(Math.max(0, hp.hp / hp.max)),
    );
    this.q('#av-mana-orb').style.setProperty(
      '--fill',
      String(player.mana / player.maxMana),
    );
    this.q('#av-health-orb b').textContent = String(
      Math.max(0, Math.ceil(hp.hp)),
    );
    this.q('#av-mana-orb b').textContent = String(Math.floor(player.mana));
    this.q('#av-region-name').textContent = inCathedral(
      ctx.world.pos(ctx.player),
    )
      ? '晨曦大教堂 · 圣堂内殿'
      : regionCaption(ctx);
    this.q('#av-region-name').style.color =
      ctx.s.journal.get(ctx.player)!.level <
      REGIONS[regionAt(ctx.world.pos(ctx.player))].levels[0]
        ? '#efac7f'
        : '';
  }
  private preview(): void {
    const canvas = this.q<HTMLCanvasElement>('#av-avatar-preview'),
      g = canvas.getContext('2d')!,
      eq = this.context().s.equip.get(this.context().player)!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.imageSmoothingEnabled = false;
    for (const p of blockPose(newLimbPose(), eq, 'front', false)) {
      const f = this.atlas.frames[p.frame];
      g.save();
      g.translate(64 + p.x * 2.5, 148 + p.y * 2.5);
      g.rotate(p.rotation);
      g.scale(2.5 * p.sx, 2.5 * p.sy);
      g.drawImage(
        this.atlas.canvas,
        f.x,
        f.y,
        f.w,
        f.h,
        -p.ax * f.w,
        -p.ay * f.h,
        f.w,
        f.h,
      );
      g.restore();
    }
  }
  private dialogueKey = '';
  private updateJournal(ctx: Ctx): void {
    const j = ctx.s.journal.get(ctx.player)!,
      npc = nearbyNpc(ctx),
      site = npc ? undefined : nearbySite(ctx),
      def = dialogue(ctx),
      open = !!def && !this.menuOpen && !this.inventoryOpen;
    this.q('#av-dialogue').hidden = !open;
    this.element.classList.toggle('talking', open);
    this.q('#av-interact').hidden = (!npc && !site) || this.paused;
    if (npc)
      this.q('#av-interact').textContent =
        '交谈 C · ' + NPCS[ctx.s.npc.get(npc)!.kind].name;
    if (site)
      this.q('#av-interact').textContent = 'C · ' + site.definition.name;
    const tracked = worldSites(ctx).find(
        (s) => s.definition.id === ctx.progress.trackedSite,
      ),
      at = ctx.world.pos(ctx.player);
    this.q('#av-exploration-objective').textContent = tracked
      ? `◇ ${tracked.definition.name} · ${Math.round(Math.hypot(tracked.position.x - at.x, tracked.position.y - at.y) / 16)} 米 · ${tracked.position.x > at.x + 32 ? '东' : tracked.position.x < at.x - 32 ? '西' : ''}${tracked.position.y > at.y + 32 ? '南' : tracked.position.y < at.y - 32 ? '北' : ''} · M 地图`
      : 'M 地图 · 沿道路发现新地点';
    const underground = ctx.progress.zone !== 'overworld';
    this.q('#av-quest-tracker > b').textContent = underground
      ? DUNGEONS[ctx.progress.zone as keyof typeof DUNGEONS].name
      : '神树的守望';
    this.q('#av-quest-objective').textContent = underground
      ? ctx.progress.bosses.includes(ctx.progress.zone + '-warden')
        ? '核心已清除，回环近路已开启；可继续搜寻侧室遗箱。'
        : '探索岔路，清除核心守卫；入口可返回地表。'
      : questObjective(ctx);
    this.q('#av-xp').textContent =
      `等级 ${j.level} · ${j.xp} / ${levelRequirement(j.level)} 经验`;
    if (def) {
      const key = JSON.stringify(def);
      if (this.dialogueKey !== key) {
        this.dialogueKey = key;
        this.q('#av-dialogue-name').textContent = def.title;
        this.q('#av-dialogue-title').textContent = def.subtitle;
        this.q('#av-dialogue-text').textContent = def.body;
        this.q('#av-dialogue-choices').innerHTML = def.choices
          .map(
            (c) =>
              `<button data-quest-action="${c.command}">${c.label}</button>`,
          )
          .join('');
        const canvas = this.q<HTMLCanvasElement>('#av-dialogue-portrait'),
          g = canvas.getContext('2d')!,
          kind = ctx.s.npc.get(j.talking)!.kind,
          f = this.atlas.frames[NPCS[kind].sprite];
        g.clearRect(0, 0, 96, 112);
        g.imageSmoothingEnabled = false;
        g.drawImage(
          this.atlas.canvas,
          f.x,
          f.y,
          f.w,
          f.h,
          (96 - f.w) / 2,
          112 - f.h,
          f.w,
          f.h,
        );
      }
    } else this.dialogueKey = '';
  }
  toast(message: string): void {
    this.q('#av-toast').textContent = message;
    this.toastTime = 2.4;
  }
  consume(events: readonly GameEvent[]): void {
    for (const ev of events)
      if (
        (ev.kind === 'notice' ||
          ev.kind === 'noMana' ||
          ev.kind === 'pickup') &&
        ev.text
      )
        this.toast(ev.text);
  }
  setInventory(open: boolean): void {
    if (open) this.releaseStick();
    this.inventoryOpen = open;
    this.input.reset();
    this.element.classList.toggle('inventory-open', open);
    this.q('#av-inventory').hidden = !open;
    this.q('#av-tooltip').hidden = true;
    this.renderInventory();
    if (open) this.actions.checkpoint();
    if (open) this.q<HTMLButtonElement>('#av-close-bag').focus();
    else this.q<HTMLButtonElement>('#av-bag-button').blur();
  }
  setWorldMap(open: boolean): void {
    if (open) this.releaseStick();
    if (
      !this.running ||
      this.context().gameOver ||
      this.menuOpen ||
      this.inventoryOpen ||
      this.helpOpen ||
      this.context().s.journal.get(this.context().player)?.talking
    )
      return;
    this.input.reset();
    if (open) {
      this.actions.checkpoint();
      this.worldMap.open();
    } else this.worldMap.close();
  }
  setMenu(open: boolean): void {
    if (open) {
      this.worldMap.close();
      this.releaseStick();
    }
    this.menuOpen = open;
    this.input.reset();
    this.q('#av-menu2').hidden = !open;
    this.q('#av-resume').hidden = !this.running || this.context().gameOver;
    this.q('#av-start2').textContent = '全武器试用';
    this.q('#av-menu-desc').textContent = this.context().gameOver
      ? '旅途在此暂歇。可从冒险存档继续上次保存的进度，或进入武器试用。'
      : '从一柄长剑与余烬法杖开始，探索神树与古老教堂。旅途会在此留下记忆。';
    if (open) {
      this.actions.checkpoint();
      this.saves.refresh();
    }
  }
  restarted(): void {
    this.running = true;
    this.deathShown = false;
    this.helpOpen = false;
    this.saves.close();
    this.worldMap.close();
    this.q('#av-help').hidden = true;
    this.setInventory(false);
    this.setMenu(false);
    this.lastRevision = -1;
    this.toast('C 与圣使交谈 · 向南探索教堂 · E 四部位换装');
  }
  private setHelp(open: boolean): void {
    if (open) this.releaseStick();
    this.helpOpen = open;
    this.q('#av-help').hidden = !open;
    this.input.reset();
  }
  private setTouch(touch: boolean): void {
    this.releaseStick();
    this.touch = touch;
    this.element.classList.toggle('touch-mode', touch);
    this.q('#av-touch-button').textContent = '触控：' + (touch ? '开' : '关');
  }
  private slotHTML(
    item: ItemStack | null,
    index: number,
    hotbar = false,
  ): string {
    const selected = index === this.inventory.selected,
      label = item ? `${ITEMS[item.id].name}，数量 ${item.count}` : '空物品格';
    return `<button class="av-slot ${hotbar && selected ? 'active' : ''}" data-slot="${index}" aria-label="${label}" ${hotbar ? 'aria-pressed="' + selected + '"' : ''}>${item ? `<img draggable="false" src="${this.icons[item.id]}" alt="">${item.count > 1 ? `<span class="av-count">${item.count}</span>` : ''}` : ''}${index < 9 ? `<span class="av-key">${index + 1}</span>` : ''}</button>`;
  }
  renderInventory(): void {
    this.preview();
    const inv = this.inventory;
    this.q('#av-hotbar').innerHTML = inv.slots
      .slice(0, 9)
      .map((item, i) => this.slotHTML(item, i, true))
      .join('');
    this.q('#av-bag-grid').innerHTML = inv.slots
      .slice(9)
      .map((item, i) => this.slotHTML(item, i + 9))
      .join('');
    this.q('#av-bag-hotbar').innerHTML = inv.slots
      .slice(0, 9)
      .map((item, i) => this.slotHTML(item, i, true))
      .join('');
    this.q('#av-craft-grid').innerHTML = inv.craft
      .map((item, i) => this.slotHTML(item, i + 36))
      .join('');
    const output = recipe(inv);
    this.q('#av-output').innerHTML = this.slotHTML(output, 41);
    this.q('#av-output .av-slot').setAttribute(
      'aria-label',
      output ? '合成 ' + ITEMS[output.id].name : '没有匹配的配方',
    );
    this.q('#av-equipment').innerHTML = (
      [
        ['头盔', 42, inv.armor.head],
        ['胸甲', 43, inv.armor.chest],
        ['护腿', 44, inv.armor.legs],
        ['靴子', 40, inv.boots],
      ] as const
    )
      .map(
        ([label, index, item]) =>
          `<div class="av-armor-cell">${this.slotHTML(item, index)}<small>${label}</small></div>`,
      )
      .join('');
    const eq = this.context().s.equip.get(this.context().player)!;
    this.q('#av-gear-stats').textContent =
      `减伤 ${armorReduction(eq)} · ${fullSet(eq) === 'sanctum' ? '晨曦套装\n法力 +2/秒' : fullSet(eq) ? '完整套装' : '可混搭装备'}`;
    this.q('#av-boot-name').textContent = inv.boots
      ? ITEMS[inv.boots.id].name
      : '未装备靴子';
    this.q('#av-craft-caption').textContent = output
      ? `${ITEMS[output.id].name} ×${output.count} · 点击取出`
      : '在 2×2 格放入材料';
    const cursor = this.q('#av-cursor');
    cursor.hidden = !inv.cursor;
    if (inv.cursor)
      cursor.innerHTML = `<img src="${this.icons[inv.cursor.id]}" alt="">${ITEMS[inv.cursor.id].name} ×${inv.cursor.count}`;
    for (const button of this.element.querySelectorAll<HTMLButtonElement>(
      '[data-equip-weapon]',
    )) {
      const id = button.dataset.equipWeapon as ItemId;
      button.disabled =
        !!inv.cursor || !inv.slots.some((item) => item?.id === id);
    }
    this.lastInventory = inv;
    this.lastRevision = inv.revision;
  }
  private slotEvent(e: MouseEvent, right = false): void {
    const slot = (e.target as Element).closest<HTMLElement>('[data-slot]');
    if (!slot) return;
    e.preventDefault();
    const index = Number(slot.dataset.slot);
    const held = this.q('#av-cursor');
    held.style.left = Math.max(4, Math.min(innerWidth - 195, e.clientX)) + 'px';
    held.style.top = Math.max(4, Math.min(innerHeight - 55, e.clientY)) + 'px';
    this.q('#av-tooltip').hidden = true;
    if (this.inventoryOpen) {
      this.actions.command(
        index === 41
          ? { type: 'craft' }
          : {
              type: 'slot',
              index,
              right: right || this.split,
              shift: e.shiftKey || this.quick,
            },
      );
    } else if (index < 9 && !this.paused)
      this.actions.command({ type: 'select', index });
  }
  private events(): void {
    this.q('#av-interact').onclick = () => this.actions.interact();
    this.q('#av-map-button').onclick = () =>
      this.setWorldMap(!this.worldMap.opened);
    this.q('#av-map').onclick = () => this.setWorldMap(true);
    this.q('#av-dialogue-close').onclick = () =>
      this.actions.quest({ type: 'close' });
    this.q('#av-dialogue-choices').onclick = (e) => {
      const button = (e.target as Element).closest<HTMLElement>(
        '[data-quest-action]',
      );
      if (button)
        this.actions.quest({
          type: button.dataset.questAction as
            | 'accept'
            | 'report'
            | 'bless'
            | 'heal'
            | 'close',
        });
    };
    for (const button of this.element.querySelectorAll<HTMLButtonElement>(
      '[data-equip-weapon]',
    ))
      button.onclick = () => {
        this.actions.command({
          type: 'equip',
          id: button.dataset.equipWeapon as ItemId,
        });
      };
    this.q('#av-start2').onclick = () => this.actions.restart();
    this.q('#av-start-grove').onclick = () => this.actions.restart(true);
    this.q('#av-utility-bag').onclick = () => {
      if (this.running && !this.menuOpen)
        this.actions.inventory(!this.inventoryOpen);
    };
    this.q('#av-class-hint').onclick = () => {
      let index = this.inventory.slots.findIndex(
        (item) => item?.id === this.lastStaff,
      );
      if (index < 0)
        index = this.inventory.slots.findIndex(
          (item) =>
            item &&
            [
              'ember',
              'frost',
              'storm',
              'ward',
              'blink',
              'scythe',
              'greatsword',
            ].includes(item.id),
        );
      if (index >= 0 && index < 9)
        this.actions.command({ type: 'select', index });
      else
        this.toast(
          index >= 9
            ? '把背包里的法杖移入快捷栏'
            : '沿东侧道路前往古树祭坛，寻找雷电法杖',
        );
    };
    this.q('#av-resume').onclick = () => this.setMenu(false);
    this.q('#av-pause-button').onclick = () => this.setMenu(true);
    this.q('#av-bag-button').onclick = () => {
      if (this.running && !this.menuOpen)
        this.actions.inventory(!this.inventoryOpen);
    };
    this.q('#av-close-bag').onclick = () => this.actions.inventory(false);
    this.q('#av-help-button').onclick = () => this.setHelp(true);
    this.q('#av-recipes').onclick = () => this.setHelp(true);
    this.q('#av-close-help').onclick = () => this.setHelp(false);
    this.q('#av-touch-button').onclick = () => this.setTouch(!this.touch);
    this.q('#av-view-button').onclick = () => {
      this.q('#av-view-button').textContent = this.actions.view();
    };
    this.q('#av-quality-button').onclick = () => {
      this.q('#av-quality-button').textContent = this.actions.graphics();
    };
    this.q('#av-split').onclick = () => {
      this.split = !this.split;
      this.q('#av-split').classList.toggle('active', this.split);
      this.q('#av-split').textContent =
        '拆分模式：' + (this.split ? '开' : '关');
    };
    this.q('#av-quick').onclick = () => {
      this.quick = !this.quick;
      this.q('#av-quick').classList.toggle('active', this.quick);
      this.q('#av-quick').textContent =
        '快速移动：' + (this.quick ? '开' : '关');
    };
    this.element.addEventListener('click', (e) => this.slotEvent(e));
    this.element.addEventListener('contextmenu', (e) =>
      this.slotEvent(e, true),
    );
    window.addEventListener('keydown', (e) => this.keyDown(e), true);
    window.addEventListener('pointermove', (e) => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      const cursor = this.q('#av-cursor');
      cursor.style.left =
        Math.max(4, Math.min(innerWidth - 195, e.clientX)) + 'px';
      cursor.style.top =
        Math.max(4, Math.min(innerHeight - 55, e.clientY)) + 'px';
      const tip = this.q('#av-tooltip');
      if (!tip.hidden) {
        tip.style.left =
          Math.max(5, Math.min(innerWidth - 270, e.clientX + 16)) + 'px';
        tip.style.top =
          Math.max(
            5,
            Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 18),
          ) + 'px';
      }
    });
    this.element.addEventListener('pointerover', (e) => {
      const slot = (e.target as Element).closest<HTMLElement>('[data-slot]');
      if (!slot || this.inventory.cursor) return;
      const index = Number(slot.dataset.slot),
        item =
          index === 41
            ? recipe(this.inventory)
            : getSlot(this.inventory, index);
      if (!item) return;
      const tip = this.q('#av-tooltip');
      tip.innerHTML = `<strong style="color:${ITEMS[item.id].color}">${ITEMS[item.id].name}</strong>${ITEMS[item.id].desc}`;
      tip.hidden = false;
      tip.style.left =
        Math.max(6, Math.min(innerWidth - 270, this.pointerX + 16)) + 'px';
      tip.style.top =
        Math.max(8, Math.min(innerHeight - 135, this.pointerY - 100)) + 'px';
    });
    this.element.addEventListener('pointerout', (e) => {
      if ((e.target as Element).closest('[data-slot]'))
        this.q('#av-tooltip').hidden = true;
    });
    document.querySelector('#app canvas')!.addEventListener(
      'wheel',
      (event) => {
        const e = event as WheelEvent;
        if (!this.paused) {
          e.preventDefault();
          this.actions.command({
            type: 'select',
            index: this.inventory.selected + (e.deltaY > 0 ? 1 : -1),
          });
        }
      },
      { passive: false },
    );
    window.addEventListener('blur', () => {
      if (this.running && !this.inventoryOpen && !this.helpOpen)
        this.setMenu(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (
        document.hidden &&
        this.running &&
        !this.inventoryOpen &&
        !this.helpOpen
      )
        this.setMenu(true);
    });
    this.touchEvents();
  }
  private keyDown(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const handled = (): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (e.target instanceof HTMLInputElement) {
      if (k === 'escape') {
        handled();
        this.saves.close();
      } else e.stopImmediatePropagation();
      return;
    }
    if (this.saves.opened) {
      if (k === 'escape') this.saves.close();
      if (k !== 'tab') handled();
      return;
    }
    if (
      !this.menuOpen &&
      this.context().s.journal.get(this.context().player)?.talking &&
      (k === 'escape' || k === 'c')
    ) {
      handled();
      if (!e.repeat) this.actions.quest({ type: 'close' });
      return;
    }
    if (
      !this.menuOpen &&
      this.context().s.journal.get(this.context().player)?.talking
    ) {
      handled();
      return;
    }
    if (this.worldMap.opened) {
      if (k === 'escape' || k === 'm') {
        handled();
        this.worldMap.close();
      } else if (k === 'tab') e.stopImmediatePropagation();
      else handled();
      return;
    }
    if (k === 'escape') {
      handled();
      if (this.helpOpen) this.setHelp(false);
      else if (this.inventoryOpen) this.actions.inventory(false);
      else if (this.running) this.setMenu(!this.menuOpen);
      return;
    }
    if (k === 'r' && this.context().gameOver) {
      handled();
      try {
        if (this.actions.saves.activeSlot() !== null)
          this.actions.saves.load(this.actions.saves.activeSlot()!);
        else this.actions.restart();
      } catch (error) {
        this.toast(error instanceof Error ? error.message : '无法读取存档');
      }
      return;
    }
    if (this.helpOpen || !this.running || this.menuOpen) {
      handled();
      return;
    }
    if (k === 'm' && !this.inventoryOpen) {
      handled();
      if (!e.repeat) this.setWorldMap(true);
      return;
    }
    if (k === 'c' && !this.inventoryOpen) {
      handled();
      if (!e.repeat) this.actions.interact();
      return;
    }
    if (['e', 'tab', 'b'].includes(k)) {
      handled();
      if (!e.repeat) this.actions.inventory(!this.inventoryOpen);
      return;
    }
    if (this.inventoryOpen) {
      handled();
      return;
    }
    if (/^[1-9]$/.test(k)) {
      handled();
      this.actions.command({ type: 'select', index: Number(k) - 1 });
      return;
    }
    if (k === 'h') {
      handled();
      if (!e.repeat) this.setHelp(true);
    }
  }
  private touchEvents(): void {
    this.releaseStick = bindMobileStick(
      this.element,
      this.input,
      () => this.touch && !this.paused,
    );
    for (const button of this.element.querySelectorAll<HTMLButtonElement>(
      '[data-mage]',
    )) {
      const id = button.dataset.mage as MageSkillId,
        bit =
          id === 'field' ? BTN.FIELD : id === 'wave' ? BTN.CAST : BTN.ULTIMATE;
      button.addEventListener('pointerdown', (event) => {
        if (this.paused || button.disabled) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.input.setButton(bit, true);
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
        button.addEventListener(name, () => this.input.setButton(bit, false));
    }
    window.addEventListener('pointerup', () => {
      this.input.setButton(BTN.FIELD, false);
      this.input.setButton(BTN.CAST, false);
      this.input.setButton(BTN.ULTIMATE, false);
    });
    const bits: Record<string, number> = {
      attack: BTN.ATTACK,
      cast: BTN.CAST,
      dodge: BTN.DODGE,
      use: BTN.USE,
    };
    for (const button of this.q('#av-utilities').querySelectorAll<HTMLElement>(
      '[data-action]',
    )) {
      const bit = bits[button.dataset.action!];
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        this.input.setButton(bit, true);
      });
      for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture'])
        button.addEventListener(kind, () => this.input.setButton(bit, false));
    }
  }
  update(ctx: Ctx, dt: number, fps: number): void {
    const saveStatus = this.actions.saves.status(),
      indicator = this.q('#av-save-indicator');
    if (indicator.textContent !== saveStatus)
      indicator.textContent = saveStatus;
    this.q('.av-preview strong').textContent = ctx.progress.name;
    this.updateMageHUD(ctx);
    this.updateJournal(ctx);
    const p = ctx.s.player.get(ctx.player)!,
      hp = ctx.s.health.get(ctx.player)!;
    this.q('#av-health-value').textContent =
      `${Math.max(0, Math.ceil(hp.hp))} / ${hp.max}`;
    this.q('#av-mana-value').textContent =
      `${Math.floor(p.mana)} / ${p.maxMana}`;
    this.q('#av-health-fill').style.width =
      100 * Math.max(0, hp.hp / hp.max) + '%';
    this.q('#av-mana-fill').style.width = (100 * p.mana) / p.maxMana + '%';
    const inferno = ctx.s.blade.get(ctx.player)!.infernoLeft;
    this.q('#av-kills').textContent =
      `击败 ${p.kills}  ·  ${inferno > 0 ? '炎躯 ' + inferno.toFixed(1) + '秒' : p.shield > 0 ? '护盾 ' + Math.ceil(p.shieldHp) + ' / ' + p.shield.toFixed(1) + '秒' : '存活 ' + Math.floor(ctx.world.time / 60) + ':' + String(Math.floor(ctx.world.time % 60)).padStart(2, '0')}`;
    this.q('#av-level').textContent = String(
      ctx.s.journal.get(ctx.player)!.level,
    ).padStart(2, '0');
    const selected = this.inventory.slots[this.inventory.selected],
      item = selected ? ITEMS[selected.id] : null,
      skill =
        selected && isAbility(selected.id) ? ABILITIES[selected.id] : null;
    this.q('#av-selected-name').textContent = item?.name || '空物品格';
    this.q('#av-selected-name').style.color = item?.color || '#d4d6bc';
    const cd =
      selected && isAbility(selected.id) ? p.cooldowns[selected.id] || 0 : 0;
    this.q('#av-skill').textContent = skill
      ? `右键 / F · ${skill.name} | ${skill.cost} 法力 | ${cd > 0 ? cd.toFixed(1) + ' 秒后就绪' : '已就绪'}`
      : item?.kind === 'sword'
        ? '右键 / F · 旋风斩 | ' +
          (p.castCd > 0 ? p.castCd.toFixed(1) + ' 秒后就绪' : '已就绪')
        : item?.kind === 'potion' || item?.kind === 'supply'
          ? '左键 / X · 使用当前物品'
          : 'E · 背包与合成';
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.q('#av-toast').classList.toggle('show', this.toastTime > 0);
    if (
      this.inventory !== this.lastInventory ||
      this.inventory.revision !== this.lastRevision
    )
      this.renderInventory();
    for (const slot of this.q('#av-hotbar').querySelectorAll<HTMLElement>(
      '[data-slot]',
    )) {
      const entry = this.inventory.slots[Number(slot.dataset.slot)],
        cooldown =
          entry && isAbility(entry.id) ? p.cooldowns[entry.id] || 0 : 0,
        total = entry && isAbility(entry.id) ? ABILITIES[entry.id].cd : 1;
      let overlay = slot.querySelector<HTMLElement>('.av-cd');
      if (cooldown > 0) {
        if (!overlay) {
          overlay = document.createElement('span');
          overlay.className = 'av-cd';
          slot.appendChild(overlay);
        }
        overlay.style.height = (cooldown / total) * 100 + '%';
      } else overlay?.remove();
    }
    this.q('#av-debug').hidden = !ctx.debug;
    if (ctx.debug) {
      const pos = ctx.world.pos(ctx.player);
      this.q('#av-debug').textContent =
        `${fps.toFixed(0)} FPS · 实体 ${ctx.world.alive.size}\n脚底 ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}\n固定步长 60 Hz`;
    }
    this.mapTime += dt;
    if (this.mapTime > 0.2) {
      this.drawMap(ctx);
      this.mapTime = 0;
    }
    if (ctx.gameOver && !this.deathShown) {
      this.deathShown = true;
      this.setInventory(false);
      this.setMenu(true);
    }
  }
  private drawMap(ctx: Ctx): void {
    drawExplorationMap(this.q<HTMLCanvasElement>('#av-map'), ctx);
  }
}
