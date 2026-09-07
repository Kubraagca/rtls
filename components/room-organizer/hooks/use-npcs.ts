import { useEffect, useRef } from 'react';
import { getRtlsPersonItems } from '../lib/rtls-person-items';
import {
  cloneAndFitOfficeAvatar,
  loadOfficeAvatar,
  loadOfficeIdleAvatar,
  loadOfficeSittingAvatar,
  type OfficeAvatarAsset
} from '../three/office-avatar';
import { createRtlsScannedCrowdRenderer, type CrowdProxyAgent, type RtlsScannedCrowdRenderer } from '../three/rtls-scanned-crowd-renderer';
import type { FurnitureItem } from '../lib/types';
import type * as ThreeNS from 'three';

type ThreeModule = typeof import('three');

type RtlsAvatarMode = 'walking' | 'idle' | 'working';
type TargetKind = 'desk' | 'roam';
type RenderMode = 'full' | 'proxy' | 'hidden';

const NPC_TAG = 'npc';
const OFFICE_AVATAR_TARGET_HEIGHT = 1.78;
const MAX_FULL_AVATARS = 4;
const FULL_AVATAR_MAX_XZ_DISTANCE = 26;
const FAR_HIDE_XZ_DISTANCE = 70;
const LOD_REFRESH_SECONDS = 0.35;
const FULL_ANIMATION_STEP_SECONDS = 1 / 24;
const PROXY_REFRESH_SECONDS = 1 / 20;
const SNAPSHOT_REFRESH_SECONDS = 0.5;
const PERFORMANCE_REFRESH_SECONDS = 1;

interface RtlsStation {
  x: number;
  z: number;
  faceYaw: number;
}

export interface RtlsDeviceSnapshot {
  id: string;
  status: 'Yürüyor' | 'Masada çalışıyor' | 'Bekliyor';
  mode: RtlsAvatarMode;
  x: number;
  z: number;
  battery: number;
}

export interface RtlsPerformanceSnapshot {
  fps: number;
  total: number;
  visible: number;
  fullAvatars: number;
  proxyAvatars: number;
  hidden: number;
  drawCalls: number;
  triangles: number;
}

interface NpcState {
  group: ThreeNS.Group;
  position: { x: number; z: number };
  target: { x: number; z: number };
  targetKind: TargetKind;
  targetFaceYaw?: number;
  speed: number;
  phase: number;
  mode: RtlsAvatarMode;
  modeUntil: number;
  index: number;
  yaw: number;
  renderMode: RenderMode;
  visibleInFrustum: boolean;
  cameraDistance: number;
}

interface FullAvatarSlot {
  container: ThreeNS.Group;
  walkingModel: ThreeNS.Group;
  idleModel?: ThreeNS.Group;
  sittingModel?: ThreeNS.Group;
  walkingMixer?: ThreeNS.AnimationMixer;
  idleMixer?: ThreeNS.AnimationMixer;
  sittingMixer?: ThreeNS.AnimationMixer;
  actions: Partial<Record<RtlsAvatarMode, ThreeNS.AnimationAction>>;
  activeMode?: RtlsAvatarMode;
  assignedNpcIndex?: number;
  animationAccumulator: number;
  labelTexture: ThreeNS.CanvasTexture;
  labelCanvas: HTMLCanvasElement;
  labelSprite: ThreeNS.Sprite;
  statusRing: ThreeNS.Mesh;
  labelKey: string;
  shadowEnabled: boolean;
}

