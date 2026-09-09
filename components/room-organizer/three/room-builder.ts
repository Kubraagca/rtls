import { removeAndDispose } from './builder-utils';
import { buildFloorMaterial } from './floor-patterns';
import { mergeHoleRects, openingsForWall, type FloorOpening, type WallOpening } from './wall-openings';
import { buildWallMaterial } from './wall-patterns';
import type { FloorPattern, FloorPlanFitMode, InteriorWall, WallId, WallPattern } from '../lib/types';
import type * as ThreeNS from 'three';

type ThreeModule = typeof import('three');

/**
 * Freeze an object's transform: the room shell (walls, floor, baseboards,
 * foundation, grid) never moves after it's built — a change rebuilds the whole
 * shell, and applyWallDisplay only toggles `.visible`. Disabling matrixAutoUpdate
 * (after a single updateMatrix()) skips the per-frame matrix recompute for every
 * one of these meshes.
 */
function makeStatic(object: ThreeNS.Object3D): void {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

export const ROOM_OBJECT_TAGS = {
  Floor: 'floor',
  Wall: 'wall',
  Furniture: 'furniture',
  Signal: 'wifi-signal',
  CameraVision: 'camera-vision',
} as const;

export type RoomObjectTag = (typeof ROOM_OBJECT_TAGS)[keyof typeof ROOM_OBJECT_TAGS];

export type WallDisplay = 'up' | 'cutaway' | 'down';

/**
 * build-mode-style wall cutaway. Reads the active wall-display mode + the camera
 * position and toggles each tagged wall (and the roof) `.visible` so the
 * user sees the interior from any angle without ghostly translucency.
 *
 * Call this once after rebuilding walls, and again on every orbit-controls
 * change — visibility is cheap to flip, no geometry rebuild required.
 */
export function applyWallDisplay(
  scene: ThreeNS.Scene,
  cameraX: number,
  cameraZ: number,
  mode: WallDisplay,
  roomWidth: number,
  roomDepth: number
): void {
  const halfW = roomWidth / 2;
  const halfD = roomDepth / 2;

  for (const obj of scene.children) {
    const tag = obj.userData.type as string | undefined;
    if (tag === 'roof') {
      // Roof only shows in "up" mode — cutaway and down both want the
      // interior visible from above.
      obj.visible = mode === 'up';
      continue;
    }
    if (tag === 'interior-wall') {
      obj.visible = mode !== 'down';
      continue;
    }
    if (tag === ROOM_OBJECT_TAGS.Furniture && obj.userData.exteriorOpening === true) {
      if (mode === 'down') {
        obj.visible = false;
      } else if (mode === 'up') {
        obj.visible = true;
      } else {
        const nx = obj.userData.exteriorNormalX as number | undefined;
        const nz = obj.userData.exteriorNormalZ as number | undefined;
        const planX = obj.userData.exteriorPlanCenterX as number | undefined;
        const planZ = obj.userData.exteriorPlanCenterZ as number | undefined;
        obj.visible = [nx, nz, planX, planZ].every(Number.isFinite)
          ? (cameraX - planX!) * nx! + (cameraZ - planZ!) * nz! < 0
          : true;
      }
      continue;
    }
    if (tag !== ROOM_OBJECT_TAGS.Wall) continue;

    // Freeform boundary segments don't always have one of the four legacy
    // north/east/south/west ids. They are still exterior walls, however, and
    // must disappear alongside every other wall in walls-down mode.
    if (mode === 'down' && obj.userData.exteriorWall === true) {
      obj.visible = false;
      continue;
    }
    // Cutaway is based on the camera's direction relative to the ROOM, not
    // the distance to each individual segment. Therefore all wall pieces
    // facing the same direction open/close together.
    if (mode === 'cutaway' && obj.userData.exteriorWall === true) {
      const nx = obj.userData.exteriorNormalX as number | undefined;
      const nz = obj.userData.exteriorNormalZ as number | undefined;
      const planX = obj.userData.exteriorPlanCenterX as number | undefined;
      const planZ = obj.userData.exteriorPlanCenterZ as number | undefined;
      if ([nx, nz, planX, planZ].every(Number.isFinite)) {
        obj.visible = (cameraX - planX!) * nx! + (cameraZ - planZ!) * nz! < 0;
        continue;
      }
    }

    // Id-less Wall-tagged helpers (the snap grid) stay visible in EVERY mode
    // — checking this after the mode branches made walls-down hide the floor
    // grid, which Sims-style walls-down is supposed to keep (#122).
    const wallId = obj.userData.wallId as WallId | undefined;
    if (!wallId) {
      // Freeform boundary walls have generated ids rather than legacy compass
      // ids. Their stored outward normal lets cutaway hide the wall facing the
      // camera exactly like north/east/south/west walls.
      if (mode === 'cutaway' && obj.userData.exteriorWall === true) {
        const nx = obj.userData.exteriorNormalX as number | undefined;
        const nz = obj.userData.exteriorNormalZ as number | undefined;
        const planX = obj.userData.exteriorPlanCenterX as number | undefined;
        const planZ = obj.userData.exteriorPlanCenterZ as number | undefined;
        if ([nx, nz, planX, planZ].every(Number.isFinite)) {
          obj.visible = (cameraX - planX!) * nx! + (cameraZ - planZ!) * nz! < 0;
          continue;
        }
      }
      obj.visible = true;
      continue;
    }

    if (mode === 'down') {
      obj.visible = false;
      continue;
    }
    if (mode === 'up') {
      obj.visible = true;
      continue;
    }

    // Cutaway: hide the wall if the camera is on its outer side.

    let nx = 0;
    let nz = 0;
    let cx = 0;
    let cz = 0;
    switch (wallId) {
      case 'north': nz = -1; cz = -halfD; break;
      case 'south': nz =  1; cz =  halfD; break;
      case 'east':  nx =  1; cx =  halfW; break;
      case 'west':  nx = -1; cx = -halfW; break;
    }
    const dot = (cameraX - cx) * nx + (cameraZ - cz) * nz;
    obj.visible = dot < 0;
  }
}

// Warm cream — build-mode build mode walls read as tan/cream by default, never
// the neutral mid-grey we used to fall back to.
const DEFAULT_WALL_COLOR = 0xe8dcc4;
// Keep the exterior shell identical to newly drawn interior segments. This is
// intentionally shared in value with interior-walls.ts: every wall begins as
// a 2.60 m high, 16 cm thick construction element.
const DEFAULT_WALL_HEIGHT = 2.6;
const DEFAULT_WALL_THICKNESS = 0.16;

export function removeTagged(scene: ThreeNS.Scene, ...tags: RoomObjectTag[]): void {
  const tagSet = new Set<string>(tags);
  const toRemove = scene.children.filter((obj) => tagSet.has(obj.userData.type as string));
  toRemove.forEach((obj) => removeAndDispose(scene, obj));
}

export interface RoomBuilderOptions {
  scene: ThreeNS.Scene;
  width: number;
  depth: number;
  floorColor: string;
  floorPattern?: FloorPattern;
  wallPattern?: WallPattern;
  wallColors?: Partial<Record<WallId, string>>;
  /** Door / window cutouts to punch through the relevant walls. */
  wallOpenings?: ReadonlyMap<WallId, WallOpening[]>;
  /** Exterior walls that have been removed (open sides). */ 
  hiddenWalls?: readonly WallId[]; 
  boundaryWalls?: readonly InteriorWall[];
  /** Stairwell openings to cut through this floor's plane. */
  floorOpenings?: readonly FloorOpening[];
  floorPlanImage: string | null;
  floorPlanOpacity: number;
  floorPlanFitMode: FloorPlanFitMode;
  floorPlan3DEffect: boolean;
  /** Vertical offset for this floor (y in metres). Defaults to 0 (ground). */
  yOffset?: number;
  /** Opacity multiplier for stacked floors below the active one. */
  ghostOpacity?: number;
  onTextureLoaded?: () => void;
}

export function buildRoom(THREE: ThreeModule, options: RoomBuilderOptions): void {
  const yOffset = options.yOffset ?? 0;
  const isGhost = options.ghostOpacity !== undefined && options.ghostOpacity < 1;

  const hasFloorOpenings = options.floorOpenings && options.floorOpenings.length > 0;
  const useDisplacement = options.floorPlanImage && options.floorPlan3DEffect;

  // When the floor has stairwell openings we use ShapeGeometry so we can
  // punch rectangular holes. Otherwise keep the simpler PlaneGeometry
  // (which also supports displacement subdivision for floor-plan 3D effect).
  const geometry = options.boundaryWalls && options.boundaryWalls.length >= 3 && !useDisplacement
    ? buildBoundaryFloorGeometry(THREE, options.boundaryWalls)
    : hasFloorOpenings && !useDisplacement
    ? buildFloorGeometryWithOpenings(THREE, options.width, options.depth, options.floorOpenings!)
    : new THREE.PlaneGeometry(options.width, options.depth, useDisplacement ? 100 : 1, useDisplacement ? 100 : 1);

  let material: ThreeNS.Material;
  if (options.floorPlanImage) {
    material = buildFloorPlanMaterial(THREE, options, options.floorPlanImage);
  } else {
    // Note: an image-less call must NOT drop the decoded-image cache here —
    // only floor 0 carries the plan, so in a multi-floor rebuild every upper
    // floor would wipe the cache floor 0 just warmed and the multi-MB data
    // URL would re-decode on every other rebuild (#119). The caller clears
    // the cache via clearFloorPlanImageCache() when the plan is truly gone.
    material = buildFloorMaterial(THREE, {
      pattern: options.floorPattern ?? 'solid',
      color: options.floorColor,
      roomWidth: options.width,
      roomDepth: options.depth,
    });
  }

  if (isGhost) {
    material.transparent = true;
    material.opacity = options.ghostOpacity!;
  }

  const floor = new THREE.Mesh(geometry, material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = yOffset;
  floor.receiveShadow = true;
  floor.userData.type = ROOM_OBJECT_TAGS.Floor;
  makeStatic(floor);
  options.scene.add(floor);


  // Concrete foundation plinth — only on the ground floor. build-mode houses sit on
  // a low base that extends slightly past the wall plane and grounds the
  // building visually.
  if (yOffset === 0 && !options.floorPlanImage && !(options.boundaryWalls && options.boundaryWalls.length >= 3)) {
    addFoundation(THREE, options.scene, options.width, options.depth, isGhost ? options.ghostOpacity : undefined);
  }

  if (!options.floorPlanImage) {
    buildWalls(
      THREE,
      options.scene,
      options.width,
      options.depth,
      options.wallColors,
      options.wallPattern,
      yOffset,
      isGhost ? options.ghostOpacity : undefined,
      options.wallOpenings,
      options.hiddenWalls,
      options.boundaryWalls
    );
  }
}

function buildBoundaryFloorGeometry(THREE: ThreeModule, walls: readonly InteriorWall[]): ThreeNS.BufferGeometry {
  const points = new THREE.Shape();
  const first = walls[0]!;
  const vertices = [{ x: first.x1, z: first.z1 }, { x: first.x2, z: first.z2 }];
  const remaining = walls.slice(1).map((wall) => ({ ...wall }));
  while (remaining.length > 0) {
    const current = vertices[vertices.length - 1]!;
    const index = remaining.findIndex((wall) => Math.hypot(wall.x1 - current.x, wall.z1 - current.z) < 0.01 || Math.hypot(wall.x2 - current.x, wall.z2 - current.z) < 0.01);
    if (index < 0) break;
    const next = remaining.splice(index, 1)[0]!;
    if (Math.hypot(next.x1 - current.x, next.z1 - current.z) < 0.01) vertices.push({ x: next.x2, z: next.z2 });
    else vertices.push({ x: next.x1, z: next.z1 });
  }
  for (const vertex of vertices) points.lineTo(vertex.x, -vertex.z);
  points.closePath();
  return new THREE.ShapeGeometry(points);
}

const FOUNDATION_OVERHANG = 0.18;
const FOUNDATION_HEIGHT = 0.18;
const FOUNDATION_COLOR = 0x858b8d;

function addFoundation(
  THREE: ThreeModule,
  scene: ThreeNS.Scene,
  width: number,
  depth: number,
  ghostOpacity?: number
): void {
  const outerW = width + FOUNDATION_OVERHANG * 2;
  const outerD = depth + FOUNDATION_OVERHANG * 2;
  // Hollow rectangle: outer perimeter minus the inner room footprint, so the
  // foundation reads as a ring around the building rather than overlapping
  // the floor mesh.
  const outline = new THREE.Shape();
  outline.moveTo(-outerW / 2, -outerD / 2);
  outline.lineTo(outerW / 2, -outerD / 2);
  outline.lineTo(outerW / 2, outerD / 2);
  outline.lineTo(-outerW / 2, outerD / 2);
  outline.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-width / 2, -depth / 2);
  hole.lineTo(width / 2, -depth / 2);
  hole.lineTo(width / 2, depth / 2);
  hole.lineTo(-width / 2, depth / 2);
  hole.closePath();
  outline.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: FOUNDATION_HEIGHT,
    bevelEnabled: false,
  });
  // Extrude is created along +Z. Rotate to stand up vertically.
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: FOUNDATION_COLOR,
    roughness: 0.92,
  });
  if (ghostOpacity !== undefined) {
    material.transparent = true;
    material.opacity = ghostOpacity;
  }
  const foundation = new THREE.Mesh(geometry, material);
  foundation.position.y = -FOUNDATION_HEIGHT;
  foundation.receiveShadow = true;
  foundation.castShadow = true;
  foundation.userData.type = ROOM_OBJECT_TAGS.Floor;
  makeStatic(foundation);
  scene.add(foundation);
}

