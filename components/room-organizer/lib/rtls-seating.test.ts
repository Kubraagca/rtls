import { describe, expect, it } from 'vitest';
import { findRtlsSeatAnchor, getRtlsSeatAnchors, isRtlsSeat } from './rtls-seating';
import type { FurnitureItem } from './types';

function item(overrides: Partial<FurnitureItem>): FurnitureItem {
  return {
    id: 'seat',
    type: 'office-chair',
    name: 'Seat',
    width: 0.68,
    depth: 0.68,
    height: 1.1,
    color: '#000',
    icon: 'seat',
    position: { x: 0, z: 0 },
    ...overrides,
  };
}

describe('RTLS seating anchors', () => {
  it('only accepts actual seating furniture', () => {
    expect(isRtlsSeat(item({ type: 'office-chair' }))).toBe(true);
    expect(isRtlsSeat(item({ type: 'workstation', category: 'office' }))).toBe(false);
    expect(isRtlsSeat(item({ type: 'custom-glb', category: 'decor' }))).toBe(false);
    expect(isRtlsSeat(item({ type: 'custom-glb', category: 'seating' }))).toBe(true);
  });

  it('creates separate capacity anchors for a sofa', () => {
    const anchors = getRtlsSeatAnchors([item({ id: 'sofa', type: 'gltf-sofa', width: 2.2, depth: 1 })]);
    expect(anchors).toHaveLength(3);
    expect(new Set(anchors.map((anchor) => anchor.id)).size).toBe(3);
    expect(anchors[0]!.x).toBeLessThan(anchors[1]!.x);
    expect(anchors[1]!.x).toBeLessThan(anchors[2]!.x);
  });

  it('does not validate a seated pose in an empty area', () => {
    const seat = item({ position: { x: 3, z: 2 } });
    expect(findRtlsSeatAnchor({ x: 0, z: 0 }, [seat])).toBeUndefined();
    expect(findRtlsSeatAnchor({ x: 3.1, z: 2.1 }, [seat])).toBeDefined();
  });
});
