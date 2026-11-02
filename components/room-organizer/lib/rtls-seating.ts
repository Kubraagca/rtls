import type { FurnitureItem } from './types';

/** A real, usable place where an RTLS avatar may sit. */
export interface RtlsSeatAnchor {
  id: string;
  sourceId: string;
  x: number;
  z: number;
  faceYaw: number;
}

const SINGLE_SEAT_TYPES = new Set([
  'office-chair',
  'conference-chair',
  'chair',
  'dining-chair',
  'armchair',
  'bench',
  'garden-bench',
  'gltf-chair',
]);

const MULTI_SEAT_TYPES = new Set(['sofa', 'gltf-sofa']);

/**
 * Returns true only for furniture that can physically support a seated pose.
 * Custom uploaded assets are accepted only when the editor placed them in the
 * seating category; arbitrary GLBs must never become invisible seat targets.
 */
export function isRtlsSeat(item: FurnitureItem): boolean {
  return SINGLE_SEAT_TYPES.has(item.type)
    || MULTI_SEAT_TYPES.has(item.type)
    || (item.type === 'custom-glb' && item.category === 'seating');
}

/**
 * Build explicit seat anchors instead of using an object's generic centre.
 * A sofa/bench gets multiple anchors, which makes seating groups usable and
 * prevents several tracked people from stacking into one visual seat.
 */
export function getRtlsSeatAnchors(items: readonly FurnitureItem[]): RtlsSeatAnchor[] {
  const anchors: RtlsSeatAnchor[] = [];
  for (const item of items) {
    if (!item.position || !isRtlsSeat(item)) continue;

    const isMultiSeat = MULTI_SEAT_TYPES.has(item.type) || item.type === 'bench' || item.type === 'garden-bench';
    const count = isMultiSeat ? Math.max(1, Math.min(4, Math.floor(item.width / 0.72))) : 1;
    const usableWidth = count > 1 ? Math.max(0.45, item.width - 0.34) : 0;
    const yaw = item.rotation ?? 0;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    for (let index = 0; index < count; index += 1) {
      const localX = count === 1 ? 0 : -usableWidth / 2 + (usableWidth * index) / (count - 1);
      anchors.push({
        id: `${item.id}:seat-${index + 1}`,
        sourceId: item.id,
        x: item.position.x + localX * cos,
        z: item.position.z + localX * sin,
        faceYaw: normalizeAngle(yaw),
      });
    }
  }
  return anchors;
}

/** Used by the non-live editor preview to validate a persisted seated pose. */
export function findRtlsSeatAnchor(
  position: { x: number; z: number },
  items: readonly FurnitureItem[],
  maxDistance = 0.52
): RtlsSeatAnchor | undefined {
  let closest: RtlsSeatAnchor | undefined;
  let closestDistance = maxDistance;
  for (const anchor of getRtlsSeatAnchors(items)) {
    const distance = Math.hypot(anchor.x - position.x, anchor.z - position.z);
    if (distance <= closestDistance) {
      closest = anchor;
      closestDistance = distance;
    }
  }
  return closest;
}

function normalizeAngle(value: number): number {
  let angle = value % (Math.PI * 2);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
