import { removeAndDispose } from './builder-utils';
import { buildFloorMaterial } from './floor-patterns';
import type { FloorPattern, InteriorWall } from '../lib/types';
import type * as ThreeNS from 'three';

type ThreeModule = typeof import('three');

const FLOOR_ZONE_TAG = 'interior-floor-zone';
// Drawing snaps at roughly 0.45 m. A persisted layout can therefore have a
// new endpoint a few centimetres away from the old wall it visually touches.
// Treat those as one junction when discovering closed rooms.
const POINT_TOLERANCE = 0.18;
const MAX_LOOP_POINTS = 20;

interface PlanPoint {
  x: number;
  z: number;
}

function area(points: readonly PlanPoint[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

function distanceToSegment(point: PlanPoint, start: PlanPoint, end: PlanPoint): { distance: number; projected: PlanPoint } {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.000001) return { distance: Math.hypot(point.x - start.x, point.z - start.z), projected: start };
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const projected = { x: start.x + dx * t, z: start.z + dz * t };
  return { distance: Math.hypot(point.x - projected.x, point.z - projected.z), projected };
}

function segmentIntersection(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): PlanPoint | null {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const cdx = d.x - c.x;
  const cdz = d.z - c.z;
  const denominator = abx * cdz - abz * cdx;
  if (Math.abs(denominator) < 0.000001) return null;
  const acx = c.x - a.x;
  const acz = c.z - a.z;
  const t = (acx * cdz - acz * cdx) / denominator;
  const u = (acx * abz - acz * abx) / denominator;
  if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
  return { x: a.x + abx * t, z: a.z + abz * t };
}

/** Split every wall at endpoint-on-wall joins and crossings. This is the same
 * model used by floor planners that turn a click on an existing wall into a
 * real corner before they search for rooms. */
function splitWallsAtJunctions(walls: readonly InteriorWall[]): Array<{ a: PlanPoint; b: PlanPoint }> {
  const valid = walls
    .filter((wall) => [wall.x1, wall.z1, wall.x2, wall.z2].every(Number.isFinite))
    .map((wall) => ({ a: { x: wall.x1, z: wall.z1 }, b: { x: wall.x2, z: wall.z2 } }))
    .filter((wall) => Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z) > 0.01);

  const parts: Array<{ a: PlanPoint; b: PlanPoint }> = [];
  for (const wall of valid) {
    const candidates: PlanPoint[] = [wall.a, wall.b];
    for (const other of valid) {
      for (const endpoint of [other.a, other.b]) {
        const hit = distanceToSegment(endpoint, wall.a, wall.b);
        if (hit.distance <= POINT_TOLERANCE) candidates.push(hit.projected);
      }
      const crossing = segmentIntersection(wall.a, wall.b, other.a, other.b);
      if (crossing) candidates.push(crossing);
    }
    const dx = wall.b.x - wall.a.x;
    const dz = wall.b.z - wall.a.z;
    const lengthSquared = dx * dx + dz * dz;
    const ordered = candidates
      .map((point) => ({ point, t: ((point.x - wall.a.x) * dx + (point.z - wall.a.z) * dz) / lengthSquared }))
      .sort((left, right) => left.t - right.t)
      .filter((entry, index, list) => index === 0 || Math.hypot(entry.point.x - list[index - 1]!.point.x, entry.point.z - list[index - 1]!.point.z) > 0.005);
    for (let index = 1; index < ordered.length; index += 1) {
      const a = ordered[index - 1]!.point;
      const b = ordered[index]!.point;
      if (Math.hypot(b.x - a.x, b.z - a.z) > 0.01) parts.push({ a, b });
    }
  }
  return parts;
}

function loopKey(points: readonly string[]): string {
  const variants: string[] = [];
  for (const source of [points, [...points].reverse()]) {
    for (let i = 0; i < source.length; i += 1) {
      variants.push([...source.slice(i), ...source.slice(0, i)].join('|'));
    }
  }
  return variants.sort()[0]!;
}

