import { isWallMounted, isWallPassThrough } from './opening-snap';
import type { FurnitureItem, InteriorWall, RoomLayout, Vec2 } from './types';

// A tiny visual-fit tolerance keeps adjacent furniture from getting stuck on
// floating-point/model-export edges. It is deliberately much smaller than a
// furniture footprint, so genuine overlaps still collide.
const COLLISION_EDGE_TOLERANCE = 0.015;

function collisionDimensions(item: Pick<FurnitureItem, 'width' | 'depth' | 'collisionWidth' | 'collisionDepth'>): { width: number; depth: number } {
  return {
    width: Math.max(0.01, (item.collisionWidth ?? item.width) - COLLISION_EDGE_TOLERANCE),
    depth: Math.max(0.01, (item.collisionDepth ?? item.depth) - COLLISION_EDGE_TOLERANCE),
  };
}

export function boundingRadius(item: Pick<FurnitureItem, 'width' | 'depth' | 'collisionWidth' | 'collisionDepth'>): number {
  const width = item.collisionWidth ?? item.width;
  const depth = item.collisionDepth ?? item.depth;
  return Math.hypot(width / 2, depth / 2);
}

/**
 * Half-extents of an item's axis-aligned bounding box in world space, given
 * its oriented footprint. Shared by bounds tests, wall snapping, and the 2D
 * renderer so rotated items report a consistent footprint everywhere.
 */
export function rotatedHalfExtents(
  item: Pick<FurnitureItem, 'width' | 'depth' | 'rotation'>
): { halfW: number; halfD: number } {
  const cos = Math.abs(Math.cos(item.rotation ?? 0));
  const sin = Math.abs(Math.sin(item.rotation ?? 0));
  return {
    halfW: (item.width * cos + item.depth * sin) / 2,
    halfD: (item.width * sin + item.depth * cos) / 2,
  };
}

/**
 * Oriented-bounding-box overlap via the separating-axis theorem (SAT) in the
 * XZ plane. The cheap bounding-circle test runs first as a broad phase; SAT
 * then eliminates the false positives circles produce on long, thin items
 * (sofas, fences, counters) sitting diagonally near each other.
 */
export function itemsOverlap(a: FurnitureItem, b: FurnitureItem): boolean {
  if (!a.position || !b.position) return false;
  const distance = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
  if (distance >= boundingRadius(a) + boundingRadius(b)) return false;
  return obbOverlap(toObb(a), toObb(b));
}

interface Obb {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  /** Unit axis of the width dimension. */
  ax: number;
  az: number;
  /** Unit axis of the depth dimension. */
  bx: number;
  bz: number;
}

function toObb(item: FurnitureItem): Obb {
  const rotation = item.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dimensions = collisionDimensions(item);
  return {
    cx: item.position?.x ?? 0,
    cz: item.position?.z ?? 0,
    hw: dimensions.width / 2,
    hd: dimensions.depth / 2,
    // Three's rotY maps the local +X axis to (cosθ, −sinθ) in world XZ, so the
    // width axis is (cos, −sin) and the depth axis is (sin, cos).
    ax: cos,
    az: -sin,
    bx: sin,
    bz: cos,
  };
}

function obbOverlap(a: Obb, b: Obb): boolean {
  // SAT: two convex boxes are disjoint iff a separating axis exists among the
  // four face normals. Project each box's half-extents and the centre delta
  // onto every axis and compare.
  const axes: ReadonlyArray<readonly [number, number]> = [
    [a.ax, a.az],
    [a.bx, a.bz],
    [b.ax, b.az],
    [b.bx, b.bz],
  ];
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  for (const [x, z] of axes) {
    const projectedDistance = Math.abs(dx * x + dz * z);
    const extentA = a.hw * Math.abs(a.ax * x + a.az * z) + a.hd * Math.abs(a.bx * x + a.bz * z);
    const extentB = b.hw * Math.abs(b.ax * x + b.az * z) + b.hd * Math.abs(b.bx * x + b.bz * z);
    if (projectedDistance >= extentA + extentB) return false;
  }
  return true;
}

