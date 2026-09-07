import { useEffect, useMemo, type RefObject, type MutableRefObject } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addFloorPlanRepaintHandler, render2DTopDown } from '../canvas-2d/render';
import { hasCollisions } from '../lib/geometry';
import { scheduleAssetLoad } from '../lib/asset-load-queue';
import { isRtlsPersonItem } from '../lib/rtls-person-items';
import { useCatalogRegistry } from '../lib/catalog-registry';
import { FLOOR_HEIGHT_METERS } from '../lib/types';
import { disposeObject, removeAndDispose } from '../three/builder-utils';
import { addVisionCones } from '../three/camera-vision';
import { fitStoredCustomGltfAsset, loadStoredCustomGltfAsset } from '../three/custom-gltf-assets';
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
import { cloneAndFitOfficeAvatar, loadOfficeIdleAvatar } from '../three/office-avatar';
import { setOutdoorVisible } from '../three/outdoor';
import { buildRoof, removeRoof } from '../three/roof';
import { ROOM_OBJECT_TAGS, applyWallDisplay, buildRoom, clearFloorPlanImageCache, removeTagged } from '../three/room-builder';
import { addSignalOverlays } from '../three/signal-overlay';
import { computeFloorOpenings, computeWallOpenings } from '../three/wall-openings';
import type { DigitalTwinLayerState } from '../lib/digital-twin-layers';
import type { FloorLayout, RoomLayout, ViewSettings } from '../lib/types';
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

