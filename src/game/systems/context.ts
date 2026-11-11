/** 系统共享上下文。加系统时只改这里，不用给每个系统塞一堆参数。 */
import type { Vec2 } from '../../engine/math';
import type { Camera } from '../../engine/camera';
import type { Scene } from '../spawn';

export interface Ctx extends Scene {
  camera: Camera;
  /** 本局是否结束（玩家死亡）。 */
  gameOver: boolean;
  debug: boolean;
  aimPointer: Vec2;
}