const WALL_THICKNESS = 0.16;

export function collisionWalls(layout: RoomLayout, interiorWalls: readonly InteriorWall[] = []): InteriorWall[] {
  const w = layout.width / 2;
  const d = layout.height / 2;
  const boundary = layout.boundaryWalls?.length ? layout.boundaryWalls : [
    { id: 'north', x1: -w, z1: -d, x2: w, z2: -d },
    { id: 'east', x1: w, z1: -d, x2: w, z2: d },
    { id: 'south', x1: w, z1: d, x2: -w, z2: d },
    { id: 'west', x1: -w, z1: d, x2: -w, z2: -d },
  ];
  return [...boundary, ...interiorWalls];
}

/** Continuous SAT: test the entire translation, even if one pointer event
 * jumps from one side of a thin wall to the other. */
export function movementCrossesWall(item: FurnitureItem, destination: Vec2, walls: readonly InteriorWall[]): boolean {
  if (!item.position || isWallMounted(item.type) || isWallPassThrough(item.type)) return false;
  if (![destination.x, destination.z].every(Number.isFinite)) return true;
  const a = toObb(item);
  const vx = destination.x - a.cx;
  const vz = destination.z - a.cz;
  if (Math.hypot(vx, vz) < 1e-9) return false;
  return walls.some((wall) => {
    const b = wallAsObb(wall);
    if (!b) return false;
    // Furniture intentionally sits very close to wall faces, so its starting
    // footprint may already touch the wall's thickness. In that case only a
    // move deeper into the wall or through to the other side is blocked;
    // moving away/along the wall must remain possible.
    if (obbOverlap(a, b)) {
      const startNormal = (a.cx - b.cx) * b.bx + (a.cz - b.cz) * b.bz;
      const endX = a.cx + vx;
      const endZ = a.cz + vz;
      const endNormal = (endX - b.cx) * b.bx + (endZ - b.cz) * b.bz;
      if (startNormal * endNormal < -1e-8 || Math.abs(endNormal) < Math.abs(startNormal) - 1e-8) return true;
      return false;
    }
    let enter = 0;
    let leave = 1;
    for (const [x, z] of [[a.ax, a.az], [a.bx, a.bz], [b.ax, b.az], [b.bx, b.bz]] as const) {
      const radius = a.hw * Math.abs(a.ax * x + a.az * z) + a.hd * Math.abs(a.bx * x + a.bz * z)
        + b.hw * Math.abs(b.ax * x + b.az * z) + b.hd * Math.abs(b.bx * x + b.bz * z);
      const start = (a.cx - b.cx) * x + (a.cz - b.cz) * z;
      const speed = vx * x + vz * z;
      if (Math.abs(speed) < 1e-10) {
        if (Math.abs(start) >= radius - 1e-8) return false;
      } else {
        const t1 = (-radius - start) / speed;
        const t2 = (radius - start) / speed;
        enter = Math.max(enter, Math.min(t1, t2));
        leave = Math.min(leave, Math.max(t1, t2));
        if (enter >= leave - 1e-8) return false;
      }
    }
    return enter < leave - 1e-8;
  });
}

function wallAsObb(wall: InteriorWall): Obb | null {
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const length = Math.hypot(dx, dz);
  if (length < 0.0001) return null;
  return {
    cx: (wall.x1 + wall.x2) / 2,
    cz: (wall.z1 + wall.z2) / 2,
    hw: length / 2,
    hd: WALL_THICKNESS / 2,
    ax: dx / length,
    az: dz / length,
    bx: -dz / length,
    bz: dx / length,
  };
}

function crossesWall(item: FurnitureItem, walls: readonly InteriorWall[]): boolean {
  const itemObb = toObb(item);
  return walls.some((wall) => {
    const wallObb = wallAsObb(wall);
    return wallObb ? obbOverlap(itemObb, wallObb) : false;
  });
}

