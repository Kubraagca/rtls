import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareFirstPersonBody } from './first-person-body';

describe('first person body', () => {
  it('keeps the real body in the scene and visible to a downward eye camera', () => {
    const scene = new THREE.Scene();
    const avatar = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.16), new THREE.MeshStandardMaterial());
    leg.position.set(0.1, 0.5, 0.08);
    avatar.add(leg);
    scene.add(avatar);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 100);
    camera.position.set(0, 1.65, 0.08);
    camera.lookAt(0, 0, 0.08);
    const body = prepareFirstPersonBody(camera.position);
    body.attach(avatar);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    expect(avatar.parent).toBe(scene);
    expect(camera.layers.test(leg.layers)).toBe(true);
    expect(leg.visible).toBe(true);
    expect(frustum.intersectsObject(leg)).toBe(true);
    body.dispose();
  });

  it('isolates material changes from other avatars and restores them on exit', () => {
    const shared = new THREE.MeshStandardMaterial();
    const owned = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const other = new THREE.Mesh(owned.geometry, shared);
    const body = prepareFirstPersonBody(new THREE.Vector3(0, 1.65, 0));
    body.attach(owned);
    const adapted = owned.material;
    body.attach(owned);
    expect(owned.material).toBe(adapted);
    expect(owned.material).not.toBe(shared);
    expect(other.material).toBe(shared);
    body.dispose();
    expect(owned.material).toBe(shared);
  });
});
