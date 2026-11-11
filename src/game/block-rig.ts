/** 模块化方块人单节骨架：所有装备与手持物共用挂点，UI 预览复用同一静止姿态。 */
import type { View } from '../engine/facing';
import type { LimbPose } from '../engine/animation';
import type { Equip } from './components';
import type { ArmorMat } from './armor';
export interface BlockPartPose {
  part: string;
  frame: string;
  x: number;
  y: number;
  ax: number;
  ay: number;
  rotation: number;
  sx: number;
  sy: number;
  z: number;
}
export const BLOCK_RIG = {
  shoulderY: -30,
  hipY: -14,
  armLength: 14,
  legLength: 14,
  weaponScale: 0.74,
  headY: -31,
  stride: 2.4,
  lift: 1.5,
};
export function blockFrame(part: string, mat: string, view: View): string {
  return `block_${part}_${mat}_${view}`;
}
export function blockPose(
  pose: LimbPose,
  eq: Equip,
  view: View,
  flip: boolean,
  attack = 0,
  cast = 0,
): BlockPartPose[] {
  const parts: BlockPartPose[] = [],
    fx = flip ? -1 : 1,
    bob = Math.abs(Math.sin(pose.phase)) * 0.6 * pose.blend;
  const add = (
    part: string,
    frame: string,
    x: number,
    y: number,
    ax: number,
    ay: number,
    z: number,
    rotation = 0,
    sy = 1,
  ) =>
    parts.push({
      part,
      frame,
      x: x * fx,
      y,
      ax,
      ay,
      rotation: rotation * fx,
      sx: fx,
      sy,
      z,
    });
  const mat = (slot: 'head' | 'chest' | 'legs'): ArmorMat => eq[slot] || 'none';
  add(
    'body',
    blockFrame('body', mat('chest'), view),
    0,
    BLOCK_RIG.hipY - bob,
    0.5,
    1,
    10,
  );
  add(
    'head',
    blockFrame('head', mat('head'), view),
    0,
    BLOCK_RIG.headY - bob,
    0.5,
    1,
    20,
  );
  for (let i = 0; i < 2; i++) {
    const ph = pose.phase + i * Math.PI,
      swing = Math.sin(ph) * pose.blend,
      hipX = view === 'side' ? (i === 0 ? -2.5 : 2.5) : i === 0 ? -4.5 : 4.5,
      lift = Math.max(0, Math.cos(ph)) * BLOCK_RIG.lift * pose.blend;
    const legRot = view === 'side' ? swing * 0.25 : swing * 0.16 * pose.dir.x,
      len =
        BLOCK_RIG.legLength -
        lift +
        (view === 'side' ? 0 : swing * 1.2 * Math.abs(pose.dir.y)),
      hipY = BLOCK_RIG.hipY - bob * 0.25;
    add(
      'leg' + i,
      blockFrame('leg', mat('legs'), view),
      hipX,
      hipY,
      0.5,
      0,
      view === 'side' && i === 0 ? 6 : 11,
      legRot,
      len / BLOCK_RIG.legLength,
    );
    add(
      'foot' + i,
      blockFrame('boot', eq.shoes, view),
      hipX - Math.sin(legRot) * len,
      hipY + Math.cos(legRot) * len,
      0.5,
      1,
      view === 'side' && i === 0 ? 7 : 12,
    );
    const shoulderX =
        view === 'side'
          ? i === 0
            ? -3
            : 4
          : (i === 0 ? -11 : 11) * (view === 'back' ? -1 : 1),
      y = BLOCK_RIG.shoulderY - bob;
    let rot = -swing * (view === 'side' ? 0.32 : 0.13);
    if (i === 1) {
      rot += (view === 'back' ? 1 : -1) * (0.12 + cast * 0.85 + attack * 0.8);
    }
    const hx = shoulderX - Math.sin(rot) * BLOCK_RIG.armLength,
      hy = y + Math.cos(rot) * BLOCK_RIG.armLength;
    const z = (view === 'side' && i === 0) || view === 'back' ? 8 : 15;
    add(
      'arm' + i,
      blockFrame('arm', mat('chest'), view),
      shoulderX,
      y,
      0.5,
      0,
      z,
      rot,
    );
    add(
      'hand' + i,
      blockFrame('hand', mat('chest'), view),
      hx,
      hy,
      0.5,
      0.5,
      z + 2,
      rot,
    );
  }
  return parts.sort((a, b) => a.z - b.z);
}
