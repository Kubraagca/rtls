import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitStoredCustomGltfAsset } from './custom-gltf-assets';

describe('fitStoredCustomGltfAsset', () => {
  it('fits an uploaded model inside the requested dimensions and rests it on the floor', () => {
    const source = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 4), new THREE.MeshBasicMaterial());
    mesh.position.set(4, 3, -2);
    source.add(mesh);

    const fitted = fitStoredCustomGltfAsset(THREE, source, { width: 2, depth: 1, height: 1.5 });
    const bounds = new THREE.Box3().setFromObject(fitted);
    const size = bounds.getSize(new THREE.Vector3());

    expect(size.x).toBeLessThanOrEqual(2.001);
    expect(size.z).toBeLessThanOrEqual(1.001);
    expect(size.y).toBeLessThanOrEqual(1.501);
    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0, 6);
    expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0, 6);
  });

  it('clamps stale oversized catalog dimensions before fitting', () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));

    const fitted = fitStoredCustomGltfAsset(THREE, source, { width: 50, depth: 50, height: 50 });
    const size = new THREE.Box3().setFromObject(fitted).getSize(new THREE.Vector3());

    expect(Math.max(size.x, size.y, size.z)).toBeLessThanOrEqual(3.001);
  });
});