export interface UseNpcsOptions {
  enabled: boolean;
  threeModuleRef: React.MutableRefObject<ThreeModule | null>;
  sceneRef: React.MutableRefObject<ThreeNS.Scene | null>;
  cameraRef?: React.MutableRefObject<ThreeNS.PerspectiveCamera | null>;
  rendererRef?: React.MutableRefObject<ThreeNS.WebGLRenderer | null>;
  roomWidth: number;
  roomDepth: number;
  /** Office items are used to derive realistic work/desk stations. */
  items?: readonly FurnitureItem[];
  /** Y-offset to plant the avatars on the active floor. */
  floorY: number;
  /** Request a render on the next animation frame (render-on-demand). */
  invalidate?: () => void;
  /** Refresh the static shadow map while one of the few full avatars casts a shadow. */
  requestShadowUpdate?: () => void;
  /** Freeze demo movement while keeping tracked agents visible. */
  paused?: boolean;
  /** Show labels only on full-quality avatars; proxies never allocate CanvasTextures. */
  showLabels?: boolean;
  /** Disable all 3D crowd rendering while keeping the 2D RTLS simulation/snapshots alive. */
  render3D?: boolean;
  /** Selected/inspected employee is always promoted into the bounded full-GLB pool. */
  priorityDeviceId?: string | null;
  /** Throttled live snapshot used by the Twinzo-inspired device panel. */
  onSnapshot?: (devices: readonly RtlsDeviceSnapshot[]) => void;
  /** Once-per-second performance telemetry for the in-app benchmark HUD. */
  onPerformance?: (snapshot: RtlsPerformanceSnapshot) => void;
}

/**
 * Performance-oriented RTLS crowd manager.
 *
 * The critical rule is that tracked-person count is NOT equal to SkinnedMesh
 * count. At most MAX_FULL_AVATARS use the user's rigged GLB + AnimationMixer.
 * Everyone else uses GPU-instanced poses baked from that exact same scanned
 * GLB, so there are no synthetic/robot people. Off-screen/far agents are not
 * rendered at all.
 */
