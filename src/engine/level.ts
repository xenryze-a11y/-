/**
 * 瓦片地图与碰撞。对应 goengine 的 engine/level/level.go。
 * 坐标系：俯视 2D，+X 向右、+Y 向下，单位世界像素，时间秒。
 * 瓦片用一个 uint8 同时编码材质与通行性；越界当墙。
 */
import { clamp, makeRng, type Vec2 } from './math';

export const TILE = 32;

export const Tile = {
  GRASS: 0,
  DIRT: 1,
  STONE: 2,
  WATER: 3,
  FLOOR: 4,
  WALL: 5,
  ROAD: 6,
  CLIFF: 7,
  STAIRS: 8,
} as const;

export type TileValue = (typeof Tile)[keyof typeof Tile];

/** 贴图名按材质查表；命名即协议，见 docs/ART.md。 */
export const TILE_SPRITE: Record<TileValue, string> = {
  [Tile.GRASS]: 'tileGrass',
  [Tile.DIRT]: 'tileDirt',
  [Tile.STONE]: 'tileStone',
  [Tile.WATER]: 'tileWater',
  [Tile.FLOOR]: 'tileFloor',
  [Tile.WALL]: 'tileWall',
  [Tile.ROAD]: 'tileRoad',
  [Tile.CLIFF]: 'tileCliffRaised',
  [Tile.STAIRS]: 'terrainStairs',
};

export interface Blocker {
  x: number;
  y: number;
  r: number;
}
export interface LevelSnapshot {
  w: number;
  h: number;
  tiles: number[];
  southWalls: number[];
  spawn: Vec2;
  blockers: Blocker[];
  revision: number;
}

export class Level {
  readonly tiles: Uint8Array;
  /** 南面墙要画在实体之上，用伪 3D 夹出房屋（对应 Go 的 LayerWallFront/Roof）。 */
  readonly southWalls: Uint8Array;
  readonly spawn: Vec2 = { x: 0, y: 0 };
  private readonly blockers: Blocker[] = [];
  private readonly blockerCells = new Map<string, Set<Blocker>>();
  private readonly blockerCellSize = 128;
  revision = 0;
  /** 只标记瓦片外观改变；碰撞物增减不应重烘焙地面。 */
  terrainRevision = 0;
  markTerrainChanged(): void {
    this.revision++;
    this.terrainRevision++;
  }

  constructor(
    readonly w: number,
    readonly h: number,
    seed = 20261109,
  ) {
    this.tiles = new Uint8Array(w * h);
    this.southWalls = new Uint8Array(w * h);
    this.generate(seed);
  }

  get pixelW(): number {
    return this.w * TILE;
  }
  snapshot(): LevelSnapshot {
    return {
      w: this.w,
      h: this.h,
      tiles: [...this.tiles],
      southWalls: [...this.southWalls],
      spawn: { ...this.spawn },
      blockers: this.blockers.map((b) => ({ ...b })),
      revision: this.revision,
    };
  }
  static restore(data: LevelSnapshot): Level {
    const level = new Level(data.w, data.h);
    level.tiles.set(data.tiles);
    level.southWalls.set(data.southWalls);
    Object.assign(level.spawn, data.spawn);
    for (const b of data.blockers) level.addBlocker(b.x, b.y, b.r);
    level.revision = data.revision;
    return level;
  }
  get pixelH(): number {
    return this.h * TILE;
  }

  at(cx: number, cy: number): TileValue {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return Tile.WALL;
    return this.tiles[cy * this.w + cx] as TileValue;
  }

  private set(cx: number, cy: number, t: TileValue): void {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return;
    this.tiles[cy * this.w + cx] = t;
  }

  private solidTile(t: TileValue): boolean {
    return t === Tile.WALL || t === Tile.WATER || t === Tile.CLIFF;
  }

  addBlocker(x: number, y: number, r: number): void {
    const b = { x, y, r };
    this.blockers.push(b);
    this.visitBlockerCells(b, (key) => {
      let bucket = this.blockerCells.get(key);
      if (!bucket) {
        bucket = new Set();
        this.blockerCells.set(key, bucket);
      }
      bucket.add(b);
    });
    this.revision++;
  }

