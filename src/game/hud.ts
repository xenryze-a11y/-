/** 固定在屏幕上的 HUD，不跟随相机。用 Graphics + Text，方便朋友直接改布局。 */
import { Container, Graphics, Text } from 'pixi.js';
import type { InputState } from '../engine/input';
import { SHOE_LABEL } from './data';
import type { Ctx } from './systems/context';

const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

export class Hud {
  readonly root = new Container();
  private readonly bars = new Graphics();
  private readonly cross = new Graphics();
  private readonly stats = new Text({
    text: '', style: { fontFamily: FONT, fontSize: 14, fill: 0xe8dcc0, lineHeight: 22 },
  });
  private readonly hint = new Text({
    text: 'WASD 移动 · 鼠标瞄准 · 左键攻击 · 右键特殊技 · 空格翻滚 · 1/2 换武器 · R 重开 · F3 调试',
    style: { fontFamily: FONT, fontSize: 13, fill: 0xbfc9b0 },
  });
  private readonly over = new Text({
    text: '你倒在了灰烬谷\n按 R 重新开始',
    style: { fontFamily: FONT, fontSize: 34, fontWeight: 'bold', fill: 0xe8b0a0, align: 'center', lineHeight: 46 },
  });
  private readonly debug = new Text({
    text: '', style: { fontFamily: FONT, fontSize: 12, fill: 0x9ad8a0 },
  });

  constructor() {
    this.over.anchor.set(0.5);
    this.over.visible = false;
    this.debug.position.set(20, 84);
    this.root.addChild(this.bars, this.cross, this.stats, this.hint, this.over, this.debug);
  }

  update(ctx: Ctx, input: InputState, fps: number, w: number, h: number): void {
    const pl = ctx.s.player.get(ctx.player);
    const hp = ctx.s.health.get(ctx.player);
    const hpRatio = hp ? Math.max(0, hp.hp / hp.max) : 0;
    const manaRatio = pl ? Math.max(0, pl.mana / pl.maxMana) : 0;

    const g = this.bars;
    g.clear();
    // 生命
    g.rect(18, 18, 224, 20).fill({ color: 0x2a211c, alpha: 0.62 });
    g.rect(20, 20, 220 * hpRatio, 16).fill({ color: 0xb83b3b });
    g.rect(20, 20, 220 * hpRatio, 2).fill({ color: 0xe07a6a, alpha: 0.7 });
    // 法力
    g.rect(18, 42, 224, 14).fill({ color: 0x2a211c, alpha: 0.62 });
    g.rect(20, 44, 220 * manaRatio, 10).fill({ color: 0x3f6fc4 });
    g.rect(20, 44, 220 * manaRatio, 1).fill({ color: 0x8fb8ff, alpha: 0.7 });
    // 描边
    g.rect(18, 18, 224, 20).stroke({ width: 1, color: 0x6b5a44 });
    g.rect(18, 42, 224, 14).stroke({ width: 1, color: 0x6b5a44 });
    // 底部提示垫一层暗底，否则压在草地/血迹上看不清。
    g.rect(0, h - 40, w, 34).fill({ color: 0x0d100c, alpha: 0.68 });

    const weapon = pl?.weapon === 'staff' ? '法杖 · 火球' : '长剑 · 挥砍';
    const shoes = SHOE_LABEL[ctx.s.equip.get(ctx.player)?.shoes ?? 'cloth'];
    this.stats.text =
      `生命 ${Math.max(0, Math.ceil(hp?.hp ?? 0))} / ${hp?.max ?? 0}    法力 ${Math.floor(pl?.mana ?? 0)} / ${pl?.maxMana ?? 0}\n` +
      `武器：${weapon}    靴：${shoes}    击杀：${pl?.kills ?? 0}`;
    this.stats.position.set(24, 62);

    this.hint.position.set(Math.max(12, (w - this.hint.width) / 2), h - 30);
    this.over.position.set(w / 2, h / 2 - 40);
    this.over.visible = ctx.gameOver;

    this.debug.visible = ctx.debug;
    this.debug.text = ctx.debug
      ? `FPS ${fps.toFixed(0)} · 实体 ${ctx.world.alive.size} · 亡者 ${ctx.world.withTag('mob').length} · 模拟 ${ctx.world.time.toFixed(1)}s\n位置 ${ctx.world.pos(ctx.player).x.toFixed(0)},${ctx.world.pos(ctx.player).y.toFixed(0)} · 固定步长 1/60`
      : '';

    const c = this.cross;
    c.clear();
    const px = input.pointer.x;
    const py = input.pointer.y;
    c.rect(px - 9, py, 7, 1).fill({ color: 0xf0e3c8, alpha: 0.9 });
    c.rect(px + 3, py, 7, 1).fill({ color: 0xf0e3c8, alpha: 0.9 });
    c.rect(px, py - 9, 1, 7).fill({ color: 0xf0e3c8, alpha: 0.9 });
    c.rect(px, py + 3, 1, 7).fill({ color: 0xf0e3c8, alpha: 0.9 });
  }
}
