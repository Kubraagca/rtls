'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { FloorPlanEditor } from './canvas-2d/floor-plan-editor';
import { worldPositionFrom2DClient } from './canvas-2d/render';
import { RoomEditorProvider, type RoomEditorContextValue } from './contexts/room-editor-context';
import { SelectionProvider, type SelectionContextValue } from './contexts/selection-context';
import { useCameraPresets } from './hooks/use-camera-presets';
import { useCameraVision } from './hooks/use-camera-vision';
import { useDigitalTwinOverlays } from './hooks/use-digital-twin-overlays';
import { useHistory } from './hooks/use-history';
import { useImportExport } from './hooks/use-import-export';
import { useItemDrag } from './hooks/use-item-drag';
import { useItemPlacement } from './hooks/use-item-placement';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { useLayoutPersistence } from './hooks/use-layout-persistence';
import { useLayoutState } from './hooks/use-layout-state';
import { useNpcs, type RtlsDeviceSnapshot, type RtlsPerformanceSnapshot } from './hooks/use-npcs';
import { useRecentColors } from './hooks/use-recent-colors';
import { useSceneEffects, measurementDistance } from './hooks/use-scene-effects';
import { useThreeScene } from './hooks/use-three-scene';
import { useWalkthrough } from './hooks/use-walkthrough';
import { CAMERA_BRACKET_ARM, FURNITURE_CATALOG } from './lib/constants';
import { DEFAULT_DIGITAL_TWIN_LAYERS, type DigitalTwinLayerState } from './lib/digital-twin-layers';
import { hasCollisions } from './lib/geometry';
import { reseatWallMountedItem, settleWallMountedItem } from './lib/opening-snap';
import { playSound, type SoundCue } from './lib/sounds';
import { FLOOR_HEIGHT_METERS } from './lib/types';
import { removeCatalogItem, updateCatalogItem } from './lib/catalog-registry';
import { snapWallEndpoint } from './lib/wall-snap';
import { BottomHud } from './panels/bottom-hud';
import { CustomGlbUpload } from './panels/custom-glb-upload';
import { FloorPill } from './panels/floor-pill';
import { HeaderStats } from './panels/header-stats';
import { ItemContextPopover } from './panels/item-context-popover';
import { LotBadge } from './panels/lot-badge';
import { ModePanel } from './panels/mode-panel';
import { SidebarDrawer } from './panels/sidebar-drawer';
import { TouchModeToggle } from './panels/touch-mode-toggle';
import { TwinzoLiveHud } from './panels/twinzo-live-hud';
import { Viewport } from './panels/viewport';
import { WallDisplayPill } from './panels/wall-display-pill';
import { WelcomeBanner } from './panels/welcome-banner';
import type { HoverInfo } from './hooks/use-three-scene';
import type { GameMode } from './lib/types';

import type { CatalogItem, RoomLayout, ViewSettings, WallId } from './lib/types';