export function useNpcs(options: UseNpcsOptions): void {
  const {
    enabled,
    threeModuleRef,
    sceneRef,
    cameraRef,
    rendererRef,
    roomWidth,
    roomDepth,
    items = [],
    floorY,
    invalidate,
    requestShadowUpdate,
    paused = false,
    showLabels = true,
    render3D = true,
    priorityDeviceId = null,
    onSnapshot,
    onPerformance,
  } = options;

  const stateRef = useRef<NpcState[]>([]);
  const pausedRef = useRef(paused);
  const snapshotCallbackRef = useRef(onSnapshot);
  const performanceCallbackRef = useRef(onPerformance);
  const showLabelsRef = useRef(showLabels);
  const render3DRef = useRef(render3D);
  const priorityDeviceIdRef = useRef(priorityDeviceId);
  const fullSlotsRef = useRef<FullAvatarSlot[]>([]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    snapshotCallbackRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    performanceCallbackRef.current = onPerformance;
  }, [onPerformance]);

  useEffect(() => {
    showLabelsRef.current = showLabels;
    for (const slot of fullSlotsRef.current) {
      slot.labelSprite.visible = showLabels && slot.container.visible;
    }
    invalidate?.();
  }, [showLabels, invalidate]);

  useEffect(() => {
    render3DRef.current = render3D;
    if (!render3D) {
      for (const slot of fullSlotsRef.current) slot.container.visible = false;
    }
    invalidate?.();
  }, [render3D, invalidate]);

  useEffect(() => {
    priorityDeviceIdRef.current = priorityDeviceId;
  }, [priorityDeviceId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return undefined;

    const halfW = roomWidth / 2 - 0.55;
    const halfD = roomDepth / 2 - 0.55;
    if (halfW <= 0.2 || halfD <= 0.2) return undefined;

    const personItems = getRtlsPersonItems(items);
    const stations = buildRtlsStations(items, halfW, halfD);
    const npcs: NpcState[] = personItems.map((item, index) =>
      createNpc(THREE, halfW, halfD, floorY, index, stations, item)
    );
    stateRef.current = npcs;

    if (npcs.length === 0) {
      snapshotCallbackRef.current?.([]);
      performanceCallbackRef.current?.({
        fps: 0, total: 0, visible: 0, fullAvatars: 0, proxyAvatars: 0,
        hidden: 0, drawCalls: rendererRef?.current?.info.render.calls ?? 0,
        triangles: rendererRef?.current?.info.render.triangles ?? 0,
      });
      return undefined;
    }

    let disposed = false;
    let crowdRenderer: RtlsScannedCrowdRenderer | null = null;
    const fullSlots: FullAvatarSlot[] = [];
    fullSlotsRef.current = fullSlots;

    void Promise.all([
  loadOfficeAvatar(THREE),
  loadOfficeIdleAvatar(THREE),
  loadOfficeSittingAvatar(THREE)
]).then(([asset, idleAsset, sittingAsset]) => {
      if (disposed || !asset) return;
      crowdRenderer = createRtlsScannedCrowdRenderer(
  THREE,
  scene,
  asset,
  idleAsset,
  sittingAsset,
  Math.max(1, npcs.length),
  OFFICE_AVATAR_TARGET_HEIGHT
);
      crowdRenderer?.setVisible(render3DRef.current);

      const poolSize = Math.min(MAX_FULL_AVATARS, npcs.length);
      for (let index = 0; index < poolSize; index += 1) {
       const slot = createFullAvatarSlot(
  THREE,
  scene,
  asset,
  idleAsset,
  sittingAsset,
  index
);
        slot.labelSprite.visible = false;
        fullSlots.push(slot);
      }
      updateLodAssignments(THREE, npcs, fullSlots, cameraRef?.current ?? null, floorY, render3DRef.current, priorityDeviceIdRef.current);
      invalidate?.();
    });

    let rafId = 0;
    let lastTime = performance.now();
    let snapshotAccumulator = SNAPSHOT_REFRESH_SECONDS;
    let lodAccumulator = LOD_REFRESH_SECONDS;
    let proxyAccumulator = PROXY_REFRESH_SECONDS;
    let performanceAccumulator = 0;
    let frameCounter = 0;
    let lastProxyCount = 0;

    const emitSnapshot = () => {
      snapshotCallbackRef.current?.(stateRef.current.map(snapshotNpc));
    };

    const emitPerformance = (elapsedSeconds: number) => {
      const visible = npcs.filter((npc) => npc.renderMode !== 'hidden').length;
      const full = npcs.filter((npc) => npc.renderMode === 'full').length;
      const renderer = rendererRef?.current;
      performanceCallbackRef.current?.({
        fps: Math.max(0, Math.round(frameCounter / Math.max(elapsedSeconds, 0.001))),
        total: npcs.length,
        visible,
        fullAvatars: full,
        proxyAvatars: lastProxyCount,
        hidden: Math.max(0, npcs.length - visible),
        drawCalls: renderer?.info.render.calls ?? 0,
        triangles: renderer?.info.render.triangles ?? 0,
      });
      frameCounter = 0;
    };

    emitSnapshot();

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const now = performance.now();
      const delta = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;
      frameCounter += 1;
      snapshotAccumulator += delta;
      lodAccumulator += delta;
      proxyAccumulator += delta;
      performanceAccumulator += delta;

      let changed = false;
      if (!pausedRef.current) {
        changed = stepSimulation(npcs, delta, now, halfW, halfD, floorY, stations);
      }

      if (lodAccumulator >= LOD_REFRESH_SECONDS) {
        lodAccumulator = 0;
        updateLodAssignments(
          THREE,
          npcs,
          fullSlots,
          cameraRef?.current ?? null,
          floorY,
          render3DRef.current,
          priorityDeviceIdRef.current
        );
        crowdRenderer?.setVisible(render3DRef.current);
        changed = true;
      }

      // Full-quality containers still move smoothly every RAF, while expensive
      // skeleton evaluation is capped to 30 Hz below.
      updateFullAvatarSlots(THREE, npcs, fullSlots, delta, floorY, showLabelsRef.current);

      if (proxyAccumulator >= PROXY_REFRESH_SECONDS) {
        proxyAccumulator = 0;
        lastProxyCount = render3DRef.current
          ? (crowdRenderer?.update(npcs.map(toCrowdAgent), floorY) ?? 0)
          : 0;
        changed = changed || lastProxyCount > 0;
      }

      if (snapshotAccumulator >= SNAPSHOT_REFRESH_SECONDS) {
        snapshotAccumulator = 0;
        emitSnapshot();
      }

      if (performanceAccumulator >= PERFORMANCE_REFRESH_SECONDS) {
        const elapsed = performanceAccumulator;
        performanceAccumulator = 0;
        emitPerformance(elapsed);
      }

      if (!changed || !render3DRef.current) return;

      invalidate?.();
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      crowdRenderer?.dispose();
      for (const slot of fullSlots) disposeFullAvatarSlot(scene, slot);
      fullSlots.length = 0;
      fullSlotsRef.current = [];
      stateRef.current = [];
      snapshotCallbackRef.current?.([]);
      performanceCallbackRef.current?.({
        fps: 0,
        total: 0,
        visible: 0,
        fullAvatars: 0,
        proxyAvatars: 0,
        hidden: 0,
        drawCalls: 0,
        triangles: 0,
      });
      requestShadowUpdate?.();
      invalidate?.();
    };
  }, [enabled, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, cameraRef, rendererRef, roomWidth, roomDepth, items, floorY]);
}