function updateCeilingLightVisibility(
  THREE: typeof import('three'),
  scene: import('three').Scene,
  camera: import('three').PerspectiveCamera,
): void {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const lookingAtCeiling = direction.y > 0.12;
  scene.traverse((node) => {
    if (node.userData.ceilingLight !== true) return;
    const floorY = Number(node.userData.floorY ?? 0);
    node.visible = lookingAtCeiling && camera.position.y < floorY + 2.9;
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
    layout.width, layout.height, shellFinishesKey, wallOpeningsKey, interiorWallsKey,
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
      const minimumCameraY = activeFloorY + 0.05;
      if (camera.position.y < minimumCameraY) camera.position.y = minimumCameraY;
      applyWallDisplay(scene, camera.position.x, camera.position.z, view.wallDisplay, layout.width, layout.height);
      const THREE = threeModuleRef.current;
      if (THREE) updateCeilingLightVisibility(THREE, scene, camera);
      invalidate();
    };
    apply();
    controls.addEventListener('change', apply);
    return () => controls.removeEventListener('change', apply);
  }, [isReady, invalidate, threeModuleRef, sceneRef, rendererRef, cameraRef, controlsRef, view.wallDisplay, layout.width, layout.height, activeFloorY]);

  // Furniture meshes
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    removeTagged(scene, ROOM_OBJECT_TAGS.Furniture);

    const floorsToRender = view.showAllFloors
      ? layout.floors.map((floor, index) => ({ floor, index }))
      : [{ floor: activeFloor, index: activeFloorIndex }];

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

    for (const { floor, index } of floorsToRender) {
      const isActive = index === activeFloorIndex;
      const floorY = index * FLOOR_HEIGHT_METERS;
      const visibleItems = floor.items.filter((item) => isCatalogItemAvailable(item, catalog));

      for (const item of visibleItems) {
        if (!item.position) continue;
        // In RTLS live mode the placed person items become moving tracked
        // avatars. Do not also render their static editor copies underneath.
        if (digitalTwinLiveMode && isRtlsPersonItem(item)) continue;

        // Overlapping items keep their own materials; collision detection is
        // still calculated for editor logic but is no longer shown in red.
        const modelItem = !view.lightsEnabled && isLightItemType(item.type)
          ? { ...item, lightOn: false }
          : item;
        const group = createFurnitureModel(THREE, modelItem, false);
        group.position.set(item.position.x, floorY + (item.elevation ?? 0), item.position.z);
        group.rotation.y = item.rotation ?? 0;
        if (item.mirrored) group.scale.x = -1;
        group.userData.type = ROOM_OBJECT_TAGS.Furniture;
        group.userData.ceilingLight = item.type === 'ceiling-panel-light';
        group.userData.isLight = isLightItemType(item.type);
        group.userData.isCurtain = item.type === 'curtains';
        group.userData.floorY = floorY;
        group.userData.id = item.id;
        group.userData.floorIndex = index;
        group.userData.locked = item.locked === true || !isActive;
        // Inactive-floor groups are excluded from pointer raycasts entirely
        // (see drag-handlers' furnitureList, #122).
        group.userData.ghostFloor = !isActive;

        if (!isActive && view.showAllFloors) {
          ghostifyGroup(group);
        }

        scene.add(group);
        const camera = cameraRef.current;
        const distance = camera && item.position
          ? Math.hypot(item.position.x - camera.position.x, floorY - camera.position.y, item.position.z - camera.position.z)
          : 100;
        const visualPriority = (item.width * item.depth * item.height) / (distance + 2) + (isActive ? 1 : 0);

        if (item.customModelId) {
          const assetKey = item.customModelUrl ?? item.customModelId;
          void scheduleAssetLoad(`custom:${assetKey}`, visualPriority, () => loadStoredCustomGltfAsset(assetKey)).then((source) => {
            if (!source || disposed || !group.parent) return;
            for (const child of [...group.children]) {
              group.remove(child);
              disposeObject(child);
            }
            group.add(fitStoredCustomGltfAsset(THREE, source, modelItem));
            invalidate();
            requestShadowUpdate();
          });
        } else if (item.type === 'office-avatar') {
          void loadOfficeIdleAvatar(THREE).then((source) => {
            if (!source || disposed || !group.parent) return;
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

            const clip = avatar.animations.find((animation) => animation.name === 'mixamo.com')
              ?? avatar.animations[0];
            if (clip) {
              const mixer = new THREE.AnimationMixer(avatar.model);
              const action = mixer.clipAction(clip);
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.reset().play();
              avatarMixers.add(mixer);
              startAvatarAnimationLoop();
            } else {
              console.warn('Edit avatar idle animation clip bulunamadı');
            }
            invalidate();
            requestShadowUpdate();
          });
        } else {
          const assetPath = GLTF_ASSET_PATHS[item.type];
          if (assetPath) {
            void loadGltfAsset(assetPath, visualPriority).then((source) => {
              if (!source || disposed || !group.parent) return;
              for (const child of [...group.children]) {
                group.remove(child);
                disposeObject(child);
              }
              group.add(fitGltfAsset(THREE, source, modelItem));
              invalidate();
              requestShadowUpdate();
            });
          }
        }
      }
    }

    // The furniture set just changed — bump the revision so the drag/hover
    // raycast pre-filter cache rebuilds its list, and recompute the static
    // shadow map now that shadow casters were added/removed/moved.
    scene.userData[FURNITURE_REVISION_KEY] =
      ((scene.userData[FURNITURE_REVISION_KEY] as number | undefined) ?? 0) + 1;
    if (cameraRef.current) updateCeilingLightVisibility(THREE, scene, cameraRef.current);
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
    layout.floors, layout.width, layout.height,
    activeFloor, activeFloorIndex, view.showAllFloors, view.lightsEnabled, digitalTwinLiveMode, catalog,
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
    activeFloor, activeFloorIndex, layout.width, layout.height,
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
        .filter((item) => isLightItemType(item.type) && item.position)
        .map((item) => ({
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
  }, [isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, view.showOutdoor, layout.width, layout.height]);

  // Interior walls
  useEffect(() => {
    invalidate();
    if (!isReady) return;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;

    clearInteriorWalls(scene);
    clearRoomFloorZones(scene);
    const floorsToRender = view.showAllFloors
      ? layout.floors.map((floor, index) => ({ floor, index }))
      : [{ floor: activeFloor, index: activeFloorIndex }];

    for (const { floor, index } of floorsToRender) {
      const walls = floor.interiorWalls ?? [];
      if (walls.length === 0) continue;
      const isActive = index === activeFloorIndex;
      renderInteriorWalls(
        THREE, scene, walls,
        index * FLOOR_HEIGHT_METERS,
      view.showAllFloors && !isActive ? 0.10 : undefined,
        { openingCandidates: floor.items, roomWidth: layout.width, roomDepth: layout.height }
      );
      renderRoomFloorZones(THREE, scene, walls, index * FLOOR_HEIGHT_METERS, {
        floorColor: floor.floorColor,
        floorPattern: floor.floorPattern,
        roomWidth: layout.width,
        roomDepth: layout.height,
        ghostOpacity: view.showAllFloors && !isActive ? 0.10 : undefined,
      });
    }
    // Interior walls cast shadows — recompute the static shadow map after any
    // add/remove/re-extrude so their cast shadows don't go stale.
    requestShadowUpdate();
    // layout.floors/activeFloor are read for the wall segments and the
    // door/window opening candidates only; the two keys cover exactly that,
    // so a furniture edit doesn't re-extrude every interior wall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, interiorWallsKey, wallOpeningsKey, activeFloorIndex, view.showAllFloors, view.view2D, layout.width, layout.height]);

  // Cyan outline on selected wall. Declared AFTER the shell + interior-wall
  // rebuild effects and keyed on the same rebuild keys, so it always snapshots
  // the CURRENT wall mesh. If it ran before the rebuilds (or without those
  // keys) a hidden/moved/re-extruded wall would leave a stale floating outline.
  useEffect(() => {
    invalidate();
    if (!isReady) return undefined;
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return undefined;

    for (const child of [...scene.children]) {
      if (child.userData.type === 'wall-selection') removeAndDispose(scene, child);
    }
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
    shellFinishesKey, wallOpeningsKey, interiorWallsKey,
    layout.width, layout.height, view.showAllFloors, view.wallDisplay,
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

    buildRoof(THREE, {
      scene,
      width: layout.width,
      depth: layout.height,
      baseY: layout.floors.length * FLOOR_HEIGHT_METERS,
      spec: layout.roof,
    });
    // buildRoof adds meshes visible; only applyWallDisplay hides the roof in
    // cutaway/walls-down mode, and it otherwise runs on orbit — so a roof
    // rebuilt while the walls are open would pop in until the camera moves (#119).
    const camera = cameraRef.current;
    if (camera) {
      applyWallDisplay(scene, camera.position.x, camera.position.z, view.wallDisplay, layout.width, layout.height);
    }
    requestShadowUpdate();
  }, [isReady, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, cameraRef, layout.roof, layout.width, layout.height, layout.floors.length, activeFloorIndex, view.showAllFloors, view.wallDisplay]);

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
        selectedItemId,
        extraSelectedIds,
        showMeasurements: view.showMeasurements,
        showWiFiSignals: view.showWiFiSignals,
        showHeatmap: digitalTwinLayers?.heatmap ?? view.showHeatmap,
        showAreas: digitalTwinLayers?.areas ?? false,
        showPaths: digitalTwinLayers?.paths ?? false,
        showDigitalTwinLabels: digitalTwinLayers?.labels ?? false,
        trackedDevices: digitalTwinLayers?.devices ? digitalTwinDevices : undefined,
        hasCollision: (item) => hasCollisions(item, visibleActiveFloor.items, layout.width, layout.height),
        zoom: planZoom,
        panX: planPanX,
        panY: planPanY,
        backgroundColor: view.backgroundColor,
        backgroundImage: view.backgroundImage,
        wallPreview:
          view.drawWallMode && wallDraft && pointerWorld
            ? { start: wallDraft, end: pointerWorld }
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
  }, [invalidate, canvas2DRef, view.view2D, view.showMeasurements, view.showWiFiSignals, view.showHeatmap, view.drawWallMode, view.backgroundColor, view.backgroundImage, digitalTwinLayers, digitalTwinDevices, layout, visibleActiveFloor, selectedItemId, extraSelectedIds, planZoom, planPanX, planPanY, wallDraft, pointerWorld]);
}

export { measurementDistance } from '../three/measurement';
