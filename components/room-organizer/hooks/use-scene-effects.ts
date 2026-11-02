import { useEffect, useMemo, type RefObject, type MutableRefObject } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addFloorPlanRepaintHandler, render2DTopDown } from '../canvas-2d/render';
import { hasCollisions } from '../lib/geometry';
import { scheduleAssetLoad } from '../lib/asset-load-queue';
import { ROOM_WALL_HEIGHT_METERS } from '../lib/constants';
import { isRtlsPersonItem } from '../lib/rtls-person-items';
import { findRtlsSeatAnchor } from '../lib/rtls-seating';
import { useCatalogRegistry } from '../lib/catalog-registry';
import { FLOOR_HEIGHT_METERS } from '../lib/types';
import { disposeObject, removeAndDispose } from '../three/builder-utils';
import { addVisionCones } from '../three/camera-vision';
import { fitStoredCustomGltfAsset, loadStoredCustomGltfAsset, measureCollisionFootprint } from '../three/custom-gltf-assets';
import { FURNITURE_REVISION_KEY } from '../three/drag-handlers';
import { createFurnitureModel } from '../three/furniture-builders';
import {
  clearInteriorWalls,
  clearPreview as clearWallPreview,
  renderInteriorWalls,
  renderInteriorWallPreview,
} from '../three/interior-walls';
import { clearRoomFloorZones, renderRoomFloorZones } from '../three/room-floor-zones';
import { clearItemLabels, renderItemLabels } from '../three/item-labels';
import { applyTimeOfDay, isLightItemType } from '../three/lighting';
import { clearMeasurement, renderMeasurement } from '../three/measurement';
import {
  cloneAndFitOfficeAvatar,
  loadFemaleOfficeIdleAvatar,
  loadFemaleOfficeSittingAvatar,
  loadOfficeIdleAvatar,
  loadOfficeSittingAvatar,
} from '../three/office-avatar';
import { setOutdoorVisible } from '../three/outdoor';
import { queuePlanSprite } from '../three/plan-sprites';
import { buildRoof, removeRoof } from '../three/roof';
import { ROOM_OBJECT_TAGS, applyWallDisplay, buildRoom, clearFloorPlanImageCache, removeTagged } from '../three/room-builder';
import { addSignalOverlays } from '../three/signal-overlay';
import { computeFloorOpenings, computeWallOpenings } from '../three/wall-openings';
import type { DigitalTwinLayerState } from '../lib/digital-twin-layers';
import type { FloorLayout, FurnitureItem, InteriorWall, RoomLayout, ViewSettings } from '../lib/types';
import type { LayoutActions } from './use-layout-state';
import type * as ThreeNS from 'three';

const GLTF_ASSET_PATHS: Record<string, string> = {
  'gltf-chair': '/models/gltf-sample-assets/ChairDamaskPurplegold.glb',
  'gltf-sofa': '/models/gltf-sample-assets/GlamVelvetSofa.glb',
  'gltf-fridge': '/models/gltf-sample-assets/CommercialRefrigerator.glb',
  'gltf-plant': '/models/gltf-sample-assets/DiffuseTransmissionPlant.glb',
  'gltf-vase': '/models/gltf-sample-assets/GlassVaseFlowers.glb',
  'gltf-lamp': '/models/gltf-sample-assets/AnisotropyBarnLamp.glb',
  chair: '/models/gltf-sample-assets/ChairDamaskPurplegold.glb',
  sofa: '/models/gltf-sample-assets/GlamVelvetSofa.glb',
  fridge: '/models/gltf-sample-assets/CommercialRefrigerator.glb',
  plant: '/models/gltf-sample-assets/DiffuseTransmissionPlant.glb',
  vase: '/models/gltf-sample-assets/GlassVaseFlowers.glb',
  lamp: '/models/gltf-sample-assets/AnisotropyBarnLamp.glb',
  'floor-lamp': '/models/gltf-sample-assets/AnisotropyBarnLamp.glb',
};

function exteriorOpeningAttachment(
  item: FurnitureItem,
  layout: RoomLayout
): {
  centerX: number;
  centerZ: number;
  normalX: number;
  normalZ: number;
  planCenterX: number;
  planCenterZ: number;
} | null {
  if ((item.type !== 'door' && item.type !== 'window' && item.type !== 'security-camera') || !item.position) return null;
  const boundaries: readonly InteriorWall[] = layout.boundaryWalls ?? [
    { id: 'north', x1: -layout.width / 2, z1: -layout.height / 2, x2: layout.width / 2, z2: -layout.height / 2 },
    { id: 'east', x1: layout.width / 2, z1: -layout.height / 2, x2: layout.width / 2, z2: layout.height / 2 },
    { id: 'south', x1: layout.width / 2, z1: layout.height / 2, x2: -layout.width / 2, z2: layout.height / 2 },
    { id: 'west', x1: -layout.width / 2, z1: layout.height / 2, x2: -layout.width / 2, z2: -layout.height / 2 },
  ];
  const centre = boundaries.reduce((sum, wall) => ({ x: sum.x + wall.x1, z: sum.z + wall.z1 }), { x: 0, z: 0 });
  centre.x /= boundaries.length;
  centre.z /= boundaries.length;
  let closest: { wall: InteriorWall; distance: number; x: number; z: number } | null = null;
  for (const wall of boundaries) {
    const dx = wall.x2 - wall.x1;
    const dz = wall.z2 - wall.z1;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < 0.000001) continue;
    const t = Math.max(0, Math.min(1, ((item.position.x - wall.x1) * dx + (item.position.z - wall.z1) * dz) / lengthSquared));
    const x = wall.x1 + dx * t;
    const z = wall.z1 + dz * t;
    const distance = Math.hypot(item.position.x - x, item.position.z - z);
    if (!closest || distance < closest.distance) closest = { wall, distance, x, z };
  }
  if (!closest || closest.distance > Math.max(0.45, item.depth * 2)) return null;
  const dx = closest.wall.x2 - closest.wall.x1;
  const dz = closest.wall.z2 - closest.wall.z1;
  const length = Math.hypot(dx, dz);
  let normalX = -dz / length;
  let normalZ = dx / length;
  if ((closest.x - centre.x) * normalX + (closest.z - centre.z) * normalZ < 0) {
    normalX *= -1;
    normalZ *= -1;
  }
  // The opening must follow the room-wide cutaway decision, just like its
  // wall.  Using its own point on the segment would let a front door and the
  // rest of that front-facing wall disagree at oblique camera angles.
  return {
    centerX: closest.x,
    centerZ: closest.z,
    normalX,
    normalZ,
    planCenterX: centre.x,
    planCenterZ: centre.z,
  };
}

