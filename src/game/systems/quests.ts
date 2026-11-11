/** NPC 对话和任务是纯模拟命令；UI 暂停与文字仅投影这些状态。 */
import { BLADE_MAGIC } from '../weapon-data';
import { dist } from '../../engine/math';
import { addItem, notice } from '../inventory';
import { NPCS, SANCTUARY, inCathedral } from '../sanctuary-data';
import type { ItemId } from '../items';
import type { Ctx } from './context';
export type QuestCommand =
  | { type: 'talk'; npc?: number }
  | { type: 'accept' | 'report' | 'bless' | 'heal' | 'close' };
export function levelRequirement(level: number): number {
  return SANCTUARY.levelBaseXp + (level - 1) * SANCTUARY.levelStepXp;
}
export function grantXp(ctx: Ctx, amount: number): void {
  const j = ctx.s.journal.get(ctx.player);
  if (!j || j.level >= SANCTUARY.maxLevel) return;
  j.xp += amount;
  while (j.level < SANCTUARY.maxLevel && j.xp >= levelRequirement(j.level)) {
    j.xp -= levelRequirement(j.level);
    j.level++;
    const hp = ctx.s.health.get(ctx.player)!,
      p = ctx.s.player.get(ctx.player)!;
    const growth =
      SANCTUARY.levelHp *
      (ctx.s.blade.get(ctx.player)?.infernoVitality
        ? BLADE_MAGIC.inferno.vitalityMultiplier
        : 1);
    hp.max += growth;
    hp.hp = Math.min(hp.max, hp.hp + growth);
    p.maxMana += SANCTUARY.levelMana;
    p.mana = Math.min(p.maxMana, p.mana + SANCTUARY.levelMana);
    notice(ctx, `旅人等级 ${j.level} · 生命与法力上限提升`);
  }
}
export function canTalk(ctx: Ctx, id: number): boolean {
  if (
    !ctx.s.npc.has(id) ||
    !ctx.world.alive.has(id) ||
    ctx.world.isPendingDeath(id)
  )
    return false;
  const at = ctx.world.pos(ctx.player),
    npc = ctx.world.pos(id);
  return (
    inCathedral(at) === inCathedral(npc) &&
    dist(at, npc) <= SANCTUARY.talkRange &&
    ctx.level.lineClear(at, npc)
  );
}
export function nearbyNpc(ctx: Ctx): number {
  const at = ctx.world.pos(ctx.player);
  let best = 0,
    d = Infinity;
  ctx.s.npc.forEach((id) => {
    if (!canTalk(ctx, id)) return;
    const next = dist(at, ctx.world.pos(id));
    if (next < d) {
      d = next;
      best = id;
    }
  });
  return best;
}
export function questProgress(ctx: Ctx): number {
  const j = ctx.s.journal.get(ctx.player)!;
  return Math.min(
    SANCTUARY.killsRequired,
    Math.max(0, ctx.s.player.get(ctx.player)!.kills - j.killsAtStart),
  );
}
export function questObjective(ctx: Ctx): string {
  const j = ctx.s.journal.get(ctx.player)!;
  return j.stage === 'unmet'
    ? '前往神树东侧，与圣使瑟拉交谈'
    : j.stage === 'purifying'
      ? questProgress(ctx) < SANCTUARY.killsRequired
        ? `净化林地亡者 ${questProgress(ctx)} / ${SANCTUARY.killsRequired}`
        : '返回神树东侧，向圣使复命'
      : j.stage === 'pilgrimage'
        ? '向南进入教堂北门，拜访神父奥伦'
        : '晨曦祝福已获 · 四件套额外回复法力';
}
export function applyQuestCommand(ctx: Ctx, command: QuestCommand): void {
  const j = ctx.s.journal.get(ctx.player)!;
  if (command.type === 'close') {
    j.talking = 0;
    return;
  }
  if (ctx.gameOver) return;
  if (command.type === 'talk') {
    const id = command.npc || nearbyNpc(ctx);
    if (canTalk(ctx, id)) j.talking = id;
    return;
  }
  const id = j.talking;
  if (!canTalk(ctx, id)) {
    j.talking = 0;
    return;
  }
  const npc = ctx.s.npc.get(id)!;
  if (
    command.type === 'accept' &&
    npc.kind === 'herald' &&
    j.stage === 'unmet'
  ) {
    j.stage = 'purifying';
    j.killsAtStart = ctx.s.player.get(ctx.player)!.kills;
    j.talking = 0;
    notice(ctx, '任务已接取 · 净化三名亡者，再向圣使复命');
  } else if (
    command.type === 'report' &&
    npc.kind === 'herald' &&
    j.stage === 'purifying' &&
    questProgress(ctx) >= SANCTUARY.killsRequired
  ) {
    j.stage = 'pilgrimage';
    grantXp(ctx, SANCTUARY.firstRewardXp);
    notice(ctx, '圣使已认可你的勇气 · 去南侧教堂寻找神父');
  } else if (
    command.type === 'bless' &&
    npc.kind === 'priest' &&
    j.stage === 'pilgrimage'
  ) {
    const inv = ctx.s.inventory.get(ctx.player)!,
      copy = inv.slots.map((i) => (i ? { ...i } : null)),
      ordered = [...copy.slice(9), ...copy.slice(0, 9)],
      reward: ItemId[] = [
        'sanctum_head',
        'sanctum_chest',
        'sanctum_legs',
        'sanctum_boots',
      ];
    if (reward.some((item) => addItem(ordered, item, 1) > 0)) {
      notice(ctx, '先空出四个背包格，再来领取晨曦套装');
      return;
    }
    inv.slots = [...ordered.slice(27), ...ordered.slice(0, 27)];
    inv.revision++;
    j.stage = 'complete';
    grantXp(ctx, SANCTUARY.finalRewardXp);
    const hp = ctx.s.health.get(ctx.player)!,
      p = ctx.s.player.get(ctx.player)!;
    hp.hp = hp.max;
    p.mana = p.maxMana;
    notice(ctx, '任务完成 · 获得晨曦四件套与圣堂祝福');
  } else if (command.type === 'heal' && npc.kind === 'priest') {
    const hp = ctx.s.health.get(ctx.player)!,
      p = ctx.s.player.get(ctx.player)!;
    hp.hp = hp.max;
    p.mana = p.maxMana;
    notice(ctx, '晨曦祈祷 · 生命与法力已恢复');
  }
}
export interface Dialogue {
  title: string;
  subtitle: string;
  body: string;
  choices: { label: string; command: QuestCommand['type'] }[];
}
export function dialogue(ctx: Ctx): Dialogue | null {
  const j = ctx.s.journal.get(ctx.player)!,
    npc = ctx.s.npc.get(j.talking);
  if (!npc) return null;
  const def = NPCS[npc.kind],
    choices: Dialogue['choices'] = [],
    d: Dialogue = { title: def.name, subtitle: def.title, body: '', choices };
  if (npc.kind === 'herald') {
    if (j.stage === 'unmet') {
      d.body =
        '这株神树曾庇佑整座灰烬谷，如今亡者的腐息已逼近树根。旅人，你愿意替我净化三名林地亡者吗？完成后，我会指引你前往神树南侧的晨曦大教堂，接受神父的祝福。';
      choices.push({ label: '我愿意守护神树 · 接受任务', command: 'accept' });
    } else if (j.stage === 'purifying') {
      const done = questProgress(ctx) >= SANCTUARY.killsRequired;
      d.body = done
        ? '林地的气息已经变得清澈，你做得很好。沿神树南侧的石路前行，从教堂北门进入。神父奥伦在中殿尽头等候，他将为你授予晨曦套装。'
        : `不必急于求成。你已净化 ${questProgress(ctx)} / ${SANCTUARY.killsRequired} 名亡者；完成后再来见我。我会一直守候在神树旁。`;
      if (done)
        choices.push({ label: '向圣使复命 · 获得 30 经验', command: 'report' });
    } else
      d.body =
        j.stage === 'complete'
          ? '晨曦的光已经与你同在。那套圣甲的每一个部件都可单独穿戴；集齐四件，神树会加快你的法力恢复。愿你一路平安。'
          : '沿石路向南，从教堂朝向神树的北门进入。屋顶会在你入内后隐去，穿过座椅间的长廊即可找到神父奥伦。';
  } else {
    if (j.stage === 'pilgrimage') {
      d.body =
        '瑟拉已经将你的善行告诉我。愿晨曦护佑你的旅途。这套圣甲包含头盔、胸甲、护腿与靴子，各部件可独立穿戴；四件齐备，将获得持续的法力祝福。请收下它们。';
      choices.push({ label: '接受晨曦祝福 · 领取四件套', command: 'bless' });
    } else
      d.body =
        j.stage === 'complete'
          ? '愿你心中的火永不熄灭。旅途中若感到疲惫，随时回到这里。我会为你祈祷，恢复生命与法力。'
          : '欢迎来到晨曦大教堂。这里是旅人的避风港；神树旁的圣使瑟拉正在寻找一位愿意守护林地的人。你可以先与她谈谈。';
    choices.push({ label: '请为我祈祷 · 恢复生命与法力', command: 'heal' });
  }
  choices.push({ label: '结束交谈', command: 'close' });
  return d;
}
