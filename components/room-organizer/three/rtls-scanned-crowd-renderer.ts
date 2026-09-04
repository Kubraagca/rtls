import { cloneAndFitOfficeAvatar, type OfficeAvatarAsset } from './office-avatar';
import type * as ThreeNS from 'three';

export type CrowdAvatarMode = 'walking' | 'idle' | 'working';

export interface CrowdProxyAgent {
  index: number;
  x: number;
  z: number;
  yaw: number;
  phase: number;
  mode: CrowdAvatarMode;
  visible: boolean;
  fullQuality: boolean;
}

export interface RtlsScannedCrowdRenderer {
  root: ThreeNS.Group;
  update(agents: readonly CrowdProxyAgent[], floorY: number): number;
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface PoseBatch {
  mesh: ThreeNS.InstancedMesh;
  cursor: number;
}

const WALK_FRAME_COUNT = 8;

/**
 * Instanced crowd renderer built from the SAME scanned GLB used by the full
 * avatars. The walking clip is sampled once into a small set of static posed
 * geometries. Runtime crowd animation then only moves InstancedMesh matrices;
 * it does not create one Skeleton/AnimationMixer per person.
 *
 * Result: no procedural/robot proxy people, while the expensive CPU skeleton
 * work remains bounded to the few nearby full-quality avatars.
 */
export function createRtlsScannedCrowdRenderer(
  THREE: typeof import('three'),
  scene: ThreeNS.Scene,
  asset: OfficeAvatarAsset,
  idleAsset: OfficeAvatarAsset | null,
  sittingAsset: OfficeAvatarAsset | null,
  capacity: number,
  targetHeight: number
): RtlsScannedCrowdRenderer | null {
  const sample = cloneAndFitOfficeAvatar(THREE, asset, targetHeight, {
    shareResources: true,
    castShadow: false,
    receiveShadow: false,
    addBadge: false,
  });

  const skinned = findFirstSkinnedMesh(sample.model);
  if (!skinned) return null;

  const walkClip = findClip(sample.animations, ['Take 001', 'Rig|walk', 'walk', 'walking']);
  const root = new THREE.Group();
  root.name = 'rtls-scanned-glb-crowd';
  root.userData.type = 'rtls-scanned-crowd';

  const material = cloneMaterial(skinned.material);
  const walkGeometries: ThreeNS.BufferGeometry[] = [];
  const mixer = walkClip ? new THREE.AnimationMixer(sample.model) : undefined;
  const action = walkClip && mixer ? mixer.clipAction(walkClip) : undefined;
  if (action) action.play();

  const frameCount = walkClip ? WALK_FRAME_COUNT : 1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (mixer && walkClip) {
      const t = (walkClip.duration * frame) / frameCount;
      mixer.setTime(t);
    }
    sample.model.updateMatrixWorld(true);
    walkGeometries.push(bakeCurrentPose(THREE, skinned));
  }
  mixer?.stopAllAction();

  // Bake one real idle pose from the separately rigged user-supplied idle GLB.
  // This avoids using the walking GLB's rest/T-pose when a far/proxy worker is idle.
  let idleGeometry: ThreeNS.BufferGeometry | null = null;
  if (idleAsset) {
    const idleSample = cloneAndFitOfficeAvatar(THREE, idleAsset, targetHeight, {
      shareResources: true,
      castShadow: false,
      receiveShadow: false,
      addBadge: false,
    });

    const idleSkinned = findFirstSkinnedMesh(idleSample.model);
    const namedIdleClip = findNamedClip(
      idleSample.animations,
      ['Idle', 'Standing Idle', 'idle', 'standing', 'mixamo.com', 'Take 001']
    );
    const idleClip = namedIdleClip ?? idleSample.animations[0];
    if (!namedIdleClip && idleSample.animations.length > 0) {
      console.warn('Idle avatar animation clip bulunamadı');
    }

    if (idleSkinned) {
      if (idleClip) {
        const idleMixer = new THREE.AnimationMixer(idleSample.model);
        const idleAction = idleMixer.clipAction(idleClip);
        idleAction.play();

        // Sample around the middle of the idle clip so we get a natural standing pose.
        idleMixer.setTime(Math.max(0, idleClip.duration * 0.5));
        idleSample.model.updateMatrixWorld(true);
        idleGeometry = bakeCurrentPose(THREE, idleSkinned);

        idleMixer.stopAllAction();
        idleMixer.uncacheRoot(idleSample.model);
      }
    }
  }

