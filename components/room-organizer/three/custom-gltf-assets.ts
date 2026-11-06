'use client';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadCustomGlbAssetData } from '../lib/custom-glb-store';
import { normaliseCustomItemDimensions } from '../lib/custom-item-sizing';
import type * as ThreeNS from 'three';

export interface CustomGlbSceneInfo {
  width: number;
  depth: number;
  height: number;
  collisionWidth: number;
  collisionDepth: number;
  animationCount: number;
}

const sourceCache = new Map<string, Promise<ThreeNS.Object3D | null>>();

function makeLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

function parseGlb(data: ArrayBuffer): Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF> {
  return new Promise((resolve, reject) => {
    makeLoader().parse(data, '', resolve, reject);
  });
}

function saneDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0.5;
  return Math.max(0.02, Math.min(50, value));
}

// Custom uploads are furniture in this editor, so an asset whose longest
// edge is several metres is almost always exported with an overly large
// scene scale. Keep the proportions, but give new uploads a usable default
// size. The user can still enlarge the item later in the editor.
function normaliseLikelyUnits(width: number, depth: number, height: number): { width: number; depth: number; height: number } {
  const longest = Math.max(width, depth, height);
  let factor = 1;
  // Common exports are metres, centimetres, or millimetres. This only picks a
  // sensible initial physical size; the user can edit all three dimensions in
  // the upload dialog before placing the object.
  if (longest > 1000) factor = 0.001;
  else if (longest > 20) factor = 0.01;
  else if (longest < 0.02) factor = 1 / Math.max(longest, 0.0001);
  const dimensions = {
    width: saneDimension(width * factor),
    depth: saneDimension(depth * factor),
    height: saneDimension(height * factor),
  };
  return normaliseCustomItemDimensions(dimensions);
}

const NON_COLLIDING_MESH_TOKENS = /transparent|glass|divider|partition|panel/i;

function isCollisionMesh(node: ThreeNS.Object3D): node is ThreeNS.Mesh {
  const mesh = node as ThreeNS.Mesh;
  if (!mesh.isMesh || !mesh.geometry || mesh.visible === false) return false;
  if (NON_COLLIDING_MESH_TOKENS.test(mesh.name) || NON_COLLIDING_MESH_TOKENS.test(mesh.parent?.name ?? '')) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
  return !materials.some((material) => material.transparent || material.opacity < 0.85);
}

function collisionBounds(THREE: typeof import('three'), scene: ThreeNS.Object3D): ThreeNS.Box3 {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  scene.traverse((node) => {
    if (isCollisionMesh(node)) bounds.expandByObject(node);
  });
  return bounds;
}

export function measureCollisionFootprint(
  THREE: typeof import('three'),
  scene: ThreeNS.Object3D,
  item: { width: number; depth: number },
): { collisionWidth: number; collisionDepth: number } {
  const fullBounds = new THREE.Box3().setFromObject(scene);
  const fullSize = fullBounds.getSize(new THREE.Vector3());
  const solidBounds = collisionBounds(THREE, scene);
  if (solidBounds.isEmpty() || fullSize.x < 0.001 || fullSize.z < 0.001) {
    return { collisionWidth: item.width, collisionDepth: item.depth };
  }
  const solidSize = solidBounds.getSize(new THREE.Vector3());
  return {
    collisionWidth: Math.min(item.width, item.width * (solidSize.x / fullSize.x) + 0.01),
    collisionDepth: Math.min(item.depth, item.depth * (solidSize.z / fullSize.z) + 0.01),
  };
}

export async function inspectCustomGlbScene(
  THREE: typeof import('three'),
  data: ArrayBuffer
): Promise<CustomGlbSceneInfo> {
  const gltf = await parseGlb(data.slice(0));
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  if (bounds.isEmpty()) throw new Error('GLB içinde görüntülenebilir 3D mesh bulunamadı.');
  const size = bounds.getSize(new THREE.Vector3());
  const dims = normaliseLikelyUnits(size.x, size.z, size.y);
  const solidBounds = collisionBounds(THREE, gltf.scene);
  const solidSize = solidBounds.isEmpty() ? size : solidBounds.getSize(new THREE.Vector3());
  const info = {
    width: dims.width,
    depth: dims.depth,
    height: dims.height,
    // Keep only a 1 cm tolerance so chairs can tuck close to desks without
    // becoming stuck on floating-point/model-export noise.
    collisionWidth: Math.min(dims.width, dims.width * (solidSize.x / Math.max(size.x, 0.001)) + 0.01),
    collisionDepth: Math.min(dims.depth, dims.depth * (solidSize.z / Math.max(size.z, 0.001)) + 0.01),
    animationCount: gltf.animations.length,
  };
  // This parse is only for upload-time measurement. Release GPU-side resources
  // after reading the bounds; the real scene is parsed lazily from IndexedDB.
  gltf.scene.traverse((node) => {
    const mesh = node as ThreeNS.Mesh;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) material.dispose();
  });
  return info;
}