// Data-URL floor plans are multi-MB and decoding them dominates a shell
// rebuild. Cache the decoded image element (not the Texture — textures are
// disposed along with their meshes) keyed on the URL; single entry, since a
// building has one floor plan.
let floorPlanImageCache: { url: string; image: HTMLImageElement } | null = null;

/**
 * Drop the decoded floor-plan cache. Call when the building no longer has a
 * plan (so a removed multi-MB data URL isn't retained) — not per image-less
 * buildRoom call, which would thrash the cache in multi-floor rebuilds (#119).
 */
export function clearFloorPlanImageCache(): void {
  floorPlanImageCache = null;
}

function buildFloorPlanMaterial(
  THREE: ThreeModule,
  options: RoomBuilderOptions,
  imageUrl: string
): ThreeNS.MeshStandardMaterial {
  // With the 3D effect on we build two textures (map + displacement) from the
  // same URL. On a cache miss we must not kick off two independent decodes of a
  // multi-MB data URL — share a single in-flight decode. The first cache-miss
  // call starts one loader; later synchronous calls in the same build return a
  // placeholder Texture whose pixels are filled in when the shared load
  // resolves. `onLoad` fires for every texture once the image is ready.
  let sharedLoad: {
    started: boolean;
    resolved: boolean;
    image: HTMLImageElement | null;
    pending: Array<{ texture: ThreeNS.Texture; onLoad?: (texture: ThreeNS.Texture) => void }>;
  } | null = null;

  const acquireTexture = (onLoad?: (texture: ThreeNS.Texture) => void): ThreeNS.Texture => {
    // Cache warm (from a previous build) — decode already available.
    if (floorPlanImageCache?.url === imageUrl) {
      const texture = new THREE.Texture(floorPlanImageCache.image);
      texture.needsUpdate = true;
      onLoad?.(texture);
      return texture;
    }

    if (!sharedLoad) {
      sharedLoad = { started: false, resolved: false, image: null, pending: [] };
    }

    // Second (and later) calls before the load resolves: attach a placeholder
    // texture that gets its image + onLoad when the single decode finishes.
    if (sharedLoad.started) {
      if (sharedLoad.resolved && sharedLoad.image) {
        const texture = new THREE.Texture(sharedLoad.image);
        texture.needsUpdate = true;
        onLoad?.(texture);
        return texture;
      }
      const texture = new THREE.Texture();
      sharedLoad.pending.push({ texture, ...(onLoad ? { onLoad } : {}) });
      return texture;
    }

    // First cache-miss call: kick off the one and only decode for this build.
    sharedLoad.started = true;
    const loader = new THREE.TextureLoader();
    return loader.load(imageUrl, (loaded) => {
      const image = loaded.image as HTMLImageElement;
      floorPlanImageCache = { url: imageUrl, image };
      if (sharedLoad) {
        sharedLoad.resolved = true;
        sharedLoad.image = image;
        for (const { texture, onLoad: pendingOnLoad } of sharedLoad.pending) {
          texture.image = image;
          texture.needsUpdate = true;
          pendingOnLoad?.(texture);
        }
        sharedLoad.pending = [];
      }
      onLoad?.(loaded);
    });
  };

  const texture = acquireTexture((loaded) => {
    fitTextureToRoom(loaded, options.width, options.depth, options.floorPlanFitMode);
    options.onTextureLoaded?.();
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const params: ThreeNS.MeshStandardMaterialParameters = {
    map: texture,
    transparent: true,
    opacity: options.floorPlanOpacity,
    roughness: 0.8,
    metalness: 0.2,
  };

  if (options.floorPlan3DEffect) {
    const displacement = acquireTexture();
    displacement.wrapS = THREE.ClampToEdgeWrapping;
    displacement.wrapT = THREE.ClampToEdgeWrapping;
    params.displacementMap = displacement;
    params.displacementScale = 0.3;
  }

  return new THREE.MeshStandardMaterial(params);
}

function fitTextureToRoom(
  texture: ThreeNS.Texture,
  roomWidth: number,
  roomDepth: number,
  mode: FloorPlanFitMode
): void {
  const image = texture.image as HTMLImageElement | undefined;
  if (!image) return;

  const imageAspect = image.width / image.height;
  const roomAspect = roomWidth / roomDepth;

  if (mode === 'stretch') {
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    return;
  }

  const wider = imageAspect > roomAspect;
  if (mode === 'cover') {
    const scale = wider ? roomAspect / imageAspect : imageAspect / roomAspect;
    if (wider) {
      texture.repeat.set(scale, 1);
      texture.offset.set((1 - scale) / 2, 0);
    } else {
      texture.repeat.set(1, scale);
      texture.offset.set(0, (1 - scale) / 2);
    }
    return;
  }

  const scale = wider ? imageAspect / roomAspect : roomAspect / imageAspect;
  if (wider) {
    texture.repeat.set(1, scale);
    texture.offset.set(0, (1 - scale) / 2);
  } else {
    texture.repeat.set(scale, 1);
    texture.offset.set((1 - scale) / 2, 0);
  }
}

function buildWalls(
  THREE: ThreeModule,
  scene: ThreeNS.Scene,
  width: number,
  depth: number,
  colors?: Partial<Record<WallId, string>>,
  pattern?: WallPattern,
  yOffset = 0,
  ghostOpacity?: number,
  openings?: ReadonlyMap<WallId, WallOpening[]>,
  hiddenWalls?: readonly WallId[],
  boundaryWalls?: readonly InteriorWall[]
): void {
  const wallHeight = DEFAULT_WALL_HEIGHT;
  const centerY = yOffset + wallHeight / 2;

  const boundaryCenter = boundaryWalls && boundaryWalls.length > 0
    ? boundaryWalls.reduce((sum, wall) => ({ x: sum.x + wall.x1, z: sum.z + wall.z1 }), { x: 0, z: 0 })
    : { x: 0, z: 0 };
  if (boundaryWalls?.length) {
    boundaryCenter.x /= boundaryWalls.length;
    boundaryCenter.z /= boundaryWalls.length;
  }
  const wallSpecs: ReadonlyArray<{
    id: string;
    width: number;
    rotateY: number;
    position: [number, number, number];
    outwardNormal: readonly [number, number];
    planCenter: readonly [number, number];
  }> = boundaryWalls && boundaryWalls.length >= 3 ? boundaryWalls.map((wall) => {
    const dx = wall.x2 - wall.x1;
    const dz = wall.z2 - wall.z1;
    const length = Math.hypot(dx, dz);
    const midX = (wall.x1 + wall.x2) / 2;
    const midZ = (wall.z1 + wall.z2) / 2;
    let nx = -dz / length;
    let nz = dx / length;
    if ((midX - boundaryCenter.x) * nx + (midZ - boundaryCenter.z) * nz < 0) {
      nx *= -1;
      nz *= -1;
    }
    return {
      id: wall.id,
      width: length,
      rotateY: Math.atan2(-dz, dx),
      position: [midX, centerY, midZ] as [number, number, number],
      outwardNormal: [nx, nz] as const,
      planCenter: [boundaryCenter.x, boundaryCenter.z] as const,
    };
  }) : [
    { id: 'north', width, rotateY: 0, position: [0, centerY, -depth / 2] as [number, number, number], outwardNormal: [0, -1] as const, planCenter: [0, 0] as const },
    { id: 'south', width, rotateY: Math.PI, position: [0, centerY, depth / 2] as [number, number, number], outwardNormal: [0, 1] as const, planCenter: [0, 0] as const },
    { id: 'west', width: depth, rotateY: Math.PI / 2, position: [-width / 2, centerY, 0] as [number, number, number], outwardNormal: [-1, 0] as const, planCenter: [0, 0] as const },
    { id: 'east', width: depth, rotateY: -Math.PI / 2, position: [width / 2, centerY, 0] as [number, number, number], outwardNormal: [1, 0] as const, planCenter: [0, 0] as const },
  ];

  for (const spec of wallSpecs) {
    if (hiddenWalls?.includes(spec.id as WallId)) continue;
    const color = colors?.[spec.id as WallId] ?? hexFromInt(DEFAULT_WALL_COLOR);
    const material = buildWallMaterial(THREE, {
      pattern: pattern ?? 'solid',
      color,
      width: spec.width,
      height: wallHeight,
    });
    material.side = THREE.DoubleSide;

    if (ghostOpacity !== undefined) {
      material.transparent = true;
      material.opacity *= ghostOpacity;
    }

    const wallCutouts = openings && (spec.id === 'north' || spec.id === 'south' || spec.id === 'east' || spec.id === 'west') ? openingsForWall(openings, spec.id) : [];
    const geometry =
      wallCutouts.length > 0
        ? buildWallGeometryWithCutouts(THREE, spec.width, wallHeight, wallCutouts, DEFAULT_WALL_THICKNESS)
        : new THREE.BoxGeometry(spec.width, wallHeight, DEFAULT_WALL_THICKNESS);

    const wall = new THREE.Mesh(geometry, material);
    wall.rotation.y = spec.rotateY;
    wall.position.set(spec.position[0], spec.position[1], spec.position[2]);
    wall.userData.type = ROOM_OBJECT_TAGS.Wall;
    wall.userData.exteriorWall = true;
    wall.userData.exteriorCenterX = spec.position[0];
    wall.userData.exteriorCenterZ = spec.position[2];
    wall.userData.exteriorNormalX = spec.outwardNormal[0];
    wall.userData.exteriorNormalZ = spec.outwardNormal[1];
    wall.userData.exteriorPlanCenterX = spec.planCenter[0];
    wall.userData.exteriorPlanCenterZ = spec.planCenter[1];
    const legacyWallId = spec.id.replace('outer-', '');
    const sourceWall = boundaryWalls?.find((wall) => wall.id === spec.id);
    const axisAligned = !sourceWall || Math.abs(sourceWall.x2 - sourceWall.x1) < 0.001 || Math.abs(sourceWall.z2 - sourceWall.z1) < 0.001;
    if (axisAligned && (legacyWallId === 'north' || legacyWallId === 'south' || legacyWallId === 'east' || legacyWallId === 'west')) {
      wall.userData.wallId = legacyWallId;
    }
    makeStatic(wall);
    scene.add(wall);

    // Dark wood baseboard along the floor of every wall — the build-mode-style
    // trim that grounds the room and hides the floor/wall seam. Solid
    // (non-translucent) so the room reads as a real building from outside.
    addBaseboard(THREE, scene, spec, yOffset, ghostOpacity);
  }

  // Keep the 3D presentation clean and architectural. Grid snapping remains
  // active in the editor, but the construction grid is intentionally hidden.
}

const BASEBOARD_HEIGHT = 0.12;
const BASEBOARD_DEPTH = DEFAULT_WALL_THICKNESS + 0.01;
const BASEBOARD_COLOR = 0xc7cac8;

function addBaseboard(
  THREE: ThreeModule,
  scene: ThreeNS.Scene,
  spec: { id: string; width: number; rotateY: number; position: readonly [number, number, number]; outwardNormal: readonly [number, number]; planCenter: readonly [number, number] },
  yOffset: number,
  ghostOpacity?: number
): void {
  const material = new THREE.MeshStandardMaterial({
    color: BASEBOARD_COLOR,
    roughness: 0.76,
  });
  if (ghostOpacity !== undefined) {
    material.transparent = true;
    material.opacity = ghostOpacity;
  }
  const geometry = new THREE.BoxGeometry(spec.width, BASEBOARD_HEIGHT, BASEBOARD_DEPTH);
  const base = new THREE.Mesh(geometry, material);
  base.rotation.y = spec.rotateY;
  // Baseboards offset slightly inward (toward room centre) so they're flush
  // with the inside face of the wall. The wall's outward normal points away
  // from origin, so push along the negative of (position.xz / |position.xz|).
  const [px, , pz] = spec.position;
  const radial = Math.hypot(px, pz);
  if (radial > 0.001) {
    const inset = BASEBOARD_DEPTH / 2;
    const nx = px / radial;
    const nz = pz / radial;
    base.position.set(px - nx * inset, yOffset + BASEBOARD_HEIGHT / 2, pz - nz * inset);
  } else {
    base.position.set(px, yOffset + BASEBOARD_HEIGHT / 2, pz);
  }
  base.receiveShadow = true;
  base.userData.type = ROOM_OBJECT_TAGS.Wall;
  base.userData.exteriorWall = true;
  base.userData.exteriorCenterX = spec.position[0];
  base.userData.exteriorCenterZ = spec.position[2];
  base.userData.exteriorNormalX = spec.outwardNormal[0];
  base.userData.exteriorNormalZ = spec.outwardNormal[1];
  base.userData.exteriorPlanCenterX = spec.planCenter[0];
  base.userData.exteriorPlanCenterZ = spec.planCenter[1];
  const legacyWallId = spec.id.replace('outer-', '');
  if (legacyWallId === 'north' || legacyWallId === 'south' || legacyWallId === 'east' || legacyWallId === 'west') {
    base.userData.wallId = legacyWallId;
  }
  makeStatic(base);
  scene.add(base);
}

/**
 * ShapeGeometry emits UVs equal to the raw shape vertex coordinates, while the
 * pattern materials calibrate `texture.repeat` for PlaneGeometry's [0,1] UV
 * span — feeding one into the other multiplies the tiling by the shape's size
 * (#125). Rescale an origin-centred span×span shape to the plane convention so
 * both geometry types tile identically.
 */
function normalizeShapeUvs(
  geometry: ThreeNS.BufferGeometry,
  spanX: number,
  spanY: number
): ThreeNS.BufferGeometry {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / spanX + 0.5, uv.getY(i) / spanY + 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

function buildWallGeometryWithCutouts(
  THREE: ThreeModule,
  wallWidth: number,
  wallHeight: number,
  cutouts: readonly WallOpening[],
  thickness = DEFAULT_WALL_THICKNESS
): ThreeNS.BufferGeometry {
  const halfW = wallWidth / 2;
  const halfH = wallHeight / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -halfH);
  shape.lineTo(halfW, -halfH);
  shape.lineTo(halfW, halfH);
  shape.lineTo(-halfW, halfH);
  shape.closePath();

  // Merge overlapping cutouts before building holes — overlapping holes are
  // illegal for earcut and produce phantom fill / self-intersecting triangles.
  const rects = cutouts.map(
    (c) =>
      [
        c.centerAlongWall - c.width / 2,
        -halfH + c.bottomFromFloor,
        c.centerAlongWall + c.width / 2,
        -halfH + c.bottomFromFloor + c.height,
      ] as [number, number, number, number]
  );
  for (const [x0, y0, x1, y1] of mergeHoleRects(rects)) {
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
    const hole = new THREE.Path();
    hole.moveTo(x0, y0);
    hole.lineTo(x1, y0);
    hole.lineTo(x1, y1);
    hole.lineTo(x0, y1);
    hole.closePath();
    shape.holes.push(hole);
  }

  // A cut-out wall must remain solid too. Extruding the same shape gives door
  // and window walls the exact thickness of ordinary exterior/interior walls.
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  return normalizeShapeUvs(geometry, wallWidth, wallHeight);
}

/**
 * Build a floor plane with rectangular holes cut out for stairwells.
 * The geometry lies in the XY plane (like PlaneGeometry) and must be
 * rotated -90° on X to become horizontal.
 */
function buildFloorGeometryWithOpenings(
  THREE: ThreeModule,
  roomWidth: number,
  roomDepth: number,
  openings: readonly FloorOpening[]
): ThreeNS.BufferGeometry {
  const halfW = roomWidth / 2;
  const halfD = roomDepth / 2;

  // ShapeGeometry lives in XY — after rotation X maps to world X, Y maps
  // to world Z (negated by the -90° rotation), so we use depth as the Y
  // axis of the shape.
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -halfD);
  shape.lineTo(halfW, -halfD);
  shape.lineTo(halfW, halfD);
  shape.lineTo(-halfW, halfD);
  shape.closePath();

  // The -90° X rotation maps shape-Y to world -Z, so negate Z below.
  //
  // Split openings by whether they're axis-aligned (rotation a multiple of 90°)
  // or genuinely rotated. Axis-aligned holes go through mergeHoleRects so two
  // stacked stairwells fuse into one clean rectangle (overlapping holes are
  // illegal for earcut). Rotated holes are cut as individual rotated rectangles
  // matching the stairs' footprint — no over-inflated AABB, so no corner gaps.
  const axisAligned: FloorOpening[] = [];
  const rotated: FloorOpening[] = [];
  for (const o of openings) {
    (isAxisAlignedRotation(o.rotation) ? axisAligned : rotated).push(o);
  }

  const rects = axisAligned.map((o) => {
    // At 90°/270° the footprint's width and depth swap in world space.
    const swap = Math.abs(Math.sin(o.rotation)) > 0.5;
    const worldW = swap ? o.depth : o.width;
    const worldD = swap ? o.width : o.depth;
    return [
      o.centerX - worldW / 2,
      -(o.centerZ + worldD / 2),
      o.centerX + worldW / 2,
      -(o.centerZ - worldD / 2),
    ] as [number, number, number, number];
  });
  for (const [x0, y0, x1, y1] of mergeHoleRects(rects)) {
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
    const hole = new THREE.Path();
    hole.moveTo(x0, y0);
    hole.lineTo(x1, y0);
    hole.lineTo(x1, y1);
    hole.lineTo(x0, y1);
    hole.closePath();
    shape.holes.push(hole);
  }

  for (const o of rotated) {
    if (o.width <= 0 || o.depth <= 0) continue;
    // Rotate the footprint corners about the opening centre. rotation.y turns
    // local +X toward world -Z, so a world-space point is
    // (cx + lx·cos + lz·sin, cz - lx·sin + lz·cos); shape-Y is world -Z.
    const cos = Math.cos(o.rotation);
    const sin = Math.sin(o.rotation);
    const hw = o.width / 2;
    const hd = o.depth / 2;
    const localCorners: Array<[number, number]> = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
    const corners: Array<[number, number]> = localCorners.map(([lx, lz]) => {
      const worldX = o.centerX + lx * cos + lz * sin;
      const worldZ = o.centerZ - lx * sin + lz * cos;
      return [worldX, -worldZ];
    });
    const hole = new THREE.Path();
    hole.moveTo(corners[0]![0], corners[0]![1]);
    hole.lineTo(corners[1]![0], corners[1]![1]);
    hole.lineTo(corners[2]![0], corners[2]![1]);
    hole.lineTo(corners[3]![0], corners[3]![1]);
    hole.closePath();
    shape.holes.push(hole);
  }

  return normalizeShapeUvs(new THREE.ShapeGeometry(shape), roomWidth, roomDepth);
}

/**
 * True when a rotation is (within a small tolerance) a multiple of 90°, so the
 * footprint stays axis-aligned in world space and can be cut — and merged with
 * neighbours — as an ordinary AABB rectangle.
 */
function isAxisAlignedRotation(rotation: number): boolean {
  const twist = Math.abs(Math.sin(2 * rotation));
  return twist < 1e-3;
}

function hexFromInt(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}