type PlanPoint = { x: number; z: number };

/**
 * The persisted boundary is the room that was created first. A later attached
 * room is stored as drawn walls, so it must be folded into the exterior shell
 * once those walls close a larger outline. This returns that outermost closed
 * contour rather than blindly reusing the first room's rectangle.
 */
function outerBoundaryForFloor(layout: RoomLayout): InteriorWall[] {
  // A newly drawn/open room is an annex to the original shell. Do not promote
  // its inferred floor loop to the building boundary: doing so replaces the
  // original room's walls and floor. Only an explicitly persisted boundary is
  // allowed to replace the default rectangular shell.
  return layout.boundaryWalls ?? [];
}

function pointOnWall(point: PlanPoint, wall: InteriorWall, tolerance = 0.2): boolean {
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.000001) return false;
  const t = ((point.x - wall.x1) * dx + (point.z - wall.z1) * dz) / lengthSquared;
  if (t < -0.02 || t > 1.02) return false;
  const x = wall.x1 + dx * t;
  const z = wall.z1 + dz * t;
  return Math.hypot(point.x - x, point.z - z) <= tolerance;
}

/** Retain only walls that are not already represented by the exterior shell. */
function interiorWallsForFloor(
  layout: RoomLayout,
  floor: FloorLayout,
  exterior: readonly InteriorWall[]
): InteriorWall[] {
  return [...(layout.boundaryWalls ?? []), ...(floor.interiorWalls ?? [])].filter(
    (wall) => !exterior.some((edge) => pointOnWall({ x: wall.x1, z: wall.z1 }, edge) && pointOnWall({ x: wall.x2, z: wall.z2 }, edge))
  );
}

const gltfCache = new Map<string, Promise<ThreeNS.Object3D | null>>();

function isCatalogItemAvailable(
  item: FloorLayout['items'][number],
  catalog: readonly import('../lib/types').CatalogItem[]
): boolean {
  if (item.customModelId) {
    return catalog.some((entry) => entry.customModelId === item.customModelId);
  }
  return catalog.some((entry) => entry.type === item.type && !entry.customModelId);
}

function loadGltfAsset(path: string, priority = 0): Promise<ThreeNS.Object3D | null> {
  const cached = gltfCache.get(path);
  if (cached) return cached;
  const promise = scheduleAssetLoad(`catalog:${path}`, priority, () => new GLTFLoader().loadAsync(path)
    .then((gltf) => gltf.scene))
    .catch(() => null);
  gltfCache.set(path, promise);
  return promise;
}