function orbitCamera(
  THREE: typeof import('three'),
  camera: import('three').PerspectiveCamera,
  controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls,
  direction: 'left' | 'right' | 'up' | 'down'
): void {
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const step = 0.22;
  switch (direction) {
    case 'left':
      spherical.theta += step;
      break;
    case 'right':
      spherical.theta -= step;
      break;
    case 'up':
      spherical.phi = Math.max(0.15, spherical.phi - step / 2);
      break;
    case 'down':
      spherical.phi = Math.min(Math.PI / 2.2, spherical.phi + step / 2);
      break;
  }
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

function zoomCamera(
  camera: import('three').PerspectiveCamera,
  controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls,
  direction: '+' | '-'
): void {
  const offset = camera.position.clone().sub(controls.target);
  const factor = direction === '+' ? 0.72 : 1.32;
  offset.multiplyScalar(factor);
  const distance = Math.max(0.8, Math.min(100, offset.length()));
  offset.setLength(distance);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

function distanceToSegment(point: { x: number; z: number }, wall: { x1: number; z1: number; x2: number; z2: number }): number {
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(point.x - wall.x1, point.z - wall.z1);
  const t = Math.max(0, Math.min(1, ((point.x - wall.x1) * dx + (point.z - wall.z1) * dz) / lengthSquared));
  return Math.hypot(point.x - (wall.x1 + t * dx), point.z - (wall.z1 + t * dz));
}


const INITIAL_VIEW_SETTINGS: ViewSettings = {
  view2D: false,
  backgroundColor: '#dceefb',
  backgroundImage: null,
  showMeasurements: true,
  showWiFiSignals: false,
  snapToGrid: true,
  snapToWall: true,
  snapToItems: true,
  showMinimap: false,
  floorPlan3DEffect: false,
  timeOfDay: 12,
  lightsEnabled: true,
  walkthroughMode: false,
  showOutdoor: false,
  showAllFloors: false,
  wallDisplay: 'cutaway',
  measurementMode: false,
  soundsEnabled: false,
  drawWallMode: false,
  showHeatmap: false,
  showItemLabels: false,
  showNpcs: false,
  showCameraVision: false,
};

export function RoomOrganizer(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2DRef = useRef<HTMLCanvasElement>(null);

  const { layout, activeFloor, activeFloorIndex, actions } = useLayoutState();
  const activeFloorY = activeFloorIndex * FLOOR_HEIGHT_METERS;
  const { recent: recentColors, pushColor } = useRecentColors();
  const [view, setView] = useState<ViewSettings>(INITIAL_VIEW_SETTINGS);
  const [planCamera, setPlanCamera] = useState({ zoom: 1, panX: 0, panY: 0 });
  const curtainFocusRef = useRef<string | null>(null);
  const liveLightToggleRef = useRef<(id: string) => void>(() => {});

  // First-person walkthrough only runs in the 3D view; the 2D top-down renderer
  // has no PointerLockControls. This single signal gates walkthrough-aware
  // behaviour: canvas select/drag/hover, single-key shortcuts and the hook.
  const walkthroughActive = view.walkthroughMode && !view.view2D;
  const [possessedAvatar, setPossessedAvatar] = useState<{ id: string; position: { x: number; z: number }; rotation: number; eyeHeight: number } | null>(null);

  const playCue = useCallback(
    (cue: SoundCue) => {
      if (view.soundsEnabled) playSound(cue);
    },
    [view.soundsEnabled]
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedWall, setSelectedWall] = useState<{ id: string; kind: 'exterior' | 'interior' } | null>(null);
  const [extraSelectedIds, setExtraSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [autoCycleLighting, setAutoCycleLighting] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('build');
  const [liveLayers, setLiveLayers] = useState<DigitalTwinLayerState>(DEFAULT_DIGITAL_TWIN_LAYERS);
  const [livePaused, setLivePaused] = useState(false);
  const [liveDevices, setLiveDevices] = useState<readonly RtlsDeviceSnapshot[]>([]);
  const [livePerformance, setLivePerformance] = useState<RtlsPerformanceSnapshot>({
    fps: 0,
    total: 0,
    visible: 0,
    fullAvatars: 0,
    proxyAvatars: 0,
    hidden: 0,
    drawCalls: 0,
    triangles: 0,
  });
  const [selectedLiveDeviceId, setSelectedLiveDeviceId] = useState<string | null>(null);
  const [measurementPoints, setMeasurementPoints] = useState<ReadonlyArray<{ x: number; z: number }>>([]);
  const [wallDraft, setWallDraft] = useState<{ x: number; z: number } | null>(null);
  const [pointerWorld, setPointerWorld] = useState<{ x: number; z: number } | null>(null);
  useEffect(() => {
    if (!view.drawWallMode) return;
    // Entering the drawing tool must never leave an old wall/item selected.
    // Existing wall geometry is still used by snapWallEndpoint, but it is not
    // an interactive selection target while the tool owns the pointer.
    setSelectedWall(null);
    setSelectedItemId(null);
    setExtraSelectedIds(new Set());
  }, [view.drawWallMode]);
  const wallDragRef = useRef<{
    id: string;
    mode: 'start' | 'end' | 'move' | 'exterior';
    edge?: 'north' | 'south' | 'east' | 'west';
    last: { x: number; z: number };
    startPoint?: { x: number; z: number };
    startWidth?: number;
    startHeight?: number;
    startClientX?: number;
    startClientY?: number;
    startScale?: number;
    startPanX?: number;
    startPanY?: number;
  } | null>(null);
  const lastWallResizeRef = useRef(0);

  const wallSnapResult = useMemo(() => {
    if (!view.drawWallMode || !pointerWorld) return null;
    return snapWallEndpoint({
      point: pointerWorld,
      existingWalls: [...(layout.boundaryWalls ?? []), ...(activeFloor.interiorWalls ?? [])],
      fromPoint: wallDraft,
      roomWidth: layout.width,
      roomDepth: layout.height,
      // Generous visual/interaction snap makes joining a corner feel like a
      // deliberate "click into place" instead of pixel hunting.
      snapDistance: 0.65,
      clampToRoom: false,
    });
  }, [view.drawWallMode, pointerWorld, activeFloor.interiorWalls, wallDraft, layout.width, layout.height]);

  const highlightedIds = useMemo(() => {
    const normalised = catalogQuery.trim().toLowerCase();
    if (!normalised) return new Set<string>();
    const matches = new Set<string>();
    for (const item of activeFloor.items) {
      if (item.name.toLowerCase().includes(normalised) || item.type.toLowerCase().includes(normalised)) {
        matches.add(item.id);
      }
    }
    return matches;
  }, [catalogQuery, activeFloor.items]);

  // A user can attach a new closed room beyond the dimensions of the room
  // created first. Keep furniture placement/collision bounds large enough for
  // every wall endpoint, otherwise an item in that valid annex is incorrectly
  // marked as outside and cannot be placed comfortably.
  const placementFootprint = useMemo(() => {
    let maxX = layout.width / 2;
    let maxZ = layout.height / 2;
    for (const wall of [...(layout.boundaryWalls ?? []), ...layout.floors.flatMap((floor) => floor.interiorWalls ?? [])]) {
      maxX = Math.max(maxX, Math.abs(wall.x1), Math.abs(wall.x2));
      maxZ = Math.max(maxZ, Math.abs(wall.z1), Math.abs(wall.z2));
    }
    return { width: maxX * 2, depth: maxZ * 2 };
  }, [layout.width, layout.height, layout.boundaryWalls, layout.floors]);

  const collidingIds = useMemo(() => {
    const matches = new Set<string>();
    for (const item of activeFloor.items) {
      if (hasCollisions(item, activeFloor.items, placementFootprint.width, placementFootprint.depth)) {
        matches.add(item.id);
      }
    }
    return matches;
  }, [activeFloor.items, placementFootprint]);

  const handleEmptyClick = useCallback(
    (x: number, z: number, chainWall = true, snap = true, clampToRoom = snap) => {
      if (view.drawWallMode) {
        const snapped = snapWallEndpoint({
          point: { x, z },
          existingWalls: [...(layout.boundaryWalls ?? []), ...(activeFloor.interiorWalls ?? [])],
          fromPoint: wallDraft,
          roomWidth: layout.width,
          roomDepth: layout.height,
          // 2D clicks should land exactly where the cursor is. The 3D
          // workflow keeps vertex/right-angle snapping for room outlines.
          snapDistance: snap ? 0.65 : 0,
          clampToRoom,
        });
        if (!wallDraft) {
          setWallDraft(snapped.point);
          return;
        }
        // Reject zero-length walls (two clicks on the same vertex).
        const length = Math.hypot(snapped.point.x - wallDraft.x, snapped.point.z - wallDraft.z);
        if (length < 0.1) {
          setWallDraft(null);
          return;
        }
        const id = `wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        actions.addInteriorWall({
          id,
          x1: wallDraft.x,
          z1: wallDraft.z,
          x2: snapped.point.x,
          z2: snapped.point.z,
        });
        // The 2D editor uses exactly two clicks per wall. The 3D workflow
        // keeps chaining from the last endpoint for quick room outlines.
        setWallDraft(chainWall ? snapped.point : null);
        return;
      }
      if (view.measurementMode) {
        setMeasurementPoints((current) => {
          if (current.length >= 2) return [{ x, z }];
          return [...current, { x, z }];
        });
      }
    },
    [
      view.measurementMode,
      view.drawWallMode,
      wallDraft,
      actions,
      activeFloor.interiorWalls,
      layout.width,
      layout.height,
    ]
  );

  const handleFloorPointerMove = useCallback((x: number, z: number) => {
    setPointerWorld({ x, z });
  }, []);

  const handleFloorPointerLeave = useCallback(() => {
    setPointerWorld(null);
  }, []);

  const handle2DWheel = useCallback(
    (deltaY: number, clientX: number, clientY: number) => {
      const canvas = canvas2DRef.current;
      if (!canvas) return;
      const previousZoom = planCamera.zoom;
      const nextZoom = Math.max(0.5, Math.min(4, previousZoom * (deltaY < 0 ? 1.12 : 0.89)));
      if (nextZoom === previousZoom) return;

      // Keep the point under the cursor fixed while zooming, so the plan feels
      // like a real editor instead of zooming away from the user's focus.
      const point = worldPositionFrom2DClient(canvas, layout, clientX, clientY, planCamera);
      if (!point) {
        setPlanCamera((current) => ({ ...current, zoom: nextZoom }));
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const padding = 60;
      const baseScale = Math.min(
        (rect.width - padding * 2) / layout.width,
        (rect.height - padding * 2) / layout.height
      );
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const baseOffsetX = (rect.width - layout.width * baseScale * nextZoom) / 2;
      const baseOffsetY = (rect.height - layout.height * baseScale * nextZoom) / 2;
      setPlanCamera({
        zoom: nextZoom,
        panX: localX - baseOffsetX - (point.x + layout.width / 2) * baseScale * nextZoom,
        panY: localY - baseOffsetY - (point.z + layout.height / 2) * baseScale * nextZoom,
      });
    },
    [layout, planCamera]
  );

  const handle2DWallSelect = useCallback((clientX: number, clientY: number) => {
    if (view.drawWallMode) return;
    const canvas = canvas2DRef.current;
    if (!canvas) return;
    const point = worldPositionFrom2DClient(canvas, layout, clientX, clientY, { ...planCamera, allowOutside: true });
    if (!point) return;
    const rect = canvas.getBoundingClientRect();
    const baseScale = Math.min(
      (rect.width - 120) / layout.width,
      (rect.height - 120) / layout.height
    );
    const tolerance = Math.max(0.35, 20 / Math.max(1, baseScale * planCamera.zoom));
    let nearest: { id: string; distance: number } | null = null;
    for (const wall of activeFloor.interiorWalls ?? []) {
      const distance = distanceToSegment(point, wall);
      if (distance <= tolerance && (!nearest || distance < nearest.distance)) {
        nearest = { id: wall.id, distance };
      }
    }
    if (nearest) {
      setSelectedWall({ id: nearest.id, kind: 'interior' });
    } else {
      const edges = [
        { id: 'north', distance: Math.abs(point.z + layout.height / 2) },
        { id: 'south', distance: Math.abs(point.z - layout.height / 2) },
        { id: 'west', distance: Math.abs(point.x + layout.width / 2) },
        { id: 'east', distance: Math.abs(point.x - layout.width / 2) },
      ] as const;
      const edge = edges.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
      setSelectedWall(edge.distance <= tolerance ? { id: edge.id, kind: 'exterior' } : null);
    }
    if (nearest) {
      setSelectedItemId(null);
      setExtraSelectedIds(new Set());
    }
  }, [activeFloor.interiorWalls, layout, planCamera, view.drawWallMode]);

  const handle2DWallMouseDown = useCallback((clientX: number, clientY: number) => {
    if (view.measurementMode) {
      const canvas = canvas2DRef.current;
      const point = canvas ? worldPositionFrom2DClient(canvas, layout, clientX, clientY, { ...planCamera, allowOutside: true }) : null;
      if (point) handleEmptyClick(point.x, point.z, false, false, false);
      return;
    }
    const canvas = canvas2DRef.current;
    if (!canvas) return;
    const point = worldPositionFrom2DClient(canvas, layout, clientX, clientY, { ...planCamera, allowOutside: true });
    if (!point) return;
    // Drawing mode owns the pointer completely. Do not let the same pointer
    // press fall through to the wall move/resize hit testing below.
    if (view.drawWallMode) {
      wallDragRef.current = null;
      setSelectedWall(null);
      setSelectedItemId(null);
      setExtraSelectedIds(new Set());
      // Drawing clicks must use the same vertex snap as the preview. Keep
      // outside points allowed so a wall can start/end on a free boundary
      // vertex instead of being clamped back into the old rectangle.
      handleEmptyClick(point.x, point.z, true, true, false);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const baseScale = Math.min((rect.width - 120) / layout.width, (rect.height - 120) / layout.height) * planCamera.zoom;
    // The rendered wall is only a few pixels wide, so use a comfortable
    // world-space hit area to make drag-and-drop practical at every zoom.
    const tolerance = Math.max(0.35, 20 / Math.max(1, baseScale));
    let nearest: { id: string; mode: 'start' | 'end' | 'move'; distance: number } | null = null;
    for (const wall of activeFloor.interiorWalls ?? []) {
      const startDistance = Math.hypot(point.x - wall.x1, point.z - wall.z1);
      const endDistance = Math.hypot(point.x - wall.x2, point.z - wall.z2);
      const segmentDistance = distanceToSegment(point, wall);
      const hit = startDistance <= tolerance
        ? { mode: 'start' as const, distance: startDistance }
        : endDistance <= tolerance
          ? { mode: 'end' as const, distance: endDistance }
          : segmentDistance <= tolerance
            ? { mode: 'move' as const, distance: segmentDistance }
            : null;
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { id: wall.id, ...hit };
    }
    if (nearest) {
      setSelectedWall({ id: nearest.id, kind: 'interior' });
      setSelectedItemId(null);
      setExtraSelectedIds(new Set());
      wallDragRef.current = { id: nearest.id, mode: nearest.mode, last: point };
    } else {
      const edges = [
        { id: 'north', distance: Math.abs(point.z + layout.height / 2) },
        { id: 'south', distance: Math.abs(point.z - layout.height / 2) },
        { id: 'west', distance: Math.abs(point.x + layout.width / 2) },
        { id: 'east', distance: Math.abs(point.x - layout.width / 2) },
      ] as const;
      const edge = edges.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
      if (edge.distance <= tolerance) {
        setSelectedWall({ id: edge.id, kind: 'exterior' });
        setSelectedItemId(null);
        setExtraSelectedIds(new Set());
        wallDragRef.current = {
          id: edge.id,
          mode: 'exterior',
          edge: edge.id,
          last: point,
          startPoint: point,
          startWidth: layout.width,
          startHeight: layout.height,
          startClientX: clientX,
          startClientY: clientY,
          startScale: baseScale,
          startPanX: planCamera.panX,
          startPanY: planCamera.panY,
        };
      } else if (view.drawWallMode) handleEmptyClick(point.x, point.z, false, false, false);
    }
  }, [activeFloor.interiorWalls, handleEmptyClick, layout, planCamera, view.drawWallMode, view.measurementMode]);

  const handle2DWallMouseMove = useCallback((clientX: number, clientY: number) => {
    const drag = wallDragRef.current;
    if (!drag) return;
    const canvas = canvas2DRef.current;
    const point = canvas ? worldPositionFrom2DClient(canvas, layout, clientX, clientY, { ...planCamera, allowOutside: true }) : null;
    const wall = activeFloor.interiorWalls?.find((entry) => entry.id === drag.id);
    if (!point) return;
    if (drag.mode === 'exterior' && drag.startWidth && drag.startHeight && drag.startScale) {
      const now = performance.now();
      // Pointer events can arrive at 120–240 Hz, while every resize rebuilds
      // the room scene. Keep the interaction responsive without rebuilding on
      // every hardware event.
      if (now - lastWallResizeRef.current < 24) return;
      lastWallResizeRef.current = now;
      const startScale = drag.startScale;
      const horizontal = drag.edge === 'east' || drag.edge === 'west';
      const pointerDelta = horizontal
        ? clientX - (drag.startClientX ?? clientX)
        : clientY - (drag.startClientY ?? clientY);
      const delta = pointerDelta / startScale * 2 * (drag.edge === 'west' || drag.edge === 'north' ? -1 : 1);
      if (horizontal) {
        const width = Math.max(1, drag.startWidth + delta);
        const actualDelta = width - drag.startWidth;
        actions.resizeRoom(
          width,
          drag.startHeight,
          drag.edge === 'east' ? -actualDelta / 2 : actualDelta / 2,
          0
        );
        setPlanCamera((camera) => ({
          ...camera,
          panX: (drag.startPanX ?? camera.panX) + (drag.edge === 'east' ? 1 : -1) * delta * startScale / 2,
        }));
      } else {
        const height = Math.max(1, drag.startHeight + delta);
        const actualDelta = height - drag.startHeight;
        actions.resizeRoom(
          drag.startWidth,
          height,
          0,
          drag.edge === 'south' ? -actualDelta / 2 : actualDelta / 2
        );
        setPlanCamera((camera) => ({
          ...camera,
          panY: (drag.startPanY ?? camera.panY) + (drag.edge === 'south' ? 1 : -1) * delta * startScale / 2,
        }));
      }
      return;
    }
    if (!wall) return;
    const dx = point.x - drag.last.x;
    const dz = point.z - drag.last.z;
    if (drag.mode === 'start') actions.updateInteriorWall(wall.id, { x1: point.x, z1: point.z });
    else if (drag.mode === 'end') actions.updateInteriorWall(wall.id, { x2: point.x, z2: point.z });
    else actions.updateInteriorWall(wall.id, { x1: wall.x1 + dx, z1: wall.z1 + dz, x2: wall.x2 + dx, z2: wall.z2 + dz });
    drag.last = point;
  }, [actions, activeFloor.interiorWalls, layout, planCamera]);

  const handle2DWallMouseUp = useCallback(() => {
    wallDragRef.current = null;
    lastWallResizeRef.current = 0;
  }, []);

  // Reset wall draft + wall selection whenever draw mode flips off.
  useEffect(() => {
    if (!view.drawWallMode) {
      setWallDraft(null);
      setSelectedWall(null);
      setPointerWorld(null);
    }
  }, [view.drawWallMode]);

  // Floor switch: drop any in-progress wall draft and selection (those live on
  // the previous floor) and slide the camera target up/down to the new floor.
  useEffect(() => {
    setWallDraft(null);
    setSelectedItemId(null);
    setSelectedWall(null);
    setExtraSelectedIds(new Set());
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const newTargetY = activeFloorIndex * FLOOR_HEIGHT_METERS + FLOOR_HEIGHT_METERS / 2;
    const dy = newTargetY - controls.target.y;
    if (Math.abs(dy) < 0.01) return;
    controls.target.y = newTargetY;
    camera.position.y += dy;
    controls.update();
    const renderer = rendererRef.current;
    if (renderer) renderer.render(sceneRef.current!, camera);
    // The scene refs are declared below (useThreeScene) so they can't appear
    // in this dep array without a TDZ error; they're stable ref objects anyway.
    // activeFloor.id: removing floor 0 (or reordering) can change WHICH floor
    // is active while the index stays 0 — keying on the index alone carried
    // the deleted floor's selection onto its replacement (#117).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFloorIndex, activeFloor.id]);

  // Ghost-selection guard: whenever the floor's items change (undo/redo,
  // import, clear floor, deletes from any path), drop selected ids that no
  // longer exist; a vanished primary promotes the first surviving extra (#117).
  useEffect(() => {
    const ids = new Set(activeFloor.items.map((item) => item.id));
    const primaryGone = selectedItemId !== null && !ids.has(selectedItemId);
    const hasStaleExtras = Array.from(extraSelectedIds).some((id) => !ids.has(id));
    if (!primaryGone && !hasStaleExtras) return;
    const liveExtras = Array.from(extraSelectedIds).filter((id) => ids.has(id));
    if (primaryGone) setSelectedItemId(liveExtras.shift() ?? null);
    setExtraSelectedIds(new Set(liveExtras));
  }, [activeFloor.items, selectedItemId, extraSelectedIds]);

  // Make `id` the sole selection (null clears). The one way panels set a
  // primary — pairing the two setters at every call site is how stale extras
  // leaked into later group operations (#117).
  const selectOnly = useCallback((id: string | null) => {
    setSelectedItemId(id);
    setExtraSelectedIds((extras) => (extras.size === 0 ? extras : new Set()));
  }, []);

  // Plain reads + flat setter calls. The previous version computed the
  // promotion inside a nested setState updater and read the result back
  // synchronously — that only works on React's eager-evaluation path, and
  // StrictMode's double-invoked updaters ran the toggle twice (#117).
  const handleSelect = useCallback(
    (id: string, mode: 'replace' | 'toggle') => {
      if (mode === 'replace') {
        selectOnly(id);
        return;
      }
      if (selectedItemId === null) {
        setSelectedItemId(id);
        return;
      }
      if (selectedItemId === id) {
        // Toggling the primary off: promote an extra to primary (keeping the
        // rest of the multi-select intact) or clear the selection entirely.
        const [promoted] = extraSelectedIds;
        if (promoted === undefined) {
          setSelectedItemId(null);
          return;
        }
        const next = new Set(extraSelectedIds);
        next.delete(promoted);
        setExtraSelectedIds(next);
        setSelectedItemId(promoted);
        return;
      }
      const next = new Set(extraSelectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setExtraSelectedIds(next);
    },
    [selectedItemId, extraSelectedIds, selectOnly]
  );

  const toggleLight = useCallback((id: string) => {
    const item = activeFloor.items.find((entry) => entry.id === id);
    if (!item) return;
    if (gameMode === 'live') {
      // Live mode must not write a layout snapshot for every device click;
      // that would restart the RTLS stream. The scene applies this instantly.
      liveLightToggleRef.current(id);
      return;
    }
    actions.updateItem(id, { lightOn: item.lightOn === false });
  }, [actions, activeFloor.items, gameMode]);

  const toggleCurtain = useCallback((id: string) => {
    const item = activeFloor.items.find((entry) => entry.id === id);
    if (!item || item.type !== 'curtains') return;
    curtainFocusRef.current = id;
    actions.updateItem(id, { curtainsOpen: item.curtainsOpen !== true });
  }, [actions, activeFloor.items]);

  const allSelectedIds = useMemo(() => {
    const set = new Set(extraSelectedIds);
    if (selectedItemId) set.add(selectedItemId);
    return set;
  }, [selectedItemId, extraSelectedIds]);

  const { sceneBoxRef, invalidateBoxRef, handleDragStart, handleDrag, handleDragEnd } = useItemDrag({
    activeFloor,
    activeFloorIndex,
    roomWidth: placementFootprint.width,
    roomDepth: placementFootprint.depth,
    actions,
    allSelectedIds,
  });

  // Re-seat a wall-mounted camera against its wall. A flush camera's body moves
  // to whichever side it faces (so the body + cone start at the wall surface
  // instead of passing through it); a bracketed camera stands off the wall by a
  // fixed arm, independent of facing, so it can pan freely. `bracket` overrides
  // the stored flag for the moment a user toggles the mount style.
  const reseatCamera = useCallback(
    (id: string, rotation: number, bracket?: boolean) => {
      const item = activeFloor.items.find((entry) => entry.id === id);
      if (item?.type !== 'security-camera' || !item.position) return;
      const bracketed = bracket ?? item.cameraBracket ?? false;
      const pos = reseatWallMountedItem({
        position: item.position,
        itemWidth: item.width,
        itemDepth: item.depth,
        roomWidth: layout.width,
        roomDepth: layout.height,
        interiorWalls: activeFloor.interiorWalls ?? [],
        rotation,
        ...(bracketed ? { bracketArm: CAMERA_BRACKET_ARM } : {}),
      });
      actions.moveItem(id, pos.x, pos.z);
    },
    [activeFloor.items, activeFloor.interiorWalls, layout.width, layout.height, actions]
  );

  // Locked items are immune to rotation — group rotates orbit items around
  // the centroid, so rotating a set containing a locked item would move it
  // (#115). The unlocked subset still rotates about its own centroid.
  const unlockedSelectedIds = useCallback(() => {
    const lockedIds = new Set(activeFloor.items.filter((item) => item.locked).map((item) => item.id));
    return new Set(Array.from(allSelectedIds).filter((id) => !lockedIds.has(id)));
  }, [activeFloor.items, allSelectedIds]);

  const rotateItemHandler = useCallback(
    (id: string) => {
      if (allSelectedIds.size > 1 && allSelectedIds.has(id)) {
        const unlocked = unlockedSelectedIds();
        if (unlocked.size > 0) actions.rotateSelection(unlocked, Math.PI / 2);
        return;
      }
      const item = activeFloor.items.find((entry) => entry.id === id);
      if (item?.locked) return;
      if (item?.type === 'security-camera') {
        // A flush camera can only face into the room or straight out, so Rotate
        // flips 180° along its wall's in/out axis. A bracketed camera pans freely.
        const step = item.cameraBracket ? Math.PI / 2 : Math.PI;
        const next = ((item.rotation ?? 0) + step) % (Math.PI * 2);
        actions.setRotation(id, next);
        reseatCamera(id, next);
        return;
      }
      const next = ((item?.rotation ?? 0) + Math.PI / 2) % (Math.PI * 2);
      actions.setRotation(id, next);
    },
    [allSelectedIds, unlockedSelectedIds, activeFloor.items, actions, reseatCamera]
  );

  // Toggle a camera's stand-off bracket. Enabling it keeps the current facing
  // and lifts the camera onto the arm; disabling it snaps the camera back flush
  // and re-locks facing to the wall's inward normal.
  const toggleCameraBracket = useCallback(
    (id: string) => {
      const item = activeFloor.items.find((entry) => entry.id === id);
      if (item?.type !== 'security-camera') return;
      const next = !item.cameraBracket;
      actions.updateItem(id, { cameraBracket: next });
      const rotation = next ? item.rotation ?? 0 : item.wallRotation ?? item.rotation ?? 0;
      if (!next) actions.setRotation(id, rotation);
      reseatCamera(id, rotation, next);
    },
    [activeFloor.items, actions, reseatCamera]
  );

  // Wrap layout actions with the side-effect of clearing the selection when
  // the targeted item disappears.
  const removeItem = useCallback(
    (id: string) => {
      actions.removeItem(id);
      playCue('remove');
      setSelectedItemId((current) => (current === id ? null : current));
      setExtraSelectedIds((extras) => {
        if (!extras.has(id)) return extras;
        const next = new Set(extras);
        next.delete(id);
        return next;
      });
    },
    [actions, playCue]
  );

  const removeCatalogItemAndPlacements = useCallback((catalogItem: CatalogItem) => {
    const catalogKey = catalogItem.customModelId ?? catalogItem.type;
    layout.floors.forEach((floor) => {
      floor.items
        .filter((item) => (item.customModelId ?? item.type) === catalogKey)
        .forEach((item) => removeItem(item.id));
    });
    removeCatalogItem(catalogItem);
  }, [layout.floors, removeItem]);

  const updateCatalogItemAndPlacements = useCallback((catalogItem: CatalogItem) => {
    const catalogKey = catalogItem.customModelId ?? catalogItem.type;
    layout.floors.forEach((floor) => {
      floor.items
        .filter((item) => (item.customModelId ?? item.type) === catalogKey)
        .forEach((item) => actions.updateItem(item.id, {
          name: catalogItem.name,
          category: catalogItem.category,
          price: catalogItem.price,
          customThumbnail: catalogItem.customThumbnail,
        }));
    });
    updateCatalogItem(catalogItem);
  }, [actions, layout.floors]);

  const removeSelected = useCallback(() => {
    if (allSelectedIds.size === 0) return;
    // Locked items survive a group delete — the same immunity the single-item
    // Delete gate gives them (#115).
    const remaining = activeFloor.items.filter((item) => !allSelectedIds.has(item.id) || item.locked);
    if (remaining.length === activeFloor.items.length) return;
    actions.replaceItems(remaining);
    setSelectedItemId(null);
    setExtraSelectedIds(new Set());
  }, [actions, activeFloor.items, allSelectedIds]);

  // Duplicate the current selection. For a multi-select every selected item is
  // copied (each offset by the reducer) and the copies become the new
  // selection, so the result is a clean set of duplicates rather than one new
  // copy mixed in with the stale originals' ids.
  const duplicateSelected = useCallback(
    (primaryId: string) => {
      if (allSelectedIds.size > 1 && allSelectedIds.has(primaryId)) {
        // Duplicate the primary first so it becomes the new primary, then the
        // remaining selected items in a stable order.
        const others = Array.from(allSelectedIds).filter((id) => id !== primaryId);
        const newPrimary = actions.duplicateItem(primaryId);
        const newExtras = others.map((id) => actions.duplicateItem(id));
        setSelectedItemId(newPrimary);
        setExtraSelectedIds(new Set(newExtras));
        return;
      }
      const newId = actions.duplicateItem(primaryId);
      setSelectedItemId(newId);
      // Clear stale extras so the selection is only the fresh copy.
      setExtraSelectedIds(new Set());
    },
    [actions, allSelectedIds]
  );

  const history = useHistory(layout, useCallback(
    (snapshot: RoomLayout) => {
      actions.applyLayout(snapshot);
    },
    [actions]
  ));

  // Undo is scoped to the current editor surface. A snapshot created in the
  // 3D editor must not be replayed while the user is working in 2D (and vice
  // versa), because both views share the same layout state.
  const historyViewRef = useRef(view.view2D);
  useEffect(() => {
    if (historyViewRef.current === view.view2D) return;
    historyViewRef.current = view.view2D;
    history.clear();
  }, [view.view2D, history]);

  const { lastSavedAt, saving: isSaving, saveError } = useLayoutPersistence({
    layout,
    onHydrate: useCallback(
      (saved: RoomLayout) => {
        actions.applyLayout(saved);
        selectOnly(null);
        history.clear();
      },
      [actions, history, selectOnly]
    ),
  });

  const selectedItem = useMemo(
    () => (selectedItemId ? activeFloor.items.find((item) => item.id === selectedItemId) ?? null : null),
    [activeFloor.items, selectedItemId]
  );

  const hasSignalItems = useMemo(
    () => activeFloor.items.some((item) => item.isWiFiAccessPoint || item.isCCTV),
    [activeFloor.items]
  );

  const { snapPosition, getDragPlaneY, placeCatalogItem } = useItemPlacement({
    activeFloor,
    activeFloorY,
    roomWidth: placementFootprint.width,
    roomDepth: placementFootprint.depth,
    actions,
    view,
  });

  const { isReady, error, invalidate, requestShadowUpdate, threeModuleRef, sceneRef, rendererRef, cameraRef, controlsRef, worldPositionFromClient } =
    useThreeScene({
      canvasRef,
      walkthroughActive,
      onItemSelect: handleSelect,
      onLightToggle: toggleLight,
      onCurtainToggle: toggleCurtain,
      toggleLightOnSelect: gameMode === 'live',
      onItemDragStart: handleDragStart,
      onItemDrag: handleDrag,
      onItemDragEnd: handleDragEnd,
      onItemHover: setHover,
      onEmptyClick: handleEmptyClick,
      onWallSelect: ({ wallId, kind }) => {
        setSelectedWall({ id: wallId, kind });
      },
      // Only track the floor pointer while wall-draw mode consumes it — the
      // handler writes React state per mousemove, re-rendering the whole tree,
      // and the hook skips the floor raycast when the handler is absent.
      onFloorPointerMove: view.drawWallMode ? handleFloorPointerMove : undefined,
      onFloorPointerLeave: handleFloorPointerLeave,
      snapPosition,
      getDragPlaneY,
    });

  sceneBoxRef.current = sceneRef;
  invalidateBoxRef.current = invalidate;

  liveLightToggleRef.current = useCallback((id: string) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const group = scene.children.find(
      (child) => child.userData.type === 'furniture' && child.userData.id === id
    );
    if (!group) return;
    const nextOn = group.userData.liveLightOn !== false;
    group.userData.liveLightOn = !nextOn;
    group.traverse((node) => {
      if ((node as { isLight?: boolean }).isLight) {
        const light = node as unknown as { intensity: number; userData: Record<string, unknown> };
        const baseIntensity = typeof light.userData.baseIntensity === 'number'
          ? light.userData.baseIntensity
          : light.intensity || 1;
        light.userData.baseIntensity = baseIntensity;
        light.intensity = nextOn ? 0 : baseIntensity;
      }
      const material = (node as unknown as {
        material?: { emissiveIntensity?: number; userData?: Record<string, unknown> };
      }).material;
      if (!material || material.emissiveIntensity === undefined) return;
      material.userData ??= {};
      const baseEmissive = typeof material.userData.baseEmissiveIntensity === 'number'
        ? material.userData.baseEmissiveIntensity
        : material.emissiveIntensity;
      material.userData.baseEmissiveIntensity = baseEmissive;
      material.emissiveIntensity = nextOn ? baseEmissive : 0.02;
    });
    // Floor/pendant/GLTF lamps use a shared scene-level point light rather
    // than adding another light inside every furniture group.
    scene.children.forEach((node) => {
      if (node.userData.type !== 'light:lamp' || node.userData.itemId !== id) return;
      const light = node as unknown as { intensity: number; userData: Record<string, unknown> };
      const baseIntensity = typeof light.userData.baseIntensity === 'number'
        ? light.userData.baseIntensity
        : light.intensity || 1;
      light.userData.baseIntensity = baseIntensity;
      light.intensity = nextOn ? 0 : baseIntensity;
    });
    invalidate();
  }, [invalidate, sceneRef]);

  useWalkthrough({
    enabled: isReady && walkthroughActive,
    invalidate,
    canvasRef,
    threeModuleRef,
    cameraRef,
    orbitRef: controlsRef,
    sceneRef,
    eyeHeight: possessedAvatar?.eyeHeight ?? activeFloorY + 1.6,
    roomWidth: layout.width,
    roomDepth: layout.height,
    startPosition: possessedAvatar?.position,
    startRotation: possessedAvatar?.rotation,
    avatarId: possessedAvatar?.id,
    items: activeFloor.items,
    floorY: activeFloorY,
    onAvatarExit: (id, position, rotation) => actions.updateItem(id, { position, rotation }),
    onExit: useCallback(() => {
      setView((v) => (v.walkthroughMode ? { ...v, walkthroughMode: false } : v));
      setGameMode((mode) => (mode === 'live' ? 'build' : mode));
    }, []),
  });

  useSceneEffects({
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
    digitalTwinLayers: gameMode === 'live' ? liveLayers : undefined,
    digitalTwinDevices: gameMode === 'live' ? liveDevices : undefined,
    planZoom: planCamera.zoom,
    planPanX: planCamera.panX,
    planPanY: planCamera.panY,
  });

  useDigitalTwinOverlays({
    enabled: isReady && gameMode === 'live' && !view.view2D,
    layers: liveLayers,
    threeModuleRef,
    sceneRef,
    floorY: activeFloorY,
    invalidate,
  });

  useNpcs({
    enabled: isReady && gameMode === 'live' && liveLayers.devices,
    invalidate,
    requestShadowUpdate,
    threeModuleRef,
    sceneRef,
    cameraRef,
    rendererRef,
    roomWidth: layout.width,
    roomDepth: layout.height,
    items: activeFloor.items,
    floorY: activeFloorY,
    paused: gameMode === 'live' && livePaused,
    showLabels: gameMode === 'live' ? liveLayers.labels : true,
    render3D: !view.view2D,
    priorityDeviceId: gameMode === 'live' ? selectedLiveDeviceId : null,
    onSnapshot: gameMode === 'live' ? setLiveDevices : undefined,
    onPerformance: gameMode === 'live' ? setLivePerformance : undefined,
  });

  useCameraVision({
    enabled: isReady && view.showCameraVision && !view.view2D,
    invalidate,
    threeModuleRef,
    sceneRef,
  });

  const { applyPreset, focusOn, fitToRoom } = useCameraPresets({
    cameraRef,
    controlsRef,
    invalidate,
    roomSize: Math.max(layout.width, layout.height),
    buildingHeight: layout.floors.length * FLOOR_HEIGHT_METERS,
  });

  useEffect(() => {
    const id = curtainFocusRef.current;
    if (!id) return;
    const item = activeFloor.items.find((entry) => entry.id === id);
    if (item?.position) {
      focusOn(item.position, 2.8, activeFloorY + (item.elevation ?? 0));
    }
    curtainFocusRef.current = null;
  }, [activeFloor.items, activeFloorY, focusOn]);


  const focusTrackedDevice = useCallback(
    (id: string) => {
      const npc = sceneRef.current?.children.find(
        (child) => child.userData.type === 'npc' && child.userData.rtlsId === id
      );
      if (npc) {
        focusOn({ x: npc.position.x, z: npc.position.z }, 3.0, activeFloorY);
        setSelectedLiveDeviceId(id);
        return;
      }
      const snapshot = liveDevices.find((device) => device.id === id);
      if (snapshot) {
        focusOn({ x: snapshot.x, z: snapshot.z }, 3.0, activeFloorY);
        setSelectedLiveDeviceId(id);
      }
    },
    [sceneRef, focusOn, activeFloorY, liveDevices]
  );

  const toggleLiveLayer = useCallback(
    (key: keyof DigitalTwinLayerState) => {
      const next = !liveLayers[key];
      setLiveLayers((current) => ({ ...current, [key]: next }));
      if (key === 'cameras') setView((current) => ({ ...current, showCameraVision: next }));
      if (key === 'signals') setView((current) => ({ ...current, showWiFiSignals: next }));
      if (key === 'heatmap') setView((current) => ({ ...current, showHeatmap: next }));
    },
    [liveLayers]
  );

  useEffect(() => {
    if (gameMode === 'live') return;
    setLivePaused(false);
    setSelectedLiveDeviceId(null);
    setLiveDevices([]);
    setLivePerformance({ fps: 0, total: 0, visible: 0, fullAvatars: 0, proxyAvatars: 0, hidden: 0, drawCalls: 0, triangles: 0 });
    setView((current) => {
      if (!current.showCameraVision && !current.showWiFiSignals && !current.showHeatmap) return current;
      return { ...current, showCameraVision: false, showWiFiSignals: false, showHeatmap: false };
    });
  }, [gameMode]);

  const { handleScreenshot, handleExportGlb, handleShareLink, handleImport } = useImportExport({
    layout,
    actions,
    view2D: view.view2D,
    canvasRef,
    canvas2DRef,
    rendererRef,
    sceneRef,
    cameraRef,
    onImported: useCallback(() => {
      // A JSON import replaces the entire layout, so any prior multi-select ids
      // now reference items that no longer exist. Clear both the primary and
      // the extra selection to avoid ghost highlights.
      setSelectedItemId(null);
      setExtraSelectedIds(new Set());
    }, []),
  });

  // Advance the time-of-day at roughly 1 in-game hour per second when on.
  useEffect(() => {
    if (!autoCycleLighting) return undefined;
    const intervalId = window.setInterval(() => {
      setView((v) => ({ ...v, timeOfDay: (v.timeOfDay + 0.25) % 24 }));
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [autoCycleLighting]);

  // Reset measurements whenever the user exits the mode.
  useEffect(() => {
    if (!view.measurementMode) setMeasurementPoints([]);
  }, [view.measurementMode]);

  const toggle = useCallback(<K extends keyof ViewSettings>(key: K) => {
    setView((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const shortcutHandlers = useMemo(
    () => ({
      removeItem: (id: string) => {
        // A multi-select delete removes the unlocked members even when the
        // primary is locked; a single locked item can't be deleted from the
        // keyboard, matching 3D drag (#115).
        if (allSelectedIds.size > 1 && allSelectedIds.has(id)) {
          removeSelected();
          return;
        }
        const item = activeFloor.items.find((entry) => entry.id === id);
        if (!item?.locked) removeItem(id);
      },
      duplicateItem: duplicateSelected,
      rotateItem: rotateItemHandler,
      rotateItemBy: (id: string, radians: number) => {
        if (allSelectedIds.size > 1 && allSelectedIds.has(id)) {
          const unlocked = unlockedSelectedIds();
          if (unlocked.size > 0) actions.rotateSelection(unlocked, radians);
          return;
        }
        const item = activeFloor.items.find((entry) => entry.id === id);
        if (!item || item.locked) return;
        const next = ((item.rotation ?? 0) + radians) % (Math.PI * 2);
        actions.setRotation(id, next);
        reseatCamera(id, next);
      },
      moveItem: (id: string, x: number, z: number) => {
        // Arrow nudges settle wall-mounted items back onto their wall the way
        // drag release does — a nudged door slides along its wall instead of
        // translating into the room as a free slab (#116).
        const item = activeFloor.items.find((entry) => entry.id === id);
        const settled = item
          ? settleWallMountedItem(item, { x, z }, layout.width, layout.height, activeFloor.interiorWalls ?? [])
          : null;
        if (settled) actions.updateItem(id, settled);
        else actions.moveItem(id, x, z);
      },
      toggle2D: () => toggle('view2D'),
      toggleMeasurements: () => toggle('showMeasurements'),
      toggleSnap: () => toggle('snapToGrid'),
      toggleSignals: () => toggle('showWiFiSignals'),
      undo: history.undo,
      redo: history.redo,
      deselect: () => {
        if (wallDraft) {
          setWallDraft(null);
          return;
        }
        setSelectedItemId(null);
        setExtraSelectedIds(new Set());
      },
      focusOnSelection: () => {
        if (selectedItem?.position) focusOn(selectedItem.position, undefined, activeFloorY);
      },
      advanceTime: (deltaHours: number) => {
        setView((v) => ({ ...v, timeOfDay: (((v.timeOfDay + deltaHours) % 24) + 24) % 24 }));
      },
      changeFloor: (delta: number) => {
        const next = activeFloorIndex + delta;
        if (next < 0 || next >= layout.floors.length) return;
        actions.setActiveFloorIndex(next);
      },
      toggleSidebar: () => setSidebarCollapsed((c) => !c),
      removeInteriorWall: (id: string) => {
        actions.removeInteriorWall(id);
        setSelectedWall(null);
      },
      // Keep the selection (and the auto-opened paint panel) after hiding an
      // exterior wall so the Wall Visibility toggles stay reachable to restore it.
      toggleExteriorWall: (id: string) => {
        actions.toggleExteriorWall(id as WallId);
      },
    }),
    [
      removeItem,
      removeSelected,
      duplicateSelected,
      allSelectedIds,
      actions,
      activeFloor.items,
      activeFloor.interiorWalls,
      activeFloorIndex,
      activeFloorY,
      layout.floors.length,
      layout.width,
      layout.height,
      unlockedSelectedIds,
      toggle,
      history.undo,
      history.redo,
      selectedItem,
      focusOn,
      rotateItemHandler,
      reseatCamera,
      wallDraft,
    ]
  );

  useKeyboardShortcuts({
    selectedItem,
    selectedWall,
    hasSignalItems,
    walkthroughActive,
    handlers: shortcutHandlers,
  });



  const roomEditorValue = useMemo<RoomEditorContextValue>(
    () => ({
      layout,
      activeFloor,
      activeFloorIndex,
      actions,
      view,
      setView,
      toggle,
      collidingIds,
      highlightedIds,
      catalogQuery,
      setCatalogQuery,
      recentColors,
      pushColor,
      playCue,
      history,
      isReady,
      error,
      gameMode,
      setGameMode,
      autoCycleLighting,
      setAutoCycleLighting,
    }),
    [
      layout, activeFloor, activeFloorIndex, actions,
      view, setView, toggle,
      collidingIds, highlightedIds, catalogQuery, setCatalogQuery,
      recentColors, pushColor, playCue,
      history, isReady, error,
      gameMode, setGameMode, autoCycleLighting, setAutoCycleLighting,
    ]
  );

  const selectionValue = useMemo<SelectionContextValue>(
    () => ({
      selectedItemId,
      setSelectedItemId,
      selectedItem,
      extraSelectedIds,
      setExtraSelectedIds,
      allSelectedIds,
      selectOnly,
    }),
    [selectedItemId, setSelectedItemId, selectedItem, extraSelectedIds, setExtraSelectedIds, allSelectedIds, selectOnly]
  );

  return (
    <RoomEditorProvider value={roomEditorValue}>
    <SelectionProvider value={selectionValue}>
    <div
      className="pc-world"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      <Viewport
        isReady={isReady}
        error={error}
        view2D={view.view2D}
        drawWallMode={view.drawWallMode}
        layout={layout}
        activeFloor={activeFloor}
        selectedItem={selectedItem}
        selectionCount={allSelectedIds.size}
        showMeasurements={view.showMeasurements}
        showMinimap={view.showMinimap}
        walkthroughActive={walkthroughActive}
        measurementDistance={measurementDistance(measurementPoints)}
        measurementPointsPlaced={view.measurementMode ? measurementPoints.length : 0}
        wallDrawStatus={
          view.drawWallMode
            ? {
                hasAnchor: wallDraft !== null,
                snapKind: wallSnapResult?.kind,
                currentLength:
                  wallDraft && wallSnapResult
                    ? Math.hypot(
                        wallSnapResult.point.x - wallDraft.x,
                        wallSnapResult.point.z - wallDraft.z
                      )
                    : null,
              }
            : null
        }
        canvasRef={canvasRef}
        canvas2DRef={canvas2DRef}
        backgroundColor={view.backgroundColor}
        backgroundImage={view.backgroundImage}
        on2DMouseDown={handle2DWallMouseDown}
        on2DClick={handle2DWallSelect}
        on2DMouseMove={(clientX, clientY) => {
          handle2DWallMouseMove(clientX, clientY);
          if (!view.drawWallMode) return;
          const canvas = canvas2DRef.current;
          const point = canvas ? worldPositionFrom2DClient(canvas, layout, clientX, clientY, { ...planCamera, allowOutside: true }) : null;
          setPointerWorld(point);
        }}
        on2DMouseUp={handle2DWallMouseUp}
        on2DMouseLeave={() => setPointerWorld(null)}
        on2DWheel={handle2DWheel}
        hover={
          hover &&
          (() => {
            const item = activeFloor.items.find((entry) => entry.id === hover.id);
            return item ? { item, clientX: hover.clientX, clientY: hover.clientY } : null;
          })()
        }
        onCatalogDrop={(clientX, clientY, payload) => {
          let item: CatalogItem | undefined;
          try {
            const parsed = JSON.parse(payload) as CatalogItem;
            if (parsed.type && parsed.name && parsed.width && parsed.depth && parsed.height) item = parsed;
          } catch {
            item = FURNITURE_CATALOG.find((entry) => entry.type === payload);
          }
          if (!item) return;
          const world = worldPositionFromClient(clientX, clientY);
          const newId = placeCatalogItem(item, world ?? undefined);
          selectOnly(newId);
        }}
        twoDPlanEditor={
          // Match BAI's floorplanner model: DRAW owns one canvas-level
          // controller. Do not mount SVG wall/item hit targets at all while
          // drawing, so an existing wall can never win the click.
          view.view2D && !view.drawWallMode ? (
            <FloorPlanEditor
              layout={layout}
              floor={activeFloor}
              selectedWallId={selectedWall?.id ?? null}
              selectedItemId={selectedItem?.id ?? null}
              planZoom={planCamera.zoom}
              planPanX={planCamera.panX}
              planPanY={planCamera.panY}
              actions={actions}
              onSelectWall={(id, kind = 'interior') => {
                setSelectedWall(id ? { id, kind } : null);
                setSelectedItemId(null);
                setExtraSelectedIds(new Set());
              }}
              onSelectItem={(id) => {
                if (id) {
                  selectOnly(id);
                  setSelectedWall(null);
                } else {
                  setSelectedItemId(null);
                  setExtraSelectedIds(new Set());
                }
              }}
              onWheel={handle2DWheel}
              onResizePan={(x, y) => setPlanCamera((current) => ({ ...current, panX: current.panX + x, panY: current.panY + y }))}
              wallDraft={wallDraft}
              pointerWorld={pointerWorld}
              onPointerMove={(clientX, clientY) => {
                handle2DWallMouseMove(clientX, clientY);
                if (!view.drawWallMode) return;
                const canvas = canvas2DRef.current;
                const point = canvas ? worldPositionFrom2DClient(canvas, layout, clientX, clientY, { ...planCamera, allowOutside: true }) : null;
                setPointerWorld(point);
              }}
              onPointerDown={handle2DWallMouseDown}
              onPointerUp={handle2DWallMouseUp}
            />
          ) : null
        }
      />

      {gameMode !== 'live' && (
        <LotBadge
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
        />
      )}

      {/* Top-center: live stats */}
      {gameMode !== 'live' && <div
        className="pc-header-stats"
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          maxWidth: 'calc(100vw - 480px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            className="pc-glass pc-glass--dark"
            style={{ padding: '8px 12px' }}
          >
            <HeaderStats
              lastSavedAt={lastSavedAt}
              saving={isSaving}
              saveError={saveError}
            />
          </div>
          <div className="pc-glass pc-glass--dark" style={{ display: 'flex', gap: 6, padding: 5, borderRadius: 12 }}>
            {view.view2D && <button
              type="button"
              className={`pc-tile${view.drawWallMode ? ' pc-tile--active' : ''}`}
              onClick={() => setView((v) => ({ ...v, drawWallMode: !v.drawWallMode }))}
              aria-pressed={view.drawWallMode}
              title="Duvar çiz"
              style={{ height: 34, padding: '0 10px', borderRadius: 9, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800 }}
            >
              <Pencil size={13} strokeWidth={2.2} />
              DUVAR ÇİZ
            </button>}
            <button type="button" className="pc-tile" onClick={history.undo} disabled={!history.canUndo} title="Geri al" style={{ width: 34, height: 34, borderRadius: 9, fontSize: 18, opacity: history.canUndo ? 1 : 0.4 }}>↶</button>
            <button type="button" className="pc-tile" onClick={history.redo} disabled={!history.canRedo} title="İleri al" style={{ width: 34, height: 34, borderRadius: 9, fontSize: 18, opacity: history.canRedo ? 1 : 0.4 }}>↷</button>
          </div>
        </div>
      </div>}

      {/* Top-right: floor pill + wall display */}
      {gameMode !== 'live' && <div
        className="pc-top-right"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        <CustomGlbUpload
          onAdd={(catalogItem) => {
            const target = controlsRef.current?.target;
            const id = placeCatalogItem(
              catalogItem,
              target ? { x: target.x, z: target.z } : undefined
            );
            if (!id) return;
            selectOnly(id);
            playCue('place');
            invalidate();
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          className="pc-glass pc-glass--dark pc-tile"
          onClick={() => setView((v) => ({ ...v, view2D: !v.view2D, drawWallMode: v.view2D ? false : v.drawWallMode, walkthroughMode: false }))}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            fontFamily: 'var(--pc-font-display)',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
          }}
        >
          {view.view2D ? '3D Görünüm' : '2D Plan'}
        </button>
        {!view.view2D && <button
          type="button"
          className={`pc-glass pc-glass--dark pc-tile${view.walkthroughMode ? ' pc-tile--active' : ''}`}
          disabled={!walkthroughActive && !(selectedItem?.position && (selectedItem.type === 'office-avatar' || selectedItem.type === 'female-office-avatar' || (selectedItem.type === 'custom-glb' && selectedItem.category === 'people')))}
          onClick={() => {
            if (walkthroughActive) {
              setView((v) => ({ ...v, walkthroughMode: false }));
              return;
            }
            if (!selectedItem?.position) return;
            setPossessedAvatar({ id: selectedItem.id, position: { ...selectedItem.position }, rotation: selectedItem.rotation ?? 0, eyeHeight: activeFloorY + (selectedItem.elevation ?? 0) + selectedItem.height * 0.93 });
            setView((v) => ({ ...v, walkthroughMode: true, drawWallMode: false }));
          }}
          aria-pressed={view.walkthroughMode}
          title="Avatarın gözünden ofiste gez"
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            fontFamily: 'var(--pc-font-display)',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Eye size={13} strokeWidth={2.2} />
          {view.walkthroughMode ? 'GEZİNTİYİ BİTİR' : 'AVATAR GÖRÜŞÜ'}
        </button>}
        {view.view2D && <button
          type="button"
          className={`hidden pc-glass pc-glass--dark pc-tile${view.drawWallMode ? ' pc-tile--active' : ''}`}
          onClick={() => setView((v) => ({ ...v, drawWallMode: !v.drawWallMode }))}
          aria-pressed={view.drawWallMode}
          title="2D planda iki tıklamayla duvar çiz"
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            fontFamily: 'var(--pc-font-display)',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Pencil size={13} strokeWidth={2.2} />
            {view.drawWallMode ? 'DUVARI BİTİR' : 'DUVAR ÇİZ'}
          </span>
        </button>}
        <div className="pc-top-right-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="pc-glass pc-glass--dark pc-tile"
            onClick={() => {
              setGameMode('live');
              setView((v) => ({ ...v, view2D: false, walkthroughMode: false, showNpcs: true }));
            }}
            style={{ padding: '8px 12px', borderRadius: 10, fontFamily: 'var(--pc-font-display)', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}
          >
            RTLS CANLI
          </button>
          <button type="button" className="pc-glass pc-glass--dark pc-tile" onClick={history.undo} disabled={!history.canUndo} title="Geri al" style={{ width: 34, height: 34, borderRadius: 9, fontSize: 18, opacity: history.canUndo ? 1 : 0.4 }}>↶</button>
          <button type="button" className="pc-glass pc-glass--dark pc-tile" onClick={history.redo} disabled={!history.canRedo} title="İleri al" style={{ width: 34, height: 34, borderRadius: 9, fontSize: 18, opacity: history.canRedo ? 1 : 0.4 }}>↷</button>
        </div>
        </div>
        <FloorPill />
        <WallDisplayPill />
        <ModePanel
          onSetMode={(mode) => {
            setGameMode(mode);
            if (mode === 'live') {
              setView((v) => ({ ...v, view2D: false, walkthroughMode: false, showNpcs: true }));
            } else {
              setView((v) => ({ ...v, walkthroughMode: false, showNpcs: false }));
            }
          }}
          onSurprise={() => undefined}
        />
      </div>}

      {gameMode === 'live' && (
        <button
          type="button"
          className="pc-glass pc-glass--dark pc-tile"
          onClick={() => {
            setGameMode('build');
            setView((v) => ({ ...v, view2D: false, walkthroughMode: false, showNpcs: false }));
          }}
          style={{
            position: 'absolute',
            top: 128,
            right: 16,
            zIndex: 60,
            padding: '10px 14px',
            borderRadius: 10,
            fontFamily: 'var(--pc-font-display)',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
          }}
        >
          DÜZENLEMEYE DÖN
        </button>
      )}

      {/* Selection popover lives on the right edge */}
      {gameMode !== 'live' && !walkthroughActive && selectedItem && (
        <ItemContextPopover
          hasCollision={hasCollisions(
            selectedItem,
            activeFloor.items,
            placementFootprint.width,
            placementFootprint.depth
          )}
          onRotate={(id: string) => {
            rotateItemHandler(id);
            playCue('rotate');
          }}
          onToggleCameraBracket={toggleCameraBracket}
          onDuplicate={duplicateSelected}
          onRemove={removeItem}
          onClose={() => {
            setSelectedItemId(null);
            setExtraSelectedIds(new Set());
          }}
        />
      )}

      {gameMode === 'live' && (
        <TwinzoLiveHud
          layoutName={layout.name}
          floorName={activeFloor.name}
          view2D={view.view2D}
          layers={liveLayers}
          devices={liveDevices}
          selectedDeviceId={selectedLiveDeviceId}
          paused={livePaused}
          performance={livePerformance}
          measurementActive={view.measurementMode}
          onToggleView={() => setView((current) => ({ ...current, view2D: !current.view2D, walkthroughMode: false }))}
          onToggleLayer={toggleLiveLayer}
          onSelectDevice={setSelectedLiveDeviceId}
          onFocusDevice={focusTrackedDevice}
          onFit={fitToRoom}
          onTogglePaused={() => setLivePaused((current) => !current)}
          onToggleMeasurement={() => setView((current) => ({ ...current, measurementMode: !current.measurementMode }))}
        />
      )}

      <BottomHud
        selectedWall={selectedWall}
        onSelectedWallChange={setSelectedWall}
        onOrbit={(direction) => {
          const THREE = threeModuleRef.current;
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          if (THREE && camera && controls)
            orbitCamera(THREE, camera, controls, direction);
        }}
        onZoom={(direction) => {
          if (view.view2D) {
            setPlanCamera((current) => ({
              ...current,
              zoom: Math.max(0.5, Math.min(4, current.zoom * (direction === '+' ? 1.12 : 0.89))),
            }));
            return;
          }
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          if (camera && controls) zoomCamera(camera, controls, direction);
        }}
        onFit={fitToRoom}
        onRemoveCatalogItem={removeCatalogItemAndPlacements}
        onUpdateCatalogItem={updateCatalogItemAndPlacements}
        placeCatalogItem={placeCatalogItem}
      />

      {/* Touch mode toggle — visible on mobile only */}
      {gameMode !== 'live' && <TouchModeToggle controlsRef={controlsRef} isReady={isReady} onFit={fitToRoom} />}

      {/* Welcome modal — auto-shows once, dismissible */}
      {gameMode !== 'live' && <WelcomeBanner />}

      {gameMode !== 'live' && (
        <SidebarDrawer
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed(true)}
          onApplyPreset={applyPreset}
          onFitToRoom={fitToRoom}
          onScreenshot={handleScreenshot}
          onImport={handleImport}
          onExportGlb={handleExportGlb}
          onShareLink={handleShareLink}
          placeCatalogItem={placeCatalogItem}
          removeItem={removeItem}
          onRemoveCatalogItem={removeCatalogItemAndPlacements}
          onUpdateCatalogItem={updateCatalogItemAndPlacements}
        />
      )}
    </div>
    </SelectionProvider>
    </RoomEditorProvider>
  );
}

export default RoomOrganizer;