export function itemInBounds(item: FurnitureItem, roomWidth: number, roomDepth: number): boolean {
  if (!item.position) return false;
  // Rotation-aware AABB of the item's oriented footprint.
  const dimensions = collisionDimensions(item);
  const rotation = item.rotation ?? 0;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const halfW = (dimensions.width * cos + dimensions.depth * sin) / 2;
  const halfD = (dimensions.width * sin + dimensions.depth * cos) / 2;
  return (
    item.position.x - halfW >= -roomWidth / 2 &&
    item.position.x + halfW <= roomWidth / 2 &&
    item.position.z - halfD >= -roomDepth / 2 &&
    item.position.z + halfD <= roomDepth / 2
  );
}

/** True when the item's rotation-aware AABB is entirely beyond the room rect. */
export function itemFullyOutside(item: FurnitureItem, roomWidth: number, roomDepth: number): boolean {
  if (!item.position) return false;
  const { halfW, halfD } = rotatedHalfExtents(item);
  return (
    item.position.x + halfW <= -roomWidth / 2 ||
    item.position.x - halfW >= roomWidth / 2 ||
    item.position.z + halfD <= -roomDepth / 2 ||
    item.position.z - halfD >= roomDepth / 2
  );
}

/**
 * Anything at or under this height goes UNDER furniture by design (rugs are
 * 0.02 m) — a rug beneath a sofa is the intended use, not a collision.
 */
const LOW_PROFILE_MAX_HEIGHT = 0.05;

// Ceiling-mounted infrastructure intentionally shares X/Z footprint with
// desks and people below it. The editor has no per-item elevation field, so
// these types live on a separate vertical layer for collision purposes.
const CEILING_MOUNTED_TYPES = new Set(['ceiling-panel-light', 'rtls-gateway', 'rtls-beacon']);

function isLowProfile(item: Pick<FurnitureItem, 'height'>): boolean {
  return item.height <= LOW_PROFILE_MAX_HEIGHT;
}

// Intended-stacking families (#120): small tabletop items sit ON these
// surfaces (the Office template puts the computer and lamp on the desk) and
// seats tuck UNDER tables (the Kitchen template's dining chairs). Items have
// no elevation field, so the layer model is by type.
const SURFACE_TYPES = new Set(['desk', 'dining-table', 'coffee-table', 'side-table', 'counter', 'nightstand', 'dresser']);
const TABLETOP_TYPES = new Set(['computer', 'lamp', 'plant', 'books', 'candles', 'flowerpot', 'wifi', 'coffee-machine', 'vase', 'gltf-vase']);
const SEAT_TYPES = new Set(['chair', 'dining-chair', 'bench']);

function isIntendedStack(a: FurnitureItem, b: FurnitureItem): boolean {
  const stacksOn = (surface: FurnitureItem, top: FurnitureItem): boolean =>
    SURFACE_TYPES.has(surface.type) && (TABLETOP_TYPES.has(top.type) || SEAT_TYPES.has(top.type));
  return stacksOn(a, b) || stacksOn(b, a);
}

/**
 * Layer-aware pair test (#120). Wall-plane items (doors, windows, cameras)
 * collide only with EACH OTHER — two doors overlapping on one wall is real,
 * but floor furniture flush under a window or beneath a 2.4 m camera is the
 * intended use. The old symmetric 2D test flagged the shipped Living Room
 * template (rug under sofa) red on load.
 */
function pairCollides(a: FurnitureItem, b: FurnitureItem): boolean {
  const aBottom = a.elevation ?? 0;
  const bBottom = b.elevation ?? 0;
  if (aBottom + a.height <= bBottom + 0.01 || bBottom + b.height <= aBottom + 0.01) return false;
  if (CEILING_MOUNTED_TYPES.has(a.type) || CEILING_MOUNTED_TYPES.has(b.type)) return false;
  if (isWallMounted(a.type) !== isWallMounted(b.type)) return false;
  if (isLowProfile(a) || isLowProfile(b)) return false;
  if (isIntendedStack(a, b)) return false;
  return itemsOverlap(a, b);
}

