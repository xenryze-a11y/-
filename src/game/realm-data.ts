import type { WorldSnapshot } from '../engine/ecs';
import type { LevelSnapshot } from '../engine/level';
import type { Vec2 } from '../engine/math';
export type ZoneId = 'overworld' | 'mine' | 'roots' | 'jail';
export interface RealmLayer {
  world: WorldSnapshot;
  level: LevelSnapshot;
}
export interface Journey {
  returnTracked?: string;
  layers: Partial<Record<ZoneId, RealmLayer>>;
  returnAt: Vec2;
}
export const DUNGEONS = {
  mine: { name: '废弃矿洞', region: 'vale', color: '#c5a677' },
  roots: { name: '腐根洞窟', region: 'forest', color: '#a88ec1' },
  jail: { name: '旧城地牢', region: 'sanctum', color: '#a8c3b0' },
} as const;
