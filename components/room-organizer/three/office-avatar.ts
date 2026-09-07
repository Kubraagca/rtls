import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type * as ThreeNS from 'three';

export const OFFICE_AVATAR_GLB_PATH = '/models/avatars/scanned-animated-walking-man/scanned_animated_walking_man.glb';
export const OFFICE_AVATAR_SITTING_GLB_PATH = '/models/avatars/scanned-animated-walking-man/scanned_man_sitting.glb';
export const OFFICE_AVATAR_IDLE_GLB_PATH = '/models/avatars/scanned-animated-walking-man/scanned_man_idle.glb';
export const OFFICE_AVATAR_OBJ_PATH = '/models/avatars/office-man-1/Office%20man%201.obj';

export interface OfficeAvatarAsset {
  scene: ThreeNS.Group;
  animations: readonly ThreeNS.AnimationClip[];
  source: 'glb' | 'obj';
}

export interface OfficeAvatarInstance {
  model: ThreeNS.Group;
  animations: readonly ThreeNS.AnimationClip[];
  source: 'glb' | 'obj';
}

export interface CloneOfficeAvatarOptions {
  /** Share geometry/material resources with the cached source asset. Best for a bounded runtime pool. */
  shareResources?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  addBadge?: boolean;
}

let officeAvatarPromise: Promise<OfficeAvatarAsset | null> | null = null;
let officeSittingAvatarPromise: Promise<OfficeAvatarAsset | null> | null = null;
let officeIdleAvatarPromise: Promise<OfficeAvatarAsset | null> | null = null;
let idleAnimationsLogged = false;
/**
 * Load the user-supplied rigged GLB first. The legacy OBJ remains only as a
 * defensive visual fallback; OBJ cannot carry the skeleton/animation clips.
 */
export function loadOfficeAvatar(THREE: typeof import('three')): Promise<OfficeAvatarAsset | null> {
  if (officeAvatarPromise) return officeAvatarPromise;

  officeAvatarPromise = new GLTFLoader()
    .loadAsync(OFFICE_AVATAR_GLB_PATH)
    .then((gltf) => {
      const scene = gltf.scene;
      prepareGlbAvatar(scene);
      scene.userData.assetSource = 'scanned_animated_walking_man.glb';
      return {
        scene,
        // RTLS owns world X/Z. Remove horizontal root-motion from the clip so
        // the scanned man walks in place while the tracker moves his container.
        animations: gltf.animations.map((clip) => makeInPlaceClip(clip)),
        source: 'glb' as const,
      };
    })
    .catch((glbError) => {
      console.warn('Animated office avatar GLB could not be loaded; trying OBJ fallback.', glbError);
      return new OBJLoader()
        .loadAsync(OFFICE_AVATAR_OBJ_PATH)
        .then((object) => {
          prepareObjFallbackMaterials(THREE, object);
          object.userData.assetSource = 'Office man 1.obj';
          return {
            scene: object,
            animations: [] as readonly ThreeNS.AnimationClip[],
            source: 'obj' as const,
          };
        })
        .catch((objError) => {
          console.warn('Office avatar OBJ fallback could not be loaded; using GPU crowd proxies only.', objError);
          return null;
        });
    });

  return officeAvatarPromise;
}


/**
 * Load the user-supplied Mixamo sitting variant. This is intentionally kept as
 * a separate GLB from the walking avatar: the two files use different rigs, so
 * runtime model switching is safer and cheaper than retargeting every person.
 */
export function loadOfficeSittingAvatar(THREE: typeof import('three')): Promise<OfficeAvatarAsset | null> {
  void THREE;
  if (officeSittingAvatarPromise) return officeSittingAvatarPromise;

  officeSittingAvatarPromise = new GLTFLoader()
    .loadAsync(OFFICE_AVATAR_SITTING_GLB_PATH)
    .then((gltf) => {
      const scene = gltf.scene;
      prepareGlbAvatar(scene);
      scene.userData.assetSource = 'scanned_man_sitting.glb';
      return {
        scene,
        // Keep the sitting motion in-place on X/Z; RTLS owns world position.
        // Vertical hip motion is preserved so the character actually sits down.
        animations: gltf.animations.map((clip) => makeInPlaceClip(clip)),
        source: 'glb' as const,
      };
    })
    .catch((error) => {
      console.warn('Sitting office avatar GLB could not be loaded; standing/idle fallback will be used.', error);
      return null;
    });

  return officeSittingAvatarPromise;
}
export function loadOfficeIdleAvatar(
  THREE: typeof import('three')
): Promise<OfficeAvatarAsset | null> {
  void THREE;

  if (officeIdleAvatarPromise) {
    return officeIdleAvatarPromise;
  }

  officeIdleAvatarPromise = new GLTFLoader()
    .loadAsync(OFFICE_AVATAR_IDLE_GLB_PATH)
    .then((gltf) => {
      if (!idleAnimationsLogged) {
        idleAnimationsLogged = true;
        console.log(
          'Idle GLB animations:',
          gltf.animations.map((clip) => clip.name)
        );
      }
      if (gltf.animations.length === 0) {
        console.warn('Idle avatar animation clip bulunamadı');
      }
      const scene = gltf.scene;

      prepareGlbAvatar(scene);

      scene.userData.assetSource = 'scanned_man_idle.glb';

      return {
        scene,
        animations: gltf.animations.map((clip) => makeInPlaceClip(clip)),
        source: 'glb' as const,
      };
    })
    .catch((error) => {
      console.warn('Idle avatar yüklenemedi.', error);
      return null;
    });

  return officeIdleAvatarPromise;
}
/**
 * SkeletonUtils.clone is required for skinned GLB avatars. Object3D.clone()
 * would leave cloned SkinnedMeshes referencing the source skeleton hierarchy.
 *
 * For the live RTLS crowd we deliberately share immutable geometry/materials
 * across a very small full-quality avatar pool. Static editor furniture keeps
 * the safer independent-resource default so generic disposal stays valid.
 */