  // Bake one real sitting pose from the separately rigged user-supplied GLB.
  // This keeps far/instanced workers visually consistent without running a
  // skeleton or AnimationMixer per person.
  let sittingGeometry: ThreeNS.BufferGeometry | null = null;
  if (sittingAsset) {
    const sittingSample = cloneAndFitOfficeAvatar(THREE, sittingAsset, targetHeight, {
      shareResources: true,
      castShadow: false,
      receiveShadow: false,
      addBadge: false,
    });
    const sittingSkinned = findFirstSkinnedMesh(sittingSample.model);
    const sittingClip = findClip(
      sittingSample.animations,
      ['Sitting Idle', 'sitting', 'sit', 'mixamo.com', 'Take 001']
    );
    if (sittingSkinned) {
      if (sittingClip) {
        const sittingMixer = new THREE.AnimationMixer(sittingSample.model);
        const sittingAction = sittingMixer.clipAction(sittingClip);
        sittingAction.play();
        sittingMixer.setTime(Math.max(0, sittingClip.duration * 0.5));
        sittingSample.model.updateMatrixWorld(true);
        sittingGeometry = bakeCurrentPose(THREE, sittingSkinned);
        sittingMixer.stopAllAction();
        sittingMixer.uncacheRoot(sittingSample.model);
      } else {
        sittingSample.model.updateMatrixWorld(true);
        sittingGeometry = bakeCurrentPose(THREE, sittingSkinned);
      }
    }
  }

  const makeBatch = (geometry: ThreeNS.BufferGeometry, name: string): PoseBatch => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    mesh.name = name;
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    return { mesh, cursor: 0 };
  };

  const walkBatches = walkGeometries.map((geometry, index) =>
    makeBatch(geometry, `scanned-walk-frame-${index + 1}`)
  );
  // Use only a pose baked from the real idle GLB for stationary proxies.
  // Never substitute the walking GLB's rest pose here: that is the T-pose.
  const idleBatch = idleGeometry ? makeBatch(idleGeometry, 'scanned-idle-pose') : null;
  const workingBatch = sittingGeometry
    ? makeBatch(sittingGeometry, 'scanned-sitting-pose')
    : null;

  const dummy = new THREE.Object3D();
  scene.add(root);

  const reset = () => {
    if (idleBatch) {
      idleBatch.cursor = 0;
      idleBatch.mesh.count = 0;
    }
    if (workingBatch) {
      workingBatch.cursor = 0;
      workingBatch.mesh.count = 0;
    }
    for (const batch of walkBatches) {
      batch.cursor = 0;
      batch.mesh.count = 0;
    }
  };

  const writeInstance = (batch: PoseBatch, agent: CrowdProxyAgent, floorY: number) => {
    const slot = batch.cursor;
    if (slot >= capacity) return;
    dummy.position.set(agent.x, floorY, agent.z);
    dummy.rotation.set(0, agent.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    batch.mesh.setMatrixAt(slot, dummy.matrix);
    batch.cursor += 1;
  };

  return {
    root,
    update(agents, floorY) {
      reset();
      let visibleCount = 0;
      for (const agent of agents) {
        if (!agent.visible || agent.fullQuality) continue;
        visibleCount += 1;
        if (agent.mode === 'walking' && walkBatches.length > 1) {
          const frame = Math.abs(Math.floor(agent.phase * 1.45)) % walkBatches.length;
          writeInstance(walkBatches[frame]!, agent, floorY);
        } else if (agent.mode === 'working' && workingBatch) {
          writeInstance(workingBatch, agent, floorY);
        } else if (idleBatch) {
          writeInstance(idleBatch, agent, floorY);
        }
      }

      if (idleBatch) {
        idleBatch.mesh.count = idleBatch.cursor;
        if (idleBatch.cursor > 0) idleBatch.mesh.instanceMatrix.needsUpdate = true;
      }
      if (workingBatch) {
        workingBatch.mesh.count = workingBatch.cursor;
        if (workingBatch.cursor > 0) workingBatch.mesh.instanceMatrix.needsUpdate = true;
      }
      for (const batch of walkBatches) {
        batch.mesh.count = batch.cursor;
        if (batch.cursor > 0) batch.mesh.instanceMatrix.needsUpdate = true;
      }
      return visibleCount;
    },
    setVisible(visible) {
      root.visible = visible;
    },
    dispose() {
      scene.remove(root);
      idleBatch?.mesh.geometry.dispose();
      workingBatch?.mesh.geometry.dispose();
      for (const batch of walkBatches) batch.mesh.geometry.dispose();
      disposeMaterial(material);
      root.clear();
    },
  };
}

