/** 存档面板只发动作；文件和浏览器存储由组装层处理。 */
import { parseSave, SAVE_LIMIT, type SlotResult } from './saves';

export interface SaveActions {
  list(): SlotResult[];
  activeSlot(): number | null;
  status(): string;
  save(): void;
  newGame(slot: number, name: string): void;
  load(slot: number): void;
  export(slot: number | null): void;
  import(slot: number, raw: string): void;
}
export class SaveMenu {
  private selected = 0;
  private confirm?: () => void;
  private readonly panel: HTMLElement;
  constructor(
    private readonly root: HTMLElement,
    private readonly actions: SaveActions,
  ) {
    this.panel = root.querySelector('#av-saves')!;
    this.panel.innerHTML = `<section class="av-window av-save-window" role="dialog" aria-modal="true" aria-label="冒险存档">
      <header><h2>旅途记忆 <span>ADVENTURE SAVES</span></h2><button class="av-close" id="av-save-close">返回</button></header>
      <p class="av-save-intro">正式冒险 · 长剑、余烬法杖与少量补给开局。每 20 秒及重要进度自动保存。</p>
      <div id="av-save-slots" role="group" aria-label="选择存档位"></div>
      <label class="av-save-name">新角色名称 <input id="av-save-name" maxlength="20" value="灰烬旅人" autocomplete="off" spellcheck="false"></label>
      <div class="av-save-actions"><button class="av-primary" id="av-save-load">继续此旅途</button><button class="av-smallbtn" id="av-save-new">新建角色</button><button class="av-smallbtn" id="av-save-now">保存当前进度</button></div>
      <div class="av-save-actions"><button class="av-smallbtn" id="av-save-export">导出所选存档</button><button class="av-smallbtn" id="av-save-export-current">导出当前旅途</button><button class="av-smallbtn" id="av-save-import">导入到所选槽</button><input type="file" id="av-save-file" accept=".json,application/json" hidden></div>
      <div id="av-save-confirm" hidden><p id="av-save-confirm-text"></p><button class="av-smallbtn" id="av-save-confirm-yes">确认替换</button> <button class="av-smallbtn" id="av-save-confirm-no">取消</button></div>
      <p id="av-save-message" role="status" aria-live="polite"></p><p id="av-save-info" class="av-save-foot"></p><p class="av-save-foot">存档保存在当前浏览器。换设备或清理浏览器前，请先导出 JSON 备份。武器试用不会覆盖冒险。</p>
    </section>`;
    this.q('#av-save-close').onclick = () => this.close();
    this.q('#av-save-load').onclick = () =>
      this.perform(() => actions.load(this.selected));
    this.q('#av-save-new').onclick = () => {
      const name =
        this.q<HTMLInputElement>('#av-save-name').value.trim() || '灰烬旅人';
      const action = (): void => actions.newGame(this.selected, name);
      const slot = actions.list()[this.selected];
      if (slot.record || slot.error)
        this.ask(
          `将用「${name}」替换第 ${this.selected + 1} 槽。建议先导出原存档。`,
          action,
        );
      else this.perform(action);
    };
    this.q('#av-save-now').onclick = () =>
      this.perform(() => {
        actions.save();
        this.refresh();
        this.message('当前旅途已保存');
      });
    this.q('#av-save-export').onclick = () =>
      this.perform(() => actions.export(this.selected));
    this.q('#av-save-export-current').onclick = () =>
      this.perform(() => actions.export(null));
    this.q('#av-save-import').onclick = () =>
      this.q<HTMLInputElement>('#av-save-file').click();
    this.q<HTMLInputElement>('#av-save-file').onchange = async (event) => {
      const input = event.target as HTMLInputElement,
        file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        if (file.size > SAVE_LIMIT)
          throw new Error('文件过大，请选择灰烬谷存档');
        const raw = await file.text(),
          record = parseSave(raw),
          target = this.selected;
        this.ask(
          `把「${record.data.progress.name}」导入第 ${target + 1} 槽并继续？该槽原存档会被替换。`,
          () => actions.import(target, raw),
        );
      } catch (error) {
        this.message(error instanceof Error ? error.message : '无法读取文件');
      }
    };
    this.q('#av-save-confirm-yes').onclick = () => {
      const action = this.confirm;
      this.cancel();
      if (action) this.perform(action);
    };
    this.q('#av-save-confirm-no').onclick = () => this.cancel();
    root.querySelector<HTMLButtonElement>('#av-adventure')!.onclick = () =>
      this.open();
    root.querySelector<HTMLButtonElement>('#av-continue-save')!.onclick =
      () => {
        const latest = actions
          .list()
          .map((slot, index) => ({ ...slot, index }))
          .filter((slot) => slot.record)
          .sort(
            (a, b) =>
              Date.parse(b.record!.savedAt) - Date.parse(a.record!.savedAt),
          )[0];
        if (latest) this.perform(() => actions.load(latest.index));
        else this.open();
      };
    this.refresh();
  }
  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.panel.querySelector<T>(selector)!;
  }
  get opened(): boolean {
    return !this.panel.hidden;
  }
  open(): void {
    this.selected =
      this.actions.activeSlot() ??
      this.actions.list().findIndex((s) => !s.record && !s.error);
    if (this.selected < 0) this.selected = 0;
    this.panel.hidden = false;
    this.cancel();
    this.refresh();
    this.message('');
    this.q<HTMLButtonElement>('#av-save-close').focus();
  }
  close(): void {
    this.panel.hidden = true;
    this.cancel();
  }
  private cancel(): void {
    this.confirm = undefined;
    this.q('#av-save-confirm').hidden = true;
  }
  private ask(message: string, action: () => void): void {
    this.confirm = action;
    this.q('#av-save-confirm-text').textContent = message;
    this.q('#av-save-confirm').hidden = false;
  }
  private message(message: string): void {
    this.q('#av-save-message').textContent = message;
  }
  private perform(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.message(error instanceof Error ? error.message : '存档操作失败');
    }
  }
  refresh(): void {
    const slots = this.actions.list(),
      active = this.actions.activeSlot(),
      container = this.q('#av-save-slots');
    container.replaceChildren();
    slots.forEach((slot, index) => {
      const button = document.createElement('button');
      button.className =
        'av-save-slot' + (index === this.selected ? ' selected' : '');
      button.dataset.saveSlot = String(index);
      button.setAttribute('aria-pressed', String(index === this.selected));
      const number = document.createElement('span');
      number.className = 'av-save-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const copy = document.createElement('span'),
        title = document.createElement('strong'),
        detail = document.createElement('small');
      title.textContent =
        slot.record?.data.progress.name ||
        (slot.error ? '存档暂不可用' : '空的旅途');
      if (slot.record) {
        const record = slot.record,
          journal = record.data.world.stores.journal[0].value as {
            level: number;
          },
          hero = record.data.world.entities.find(
            (e) => e.id === record.data.player,
          )!,
          region = hero.position!.x > 1536 ? '古树圣域' : '灰烬谷';
        detail.textContent = `等级 ${journal.level} · ${region} · ${new Date(record.savedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}${slot.recovered ? ' · 已从备份恢复' : ''}${active === index ? ' · 当前旅途' : ''}`;
      } else
        detail.textContent = slot.error || '选择此槽创建角色，或导入已有存档';
      copy.append(title, detail);
      button.append(number, copy);
      button.onclick = () => {
        this.selected = index;
        this.cancel();
        this.refresh();
        this.message('');
      };
      container.append(button);
    });
    this.q<HTMLButtonElement>('#av-save-load').disabled =
      !slots[this.selected]?.record;
    this.q<HTMLButtonElement>('#av-save-export').disabled =
      !slots[this.selected]?.record;
    this.q<HTMLButtonElement>('#av-save-now').disabled = active === null;
    this.q<HTMLButtonElement>('#av-save-export-current').disabled =
      active === null;
    const latest = slots.some((s) => s.record);
    this.root.querySelector<HTMLButtonElement>('#av-continue-save')!.hidden =
      !latest;
    this.q('#av-save-info').textContent = this.actions.status();
  }
}