export function cloneAndFitOfficeAvatar(
  THREE: typeof import('three'),
  asset: OfficeAvatarAsset,
  targetHeight: number,
  options: CloneOfficeAvatarOptions = {}
): OfficeAvatarInstance {
  const {
    shareResources = false,
    castShadow = true,
    receiveShadow = true,
    addBadge = true,
  } = options;

  const model = cloneSkeleton(asset.scene) as ThreeNS.Group;

  model.traverse((node) => {
    const mesh = node as ThreeNS.Mesh;
    if (!mesh.isMesh) return;
    if (!shareResources) {
      mesh.geometry = mesh.geometry.clone();
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((entry) => entry.clone())
        : mesh.material.clone();
    }
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
  });

  model.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(model);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const scale = targetHeight / Math.max(initialSize.y, 0.001);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const fittedBounds = new THREE.Box3().setFromObject(model);
  const center = fittedBounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -fittedBounds.min.y, -center.z);

  // Rigged GLBs are commonly loaded in their bind pose (T-pose) until an
  // animation action samples the skeleton. Apply one stable idle sample to
  // every clone so no render path can briefly expose the bind pose. Live mode
  // may attach its own looping mixer afterwards.
  const poseClip = asset.animations[0];
  if (poseClip) {
    const poseMixer = new THREE.AnimationMixer(model);
    const poseAction = poseMixer.clipAction(poseClip);
    poseAction.setLoop(THREE.LoopOnce, 1);
    poseAction.clampWhenFinished = true;
    poseAction.reset().play();
    poseMixer.setTime(Math.min(poseClip.duration * 0.2, 0.25));
    poseAction.paused = true;
  }

  if (addBadge) {
    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0x23bfd2,
      emissive: 0x0a6670,
      emissiveIntensity: 0.8,
      roughness: 0.28,
      metalness: 0.22,
    });
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.095, 0.022), badgeMat);
    badge.position.set(0, targetHeight * 0.713, 0.16);
    badge.castShadow = castShadow;
    badge.receiveShadow = false;
    badge.userData.instanceOwnedResource = true;
    model.add(badge);
  }

  return { model, animations: asset.animations, source: asset.source };
}


function makeInPlaceClip(clip: ThreeNS.AnimationClip): ThreeNS.AnimationClip {
  const cloned = clip.clone();
  for (const track of cloned.tracks) {
    const name = track.name.toLowerCase();
    const isRootLike = name.includes('root') || name.includes('hips') || name.includes('hip_');
    if (!name.endsWith('.position') || !isRootLike) continue;
    const values = track.values;
    if (values.length < 3) continue;
    const baseX = Number(values[0] ?? 0);
    const baseZ = Number(values[2] ?? 0);
    for (let offset = 0; offset + 2 < values.length; offset += 3) {
      values[offset] = baseX;
      // Keep Y untouched so the original walking bob remains natural.
      values[offset + 2] = baseZ;
    }
  }
  return cloned;
}

function prepareGlbAvatar(root: ThreeNS.Object3D): void {
  root.traverse((node) => {
    const mesh = node as ThreeNS.Mesh;
    if (!mesh.isMesh) return;
    // Source resources are immutable and shared by the live full-avatar pool.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
}

function prepareObjFallbackMaterials(THREE: typeof import('three'), root: ThreeNS.Object3D): void {
  root.traverse((node) => {
    const mesh = node as ThreeNS.Mesh;
    if (!mesh.isMesh) return;
    const names = Array.isArray(mesh.material)
      ? mesh.material.map((entry) => entry.name)
      : [mesh.material?.name ?? ''];
    const makeMaterial = (name: string): ThreeNS.MeshStandardMaterial => {
      const key = name.toLowerCase();
      if (key.includes('skin') || key.includes('caucasian') || key.includes('male_detailed')) {
        return new THREE.MeshStandardMaterial({ color: 0xd6a178, roughness: 0.78, metalness: 0 });
      }
      if (key.includes('short04') || key.includes('eyebrow')) {
        return new THREE.MeshStandardMaterial({ color: 0x241b17, roughness: 0.92, metalness: 0 });
      }
      if (key.includes('eye')) {
        return new THREE.MeshStandardMaterial({ color: 0x4d3425, roughness: 0.34, metalness: 0.02 });
      }
      if (key.includes('suit')) {
        return new THREE.MeshStandardMaterial({ color: 0x24313f, roughness: 0.72, metalness: 0.03 });
      }
      if (key.includes('shoe')) {
        return new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.48, metalness: 0.08 });
      }
      return new THREE.MeshStandardMaterial({ color: 0x9da7ad, roughness: 0.78, metalness: 0.02 });
    };
    mesh.material = names.length > 1 ? names.map(makeMaterial) : makeMaterial(names[0] ?? '');
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
}