function bakeCurrentPose(
  THREE: typeof import('three'),
  skinned: ThreeNS.SkinnedMesh
): ThreeNS.BufferGeometry {
  const source = skinned.geometry;
  const sourcePosition = source.getAttribute('position');
  const bakedPosition = new Float32Array(sourcePosition.count * 3);
  const vertex = new THREE.Vector3();

  for (let index = 0; index < sourcePosition.count; index += 1) {
    vertex.fromBufferAttribute(sourcePosition, index);
    skinned.applyBoneTransform(index, vertex);
    skinned.localToWorld(vertex);
    const offset = index * 3;
    bakedPosition[offset] = vertex.x;
    bakedPosition[offset + 1] = vertex.y;
    bakedPosition[offset + 2] = vertex.z;
  }

  // Remove root-motion drift from the animation. RTLS controls world X/Z;
  // animation should only provide the body pose.
  const bounds = boundsFromPositions(THREE, bakedPosition);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;
  const floorOffset = bounds.min.y;
  for (let offset = 0; offset < bakedPosition.length; offset += 3) {
    bakedPosition[offset] = bakedPosition[offset]! - centerX;
    bakedPosition[offset + 1] = bakedPosition[offset + 1]! - floorOffset;
    bakedPosition[offset + 2] = bakedPosition[offset + 2]! - centerZ;
  }

  const geometry = source.clone();
  geometry.setAttribute('position', new THREE.BufferAttribute(bakedPosition, 3));
  geometry.deleteAttribute('skinIndex');
  geometry.deleteAttribute('skinWeight');
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('tangent');
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function boundsFromPositions(THREE: typeof import('three'), positions: Float32Array): ThreeNS.Box3 {
  const box = new THREE.Box3();
  box.makeEmpty();
  const point = new THREE.Vector3();
  for (let offset = 0; offset < positions.length; offset += 3) {
    point.set(positions[offset]!, positions[offset + 1]!, positions[offset + 2]!);
    box.expandByPoint(point);
  }
  return box;
}


function findFirstSkinnedMesh(root: ThreeNS.Object3D): ThreeNS.SkinnedMesh | null {
  let result: ThreeNS.SkinnedMesh | null = null;
  root.traverse((node) => {
    if (result) return;
    const candidate = node as ThreeNS.SkinnedMesh;
    if (candidate.isSkinnedMesh) result = candidate;
  });
  return result;
}

function findClip(
  animations: readonly ThreeNS.AnimationClip[],
  candidates: readonly string[]
): ThreeNS.AnimationClip | undefined {
  for (const candidate of candidates) {
    const exact = animations.find((clip) => clip.name.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    const partial = animations.find((clip) => clip.name.toLowerCase().includes(key));
    if (partial) return partial;
  }
  return animations[0];
}

function findNamedClip(
  animations: readonly ThreeNS.AnimationClip[],
  candidates: readonly string[]
): ThreeNS.AnimationClip | undefined {
  for (const candidate of candidates) {
    const exact = animations.find((clip) => clip.name.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const partial = animations.find((clip) => clip.name.toLowerCase().includes(candidate.toLowerCase()));
    if (partial) return partial;
  }
  return undefined;
}

function cloneMaterial(material: ThreeNS.Material | ThreeNS.Material[]): ThreeNS.Material | ThreeNS.Material[] {
  return Array.isArray(material) ? material.map((entry) => entry.clone()) : material.clone();
}

function disposeMaterial(material: ThreeNS.Material | ThreeNS.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
  } else {
    material.dispose();
  }
}