  removeBlocker(x: number, y: number): void {
    const i = this.blockers.findIndex(
      (b) => Math.hypot(b.x - x, b.y - y) < 0.01,
    );
    if (i >= 0) {
      const b = this.blockers[i];
      this.visitBlockerCells(b, (key) => {
        const bucket = this.blockerCells.get(key);
        bucket?.delete(b);
        if (!bucket?.size) this.blockerCells.delete(key);
      });
      this.blockers.splice(i, 1);
      this.revision++;
    }
  }

  private visitBlockerCells(b: Blocker, visit: (key: string) => void): void {
    const cell = this.blockerCellSize;
    for (
      let y = Math.floor((b.y - b.r) / cell);
      y <= Math.floor((b.y + b.r) / cell);
      y++
    )
      for (
        let x = Math.floor((b.x - b.r) / cell);
        x <= Math.floor((b.x + b.r) / cell);
        x++
      )
        visit(`${x}:${y}`);
  }
  blocked(x: number, y: number, r = 0): boolean {
    if (this.terrainBlocked(x, y, r)) return true;
    if (r <= 0) return false;
    const cell = this.blockerCellSize;
    for (
      let yy = Math.floor((y - r) / cell);
      yy <= Math.floor((y + r) / cell);
      yy++
    )
      for (
        let xx = Math.floor((x - r) / cell);
        xx <= Math.floor((x + r) / cell);
        xx++
      ) {
        const bucket = this.blockerCells.get(`${xx}:${yy}`);
        if (bucket)
          for (const b of bucket) {
            const dx = x - b.x,
              dy = y - b.y;
            if (dx * dx + dy * dy < (r + b.r) ** 2) return true;
          }
      }
    return false;
  }