/** Returns only closed wall loops; open wall chains do not create a floor. */
export function findClosedFloorLoops(walls: readonly InteriorWall[]): PlanPoint[][] {
  const points = new Map<string, PlanPoint>();
  const graph = new Map<string, Set<string>>();
  let pointNumber = 0;
  const pointKey = (point: PlanPoint): string => {
    for (const [existingKey, existingPoint] of points) {
      if (Math.hypot(existingPoint.x - point.x, existingPoint.z - point.z) <= POINT_TOLERANCE) return existingKey;
    }
    const nextKey = `p${pointNumber++}`;
    points.set(nextKey, point);
    return nextKey;
  };

  for (const wall of splitWallsAtJunctions(walls)) {
    const aKey = pointKey(wall.a);
    const bKey = pointKey(wall.b);
    if (aKey === bKey) continue;
    if (!graph.has(aKey)) graph.set(aKey, new Set());
    if (!graph.has(bKey)) graph.set(bKey, new Set());
    graph.get(aKey)!.add(bKey);
    graph.get(bKey)!.add(aKey);
  }

  const loops = new Map<string, PlanPoint[]>();
  for (const start of [...graph.keys()].sort()) {
    const path = [start];
    const visited = new Set(path);

    const visit = (current: string): void => {
      if (path.length > MAX_LOOP_POINTS) return;
      for (const next of graph.get(current) ?? []) {
        if (next < start) continue;
        if (next === start) {
          if (path.length < 3) continue;
          const polygon = path.map((pointKey) => points.get(pointKey)!);
          if (Math.abs(area(polygon)) > 0.05) loops.set(loopKey(path), polygon);
          continue;
        }
        if (visited.has(next)) continue;
        visited.add(next);
        path.push(next);
        visit(next);
        path.pop();
        visited.delete(next);
      }
    };

    visit(start);
  }

  return [...loops.values()];
}

export function clearRoomFloorZones(scene: ThreeNS.Scene): void {
  scene.children
    .filter((object) => object.userData.type === FLOOR_ZONE_TAG)
    .forEach((object) => removeAndDispose(scene, object));
}

export function renderRoomFloorZones(
  THREE: ThreeModule,
  scene: ThreeNS.Scene,
  walls: readonly InteriorWall[],
  yOffset: number,
  options: {
    floorColor: string;
    floorPattern?: FloorPattern;
    roomWidth: number;
    roomDepth: number;
    ghostOpacity?: number;
    /** The outer building footprint already has its own floor mesh. */
    skipLargestLoop?: boolean;
  }
): void {
  const loops = findClosedFloorLoops(walls);
  const largestLoopIndex = options.skipLargestLoop && loops.length > 0
    ? loops.reduce((largest, loop, index) => Math.abs(area(loop)) > Math.abs(area(loops[largest]!)) ? index : largest, 0)
    : -1;
  for (const [index, loop] of loops.entries()) {
    // The original outer footprint is already rendered by buildRoom. Rendering
    // it again would cause z-fighting; only additional enclosed regions need a
    // zone mesh.
    if (index === largestLoopIndex) continue;
    const shape = new THREE.Shape();
    loop.forEach((point, index) => {
      const y = -point.z;
      if (index === 0) shape.moveTo(point.x, y);
      else shape.lineTo(point.x, y);
    });
    shape.closePath();

    const material = buildFloorMaterial(THREE, {
      pattern: options.floorPattern ?? 'solid',
      color: options.floorColor,
      roomWidth: options.roomWidth,
      roomDepth: options.roomDepth,
    });
    material.side = THREE.DoubleSide;
    if (options.ghostOpacity !== undefined) {
      material.transparent = true;
      material.opacity = options.ghostOpacity;
    }

    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = yOffset + 0.008;
    floor.receiveShadow = true;
    floor.userData.type = FLOOR_ZONE_TAG;
    scene.add(floor);
  }
}