function buildRtlsStations(items: readonly FurnitureItem[], halfW: number, halfD: number): RtlsStation[] {
  // Prefer explicitly placed office chairs. A desk-derived offset is only an
  // approximation and becomes visibly wrong as soon as the chair is moved or
  // the desk is rotated independently.
  const chairs = items.filter(
    (item) => item.position && (item.type === 'office-chair' || item.type === 'conference-chair')
  );
  if (chairs.length > 0) {
    return chairs.map((chair) => {
      const yaw = chair.rotation ?? 0;
      return {
        x: clamp(chair.position!.x, -halfW, halfW),
        z: clamp(chair.position!.z, -halfD, halfD),
        // The chair back is modelled on local -Z, so the person faces local +Z.
        faceYaw: normalizeAngle(yaw),
      };
    });
  }

  const stations: RtlsStation[] = [];
  for (const item of items) {
    if (!item.position || item.type !== 'workstation') continue;
    const yaw = item.rotation ?? 0;
    const chairOffset = item.depth / 2 + 0.64;
    const x = clamp(item.position.x + Math.sin(yaw) * chairOffset, -halfW, halfW);
    const z = clamp(item.position.z + Math.cos(yaw) * chairOffset, -halfD, halfD);
    stations.push({ x, z, faceYaw: normalizeAngle(yaw + Math.PI) });
  }
  return stations;
}

function createNpc(
  THREE: ThreeModule,
  halfW: number,
  halfD: number,
  floorY: number,
  index: number,
  stations: readonly RtlsStation[],
  sourceItem: FurnitureItem
): NpcState {
  const group = new THREE.Group();
  group.userData.type = NPC_TAG;
  group.userData.rtlsId = `EMP-${String(index + 1).padStart(3, '0')}`;
  group.userData.sourceItemId = sourceItem.id;

  // The editor placement is the RTLS person's initial position. There is no
  // synthetic 80-person demo crowd anymore: one placed person = one live one.
  const position = {
    x: clamp(sourceItem.position?.x ?? 0, -halfW, halfW),
    z: clamp(sourceItem.position?.z ?? 0, -halfD, halfD),
  };
  group.position.set(position.x, floorY, position.z);
  group.rotation.y = sourceItem.rotation ?? 0;

  const initial = pickTarget(index, stations, halfW, halfD, true);
  return {
    group,
    position,
    target: { x: initial.x, z: initial.z },
    targetKind: initial.kind,
    targetFaceYaw: initial.faceYaw,
    speed: 0.72 + (index % 7) * 0.045,
    phase: index * 0.71,
    mode: 'walking',
    modeUntil: 0,
    index,
    yaw: sourceItem.rotation ?? 0,
    renderMode: 'hidden',
    visibleInFrustum: false,
    cameraDistance: Number.POSITIVE_INFINITY,
  };
}

function snapshotNpc(npc: NpcState): RtlsDeviceSnapshot {
  const status: RtlsDeviceSnapshot['status'] =
    npc.mode === 'walking' ? 'Yürüyor' : npc.mode === 'working' ? 'Masada çalışıyor' : 'Bekliyor';
  return {
    id: String(npc.group.userData.rtlsId ?? `EMP-${String(npc.index + 1).padStart(3, '0')}`),
    status,
    mode: npc.mode,
    x: Number(npc.position.x.toFixed(2)),
    z: Number(npc.position.z.toFixed(2)),
    battery: Math.max(22, 96 - (npc.index * 7) % 61),
  };
}

