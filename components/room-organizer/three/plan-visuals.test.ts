import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RTLS_STUDIO_TEMPLATE } from '../lib/rtls-studio-template';
import { furnitureBox } from './builder-utils';
import { planSpriteKey } from './plan-sprites';

describe('plan visual consistency', () => {
  it('keeps bevels inside authored furniture dimensions', () => {
    for (const [w, h, d] of [[1.6, 0.055, 0.8], [0.65, 0.11, 0.6], [0.12, 0.008, 0.08]]) {
      const geometry = furnitureBox(THREE, w!, h!, d!);
      geometry.computeBoundingBox();
      const size = geometry.boundingBox!.getSize(new THREE.Vector3());
      expect(size.x).toBeCloseTo(w!, 5);
      expect(size.y).toBeCloseTo(h!, 5);
      expect(size.z).toBeCloseTo(d!, 5);
      geometry.dispose();
    }
  });

  it('reuses the same image when moving or rotating and invalidates appearance changes', () => {
    const item = RTLS_STUDIO_TEMPLATE.floors[0]!.items[0]!;
    expect(planSpriteKey({ ...item, id: 'other', position: { x: 3, z: 2 }, rotation: 1.2, mirrored: true })).toBe(planSpriteKey(item));
    expect(planSpriteKey({ ...item, color: '#123456' })).not.toBe(planSpriteKey(item));
    expect(planSpriteKey({ ...item, width: 5 })).not.toBe(planSpriteKey(item));
    expect(planSpriteKey({ ...item, customModelId: 'different-model' })).not.toBe(planSpriteKey(item));
  });

  it('keeps the studio furniture footprints inside the floor', () => {
    const layout = RTLS_STUDIO_TEMPLATE;
    for (const item of layout.floors[0]!.items) {
      const angle = item.rotation ?? 0;
      const x = Math.abs(Math.cos(angle)) * item.width / 2 + Math.abs(Math.sin(angle)) * item.depth / 2;
      const z = Math.abs(Math.sin(angle)) * item.width / 2 + Math.abs(Math.cos(angle)) * item.depth / 2;
      expect(Math.abs(item.position!.x) + x).toBeLessThanOrEqual(layout.width / 2);
      expect(Math.abs(item.position!.z) + z).toBeLessThanOrEqual(layout.height / 2);
    }
  });
});