/** Render a transparent orthographic top view for a custom GLB catalogue tile. */
export async function renderCustomGlbTopThumbnail(
  THREE: typeof import('three'),
  data: ArrayBuffer,
): Promise<string> {
  const gltf = await parseGlb(data.slice(0));
  const model = gltf.scene;
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) throw new Error('GLB içinde görüntülenebilir 3D mesh bulunamadı.');

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  model.position.sub(center);
  model.updateMatrixWorld(true);

  const footprint = Math.max(size.x, size.z, 0.05) * 1.16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(256, 256, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(model);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9aa5, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-3, 8, 4);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(
    -footprint / 2, footprint / 2, footprint / 2, -footprint / 2, 0.01, 1000,
  );
  camera.position.set(0, size.y + 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);

  try {
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } finally {
    scene.remove(model);
    renderer.dispose();
    model.traverse((node) => {
      const mesh = node as ThreeNS.Mesh;
      mesh.geometry?.dispose?.();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) material.dispose();
    });
  }
}

export function loadStoredCustomGltfAsset(id: string): Promise<ThreeNS.Object3D | null> {
  const cached = sourceCache.get(id);
  if (cached) return cached;
  // Bundled custom models use a relative public path in the layout JSON. A
  // document-relative URL keeps them working on localhost and under the
  // GitHub Pages `/rtls/` base path, while opaque IDs still resolve from the
  // browser-local IndexedDB store used by user uploads.
  const isBundledAssetPath = id.startsWith('/') || id.startsWith('./') || id.startsWith('../') || id.includes('/');
  const assetUrl = isBundledAssetPath && typeof document !== 'undefined'
    ? new URL(id, document.baseURI).toString()
    : null;
  const promise = (assetUrl
    ? fetch(assetUrl).then((response) => response.ok ? response.arrayBuffer() : null)
    : loadCustomGlbAssetData(id))
    .then((data) => (data ? parseGlb(data) : null))
    .then((gltf) => gltf?.scene ?? null)
    .catch(() => null);
  sourceCache.set(id, promise);
  return promise;
}

export function fitStoredCustomGltfAsset(
  THREE: typeof import('three'),
  source: ThreeNS.Object3D,
  item: { width: number; depth: number; height: number }
): ThreeNS.Object3D {
  const model = cloneSkinned(source);
  // Saved layouts can pre-date the custom-item size guard. Always sanitise the
  // target dimensions here as a final line of defence; otherwise one stale
  // 10–50 metre catalog value makes the uploaded model room-sized again.
  const target = normaliseCustomItemDimensions(item);

  // SkeletonUtils.clone() copies the hierarchy but does not guarantee fresh
  // world matrices when the clone is not attached to a scene. Recompute them
  // before measuring, otherwise a stale source matrix can produce an invalid
  // scale (most noticeable with GLBs exported with a root transform).
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(
    target.width / Math.max(size.x, 0.001),
    target.height / Math.max(size.y, 0.001),
    target.depth / Math.max(size.z, 0.001)
  );
  model.scale.setScalar(Number.isFinite(scale) && scale > 0 ? scale : 1);
  model.updateMatrixWorld(true);

  const fitted = new THREE.Box3().setFromObject(model);
  const center = fitted.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= fitted.min.y;
  model.position.z -= center.z;
  model.updateMatrixWorld(true);
  model.userData.customFitDimensions = target;
  model.traverse((node) => {
    if ('castShadow' in node) node.castShadow = true;
    if ('receiveShadow' in node) node.receiveShadow = true;
    // The cached source and all clones share GLB GPU resources. See
    // disposeObject(): keep these alive until the session-level cache is gone.
    node.userData.preserveSharedAssetResource = true;
  });
  return model;
}
