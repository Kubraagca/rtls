import { useCallback, useRef, type MutableRefObject } from 'react';
import { hasCollisions } from '../lib/geometry';
import { isOpening, snapOpeningToWall, settleWallMountedItem } from '../lib/opening-snap';
import type { LayoutActions } from './use-layout-state';
import type { FloorLayout } from '../lib/types';
import type * as ThreeNS from 'three';

export interface UseItemDragParams {
  activeFloor: FloorLayout;
  activeFloorIndex: number;
  roomWidth: number;
  roomDepth: number;
  interiorWalls: FloorLayout['interiorWalls'];
  boundaryWalls: FloorLayout['interiorWalls'];
  actions: LayoutActions;
  allSelectedIds: ReadonlySet<string>;
}

export interface UseItemDragResult {
  /**
   * useThreeScene is called after this hook (its options include the drag
   * callbacks below), so its scene ref and invalidate fn are late-bound
   * through these boxes for use in the fast-path helpers.
   */
  sceneBoxRef: MutableRefObject<MutableRefObject<ThreeNS.Scene | null> | null>;
  invalidateBoxRef: MutableRefObject<() => void>;
  handleDragStart(primaryId: string): void;
  handleDrag(id: string, x: number, z: number): boolean;
  handleDragEnd(id: string): void;
}

/**
 * Drag fast-path. While a drag is in progress the Three.js groups are moved
 * directly and the single state dispatch is deferred to drag end —
 * dispatching per mousemove (the old behaviour) tore down and rebuilt every
 * furniture mesh on each pointer event. `origins` snapshots the selection's
 * starting positions for group drags; `latest` accumulates in-flight
 * positions and becomes one bulkSetPositions on release (which also gives
 * undo a single entry per gesture instead of one per mousemove).
 */
// True if any entry's latest position differs from its origin. A pure
// click-select (or any gesture with no net movement) leaves latest === origins,
// which must not commit state or lock the item.
function sessionMoved(
  origins: Map<string, { x: number; z: number }>,
  latest: Map<string, { x: number; z: number }>
): boolean {
  const EPS = 1e-4;
  for (const [id, origin] of origins) {
    const now = latest.get(id);
    if (!now) continue;
    if (Math.abs(now.x - origin.x) > EPS || Math.abs(now.z - origin.z) > EPS) {
      return true;
    }
  }
  return false;
}