function fitGltfAsset(THREE: typeof import('three'), source: ThreeNS.Object3D, item: { width: number; depth: number; height: number }): ThreeNS.Object3D {
  const model = source.clone(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(
    item.width / Math.max(size.x, 0.001),
    item.height / Math.max(size.y, 0.001),
    item.depth / Math.max(size.z, 0.001)
  );
  model.scale.setScalar(scale);
  const fitted = new THREE.Box3().setFromObject(model);
  const center = fitted.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= fitted.min.y;
  model.position.z -= center.z;
  model.traverse((node) => {
    if ('castShadow' in node) node.castShadow = true;
    if ('receiveShadow' in node) node.receiveShadow = true;
  });
  return model;
}

interface MaterialLike {
  transparent: boolean;
  opacity: number;
}

interface MeshLike {
  material?: MaterialLike | readonly MaterialLike[] | null;
}

function ghostifyGroup(group: import('three').Object3D, opacity = 0.12): void {
  group.traverse((node) => {
    const material = (node as MeshLike).material;
    if (!material) return;
    const apply = (m: MaterialLike) => {
      m.transparent = true;
      m.opacity = Math.min(m.opacity, opacity);
    };
    if (Array.isArray(material)) {
      material.forEach(apply);
    } else {
      apply(material as MaterialLike);
    }
  });
}

/**
 * Identifies the parts of an item that require rebuilding its Three.js model.
 * Position-like fields are deliberately excluded: dragging, rotating, or
 * nudging an item can then update the existing group in place.
 */
function furnitureVisualKey(
  item: FurnitureItem,
  floorIndex: number,
  isActive: boolean,
  exteriorOpening: ReturnType<typeof exteriorOpeningAttachment>,
): string {
  const {
    position: _position,
    rotation: _rotation,
    elevation: _elevation,
    mirrored: _mirrored,
    locked: _locked,
    collisionWidth: _collisionWidth,
    collisionDepth: _collisionDepth,
    ...visualFields
  } = item;
  return JSON.stringify({
    visualFields,
    floorIndex,
    isActive,
    exteriorOpening,
  });
}

function isInsidePlan(layout: RoomLayout, x: number, z: number): boolean {
  const walls = layout.boundaryWalls;
  if (!walls?.length) return Math.abs(x) <= layout.width / 2 && Math.abs(z) <= layout.height / 2;
  const points = walls.map((wall) => ({ x: wall.x1, z: wall.z1 }));
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function updateCeilingLightVisibility(
  scene: import('three').Scene,
  camera: import('three').PerspectiveCamera,
  layout: RoomLayout,
): void {
  const inside = isInsidePlan(layout, camera.position.x, camera.position.z);
  const belowCeiling = camera.position.y < layout.floors.length * FLOOR_HEIGHT_METERS - 0.15;
  // Ceiling-mounted items should remain available while editing from inside
  // the room; requiring a steep upward camera angle made them disappear even
  // when the ceiling was clearly in view.
  const canSeeCeiling = inside && belowCeiling;
  scene.traverse((node) => {
    if (node.userData.ceilingMounted !== true) return;
    node.visible = canSeeCeiling;
  });
}

export interface UseSceneEffectsParams {
  isReady: boolean;
  /** Request a render on the next animation frame (render-on-demand). */
  invalidate: () => void;
  /** Recompute the static shadow map — call after a shadow caster/sun change. */
  requestShadowUpdate: () => void;
  threeModuleRef: MutableRefObject<typeof import('three') | null>;
  sceneRef: MutableRefObject<ThreeNS.Scene | null>;
  rendererRef: MutableRefObject<ThreeNS.WebGLRenderer | null>;
  cameraRef: MutableRefObject<ThreeNS.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null>;
  canvas2DRef: RefObject<HTMLCanvasElement | null>;
  layout: RoomLayout;
  actions: LayoutActions;
  activeFloor: FloorLayout;
  activeFloorIndex: number;
  view: ViewSettings;
  selectedItemId: string | null;
  extraSelectedIds: ReadonlySet<string>;
  highlightedIds: ReadonlySet<string>;
  selectedWall: { id: string; kind: 'exterior' | 'interior' } | null;
  wallDraft: { x: number; z: number } | null;
  pointerWorld: { x: number; z: number } | null;
  wallSnapResult: { point: { x: number; z: number }; kind: string } | null;
  measurementPoints: ReadonlyArray<{ x: number; z: number }>;
  digitalTwinLayers?: DigitalTwinLayerState;
  digitalTwinDevices?: readonly { id: string; x: number; z: number; status: string; battery: number }[];
  planZoom?: number;
  planPanX?: number;
  planPanY?: number;
}

export function useSceneEffects({
  isReady,
  invalidate,
  requestShadowUpdate,
  threeModuleRef,
  sceneRef,
  rendererRef,
  cameraRef,
  controlsRef,
  canvas2DRef,
  layout,
  actions,
  activeFloor,
  activeFloorIndex,
  view,
  selectedItemId,
  extraSelectedIds,
  highlightedIds,
  selectedWall,
  wallDraft,
  pointerWorld,
  wallSnapResult,
  measurementPoints,
  digitalTwinLayers,
  digitalTwinDevices,
  planZoom = 1,
  planPanX = 0,
  planPanY = 0,
}: UseSceneEffectsParams): void {
  const activeFloorY = activeFloorIndex * FLOOR_HEIGHT_METERS;
  const digitalTwinLiveMode = digitalTwinDevices !== undefined;
  const catalog = useCatalogRegistry();
  // A user-uploaded desk is stored in the browser's custom catalog, not in
  // the repository. Prefer that asset for the built-in workstations when its
  // catalog label identifies it as a desk/table.
  const customDeskCatalogItem = useMemo(
    () => catalog.find((entry) => {
      if (!entry.customModelId) return false;
      const label = `${entry.name} ${entry.type}`.toLocaleLowerCase('tr-TR');
      return /masa|desk|workstation|çalışma/.test(label);
    }),
    [catalog]
  );
  const visibleActiveFloor = useMemo<FloorLayout>(
    () => ({
      ...activeFloor,
      items: activeFloor.items.filter((item) => isCatalogItemAvailable(item, catalog)),
    }),
    [activeFloor, catalog]
  );

  // Serialized signatures of exactly the item-derived inputs the structural
  // effects consume. `layout.floors` gets a new identity on every item action,
  // so keying the effects on it rebuilt walls, floors, procedural textures,
  // and lights each time a chair moved; these keys only change when something
  // the structure actually depends on changes.
  const wallOpeningsKey = useMemo(
    () =>
      JSON.stringify(
        layout.floors.map((floor) =>
          floor.items
            .filter((item) => item.type === 'door' || item.type === 'window' || item.type === 'stairs')
            .map((item) => [
              item.type,
              item.position?.x,
              item.position?.z,
              item.width,
              item.height,
              item.depth,
              item.rotation,
            ])
        )
      ),
    [layout.floors]
  );

  const shellFinishesKey = useMemo(
    () =>
      JSON.stringify(
        layout.floors.map((floor) => [
          floor.floorColor,
          floor.floorPattern,
          floor.wallPattern,
          floor.wallColors,
          floor.hiddenWalls,
        ])
      ),
    [layout.floors]
  );

  const interiorWallsKey = useMemo(
    () => JSON.stringify(layout.floors.map((floor) => floor.interiorWalls ?? [])),
    [layout.floors]
  );

  // Furniture is independent of interior-wall geometry. Keep this signature
  // separate so editing a wall in the 2D plan does not destroy and recreate
  // every chair, desk and GLB between pointer events.
  const furnitureKey = useMemo(
    () => JSON.stringify(layout.floors.map((floor) => floor.items)),
    [layout.floors]
  );

  const boundaryWallsKey = useMemo(
    () => JSON.stringify(layout.boundaryWalls ?? []),
    [layout.boundaryWalls]
  );

  const placementFootprint = useMemo(() => {
    let maxX = layout.width / 2;
    let maxZ = layout.height / 2;
    for (const wall of [...(layout.boundaryWalls ?? []), ...layout.floors.flatMap((floor) => floor.interiorWalls ?? [])]) {
      maxX = Math.max(maxX, Math.abs(wall.x1), Math.abs(wall.x2));
      maxZ = Math.max(maxZ, Math.abs(wall.z1), Math.abs(wall.z2));
    }
    return { width: maxX * 2, depth: maxZ * 2 };
  }, [layout.width, layout.height, layout.boundaryWalls, layout.floors]);

  const lampsKey = useMemo(
    () =>
      JSON.stringify(
        layout.floors.map((floor) =>
          floor.items
            .filter((item) => isLightItemType(item.type) && item.position)
            .map((item) => [item.position!.x, item.position!.z, item.height, item.elevation ?? 0, item.lightOn !== false])
        )
      ),
    [layout.floors]
  );

  // Wall preview during draw mode
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    if (!view.drawWallMode || !wallDraft || !wallSnapResult) {
      clearWallPreview(scene);
      return;
    }
    renderInteriorWallPreview(THREE, scene, wallDraft, wallSnapResult.point, activeFloorY);
  }, [isReady, invalidate, threeModuleRef, sceneRef, view.drawWallMode, wallDraft, wallSnapResult, activeFloorY]);

  // Build floor + walls
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    removeTagged(scene, ROOM_OBJECT_TAGS.Floor, ROOM_OBJECT_TAGS.Wall);

    // The building no longer has a floor plan: release the decoded multi-MB
    // image. (Only here — see clearFloorPlanImageCache for why buildRoom must
    // not drop it per image-less call.)
    if (!layout.floorPlanImage) clearFloorPlanImageCache();

    const floorsToRender = view.showAllFloors
      ? layout.floors.map((floor, index) => ({ floor, index }))
      : [{ floor: activeFloor, index: activeFloorIndex }];

    for (const { floor, index } of floorsToRender) {
      const isActive = index === activeFloorIndex;
      const exteriorBoundary = outerBoundaryForFloor(layout);
      const wallOpenings = computeWallOpenings(
        floor.items,
        layout.width,
        layout.height,
        3,
        floor.interiorWalls ?? []
      );
      // Stairs on the floor below create openings in this floor's plane.
      const floorBelow = index > 0 ? layout.floors[index - 1] : undefined;
      const floorOpenings = computeFloorOpenings(floorBelow);
      buildRoom(THREE, {
        scene,
        width: layout.width,
        depth: layout.height,
        floorColor: floor.floorColor,
        floorPattern: floor.floorPattern,
        wallPattern: floor.wallPattern,
        wallColors: floor.wallColors,
        wallOpenings,
        hiddenWalls: floor.hiddenWalls,
        boundaryWalls: exteriorBoundary,
        floorOpenings,
        floorPlanImage: index === 0 ? layout.floorPlanImage ?? null : null,
        floorPlanOpacity: layout.floorPlanOpacity ?? 0.5,
        floorPlanFitMode: layout.floorPlanFitMode ?? 'stretch',
        floorPlan3DEffect: view.floorPlan3DEffect,
        yOffset: index * FLOOR_HEIGHT_METERS,
        ghostOpacity: view.showAllFloors && !isActive ? 0.10 : undefined,
        onTextureLoaded: invalidate,
      });
    }

    const camera = cameraRef.current;
    if (camera) {
      applyWallDisplay(scene, camera.position.x, camera.position.z, view.wallDisplay, layout.width, layout.height);
    }
    // Walls, floor and foundation are shadow casters/receivers — recompute the
    // static shadow map now that the shell geometry changed.
    requestShadowUpdate();
    // The shell reads layout.floors/activeFloor but depends on them only
    // through the finishes and openings keys — depending on their identity
    // would rebuild walls, floor meshes, and procedural textures on every
    // item edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, rendererRef, cameraRef,
    // interiorWallsKey: opening ownership is classified across exterior AND
    // interior walls (nearest wall wins), so the exterior hole set changes
    // when interior walls do — without this dep a door claimed by a new
    // interior wall stays double-cut into the exterior wall (#119).
    layout.width, layout.height, layout.boundaryWalls, shellFinishesKey, wallOpeningsKey, interiorWallsKey,
    layout.floorPlanImage, layout.floorPlanOpacity, layout.floorPlanFitMode,
    view.floorPlan3DEffect, view.showAllFloors, view.wallDisplay,
    activeFloorIndex,
  ]);

  // Cutaway on orbit
  useEffect(() => {
    invalidate();
    if (!isReady) return undefined;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return undefined;

    // Mark dirty instead of rendering here — the change listener fires every
    // interaction frame, and the RAF loop renders that same frame anyway, so a
    // direct render would draw the full scene twice per frame while orbiting.
    const apply = () => {
      // Never allow the orbit camera to pass below the active floor. This
      // prevents seeing the underside of the plan while still allowing the
      // user to orbit upward and inspect the ceiling.
      // Keep the overview camera clearly above the floor while zooming in.
      // A tiny epsilon still lets the camera look through the floor at close
      // range, especially when OrbitControls is damping toward a new pose.
      const minimumCameraY = activeFloorY + 1.75;
      if (camera.position.y < minimumCameraY) camera.position.y = minimumCameraY;
      applyWallDisplay(scene, camera.position.x, camera.position.z, view.wallDisplay, layout.width, layout.height);
      updateCeilingLightVisibility(scene, camera, layout);
      invalidate();
    };
    apply();
    controls.addEventListener('change', apply);
    return () => controls.removeEventListener('change', apply);
  }, [isReady, invalidate, threeModuleRef, sceneRef, rendererRef, cameraRef, controlsRef, view.wallDisplay, layout, activeFloorY]);

  // Furniture meshes
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    const floorsToRender = view.showAllFloors
      ? layout.floors.map((floor, index) => ({ floor, index }))
      : [{ floor: activeFloor, index: activeFloorIndex }];

    const desiredItems = floorsToRender.flatMap(({ floor, index }) => {
      const isActive = index === activeFloorIndex;
      return floor.items
        .filter((item) => isCatalogItemAvailable(item, catalog))
        .flatMap((item) => {
          // In RTLS live mode these placed people are represented by the
          // tracked-avatar layer, not by static furniture groups.
          if (!item.position || (digitalTwinLiveMode && isRtlsPersonItem(item))) return [];
          return [{ item, index, isActive, floorY: index * FLOOR_HEIGHT_METERS }];
        });
    });
    const desiredIds = new Set(desiredItems.map(({ item }) => item.id));

    // Remove only furniture that disappeared from the desired set. Existing
    // groups whose model key is unchanged stay alive and are updated below.
    for (const child of [...scene.children]) {
      if (child.userData.type !== ROOM_OBJECT_TAGS.Furniture) continue;
      if (!desiredIds.has(child.userData.id as string)) removeAndDispose(scene, child);
    }

    let disposed = false;
    const avatarMixers = new Set<ThreeNS.AnimationMixer>();
    let avatarAnimationRaf = 0;
    let avatarAnimationLastTime = performance.now();

    const updateAvatarAnimations = (now: number) => {
      if (disposed) return;
      const delta = Math.min(0.08, Math.max(0, (now - avatarAnimationLastTime) / 1000));
      avatarAnimationLastTime = now;
      for (const mixer of avatarMixers) mixer.update(delta);
      invalidate();
      avatarAnimationRaf = requestAnimationFrame(updateAvatarAnimations);
    };

    const startAvatarAnimationLoop = () => {
      if (avatarAnimationRaf !== 0) return;
      avatarAnimationLastTime = performance.now();
      avatarAnimationRaf = requestAnimationFrame(updateAvatarAnimations);
    };

    for (const { item, index, isActive, floorY } of desiredItems) {
        if (!item.position) continue;
        const floorItems = layout.floors[index]?.items ?? [];
        const exteriorOpening = exteriorOpeningAttachment(item, layout);

        // Overlapping items keep their own materials; collision detection is
        // still calculated for editor logic but is no longer shown in red.
        const deskModel = item.type === 'workstation' && customDeskCatalogItem
          ? {
              ...item,
              type: 'custom-glb',
              customModelId: customDeskCatalogItem.customModelId,
              customModelUrl: customDeskCatalogItem.customModelUrl,
              width: customDeskCatalogItem.width,
              depth: customDeskCatalogItem.depth,
              height: customDeskCatalogItem.height,
            }
          : item;
        const modelItem = !view.lightsEnabled && isLightItemType(deskModel.type)
          ? { ...deskModel, lightOn: false }
          : deskModel;

        const visualKey = furnitureVisualKey(modelItem, index, isActive, exteriorOpening);
        const existing = scene.children.find(
          (child) => child.userData.type === ROOM_OBJECT_TAGS.Furniture && child.userData.id === item.id
        );
        const isAnimatedAvatar = item.type === 'office-avatar' || item.type === 'female-office-avatar';

        // A drag/rotate/elevation edit only changes the transform. Keep the
        // existing group, its loaded GLB and its materials in that case.
        if (existing && existing.userData.furnitureVisualKey === visualKey && !isAnimatedAvatar) {
          existing.position.set(item.position.x, floorY + (item.elevation ?? 0), item.position.z);
          existing.rotation.y = item.rotation ?? 0;
          existing.scale.x = item.mirrored ? -1 : 1;
          existing.userData.floorY = floorY;
          existing.userData.floorIndex = index;
          existing.userData.locked = item.locked === true || !isActive;
          existing.userData.ghostFloor = !isActive;
          existing.userData.exteriorOpening = Boolean(exteriorOpening);
          if (exteriorOpening) {
            existing.userData.exteriorCenterX = exteriorOpening.centerX;
            existing.userData.exteriorCenterZ = exteriorOpening.centerZ;
            existing.userData.exteriorNormalX = exteriorOpening.normalX;
            existing.userData.exteriorNormalZ = exteriorOpening.normalZ;
            existing.userData.exteriorPlanCenterX = exteriorOpening.planCenterX;
            existing.userData.exteriorPlanCenterZ = exteriorOpening.planCenterZ;
          } else {
            delete existing.userData.exteriorCenterX;
            delete existing.userData.exteriorCenterZ;
            delete existing.userData.exteriorNormalX;
            delete existing.userData.exteriorNormalZ;
            delete existing.userData.exteriorPlanCenterX;
            delete existing.userData.exteriorPlanCenterZ;
          }
          continue;
        }

        if (existing) removeAndDispose(scene, existing);

        const group = createFurnitureModel(THREE, modelItem, false);
        // Some imported lamp models are visual-only GLBs and do not contain a
        // Three.js light. Add a local, real point light so clicking the model
        // changes the surrounding illumination immediately in live mode too.
        group.position.set(item.position.x, floorY + (item.elevation ?? 0), item.position.z);
        group.rotation.y = item.rotation ?? 0;
        if (item.mirrored) group.scale.x = -1;
        group.userData.type = ROOM_OBJECT_TAGS.Furniture;
        group.userData.itemType = item.type;
        group.userData.ceilingLight = item.type === 'ceiling-panel-light';
        group.userData.ceilingMounted = item.type === 'ceiling-panel-light'
          || item.type === 'pendant-light'
          || item.type === 'rtls-gateway'
          || item.type === 'rtls-beacon';
        group.userData.isLight = isLightItemType(item.type);
        group.userData.isCurtain = item.type === 'curtains';
        group.userData.floorY = floorY;
        group.userData.id = item.id;
        group.userData.floorIndex = index;
        group.userData.locked = item.locked === true || !isActive;
        if (exteriorOpening) {
          group.userData.exteriorOpening = true;
          group.userData.exteriorCenterX = exteriorOpening.centerX;
          group.userData.exteriorCenterZ = exteriorOpening.centerZ;
          group.userData.exteriorNormalX = exteriorOpening.normalX;
          group.userData.exteriorNormalZ = exteriorOpening.normalZ;
          group.userData.exteriorPlanCenterX = exteriorOpening.planCenterX;
          group.userData.exteriorPlanCenterZ = exteriorOpening.planCenterZ;
        }
        group.userData.furnitureVisualKey = visualKey;
        // Inactive-floor groups are excluded from pointer raycasts entirely
        // (see drag-handlers' furnitureList, #122).
        group.userData.ghostFloor = !isActive;

        if (!isActive && view.showAllFloors) {
          ghostifyGroup(group);
        }

        scene.add(group);
        if (isActive && rendererRef.current) queuePlanSprite(THREE, rendererRef.current, item, group);
        const camera = cameraRef.current;
        const distance = camera && item.position
          ? Math.hypot(item.position.x - camera.position.x, floorY - camera.position.y, item.position.z - camera.position.z)
          : 100;
        const visualPriority = (item.width * item.depth * item.height) / (distance + 2) + (isActive ? 1 : 0);

        if (item.customModelId) {
          const assetKey = item.customModelUrl ?? item.customModelId;
          void scheduleAssetLoad(`custom:${assetKey}`, visualPriority, () => loadStoredCustomGltfAsset(assetKey)).then((source) => {
            if (!source || !group.parent || group.userData.furnitureVisualKey !== visualKey) return;
            for (const child of [...group.children]) {
              group.remove(child);
              disposeObject(child);
            }
            group.add(fitStoredCustomGltfAsset(THREE, source, modelItem));
            if (isActive && rendererRef.current) queuePlanSprite(THREE, rendererRef.current, item, group, true);
            if (isActive) {
              const collision = measureCollisionFootprint(THREE, source, item);
              // Re-measure legacy GLB placements too: older saved layouts may
              // contain an oversized collision box from the pre-filter model.
              if (
                item.collisionWidth === undefined
                || item.collisionDepth === undefined
                || Math.abs(item.collisionWidth - collision.collisionWidth) > 0.005
                || Math.abs(item.collisionDepth - collision.collisionDepth) > 0.005
              ) {
                actions.updateItem(item.id, collision);
              }
            }
            invalidate();
            requestShadowUpdate();
          });
        } else if (item.type === 'office-avatar' || item.type === 'female-office-avatar') {
          // A persisted working pose is only valid when the avatar is actually
          // on a real seat. If the user drags it into open space, render a
          // standing idle pose instead of showing a floating seated body.
          const hasSeat = Boolean(item.position && findRtlsSeatAnchor(item.position, floorItems));
          const loadAvatar = item.avatarPose === 'working' && hasSeat
            ? (item.type === 'female-office-avatar' ? loadFemaleOfficeSittingAvatar : loadOfficeSittingAvatar)
            : (item.type === 'female-office-avatar' ? loadFemaleOfficeIdleAvatar : loadOfficeIdleAvatar);
          void loadAvatar(THREE).then((source) => {
            if (!source || !group.parent || group.userData.furnitureVisualKey !== visualKey) return;
            for (const child of [...group.children]) {
              group.remove(child);
              disposeObject(child);
            }
            const avatar = cloneAndFitOfficeAvatar(THREE, source, item.height, {
              castShadow: false,
              receiveShadow: false,
              addBadge: false,
            });
            group.add(avatar.model);
            // The initial sprite is queued before the asynchronous avatar GLB
            // loads, so refresh it now that the real model is attached. This
            // is what powers the isometric preview on 2D hover.
            if (isActive && rendererRef.current) queuePlanSprite(THREE, rendererRef.current, item, group, true);

            const clip = avatar.animations.find((animation) => animation.name === 'mixamo.com')
              ?? avatar.animations[0];
            if (digitalTwinLiveMode && clip) {
              const mixer = new THREE.AnimationMixer(avatar.model);
              const action = mixer.clipAction(clip);
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.reset().play();
              avatarMixers.add(mixer);
              startAvatarAnimationLoop();
            } else if (clip) {
              // The idle GLB is bind/T-pose until its first animation sample
              // is evaluated. Apply one stable idle sample in editor mode,
              // but do not keep a RAF/mixer loop running just to hold it.
              const mixer = new THREE.AnimationMixer(avatar.model);
              const action = mixer.clipAction(clip);
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
              action.reset().play();
              mixer.setTime(Math.min(clip.duration * 0.2, 0.25));
              action.paused = true;
            } else if (digitalTwinLiveMode) {
              console.warn('Edit avatar idle animation clip bulunamadı');
            }
            invalidate();
            requestShadowUpdate();
          });
        } else {
          const assetPath = GLTF_ASSET_PATHS[item.type];
          if (assetPath) {
            void loadGltfAsset(assetPath, visualPriority).then((source) => {
              if (!source || !group.parent || group.userData.furnitureVisualKey !== visualKey) return;
              for (const child of [...group.children]) {
                group.remove(child);
                disposeObject(child);
              }
              group.add(fitGltfAsset(THREE, source, modelItem));
            if (isActive && rendererRef.current) queuePlanSprite(THREE, rendererRef.current, item, group, true);
              if (isActive) {
                const collision = measureCollisionFootprint(THREE, source, item);
                if (
                  item.collisionWidth === undefined
                  || item.collisionDepth === undefined
                  || Math.abs((item.collisionWidth ?? 0) - collision.collisionWidth) > 0.005
                  || Math.abs((item.collisionDepth ?? 0) - collision.collisionDepth) > 0.005
                ) {
                  actions.updateItem(item.id, collision);
                }
              }
              invalidate();
              requestShadowUpdate();
            });
          }
        }
    }

    // The furniture set just changed — bump the revision so the drag/hover
    // raycast pre-filter cache rebuilds its list, and recompute the static
    // shadow map now that shadow casters were added/removed/moved.
    scene.userData[FURNITURE_REVISION_KEY] =
      ((scene.userData[FURNITURE_REVISION_KEY] as number | undefined) ?? 0) + 1;
    if (cameraRef.current) {
      applyWallDisplay(scene, cameraRef.current.position.x, cameraRef.current.position.z, view.wallDisplay, layout.width, layout.height);
      updateCeilingLightVisibility(scene, cameraRef.current, layout);
    }
    requestShadowUpdate();
    return () => {
      disposed = true;
      if (avatarAnimationRaf !== 0) cancelAnimationFrame(avatarAnimationRaf);
      for (const mixer of avatarMixers) {
        mixer.stopAllAction();
        mixer.uncacheRoot(mixer.getRoot());
      }
      avatarMixers.clear();
    };
  }, [
    isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef,
    furnitureKey, layout.width, layout.height, boundaryWallsKey, wallOpeningsKey,
    activeFloorIndex, view.showAllFloors, view.lightsEnabled, view.wallDisplay, digitalTwinLiveMode, catalog, actions, rendererRef,
  ]);

  // Selection / highlight outlines. Kept out of the furniture effect above so
  // a selection click only swaps the outline LineSegments instead of
  // destroying and rebuilding every furniture mesh on the floor.
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    for (const group of scene.children) {
      if (group.userData.type !== ROOM_OBJECT_TAGS.Furniture) continue;
      for (const child of [...group.children]) {
        if (child.userData.type === 'selection-outline') {
          group.remove(child);
          disposeObject(child);
        }
      }
    }

    const outlineIds = new Set<string>([...extraSelectedIds, ...highlightedIds]);
    if (selectedItemId) outlineIds.add(selectedItemId);
    if (outlineIds.size === 0) return;

    const itemsById = new Map(activeFloor.items.map((item) => [item.id, item]));
    for (const group of scene.children) {
      if (group.userData.type !== ROOM_OBJECT_TAGS.Furniture) continue;
      if (group.userData.floorIndex !== activeFloorIndex) continue;
      const id = group.userData.id as string;
      if (!outlineIds.has(id)) continue;
      const item = itemsById.get(id);
      if (!item) continue;

      const isSelected = selectedItemId === id || extraSelectedIds.has(id);
      const accent = isSelected
        ? selectedItemId === id
          ? 0x00ff00
          : 0x42a5f5
        : 0xfacc15;
      const geometry = new THREE.BoxGeometry(item.width, item.height, item.depth);
      const edges = new THREE.EdgesGeometry(geometry);
      geometry.dispose();
      const outline = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: accent, linewidth: 2 })
      );
      outline.position.y = item.height / 2;
      outline.userData.type = 'selection-outline';
      group.add(outline);
    }
    // view.showAllFloors is included because the furniture effect rebuilds all
    // groups when it toggles (destroying the outline LineSegments children); the
    // outline effect must re-run afterward to reattach outlines, otherwise a
    // selected item is left with no outline after a Show-All-Floors toggle.
  }, [
    isReady, invalidate, threeModuleRef, sceneRef,
    activeFloor.items, activeFloorIndex, layout.width, layout.height,
    selectedItemId, extraSelectedIds, highlightedIds, view.showAllFloors,
  ]);

  // Wi-Fi rings + camera vision cones. Independently tagged overlays, so
  // toggling them (or editing items) never touches the furniture meshes.
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    removeTagged(scene, ROOM_OBJECT_TAGS.Signal, ROOM_OBJECT_TAGS.CameraVision);
    if (!view.showWiFiSignals && !view.showCameraVision) return;

    const floorsToRender = view.showAllFloors
      ? layout.floors.map((floor, index) => ({ floor, index }))
      : [{ floor: activeFloor, index: activeFloorIndex }];

    for (const { floor, index } of floorsToRender) {
      const floorY = index * FLOOR_HEIGHT_METERS;
      if (view.showWiFiSignals) {
        addSignalOverlays(THREE, scene, floor.items, floorY);
      }
      if (view.showCameraVision) {
        addVisionCones(THREE, scene, floor.items, floorY, index);
      }
    }
  }, [
    isReady, invalidate, threeModuleRef, sceneRef,
    layout.floors, activeFloor, activeFloorIndex,
    view.showWiFiSignals, view.showCameraVision, view.showAllFloors,
  ]);

  // Lighting
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    const lampPositions = layout.floors.flatMap((floor, index) =>
      floor.items
        .filter((item) => isLightItemType(item.type) && item.type !== 'ceiling-panel-light' && item.position)
        .map((item) => ({
          id: item.id,
          x: item.position!.x,
          z: item.position!.z,
          height: (item.elevation ?? 0) + item.height + index * FLOOR_HEIGHT_METERS,
          lightOn: item.lightOn !== false,
        }))
    );

    applyTimeOfDay(THREE, scene, view.timeOfDay, lampPositions, view.lightsEnabled);
    // The sun's angle/position changed, so the (static) shadow map must be
    // recomputed or shadows would stay frozen at the previous time of day.
    requestShadowUpdate();
    // layout.floors is read for lamp positions only; lampsKey covers exactly
    // that, so a non-lamp item edit doesn't rebuild the sky and lights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, view.timeOfDay, view.lightsEnabled, lampsKey]);

  // Apply the user-selected background after the time-of-day sky effect. The
  // custom image is kept as a scene texture so the opaque WebGL canvas can
  // display it behind the building.
  useEffect(() => {
    invalidate();
    if (!isReady) return undefined;
    if (view.view2D) return undefined;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return undefined;

    const previous = scene.userData.customBackgroundTexture as ThreeNS.Texture | undefined;
    previous?.dispose();
    scene.userData.customBackgroundTexture = undefined;

    if (!view.backgroundImage) {
      scene.background = new THREE.Color(view.backgroundColor);
      invalidate();
      return undefined;
    }

    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(view.backgroundImage, (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      scene.background = texture;
      scene.userData.customBackgroundTexture = texture;
      invalidate();
    });

    return () => { cancelled = true; };
  }, [isReady, invalidate, threeModuleRef, sceneRef, view.backgroundColor, view.backgroundImage, view.timeOfDay]);

  // Outdoor
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;
    setOutdoorVisible(THREE, scene, view.showOutdoor, layout.width, layout.height);
    // Trees/shrubs are shadow casters; the shadow map is static (autoUpdate off)
    // so it must be told the caster set changed.
    requestShadowUpdate();
  }, [
    isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef,
    view.showOutdoor, view.showAllFloors, view.view2D,
    activeFloorIndex, interiorWallsKey, boundaryWallsKey, shellFinishesKey,
    wallOpeningsKey, layout.width, layout.height,
    layout.floorPlanImage, layout.floorPlanOpacity, layout.floorPlanFitMode,
  ]);

  // Interior walls
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    // The hidden 3D canvas does not need a fresh extrusion on every drag
    // sample. This effect runs again as soon as the user returns to 3D.
    if (view.view2D) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    clearInteriorWalls(scene);
    clearRoomFloorZones(scene);
    const floorsToRender = view.showAllFloors
      ? layout.floors.map((floor, index) => ({ floor, index }))
      : [{ floor: activeFloor, index: activeFloorIndex }];

    for (const { floor, index } of floorsToRender) {
      const exteriorBoundary = outerBoundaryForFloor(layout);
      const walls = interiorWallsForFloor(layout, floor, exteriorBoundary);
      const isActive = index === activeFloorIndex;
      if (walls.length > 0) {
        renderInteriorWalls(
          THREE, scene, walls,
          index * FLOOR_HEIGHT_METERS,
          view.showAllFloors && !isActive ? 0.10 : undefined,
          { openingCandidates: floor.items, roomWidth: layout.width, roomDepth: layout.height }
        );
      }
      // A room may close against an exterior boundary as well as against
      // interior walls. Treat both as one graph so a newly drawn triangle or
      // annex immediately receives its own floor mesh.
      const floorGraph = [...(layout.boundaryWalls ?? []), ...(floor.interiorWalls ?? [])];
      renderRoomFloorZones(THREE, scene, floorGraph, index * FLOOR_HEIGHT_METERS, {
        floorColor: floor.floorColor,
        floorPattern: floor.floorPattern,
        roomWidth: layout.width,
        roomDepth: layout.height,
        ghostOpacity: view.showAllFloors && !isActive ? 0.10 : undefined,
        // Keep the base room floor and render every discovered room zone on
        // top of it. The largest loop is not always the original room when an
        // annex is drawn outside the initial footprint.
        skipLargestLoop: false,
      });
    }
    // Interior walls cast shadows — recompute the static shadow map after any
    // add/remove/re-extrude so their cast shadows don't go stale.
    requestShadowUpdate();
    // layout.floors/activeFloor are read for the wall segments and the
    // door/window opening candidates only; the two keys cover exactly that,
    // so a furniture edit doesn't re-extrude every interior wall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, interiorWallsKey, wallOpeningsKey, activeFloorIndex, view.showAllFloors, view.view2D, layout.width, layout.height, layout.boundaryWalls]);

  // Cyan outline on selected wall. Declared AFTER the shell + interior-wall
  // rebuild effects and keyed on the same rebuild keys, so it always snapshots
  // the CURRENT wall mesh. If it ran before the rebuilds (or without those
  // keys) a hidden/moved/re-extruded wall would leave a stale floating outline.
  useEffect(() => {
    invalidate();
    if (!isReady) return undefined;
    if (view.view2D) return undefined;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return undefined;

    for (const child of [...scene.children]) {
      if (child.userData.type === 'wall-selection') removeAndDispose(scene, child);
    }
    // Live RTLS is a presentation view; do not carry a build-mode wall
    // selection outline into the 3D scene.
    if (digitalTwinLayers) return undefined;
    if (!selectedWall) return undefined;

    const tag = selectedWall.kind === 'interior' ? 'interior-wall' : 'wall';
    const wallMesh = scene.children.find(
      (obj) => obj.userData.type === tag && obj.userData.wallId === selectedWall.id
    ) as ThreeNS.Mesh | undefined;
    if (!wallMesh) return undefined;

    const edges = new THREE.EdgesGeometry(wallMesh.geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0x7ff3ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const outline = new THREE.LineSegments(edges, material);
    outline.position.copy(wallMesh.position);
    outline.rotation.copy(wallMesh.rotation);
    outline.scale.copy(wallMesh.scale);
    outline.renderOrder = 999;
    outline.userData.type = 'wall-selection';
    scene.add(outline);
    invalidate();

    return () => {
      scene.remove(outline);
      edges.dispose();
      material.dispose();
    };
    // Keyed on the shell + interior-wall rebuild keys (not layout.floors
    // identity) so the outline re-snapshots the fresh mesh after any wall
    // rebuild, hide, or move — without rebuilding on unrelated furniture edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady, invalidate, threeModuleRef, sceneRef, rendererRef, cameraRef,
    selectedWall, activeFloorIndex,
    digitalTwinLayers,
    shellFinishesKey, wallOpeningsKey, interiorWallsKey,
    layout.width, layout.height, view.showAllFloors, view.wallDisplay, view.view2D,
  ]);

  // Measurement markers
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;
    if (!view.measurementMode || measurementPoints.length === 0) {
      clearMeasurement(scene);
      return;
    }
    renderMeasurement(THREE, scene, measurementPoints, activeFloorY);
  }, [isReady, invalidate, threeModuleRef, sceneRef, view.measurementMode, measurementPoints, activeFloorY]);

  // Item labels
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;
    if (!view.showItemLabels) {
      clearItemLabels(scene);
      return;
    }
    renderItemLabels(THREE, scene, visibleActiveFloor.items, activeFloorY);
  }, [isReady, invalidate, threeModuleRef, sceneRef, view.showItemLabels, visibleActiveFloor.items, activeFloorY]);

  // Roof
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    const topFloorIndex = layout.floors.length - 1;
    const showRoof =
      layout.roof &&
      layout.roof.style !== 'none' &&
      (view.showAllFloors || activeFloorIndex === topFloorIndex);

    if (!showRoof || !layout.roof) {
      removeRoof(scene);
      // The roof is a shadow caster; the static shadow map must be refreshed
      // whether the roof was just built or removed.
      requestShadowUpdate();
      return;
    }

    const exteriorBoundary = outerBoundaryForFloor(layout);
    buildRoof(THREE, {
      scene,
      width: layout.width,
      depth: layout.height,
      baseY: (layout.floors.length - 1) * FLOOR_HEIGHT_METERS + ROOM_WALL_HEIGHT_METERS,
      spec: layout.roof,
      boundaryWalls: exteriorBoundary,
      interiorWalls: activeFloor.interiorWalls,
    });
    // buildRoof adds meshes visible; only applyWallDisplay hides the roof in
    // cutaway/walls-down mode, and it otherwise runs on orbit — so a roof
    // rebuilt while the walls are open would pop in until the camera moves (#119).
    const camera = cameraRef.current;
    if (camera) {
      applyWallDisplay(scene, camera.position.x, camera.position.z, view.wallDisplay, layout.width, layout.height);
    }
    requestShadowUpdate();
  }, [isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, cameraRef, layout.roof, layout.width, layout.height, layout.boundaryWalls, activeFloor.interiorWalls, layout.floors.length, activeFloorIndex, view.showAllFloors, view.wallDisplay]);

  // 2D top-down view. The backing store is sized to the container's
  // clientWidth/clientHeight × devicePixelRatio (via a ResizeObserver) so the
  // aspect ratio matches the on-screen element (circles stay circular) and the
  // render is crisp on retina; a resize re-paints. The floor-plan repaint
  // handler lets an async image decode trigger a full repaint in the correct
  // layer order.
  useEffect(() => {
    invalidate();
    if (!view.view2D) return undefined;
    const canvas = canvas2DRef.current;
    if (!canvas) return undefined;

    const paint = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const backingWidth = Math.round(width * dpr);
      const backingHeight = Math.round(height * dpr);
      // Only resize the backing store when it actually changes — assigning
      // canvas.width/height clears the canvas even when the value is unchanged.
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;

      render2DTopDown({
        canvas,
        layout,
        floor: visibleActiveFloor,
        // The drawing tool is an isolated blank interaction surface. Keep the
        // furniture/wall geometry visible underneath, but never paint an old
        // selection while a new wall is being drawn.
        selectedItemId: view.drawWallMode ? null : selectedItemId,
        selectedWallId: view.drawWallMode ? null : selectedWall?.id ?? null,
        extraSelectedIds: view.drawWallMode ? new Set<string>() : extraSelectedIds,
        showMeasurements: view.showMeasurements,
        showWiFiSignals: view.showWiFiSignals,
        showHeatmap: digitalTwinLayers?.heatmap ?? view.showHeatmap,
        showAreas: digitalTwinLayers?.areas ?? false,
        showPaths: digitalTwinLayers?.paths ?? false,
        showDigitalTwinLabels: digitalTwinLayers?.labels ?? false,
        trackedDevices: digitalTwinLayers?.devices ? digitalTwinDevices : undefined,
        hasCollision: (item) => hasCollisions(item, visibleActiveFloor.items, placementFootprint.width, placementFootprint.depth, visibleActiveFloor.interiorWalls ?? []),
        zoom: planZoom,
        panX: planPanX,
        panY: planPanY,
        backgroundColor: view.backgroundColor,
        backgroundImage: view.backgroundImage,
        wallPreview:
          view.drawWallMode && wallDraft && pointerWorld
            ? { start: wallDraft, end: wallSnapResult?.point ?? pointerWorld }
            : null,
      });
    };

    const removeRepaintHandler = addFloorPlanRepaintHandler(paint);
    window.addEventListener('catalog-thumbnails-ready', paint);
    paint();

    const observer = new ResizeObserver(paint);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      window.removeEventListener('catalog-thumbnails-ready', paint);
      removeRepaintHandler();
    };
  }, [invalidate, canvas2DRef, view.view2D, view.showMeasurements, view.showWiFiSignals, view.showHeatmap, view.drawWallMode, view.backgroundColor, view.backgroundImage, digitalTwinLayers, digitalTwinDevices, layout, visibleActiveFloor, visibleActiveFloor.floorColor, visibleActiveFloor.floorPattern, selectedItemId, selectedWall, extraSelectedIds, placementFootprint, planZoom, planPanX, planPanY, wallDraft, pointerWorld, wallSnapResult]);
}

export { measurementDistance } from '../three/measurement';
