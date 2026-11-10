/** DOM 是表现层：读取 ECS 快照，发输入/背包命令，从不直接改组件。 */
import { BTN, type Input } from '../engine/input';
import type { TextureAtlas } from '../engine/atlas';
import type { GameEvent } from '../engine/ecs';
import { Tile } from '../engine/level';
import { ITEMS, SKILLS, isSkill, type ItemId } from './items';
import {
  getSlot,
  recipe,
  type InventoryState,
  type ItemStack,
  type InventoryCommand,
} from './inventory';
import type { Ctx } from './systems/context';
import { UI_TEMPLATE } from './ui-template';
import './ui.css';

export interface UIActions {
  command(command: InventoryCommand): void;
  inventory(open: boolean): void;
  restart(): void;
}
export class GameUI {
  readonly element = document.createElement('div');
  running = false;
  menuOpen = true;
  inventoryOpen = false;
  touch = matchMedia('(pointer:coarse)').matches;
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
    this.makeIcons();
    this.preview();
    this.events();
    this.setTouch(this.touch);
    this.renderInventory();
    this.setMenu(true);
  }
  get paused(): boolean {
    return (
      !this.running || this.menuOpen || this.inventoryOpen || this.helpOpen
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
  private preview(): void {
    const g = this.q<HTMLCanvasElement>('#av-avatar-preview').getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const name of ['heroFrontBody', 'heroFrontHead']) {
      const f = this.atlas.frames[name];
      g.drawImage(this.atlas.canvas, f.x, f.y, f.w, f.h, 8, 3, 48, 72);
    }
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
    this.inventoryOpen = open;
    this.input.reset();
    this.element.classList.toggle('inventory-open', open);
    this.q('#av-inventory').hidden = !open;
    this.q('#av-tooltip').hidden = true;
    this.renderInventory();
    if (open) this.q<HTMLButtonElement>('#av-close-bag').focus();
    else this.q<HTMLButtonElement>('#av-bag-button').blur();
  }
  setMenu(open: boolean): void {
    this.menuOpen = open;
    this.input.reset();
    this.q('#av-menu2').hidden = !open;
    this.q('#av-resume').hidden = !this.running || this.context().gameOver;
    this.q('#av-start2').textContent = this.running ? '重新启程' : '进入灰烬谷';
    this.q('#av-menu-desc').textContent = this.context().gameOver
      ? '旅途在此暂歇。带上新的补给，再一次踏入灰烬谷。'
      : '旧日的城墙仍在，余烬尚未熄灭。收集物资，调配药剂，以五系魔法穿越荒废之地。';
  }
  restarted(): void {
    this.running = true;
    this.deathShown = false;
    this.helpOpen = false;
    this.q('#av-help').hidden = true;
    this.setInventory(false);
    this.setMenu(false);
    this.lastRevision = -1;
    this.toast('E 打开背包 · 1–5 选择法杖 · 右键释放特殊技能');
  }
  private setHelp(open: boolean): void {
    this.helpOpen = open;
    this.q('#av-help').hidden = !open;
    this.input.reset();
  }
  private setTouch(touch: boolean): void {
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
    this.q('#av-equipment').innerHTML = this.slotHTML(inv.boots, 40);
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
    this.q('#av-start2').onclick = () => this.actions.restart();
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
    if (k === 'escape') {
      handled();
      if (this.helpOpen) this.setHelp(false);
      else if (this.inventoryOpen) this.actions.inventory(false);
      else if (this.running) this.setMenu(!this.menuOpen);
      return;
    }
    if (k === 'r' && this.context().gameOver) {
      handled();
      this.actions.restart();
      return;
    }
    if (this.helpOpen || !this.running || this.menuOpen) {
      handled();
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
    const stick = this.q('#av-stick2'),
      knob = this.q('#av-stick-knob');
    let pointer: number | null = null;
    const move = (e: PointerEvent): void => {
      const r = stick.getBoundingClientRect(),
        radius = r.width * 0.34;
      let x = e.clientX - r.left - r.width / 2,
        y = e.clientY - r.top - r.height / 2;
      const length = Math.hypot(x, y);
      if (length > radius) {
        x = (x / length) * radius;
        y = (y / length) * radius;
      }
      knob.style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
      this.input.setTouchAxis(x / radius, y / radius);
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      stick.setPointerCapture(pointer);
      move(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (pointer === e.pointerId) move(e);
    });
    for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture'])
      stick.addEventListener(kind, (e) => {
        if (pointer === (e as PointerEvent).pointerId) {
          pointer = null;
          knob.style.transform = 'translate(-50%,-50%)';
          this.input.setTouchAxis(0, 0);
        }
      });
    const bits: Record<string, number> = {
      attack: BTN.ATTACK,
      cast: BTN.CAST,
      dodge: BTN.DODGE,
      use: BTN.USE,
    };
    for (const button of this.q(
      '#av-mobile-buttons',
    ).querySelectorAll<HTMLElement>('[data-action]')) {
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
    const p = ctx.s.player.get(ctx.player)!,
      hp = ctx.s.health.get(ctx.player)!;
    this.q('#av-health-value').textContent =
      `${Math.max(0, Math.ceil(hp.hp))} / ${hp.max}`;
    this.q('#av-mana-value').textContent =
      `${Math.floor(p.mana)} / ${p.maxMana}`;
    this.q('#av-health-fill').style.width =
      100 * Math.max(0, hp.hp / hp.max) + '%';
    this.q('#av-mana-fill').style.width = (100 * p.mana) / p.maxMana + '%';
    this.q('#av-kills').textContent =
      `击败 ${p.kills}  ·  ${p.shield > 0 ? '护盾 ' + Math.ceil(p.shieldHp) + ' / ' + p.shield.toFixed(1) + '秒' : '存活 ' + Math.floor(ctx.world.time / 60) + ':' + String(Math.floor(ctx.world.time % 60)).padStart(2, '0')}`;
    this.q('#av-level').textContent = String(
      1 + Math.floor(p.kills / 10),
    ).padStart(2, '0');
    const selected = this.inventory.slots[this.inventory.selected],
      item = selected ? ITEMS[selected.id] : null,
      skill = selected && isSkill(selected.id) ? SKILLS[selected.id] : null;
    this.q('#av-selected-name').textContent = item?.name || '空物品格';
    this.q('#av-selected-name').style.color = item?.color || '#d4d6bc';
    const cd =
      selected && isSkill(selected.id) ? p.cooldowns[selected.id] || 0 : 0;
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
        cooldown = entry && isSkill(entry.id) ? p.cooldowns[entry.id] || 0 : 0,
        total = entry && isSkill(entry.id) ? SKILLS[entry.id].cd : 1;
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
    const canvas = this.q<HTMLCanvasElement>('#av-map'),
      g = canvas.getContext('2d')!,
      l = ctx.level;
    const colors: Record<number, string> = {
      [Tile.GRASS]: '#364e39',
      [Tile.DIRT]: '#635b41',
      [Tile.STONE]: '#626b5e',
      [Tile.WATER]: '#244950',
      [Tile.FLOOR]: '#786342',
      [Tile.WALL]: '#b6b097',
      [Tile.ROAD]: '#a18f67',
    };
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) {
        g.fillStyle = colors[l.at(x, y)];
        g.fillRect(x * 2, y * 2, 2, 2);
      }
    const pos = ctx.world.pos(ctx.player);
    g.fillStyle = '#bc6d5c';
    for (const id of ctx.world.query(pos, 310, 'mob')) {
      const p = ctx.world.pos(id);
      g.fillRect(p.x / 16 - 1, p.y / 16 - 1, 2, 2);
    }
    g.fillStyle = '#ffe1a0';
    g.fillRect(pos.x / 16 - 1.5, pos.y / 16 - 1.5, 3, 3);
    g.strokeStyle = '#ffe1a0';
    g.strokeRect(pos.x / 16 - 3, pos.y / 16 - 3, 6, 6);
  }
}