export function hasCollisions(
  item: FurnitureItem,
  allItems: readonly FurnitureItem[],
  roomWidth: number,
  roomDepth: number,
  interiorWalls: readonly InteriorWall[] = [],
  boundaryWalls: readonly InteriorWall[] = []
): boolean {
  if (!item.position) return false;
  const overlapsAnother = (): boolean =>
    allItems.some((other) => other.id !== item.id && pairCollides(item, other));
  // Wall-plane items (doors, windows, cameras) live in — or on the exterior
  // side of — the wall by design, so the room-bounds test never applies:
  // they'd always poke through the wall and read as out-of-bounds.
  if (isWallMounted(item.type)) return overlapsAnother();
  // Outdoor items belong outside the building footprint — flag them when any
  // part of their footprint pokes into the room. They still collide with
  // other items (e.g. two trees on the same spot).
  if (item.category === 'outdoor') {
    if (!itemFullyOutside(item, roomWidth, roomDepth)) return true;
    return overlapsAnother();
  }
  if (!itemInBounds(item, roomWidth, roomDepth)) return true;
  if (!isWallPassThrough(item.type) && crossesWall(item, [...interiorWalls, ...boundaryWalls])) return true;
  return overlapsAnother();
}

export type AutoOrganizeStrategy = 'shelf' | 'by-category' | 'by-size';

export function autoOrganize(
  items: readonly FurnitureItem[],
  roomWidth: number,
  roomDepth: number,
  strategy: AutoOrganizeStrategy = 'shelf',
  margin = 0.3
): FurnitureItem[] {
  if (items.length === 0) return [];

  const ordered = orderItemsForStrategy(items, strategy);
  const organized: FurnitureItem[] = [];
  let cursorX = -roomWidth / 2 + margin;
  let cursorZ = -roomDepth / 2 + margin;
  let rowMaxDepth = 0;

  for (const item of ordered) {
    if (cursorX + item.width + margin > roomWidth / 2) {
      cursorX = -roomWidth / 2 + margin;
      cursorZ += rowMaxDepth + margin;
      rowMaxDepth = 0;
    }

    // An item the grid can't hold — wider than the room even on a fresh row,
    // or the rows have consumed the remaining depth — keeps its original spot
    // and rotation: packing what fits beats stacking every leftover in an
    // overlapping pile at the origin (#128).
    const fitsWidth = cursorX + item.width + margin <= roomWidth / 2;
    const fitsDepth = cursorZ + item.depth + margin <= roomDepth / 2;
    if (!fitsWidth || !fitsDepth) {
      organized.push(item);
      continue;
    }

    organized.push({
      ...item,
      position: { x: cursorX + item.width / 2, z: cursorZ + item.depth / 2 },
      rotation: 0,
    });
    cursorX += item.width + margin;
    rowMaxDepth = Math.max(rowMaxDepth, item.depth);
  }

  return organized;
}