export function useItemDrag({
  activeFloor,
  activeFloorIndex,
  roomWidth,
  roomDepth,
  interiorWalls,
  boundaryWalls,
  actions,
  allSelectedIds,
}: UseItemDragParams): UseItemDragResult {
  const sceneBoxRef = useRef<MutableRefObject<ThreeNS.Scene | null> | null>(null);
  const invalidateBoxRef = useRef<() => void>(() => {});

  const dragSessionRef = useRef<{
    primaryId: string;
    origins: Map<string, { x: number; z: number }>;
    latest: Map<string, { x: number; z: number }>;
  } | null>(null);

  const findFurnitureGroup = useCallback(
    (itemId: string) =>
      sceneBoxRef.current?.current?.children.find(
        (obj) =>
          obj.userData.type === 'furniture' &&
          obj.userData.id === itemId &&
          obj.userData.floorIndex === activeFloorIndex
      ) ?? null,
    [activeFloorIndex]
  );

  // Live collision feedback during the fast-path: tint the dragged group's
  // emissive channel instead of rebuilding its meshes. Original emissive
  // values (lamp glow, TV screens) are stashed on material.userData and
  // restored on release.
  const setDragCollisionTint = useCallback((group: ThreeNS.Object3D, colliding: boolean) => {
    // Collision detection remains active, but overlapping furniture keeps its
    // original material instead of receiving a red drag tint.
    void group;
    void colliding;
  }, []);

  const handleDragStart = useCallback(
    (primaryId: string) => {
      const ids = allSelectedIds.size > 1 ? allSelectedIds : new Set([primaryId]);
      const origins = new Map<string, { x: number; z: number }>();
      for (const id of ids) {
        const item = activeFloor.items.find((entry) => entry.id === id);
        if (!item?.position) continue;
        // Locked co-selected items stay put during a group drag — only the
        // session's members are translated and committed (#115). The primary
        // is always unlocked: the canvas handler refuses to start a drag on a
        // locked item.
        if (item.locked && id !== primaryId) continue;
        origins.set(id, { x: item.position.x, z: item.position.z });
      }
      dragSessionRef.current = { primaryId, origins, latest: new Map(origins) };
    },
    [allSelectedIds, activeFloor.items]
  );

  const handleDrag = useCallback(
    (id: string, x: number, z: number): boolean => {
      const session = dragSessionRef.current;
      if (!session || session.primaryId !== id) {
        // No drag session (programmatic move) — dispatch directly.
        return false;
      }
      const nextLatest = new Map(session.latest);
      nextLatest.set(id, { x, z });

      // Group drag: translate every other selected group by the same delta.
      // The primary group was already moved by the canvas drag handler.
      const primaryOrigin = session.origins.get(id);
      if (primaryOrigin && session.origins.size > 1) {
        const dx = x - primaryOrigin.x;
        const dz = z - primaryOrigin.z;
        for (const [otherId, origin] of session.origins) {
          if (otherId === id) continue;
          const next = { x: origin.x + dx, z: origin.z + dz };
          nextLatest.set(otherId, next);
        }
      }

      const candidateItems = activeFloor.items.map((item) => {
        const moved = nextLatest.get(item.id);
        if (!moved) return item;
        if (isOpening(item.type)) {
          const snapped = snapOpeningToWall({ position: moved, itemWidth: item.width, roomWidth, roomDepth,
            interiorWalls, boundaryWalls });
          nextLatest.set(item.id, snapped.position);
          return { ...item, position: snapped.position, rotation: snapped.rotation };
        }
        return { ...item, position: moved };
      });
      session.latest = nextLatest;
      for (const item of candidateItems) {
        if (nextLatest.has(item.id) && isOpening(item.type)) {
          const group = findFurnitureGroup(item.id);
          if (group) group.rotation.y = item.rotation ?? 0;
        }
      }
      for (const [otherId, next] of nextLatest) {
        if (otherId === id) continue;
        const group = findFurnitureGroup(otherId);
        if (group) {
          group.position.x = next.x;
          group.position.z = next.z;
        }
      }

      const dragged = candidateItems.find((item) => item.id === id);
      const primaryGroup = findFurnitureGroup(id);
      if (dragged && primaryGroup) {
        setDragCollisionTint(primaryGroup, hasCollisions(dragged, candidateItems, roomWidth, roomDepth, interiorWalls ?? [], boundaryWalls ?? []));
      }
      invalidateBoxRef.current();
      return true;
    },
    [actions, activeFloor.items, roomWidth, roomDepth, interiorWalls, boundaryWalls, findFurnitureGroup, setDragCollisionTint]
  );

  const handleDragEnd = useCallback(
    (id: string) => {
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      const finalPos = session?.latest.get(id);
      // A gesture that never actually moved anything (a stray zero-distance
      // drag) must not write state or add an undo entry, and must not re-lock
      // the item — otherwise a click silently blocks the next nudge/delete
      // (see #65). A real drag always leaves at least one position changed.
      const moved = session ? sessionMoved(session.origins, session.latest) : false;
      if (session && finalPos && moved) {
        const primaryGroup = findFurnitureGroup(id);
        if (primaryGroup) setDragCollisionTint(primaryGroup, false);
        // Single dispatch for the whole gesture; the rebuild effect runs once.
        actions.bulkSetPositions(session.latest);
      }
      if (!moved || !session) return;
      // moved — previously only the primary was locked, so co-dragged items
      // On release, settle every wall-mounted item in the commit — doors and
      // windows re-snap their position AND wall-aligned rotation (a drag to a
      // different wall otherwise keeps the stale rotation, #62; a group drag
      // otherwise strands them mid-room, #116), and cameras additionally
      // record the wall's inward-normal yaw and re-seat for their mount
      // style. Doing this on drop (not per drag frame) keeps the drag itself
      // smooth instead of flipping between walls. Note: read positions from
      // the drag session — state is one dispatch behind here.
      for (const [movedId, releasePos] of session.latest) {
        const item = activeFloor.items.find((entry) => entry.id === movedId);
        if (!item) continue;
        const settled = settleWallMountedItem(
          item,
          releasePos,
          roomWidth,
          roomDepth,
          activeFloor.interiorWalls ?? [],
          boundaryWalls ?? []
        );
        if (settled) actions.updateItem(movedId, settled);
      }
    },
    [activeFloor.items, activeFloor.interiorWalls, boundaryWalls, roomWidth, roomDepth, actions, findFurnitureGroup, setDragCollisionTint]
  );

  return { sceneBoxRef, invalidateBoxRef, handleDragStart, handleDrag, handleDragEnd };
}
