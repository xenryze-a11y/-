import {
  drawExplorationMap,
  explorationPercent,
  mapViewport,
} from './exploration-map';
import {
  REGIONS,
  sitesForZone,
  SITE_NAMES,
  regionForZone,
  type RegionId,
} from './world-data';
import {
  nearbySite,
  worldSites,
  safeToTravel,
  completedSite,
  type ExplorationCommand,
} from './systems/exploration';
import type { Ctx } from './systems/context';
import './world-map.css';
export class WorldMapUI {
  private readonly panel: HTMLElement;
  private selectedRegion?: RegionId;
  constructor(
    root: HTMLElement,
    private readonly context: () => Ctx,
    private readonly command: (c: ExplorationCommand) => void,
  ) {
    this.panel = document.createElement('div');
    this.panel.id = 'av-world-map';
    this.panel.className = 'av-overlay';
    this.panel.hidden = true;
    this.panel.innerHTML = `<section class="av-window av-map-window" role="dialog" aria-modal="true" aria-label="探索地图"><header><h2>旅人地图 <span>THE KNOWN WORLD</span></h2><button class="av-close" id="av-map-all">全图</button><button class="av-close" id="av-map-close">关闭 M / Esc</button></header><div id="av-map-regions"></div><div class="av-map-layout"><div><canvas id="av-world-canvas" width="768" height="576" aria-label="已探索的世界；金点是角色，青色为界石，点击已发现的标记追踪"></canvas><p class="av-map-legend">金色 · 旅人　青色 · 界石　橙色 · 营地　浅金 · 未完成地点<br>行走揭开迷雾；眺望点可展开附近地图。未知地点不会显示。</p></div><aside><p id="av-map-travel-hint"></p><div id="av-waypoints"></div><h3>发现的地点 <small id="av-map-progress"></small></h3><div id="av-map-sites"></div></aside></div></section>`;
    root.appendChild(this.panel);
    this.q('#av-map-all').onclick = () => {
      this.selectedRegion = undefined;
      this.refresh();
    };
    this.q('#av-map-close').onclick = () => this.close();
    this.q<HTMLCanvasElement>('#av-world-canvas').onclick = (e) => {
      const canvas = e.currentTarget as HTMLCanvasElement,
        rect = canvas.getBoundingClientRect(),
        ctx = context(),
        view = mapViewport(canvas, ctx, this.selectedRegion),
        p = {
          x: view.left + ((e.clientX - rect.left) / rect.width) * view.width,
          y: view.top + ((e.clientY - rect.top) / rect.height) * view.height,
        };
      const target = worldSites(ctx)
        .filter((s) => ctx.progress.discovered.includes(s.definition.id))
        .sort(
          (a, b) =>
            Math.hypot(a.position.x - p.x, a.position.y - p.y) -
            Math.hypot(b.position.x - p.x, b.position.y - p.y),
        )[0];
      if (
        target &&
        Math.hypot(target.position.x - p.x, target.position.y - p.y) < 130
      ) {
        command({ type: 'track', id: target.definition.id });
        this.refresh();
      }
    };
  }
  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.panel.querySelector<T>(selector)!;
  }
  get opened(): boolean {
    return !this.panel.hidden;
  }
  open(): void {
    this.selectedRegion = undefined;
    this.panel.hidden = false;
    this.refresh();
    this.q<HTMLButtonElement>('#av-map-close').focus();
  }
  close(): void {
    this.panel.hidden = true;
  }
  refresh(): void {
    const ctx = this.context(),
      current = regionForZone(ctx.progress.zone, ctx.world.pos(ctx.player)),
      regions = this.q('#av-map-regions');
    regions.replaceChildren();
    const sites = sitesForZone(ctx.progress.zone);
    this.q('h2').textContent =
      ctx.progress.zone === 'overworld'
        ? '六域地图'
        : '地下城地图 · 沿出口返回地表';
    for (const [id, r] of Object.entries(REGIONS)) {
      if (ctx.progress.zone !== 'overworld' && id !== current) continue;
      const card = document.createElement('button');
      card.onclick = () => {
        this.selectedRegion = id as RegionId;
        this.refresh();
      };
      card.title = '点击查看该区域';
      card.dataset.mapRegion = id;
      card.className = 'av-map-region' + (id === current ? ' current' : '');
      const title = document.createElement('strong'),
        info = document.createElement('small');
      title.textContent = r.name;
      info.textContent = `建议 ${r.levels.join('–')} 级 · 探索 ${explorationPercent(ctx, id as RegionId)}%`;
      card.append(title, info);
      regions.append(card);
    }
    drawExplorationMap(
      this.q<HTMLCanvasElement>('#av-world-canvas'),
      ctx,
      this.selectedRegion,
    );
    const here = nearbySite(ctx),
      can =
        here?.definition.kind === 'waypoint' &&
        ctx.progress.waypoints.includes(here.definition.id) &&
        safeToTravel(ctx),
      portals = this.q('#av-waypoints');
    portals.replaceChildren();
    this.q('#av-map-travel-hint').textContent =
      ctx.progress.zone !== 'overworld'
        ? '寻找返回地表的出口；地下城敌人与宝箱会留下记录。'
        : can
          ? ctx.progress.waypoints.length < 2
            ? '此界石已记录。沿道路向南寻找并激活另一处界石，即可往返。'
            : '界石共鸣中 · 选择已激活的目的地'
          : '在已激活界石旁、脱离战斗后可传送。按 C 激活沿途界石。';
    for (const d of sites.filter(
      (s) =>
        s.kind === 'waypoint' &&
        (ctx.progress.discovered.includes(s.id) ||
          ctx.progress.waypoints.includes(s.id)),
    )) {
      const button = document.createElement('button'),
        known = ctx.progress.waypoints.includes(d.id);
      button.className = 'av-map-travel';
      button.dataset.travel = d.id;
      button.textContent = known
        ? d.name + (here?.definition.id === d.id ? ' · 当前位置' : ' · 传送')
        : d.name + ' · 尚未激活';
      button.disabled = !known || !can || here?.definition.id === d.id;
      button.onclick = () => {
        this.command({ type: 'travel', id: d.id });
        if (this.opened) this.refresh();
      };
      portals.append(button);
    }
    const unknown = sites.filter(
      (s) => s.kind === 'waypoint' && !ctx.progress.discovered.includes(s.id),
    ).length;
    if (unknown) {
      const hint = document.createElement('p');
      hint.className = 'av-map-legend';
      hint.textContent = `继续探索 · 尚有 ${unknown} 处界石待发现`;
      portals.append(hint);
    }
    const list = this.q('#av-map-sites');
    list.replaceChildren();
    const discovered = sites.filter((d) =>
      ctx.progress.discovered.includes(d.id),
    );
    this.q('#av-map-progress').textContent =
      `${discovered.length} / ${sites.length}`;
    for (const d of discovered) {
      const button = document.createElement('button');
      button.className =
        'av-map-site' + (ctx.progress.trackedSite === d.id ? ' tracked' : '');
      button.dataset.track = d.id;
      const title = document.createElement('strong'),
        detail = document.createElement('small');
      title.textContent = d.name;
      detail.textContent = `${SITE_NAMES[d.kind]} · ${completedSite(ctx, d) ? '已完成' : d.kind === 'waypoint' && ctx.progress.waypoints.includes(d.id) ? '已激活' : '可探索'}`;
      button.append(title, detail);
      button.title = d.description;
      button.onclick = () => {
        this.command({ type: 'track', id: d.id });
        this.refresh();
      };
      list.append(button);
    }
    if (!discovered.length)
      list.textContent = '走近路标、营地与遗迹，记录新的地点。';
  }
}