function stepSimulation(
  npcs: NpcState[],
  delta: number,
  now: number,
  halfW: number,
  halfD: number,
  floorY: number,
  stations: readonly RtlsStation[]
): boolean {
  let changed = false;
  for (const npc of npcs) {
    if (npc.mode === 'walking') {
      const dx = npc.target.x - npc.position.x;
      const dz = npc.target.z - npc.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.07) {
        npc.position.x = npc.target.x;
        npc.position.z = npc.target.z;
        npc.group.position.set(npc.position.x, floorY, npc.position.z);
        if (npc.targetFaceYaw !== undefined) npc.yaw = npc.targetFaceYaw;
        if (npc.targetKind === 'desk') {
          setMode(npc, 'working', now);
          npc.modeUntil = now + 5200 + (npc.index % 8) * 420;
        } else {
          setMode(npc, 'idle', now);
          npc.modeUntil = now + 1200 + (npc.index % 7) * 180;
        }
        changed = true;
        continue;
      }

      const step = Math.min(distance, npc.speed * delta);
      npc.position.x = clamp(npc.position.x + (dx / distance) * step, -halfW, halfW);
      npc.position.z = clamp(npc.position.z + (dz / distance) * step, -halfD, halfD);
      npc.yaw = Math.atan2(dx, dz);
      npc.group.position.set(npc.position.x, floorY, npc.position.z);
      npc.group.rotation.y = npc.yaw;
      npc.phase += delta * (7.0 + npc.speed);
      changed = true;
      continue;
    }

    npc.group.position.set(npc.position.x, floorY, npc.position.z);
    npc.group.rotation.y = npc.yaw;
    if (now < npc.modeUntil) continue;

    const next = pickTarget(npc.index, stations, halfW, halfD, npc.mode === 'working');
    npc.target = { x: next.x, z: next.z };
    npc.targetKind = next.kind;
    npc.targetFaceYaw = next.faceYaw;
    setMode(npc, 'walking', now);
    changed = true;
  }
  return changed;
}

function setMode(npc: NpcState, mode: RtlsAvatarMode, now: number): void {
  if (npc.mode === mode) return;
  npc.mode = mode;
  npc.modeUntil = now;
}

function createFullAvatarSlot(
  THREE: ThreeModule,
  scene: ThreeNS.Scene,
  asset: OfficeAvatarAsset,
  idleAsset: OfficeAvatarAsset | null,
  sittingAsset: OfficeAvatarAsset | null,
  slotIndex: number
): FullAvatarSlot {
  const container = new THREE.Group();
  container.name = `rtls-full-avatar-slot-${slotIndex + 1}`;
  container.visible = false;
  container.userData.type = 'rtls-full-avatar-slot';

  const walkingInstance = cloneAndFitOfficeAvatar(THREE, asset, OFFICE_AVATAR_TARGET_HEIGHT, {
    shareResources: true,
    castShadow: false,
    receiveShadow: false,
    addBadge: false,
  });
  const walkingModel = walkingInstance.model;
  container.add(walkingModel);

  let idleModel: ThreeNS.Group | undefined;
  let idleAnimations: readonly ThreeNS.AnimationClip[] = [];
  if (idleAsset) {
    const idleInstance = cloneAndFitOfficeAvatar(THREE, idleAsset, OFFICE_AVATAR_TARGET_HEIGHT, {
      shareResources: true,
      castShadow: false,
      receiveShadow: false,
      addBadge: false,
    });
    idleModel = idleInstance.model;
    idleModel.visible = false;
    idleAnimations = idleInstance.animations;
    container.add(idleModel);
  }

  let sittingModel: ThreeNS.Group | undefined;
  let sittingAnimations: readonly ThreeNS.AnimationClip[] = [];
  if (sittingAsset) {
    const sittingInstance = cloneAndFitOfficeAvatar(THREE, sittingAsset, OFFICE_AVATAR_TARGET_HEIGHT, {
      shareResources: true,
      castShadow: false,
      receiveShadow: false,
      addBadge: false,
    });
    sittingModel = sittingInstance.model;
    sittingModel.visible = false;
    sittingAnimations = sittingInstance.animations;
    container.add(sittingModel);
  }

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x26c6da,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const statusRing = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.30, 32), ringMaterial);
  statusRing.rotation.x = -Math.PI / 2;
  statusRing.position.y = 0.012;
  statusRing.renderOrder = 5;
  container.add(statusRing);

  const label = createStatusLabel(THREE);
  container.add(label.sprite);

  let walkingMixer: ThreeNS.AnimationMixer | undefined;
  let idleMixer: ThreeNS.AnimationMixer | undefined;
  let sittingMixer: ThreeNS.AnimationMixer | undefined;
  const actions: Partial<Record<RtlsAvatarMode, ThreeNS.AnimationAction>> = {};

  if (walkingInstance.animations.length > 0) {
    walkingMixer = new THREE.AnimationMixer(walkingModel);
    const walkClip = findAvatarClip(
      walkingInstance.animations,
      ['Rig|walk', 'walk', 'walking', 'Take 001']
    );
    if (walkClip) actions.walking = walkingMixer.clipAction(walkClip);
  }

  if (idleModel && idleAnimations.length > 0) {
    idleMixer = new THREE.AnimationMixer(idleModel);
    const idleClip = findAvatarClip(
      idleAnimations,
      ['Idle', 'idle', 'Standing Idle', 'standing', 'mixamo.com', 'Take 001']
    );
    if (idleClip) {
      actions.idle = idleMixer.clipAction(idleClip);
    } else {
      console.warn('Idle avatar animation clip bulunamadı');
      actions.idle = idleMixer.clipAction(idleAnimations[0]!);
    }
  } else if (idleModel) {
    console.warn('Idle avatar animation clip bulunamadı');
  }

  if (sittingModel && sittingAnimations.length > 0) {
    sittingMixer = new THREE.AnimationMixer(sittingModel);
    const sitClip = findAvatarClip(
      sittingAnimations,
      ['Sitting Idle', 'sitting', 'sit', 'mixamo.com', 'Take 001']
    );
    if (sitClip) actions.working = sittingMixer.clipAction(sitClip);
  }

  scene.add(container);
  return {
    container,
    walkingModel,
    idleModel,
    sittingModel,
    walkingMixer,
    idleMixer,
    sittingMixer,
    actions,
    animationAccumulator: 0,
    labelTexture: label.texture,
    labelCanvas: label.canvas,
    labelSprite: label.sprite,
    statusRing,
    labelKey: '',
    shadowEnabled: false,
  };
}