  /** 圆-AABB 最近点判定。r=0 要单独处理，否则恒假、投射物会穿墙。 */
  terrainBlocked(x: number, y: number, r = 0): boolean {
    if (r <= 0)
      return this.solidTile(
        this.at(Math.floor(x / TILE), Math.floor(y / TILE)),
      );
    const minX = Math.floor((x - r) / TILE);
    const maxX = Math.floor((x + r) / TILE);
    const minY = Math.floor((y - r) / TILE);
    const maxY = Math.floor((y + r) / TILE);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (!this.solidTile(this.at(cx, cy))) continue;
        const nx = clamp(x, cx * TILE, (cx + 1) * TILE);
        const ny = clamp(y, cy * TILE, (cy + 1) * TILE);
        const dx = x - nx;
        const dy = y - ny;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  /** Supercover 网格遍历：检查整条线经过的瓦片，包括恰好擦过的对角墙角。 */
  lineClear(a: Vec2, b: Vec2): boolean {
    let x = Math.floor(a.x / TILE),
      y = Math.floor(a.y / TILE);
    const endX = Math.floor(b.x / TILE),
      endY = Math.floor(b.y / TILE);
    const dx = b.x - a.x,
      dy = b.y - a.y,
      sx = Math.sign(dx),
      sy = Math.sign(dy);
    const deltaX = dx ? TILE / Math.abs(dx) : Infinity,
      deltaY = dy ? TILE / Math.abs(dy) : Infinity;
    let maxX = dx
      ? ((sx > 0 ? (x + 1) * TILE : x * TILE) - a.x) / dx
      : Infinity;
    let maxY = dy
      ? ((sy > 0 ? (y + 1) * TILE : y * TILE) - a.y) / dy
      : Infinity;
    const solid = (xx: number, yy: number): boolean =>
      this.solidTile(this.at(xx, yy));
    if (solid(x, y)) return false;
    while (x !== endX || y !== endY) {
      if (Math.abs(maxX - maxY) < 1e-10) {
        if (solid(x + sx, y) || solid(x, y + sy)) return false;
        x += sx;
        y += sy;
        maxX += deltaX;
        maxY += deltaY;
      } else if (maxX < maxY) {
        x += sx;
        maxX += deltaX;
      } else {
        y += sy;
        maxY += deltaY;
      }
      if (solid(x, y)) return false;
    }
    return true;
  }

  /**
   * 分轴移动：X 能过走 X、Y 能过走 Y，贴墙时沿墙滑动而不是原地卡死。
   * 返回实际落点，调用方必须经 world.setPos 写回（同步空间哈希）。
   */
  move(from: Vec2, dx: number, dy: number, r: number): Vec2 {
    let x = from.x;
    let y = from.y;
    if (dx !== 0 && !this.blocked(x + dx, y, r)) x += dx;
    if (dy !== 0 && !this.blocked(x, y + dy, r)) y += dy;
    return { x, y };
  }

  private generate(seed: number): void {
    const rng = makeRng(seed);
    const pick = (n: number): number => Math.floor(rng() * n);
    const brush = (cx: number, cy: number, rad: number, t: TileValue): void => {
      for (let y = cy - rad; y <= cy + rad; y++) {
        for (let x = cx - rad; x <= cx + rad; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= rad + (rng() - 0.5) * 2 && this.at(x, y) === Tile.GRASS)
            this.set(x, y, t);
        }
      }
    };

    for (let i = 0; i < this.w * this.h; i++) this.tiles[i] = Tile.GRASS;
    // 外圈石墙当世界边界。
    for (let x = 0; x < this.w; x++) {
      this.set(x, 0, Tile.WALL);
      this.set(x, this.h - 1, Tile.WALL);
    }
    for (let y = 0; y < this.h; y++) {
      this.set(0, y, Tile.WALL);
      this.set(this.w - 1, y, Tile.WALL);
    }

    for (let i = 0; i < 26; i++)
      brush(
        2 + pick(this.w - 4),
        2 + pick(this.h - 4),
        2 + pick(4),
        rng() < 0.5 ? Tile.DIRT : Tile.STONE,
      );
    for (let i = 0; i < 5; i++)
      brush(
        4 + pick(this.w - 8),
        4 + pick(this.h - 8),
        2 + pick(3),
        Tile.WATER,
      );

    // 十字土路，保证地图连通、跑起来有参照物。
    const roadY = Math.floor(this.h / 2);
    const roadX = Math.floor(this.w / 2);
    for (let x = 2; x < this.w - 2; x++) {
      for (let y = roadY - 1; y <= roadY + 1; y++) this.set(x, y, Tile.ROAD);
    }
    for (let y = 2; y < this.h - 2; y++) {
      for (let x = roadX - 1; x <= roadX + 1; x++) this.set(x, y, Tile.ROAD);
    }

    // 几间木屋：边框墙 + 内部地板 + 南面开口（门）。
    for (let n = 0; n < 5; n++) {
      const bw = 7 + pick(4);
      const bh = 6 + pick(3);
      const ox = 4 + pick(this.w - bw - 8);
      const oy = 4 + pick(this.h - bh - 8);
      for (let y = oy; y < oy + bh; y++) {
        for (let x = ox; x < ox + bw; x++) {
          const edge =
            x === ox || x === ox + bw - 1 || y === oy || y === oy + bh - 1;
          this.set(x, y, edge ? Tile.WALL : Tile.FLOOR);
        }
      }
      const doorX = ox + Math.floor(bw / 2);
      this.set(doorX, oy + bh - 1, Tile.FLOOR);
      for (let x = ox; x < ox + bw; x++) {
        if (this.at(x, oy + bh - 1) === Tile.WALL)
          this.southWalls[(oy + bh - 1) * this.w + x] = 1;
      }
      // 屋子里别刷怪，顺手把出生点附近的草清干净。
    }

    this.spawn.x = (roadX + 0.5) * TILE;
    this.spawn.y = (roadY + 0.5) * TILE;
    for (let y = roadY - 3; y <= roadY + 3; y++) {
      for (let x = roadX - 3; x <= roadX + 3; x++) {
        if (this.solidTile(this.at(x, y))) this.set(x, y, Tile.DIRT);
      }
    }
  }
}
