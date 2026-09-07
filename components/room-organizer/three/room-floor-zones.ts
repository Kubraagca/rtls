import { removeAndDispose } from './builder-utils';
import { buildFloorMaterial } from './floor-patterns';
import type { FloorPattern, InteriorWall } from '../lib/types';
import type * as ThreeNS from 'three';

type ThreeModule = typeof import('three');

const FLOOR_ZONE_TAG = 'interior-floor-zone';
const POINT_TOLERANCE = 0.025;
const MAX_LOOP_POINTS = 20;

interface PlanPoint {
  x: number;
  z: number;
}

function key(point: PlanPoint): string {
  return `${Math.round(point.x / POINT_TOLERANCE)}:${Math.round(point.z / POINT_TOLERANCE)}`;
}

function area(points: readonly PlanPoint[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
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

  for (const wall of walls) {
    if (![wall.x1, wall.z1, wall.x2, wall.z2].every(Number.isFinite)) continue;
    if (Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1) < 0.01) continue;
    const a = { x: wall.x1, z: wall.z1 };
    const b = { x: wall.x2, z: wall.z2 };
    const aKey = key(a);
    const bKey = key(b);
    if (aKey === bKey) continue;
    points.set(aKey, points.get(aKey) ?? a);
    points.set(bKey, points.get(bKey) ?? b);
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
  }
): void {
  for (const loop of findClosedFloorLoops(walls)) {
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