function updateLodAssignments(
  THREE: ThreeModule,
  npcs: NpcState[],
  slots: FullAvatarSlot[],
  camera: ThreeNS.PerspectiveCamera | null,
  floorY: number,
  render3D: boolean,
  priorityDeviceId: string | null
): void {
  if (!render3D) {
    for (const npc of npcs) {
      npc.renderMode = 'hidden';
      npc.visibleInFrustum = false;
    }
    for (const slot of slots) releaseSlot(slot);
    return;
  }

  let frustum: ThreeNS.Frustum | null = null;
  const point = new THREE.Vector3();
  if (camera) {
    camera.updateMatrixWorld();
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum = new THREE.Frustum().setFromProjectionMatrix(projection);
  }

  for (const npc of npcs) {
    point.set(npc.position.x, floorY + 0.9, npc.position.z);
    const dx = camera ? npc.position.x - camera.position.x : 0;
    const dz = camera ? npc.position.z - camera.position.z : 0;
    npc.cameraDistance = camera ? Math.hypot(dx, dz) : 0;
    npc.visibleInFrustum = frustum ? frustum.containsPoint(point) : true;
    npc.renderMode =
      npc.visibleInFrustum && npc.cameraDistance <= FAR_HIDE_XZ_DISTANCE ? 'proxy' : 'hidden';
  }

  const priorityIndex = priorityDeviceId
    ? npcs.findIndex((npc) => String(npc.group.userData.rtlsId) === priorityDeviceId)
    : -1;

  const candidates = npcs
    .filter((npc) => npc.visibleInFrustum && npc.cameraDistance <= FULL_AVATAR_MAX_XZ_DISTANCE)
    .sort((a, b) => {
      if (a.index === priorityIndex) return -1;
      if (b.index === priorityIndex) return 1;
      return a.cameraDistance - b.cameraDistance;
    })
    .slice(0, slots.length)
    .map((npc) => npc.index);

  if (priorityIndex >= 0 && !candidates.includes(priorityIndex) && slots.length > 0) {
    candidates[candidates.length === slots.length ? slots.length - 1 : candidates.length] = priorityIndex;
  }

  const desired = new Set(candidates);
  for (const slot of slots) {
    if (slot.assignedNpcIndex !== undefined && !desired.has(slot.assignedNpcIndex)) releaseSlot(slot);
  }

  for (const index of candidates) {
    const npc = npcs[index];
    if (!npc) continue;
    npc.renderMode = 'full';
    if (slots.some((slot) => slot.assignedNpcIndex === index)) continue;
    const free = slots.find((slot) => slot.assignedNpcIndex === undefined);
    if (free) assignSlot(free, npc);
  }

  // A selected device should remain visible even when currently outside the
  // camera frustum; focusing it will immediately bring the full GLB on screen.
  if (priorityIndex >= 0 && npcs[priorityIndex]) npcs[priorityIndex].renderMode = 'full';
}