function orderItemsForStrategy(items: readonly FurnitureItem[], strategy: AutoOrganizeStrategy): readonly FurnitureItem[] {
  if (strategy === 'shelf') return items;

  if (strategy === 'by-size') {
    return [...items].sort((a, b) => b.width * b.depth - a.width * a.depth);
  }

  // by-category: cluster items with the same category together.
  return [...items].sort((a, b) => (a.category ?? 'zzz').localeCompare(b.category ?? 'zzz'));
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export interface SnapToWallOptions {
  position: Vec2;
  item: Pick<FurnitureItem, 'width' | 'depth' | 'rotation'>;
  roomWidth: number;
  roomDepth: number;
  /** Maximum distance (m) from the wall at which snapping is applied. */
  threshold?: number;
}

/**
 * Snap a position to the nearest wall when within `threshold`. Returns the
 * adjusted position. Considers the item's axis-aligned half-extent only —
 * rotated bounds are handled with a conservative bounding box.
 */
export function snapToWall({
  position,
  item,
  roomWidth,
  roomDepth,
  threshold = 0.35,
}: SnapToWallOptions): Vec2 {
  const { halfW, halfD } = rotatedHalfExtents(item);

  const minX = -roomWidth / 2 + halfW;
  const maxX = roomWidth / 2 - halfW;
  const minZ = -roomDepth / 2 + halfD;
  const maxZ = roomDepth / 2 - halfD;

  let { x, z } = position;
  if (x - minX < threshold) x = minX;
  else if (maxX - x < threshold) x = maxX;
  if (z - minZ < threshold) z = minZ;
  else if (maxZ - z < threshold) z = maxZ;

  return { x, z };
}

export function totalCost(items: readonly FurnitureItem[]): number {
  return items.reduce((sum, item) => sum + (item.price ?? 0), 0);
}

export function footprintArea(items: readonly FurnitureItem[]): number {
  return items.reduce((sum, item) => sum + item.width * item.depth, 0);
}

export function itemCountByCategory(items: readonly FurnitureItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.category ?? 'uncategorized';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface SnapToNeighborOptions {
  position: Vec2;
  movingItem: Pick<FurnitureItem, 'id' | 'width' | 'depth' | 'rotation'>;
  otherItems: readonly FurnitureItem[];
  threshold?: number;
}

/**
 * Snap a candidate position so that the moving item's edges or centers align
 * with the nearest neighbor's edges or centers (within `threshold`). Returns
 * the adjusted position. Works in rotated-bounding-box space.
 */
export function snapToNeighbors({
  position,
  movingItem,
  otherItems,
  threshold = 0.2,
}: SnapToNeighborOptions): Vec2 {
  const { cosAbs, sinAbs } = rotatedExtents(movingItem.rotation ?? 0);
  const halfW = (movingItem.width * cosAbs + movingItem.depth * sinAbs) / 2;
  const halfD = (movingItem.width * sinAbs + movingItem.depth * cosAbs) / 2;

  let bestX = position.x;
  let bestZ = position.z;
  let bestXDelta = threshold;
  let bestZDelta = threshold;

  for (const other of otherItems) {
    if (other.id === movingItem.id || !other.position) continue;
    const otherExtents = rotatedExtents(other.rotation ?? 0);
    const otherHalfW = (other.width * otherExtents.cosAbs + other.depth * otherExtents.sinAbs) / 2;
    const otherHalfD = (other.width * otherExtents.sinAbs + other.depth * otherExtents.cosAbs) / 2;

    const candidatesX = [
      other.position.x,
      other.position.x - otherHalfW + halfW,
      other.position.x + otherHalfW - halfW,
      other.position.x - otherHalfW - halfW,
      other.position.x + otherHalfW + halfW,
    ];
    const candidatesZ = [
      other.position.z,
      other.position.z - otherHalfD + halfD,
      other.position.z + otherHalfD - halfD,
      other.position.z - otherHalfD - halfD,
      other.position.z + otherHalfD + halfD,
    ];

    for (const cx of candidatesX) {
      const delta = Math.abs(cx - position.x);
      if (delta < bestXDelta) {
        bestXDelta = delta;
        bestX = cx;
      }
    }
    for (const cz of candidatesZ) {
      const delta = Math.abs(cz - position.z);
      if (delta < bestZDelta) {
        bestZDelta = delta;
        bestZ = cz;
      }
    }
  }

  return { x: bestX, z: bestZ };
}

function rotatedExtents(rotation: number): { cosAbs: number; sinAbs: number } {
  return { cosAbs: Math.abs(Math.cos(rotation)), sinAbs: Math.abs(Math.sin(rotation)) };
}
