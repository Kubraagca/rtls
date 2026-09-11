import { describe, expect, it } from 'vitest';
import { snapOpeningToWall, settleWallMountedItem } from './opening-snap';

describe('opening placement on actual boundaries', () => {
  const boundaryWalls = [{ id: 'side', x1: 2, z1: -4, x2: 2, z2: 4 }];
  it('uses the visible wall instead of the old rectangular boundary', () => {
    const snap = snapOpeningToWall({ position: { x: 2.1, z: 1 }, itemWidth: 1,
      roomWidth: 18, roomDepth: 12, boundaryWalls });
    expect(snap.position).toEqual({ x: 2, z: 1 });
    expect(snap.rotation).toBeCloseTo(-Math.PI / 2);
  });
  it.each(['door', 'window'])('keeps %s aligned on release and inside the wall endpoints', (type) => {
    const settled = settleWallMountedItem({ type, width: 1, depth: 0.16, rotation: 0 },
      { x: 2.2, z: 3.9 }, 18, 12, [], boundaryWalls);
    expect(settled?.position).toEqual({ x: 2, z: 3.5 });
    expect(settled?.rotation).toBeCloseTo(-Math.PI / 2);
  });
});