function assignSlot(slot: FullAvatarSlot, npc: NpcState): void {
  slot.assignedNpcIndex = npc.index;
  slot.container.visible = true;
  slot.activeMode = undefined;
  slot.animationAccumulator = FULL_ANIMATION_STEP_SECONDS;
  slot.labelKey = '';
  syncSlotAnimation(slot, npc.mode, true);
}

function releaseSlot(slot: FullAvatarSlot): void {
  slot.assignedNpcIndex = undefined;
  slot.container.visible = false;
  slot.labelSprite.visible = false;
  slot.walkingMixer?.stopAllAction();
  slot.idleMixer?.stopAllAction();
  slot.sittingMixer?.stopAllAction();
  slot.activeMode = undefined;
  slot.animationAccumulator = 0;
  slot.shadowEnabled = false;
}

function updateFullAvatarSlots(
  THREE: ThreeModule,
  npcs: NpcState[],
  slots: FullAvatarSlot[],
  delta: number,
  floorY: number,
  showLabels: boolean
): void {
  for (const slot of slots) {
    const index = slot.assignedNpcIndex;
    if (index === undefined) continue;
    const npc = npcs[index];
    if (!npc) continue;

    slot.container.visible = true;
    slot.container.position.set(npc.position.x, floorY, npc.position.z);
    slot.container.rotation.y = npc.yaw;
    syncSlotAnimation(slot, npc.mode);

    slot.animationAccumulator += delta;
    if (slot.animationAccumulator >= FULL_ANIMATION_STEP_SECONDS) {
      slot.walkingMixer?.update(slot.animationAccumulator);
      slot.idleMixer?.update(slot.animationAccumulator);
      slot.sittingMixer?.update(slot.animationAccumulator);
      slot.animationAccumulator = 0;
    }

    const pulse = 1 + Math.sin(performance.now() * 0.004 + npc.index) * 0.035;
    slot.statusRing.scale.setScalar(pulse);
    slot.statusRing.rotation.z += delta * (npc.mode === 'walking' ? 1.0 : 0.25);
    (slot.statusRing.material as ThreeNS.MeshBasicMaterial).opacity =
      npc.mode === 'working' ? 0.22 : npc.mode === 'idle' ? 0.27 : 0.38;

    const status = npc.mode === 'walking' ? 'Yürüyor' : npc.mode === 'working' ? 'Masada çalışıyor' : 'Bekliyor';
    const labelKey = `${npc.index}|${status}`;
    if (slot.labelKey !== labelKey) {
      redrawStatusLabel(slot.labelTexture, slot.labelCanvas, npc.index, status);
      slot.labelKey = labelKey;
    }
    slot.labelSprite.visible = showLabels;

    // Moving personnel never cast or receive shadows. This keeps the RTLS
    // animation path independent from the renderer's shadow-map pass.
    slot.shadowEnabled = false;
  }

  void THREE; // kept in the signature for future GPU timing hooks without changing the public hook.
}

function syncSlotAnimation(slot: FullAvatarSlot, mode: RtlsAvatarMode, immediate = false): void {
  const next = slot.actions[mode];
  const previous = slot.activeMode ? slot.actions[slot.activeMode] : undefined;
  const fadeSeconds = immediate ? 0 : 0.18;
  const useIdleModel = mode === 'idle' && Boolean(slot.idleModel && slot.actions.idle);
  const useSittingModel = mode === 'working' && Boolean(slot.sittingModel && slot.actions.working);

  slot.walkingModel.visible = !useIdleModel && !useSittingModel;
  if (slot.idleModel) slot.idleModel.visible = useIdleModel;
  if (slot.sittingModel) slot.sittingModel.visible = useSittingModel;

  // An idle GLB without animations must never expose the walking rig's rest
  // pose. Keep the failure visible in the console instead of silently showing
  // a T-pose.
  if (mode === 'idle' && !useIdleModel) slot.walkingModel.visible = false;

  // walking -> walking GLB, idle -> idle GLB, working -> sitting GLB.
  if (!next) {
    if (previous) {
      if (fadeSeconds > 0) previous.fadeOut(fadeSeconds);
      else previous.stop();
    }
    slot.activeMode = mode;
    return;
  }

  if (slot.activeMode === mode && next.isRunning()) return;

  if (previous && previous !== next) {
    if (fadeSeconds > 0) previous.fadeOut(fadeSeconds);
    else previous.stop();
  }

  next.enabled = true;
  next.setEffectiveTimeScale(mode === 'walking' ? 1.05 : 1);
  next.setEffectiveWeight(1);
  next.reset();
  if (fadeSeconds > 0) next.fadeIn(fadeSeconds);
  next.play();
  slot.activeMode = mode;
}

function findAvatarClip(
  animations: readonly ThreeNS.AnimationClip[],
  candidates: readonly string[]
): ThreeNS.AnimationClip | undefined {
  const exact = new Map(animations.map((clip) => [clip.name.toLowerCase(), clip]));
  for (const candidate of candidates) {
    const match = exact.get(candidate.toLowerCase());
    if (match) return match;
  }
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    const match = animations.find((clip) => clip.name.toLowerCase().includes(key));
    if (match) return match;
  }
  return undefined;
}

function toCrowdAgent(npc: NpcState): CrowdProxyAgent {
  return {
    index: npc.index,
    x: npc.position.x,
    z: npc.position.z,
    yaw: npc.yaw,
    phase: npc.phase,
    mode: npc.mode,
    visible: npc.renderMode !== 'hidden',
    fullQuality: npc.renderMode === 'full',
  };
}

function createStatusLabel(
  THREE: ThreeModule
): { sprite: ThreeNS.Sprite; texture: ThreeNS.CanvasTexture; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, 2.01, 0);
  sprite.scale.set(1.20, 0.30, 1);
  sprite.renderOrder = 50;
  sprite.visible = false;
  return { sprite, texture, canvas };
}

function redrawStatusLabel(
  texture: ThreeNS.CanvasTexture,
  canvas: HTMLCanvasElement,
  index: number,
  status: string
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8, 18, 24, 0.88)';
  roundedRect(ctx, 5, 7, 374, 82, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(83, 219, 231, 0.70)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 6, 8, 372, 80, 17);
  ctx.stroke();
  ctx.fillStyle = '#effcff';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(`Personel ${String(index + 1).padStart(2, '0')}`, 20, 39);
  ctx.fillStyle = '#79e4ed';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText(status, 20, 68);
  texture.needsUpdate = true;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function disposeFullAvatarSlot(scene: ThreeNS.Scene, slot: FullAvatarSlot): void {
  slot.walkingMixer?.stopAllAction();
  slot.idleMixer?.stopAllAction();
  slot.sittingMixer?.stopAllAction();
  scene.remove(slot.container);
  slot.labelTexture.dispose();
  (slot.labelSprite.material as ThreeNS.SpriteMaterial).dispose();
  slot.statusRing.geometry.dispose();
  (slot.statusRing.material as ThreeNS.Material).dispose();
  // GLB geometry/materials are deliberately shared with the cached source and
  // must not be disposed here. The wrapper objects themselves are GC-managed.
}

function pickTarget(
  index: number,
  stations: readonly RtlsStation[],
  halfW: number,
  halfD: number,
  preferDesk: boolean
): { x: number; z: number; kind: TargetKind; faceYaw?: number } {
  if (stations.length > 0 && (preferDesk || Math.random() < 0.48)) {
    const station = stations[(index + Math.floor(Math.random() * stations.length)) % stations.length];
    if (station) return { ...station, kind: 'desk' };
  }
  return {
    x: rand(-halfW * 0.84, halfW * 0.84),
    z: rand(-halfD * 0.82, halfD * 0.82),
    kind: 'roam',
  };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}


function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(value: number): number {
  let angle = value % (Math.PI * 2);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
