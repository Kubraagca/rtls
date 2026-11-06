'use client';

import { useEffect, useRef, useState } from 'react';
import type { LayoutActions } from '../hooks/use-layout-state';
import type { FloorLayout, InteriorWall, RoomLayout } from '../lib/types';

interface FloorPlanEditorProps {
  layout: RoomLayout;
  floor: FloorLayout;
  activeFloorIndex?: number;
  selectedWallId: string | null;
  selectedItemId: string | null;
  planZoom?: number;
  planPanX?: number;
  planPanY?: number;
  actions: LayoutActions;
  onSelectWall(id: string | null, kind?: 'exterior' | 'interior'): void;
  onSelectItem(id: string | null): void;
  /** Hover is independent of selection so plans can show a model preview. */
  onItemHover?(id: string | null, clientX: number, clientY: number): void;
  onAreaSelect?(ids: string[]): void;
  onWheel?(deltaY: number, clientX: number, clientY: number): void;
  onResizePan?(x: number, y: number): void;
  wallDraft?: { x: number; z: number } | null;
  pointerWorld?: { x: number; z: number } | null;
  onPointerMove?(clientX: number, clientY: number): void;
  onPointerDown?(clientX: number, clientY: number): void;
  onPointerUp?(): void;
  onContextMenu?(clientX: number, clientY: number, surface?: { kind: 'wall'; id: string; wallKind: 'exterior' | 'interior' } | { kind: 'floor' }): void;
  drawWallMode?: boolean;
  snapPosition?(id: string, x: number, z: number): { x: number; z: number };
  /** Resolve a dragged wall endpoint onto a nearby junction. */
  snapWallEndpoint?(wallId: string, endpoint: 'start' | 'end', x: number, z: number): { x: number; z: number };
}

type DragState = { kind: 'wall'; wall: InteriorWall; x: number; y: number } | { kind: 'endpoint'; wall: InteriorWall; endpoint: 'start' | 'end'; x: number; y: number } | { kind: 'item'; id: string; x: number; y: number } | { kind: 'edge'; edge: 'north' | 'south' | 'east' | 'west'; x: number; y: number } | null;
type PendingWallUpdate = { id: string; wall: InteriorWall; exterior: boolean };
type Endpoint = 'start' | 'end';
type Coordinate = 'x' | 'z';

/** Transparent interaction layer over the shared canvas renderer and 3D model previews. */
export function FloorPlanEditor({ layout, floor, activeFloorIndex = 0, selectedWallId, selectedItemId, planZoom = 1, planPanX = 0, planPanY = 0, actions, onSelectWall, onSelectItem, onItemHover, onAreaSelect, onWheel, onResizePan, wallDraft, pointerWorld, onPointerMove, onPointerDown, onPointerUp, onContextMenu, drawWallMode, snapPosition, snapWallEndpoint }: FloorPlanEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const itemPositionRef = useRef<{ x: number; z: number } | null>(null);
  const wallFrameRef = useRef<number | null>(null);
  const pendingWallUpdateRef = useRef<PendingWallUpdate | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [areaStart, setAreaStart] = useState<{ x: number; y: number } | null>(null);
  const [areaEnd, setAreaEnd] = useState<{ x: number; y: number } | null>(null);
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const [coordinateDrafts, setCoordinateDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setSize({ width: host.clientWidth, height: host.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // Coordinate text belongs to a specific wall. Do not carry a previous
    // wall's draft values into the next selection.
    setCoordinateDrafts({});
  }, [selectedWallId]);
  const flushWallUpdate = () => {
    if (wallFrameRef.current !== null) {
      window.cancelAnimationFrame(wallFrameRef.current);
      wallFrameRef.current = null;
    }
    const update = pendingWallUpdateRef.current;
    pendingWallUpdateRef.current = null;
    if (!update) return;
    if (update.exterior) actions.updateBoundaryWall(update.id, update.wall);
    else actions.updateInteriorWall(update.id, update.wall);
  };
  const queueWallUpdate = (wall: InteriorWall) => {
    pendingWallUpdateRef.current = { id: wall.id, wall, exterior: wall.id.startsWith('outer-') };
    if (wallFrameRef.current !== null) return;
    wallFrameRef.current = window.requestAnimationFrame(() => {
      wallFrameRef.current = null;
      const update = pendingWallUpdateRef.current;
      pendingWallUpdateRef.current = null;
      if (!update) return;
      if (update.exterior) actions.updateBoundaryWall(update.id, update.wall);
      else actions.updateInteriorWall(update.id, update.wall);
    });
  };
  const scale = Math.max(0.1, Math.min((size.width - 120) / layout.width, (size.height - 120) / layout.height) * planZoom);
  const ox = (size.width - layout.width * scale) / 2 + planPanX;
  const oy = (size.height - layout.height * scale) / 2 + planPanY;
  const sx = (x: number) => ox + (x + layout.width / 2) * scale;
  const sy = (z: number) => oy + (z + layout.height / 2) * scale;
  const planItems = floor.items;
  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = hostRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const start = (event: React.PointerEvent<SVGElement>, drag: Exclude<DragState, null>) => {
    event.stopPropagation(); event.preventDefault();
    if (event.button !== 0) return;
    if (drag.kind === 'item') {
      const item = planItems.find((entry) => entry.id === drag.id);
      if (item?.locked || !item?.position) return;
      itemPositionRef.current = { ...item.position };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY } as DragState;
  };
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    if (areaStart) {
      setAreaEnd(localPoint(event));
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.x) / scale;
    const dz = (event.clientY - drag.y) / scale;
    drag.x = event.clientX; drag.y = event.clientY;
    if (drag.kind === 'wall') {
      drag.wall = { ...drag.wall, x1: drag.wall.x1 + dx, z1: drag.wall.z1 + dz, x2: drag.wall.x2 + dx, z2: drag.wall.z2 + dz };
      queueWallUpdate(drag.wall);
    } else if (drag.kind === 'endpoint') {
      const raw = drag.endpoint === 'start'
        ? { x: drag.wall.x1 + dx, z: drag.wall.z1 + dz }
        : { x: drag.wall.x2 + dx, z: drag.wall.z2 + dz };
      // Endpoint editing is deliberately freeform. Automatically snapping to
      // a nearby junction made it impossible to move a connected endpoint by
      // even a few millimetres. Hold Shift when an intentional junction/grid
      // snap is wanted; Alt remains an explicit freeform override.
      const next = event.shiftKey && !event.altKey
        ? (snapWallEndpoint?.(drag.wall.id, drag.endpoint, raw.x, raw.z) ?? raw)
        : raw;
      drag.wall = drag.endpoint === 'start'
        ? { ...drag.wall, x1: next.x, z1: next.z }
        : { ...drag.wall, x2: next.x, z2: next.z };
      queueWallUpdate(drag.wall);
    }
    else if (drag.kind === 'item') {
      const position = itemPositionRef.current;
      if (position) {
        // Keep an unsnapped accumulator so slow movements can cross grid cells.
        position.x += dx; position.z += dz;
        const next = snapPosition?.(drag.id, position.x, position.z) ?? position;
        actions.moveItem(drag.id, next.x, next.z);
      }
    }
    else if (drag.edge === 'east' || drag.edge === 'west') {
      const deltaWidth = (drag.edge === 'east' ? dx : -dx) * 2;
      const nextWidth = Math.max(1, layout.width + deltaWidth);
      const actualDelta = nextWidth - layout.width;
      // Keep the opposite edge fixed. Coordinates are relative to the room
      // centre, so the contents shift by half the resize amount.
      actions.resizeRoom(nextWidth, layout.height, drag.edge === 'east' ? -actualDelta / 2 : actualDelta / 2, 0);
      onResizePan?.((drag.edge === 'east' ? 1 : -1) * actualDelta * scale / 2, 0);
    } else {
      const deltaHeight = (drag.edge === 'south' ? dz : -dz) * 2;
      const nextHeight = Math.max(1, layout.height + deltaHeight);
      const actualDelta = nextHeight - layout.height;
      actions.resizeRoom(layout.width, nextHeight, 0, drag.edge === 'south' ? -actualDelta / 2 : actualDelta / 2);
      onResizePan?.(0, (drag.edge === 'south' ? 1 : -1) * actualDelta * scale / 2);
    }
  };
  const outerWalls: InteriorWall[] = layout.boundaryWalls ?? [
    { id: 'outer-north', x1: -layout.width / 2, z1: -layout.height / 2, x2: layout.width / 2, z2: -layout.height / 2 },
    { id: 'outer-east', x1: layout.width / 2, z1: -layout.height / 2, x2: layout.width / 2, z2: layout.height / 2 },
    { id: 'outer-south', x1: layout.width / 2, z1: layout.height / 2, x2: -layout.width / 2, z2: layout.height / 2 },
    { id: 'outer-west', x1: -layout.width / 2, z1: layout.height / 2, x2: -layout.width / 2, z2: -layout.height / 2 },
  ];
  const selectedWall = selectedWallId
    ? [...outerWalls, ...(floor.interiorWalls ?? [])].find((wall) => wall.id === selectedWallId) ?? null
    : null;
  const updateWall = (wall: InteriorWall, patch: Partial<InteriorWall>) => {
    if (wall.id.startsWith('outer-')) actions.updateBoundaryWall(wall.id, patch);
    else actions.updateInteriorWall(wall.id, patch);
  };
  const coordinateKey = (endpoint: Endpoint, coordinate: Coordinate) => `${endpoint}-${coordinate}`;
  const endpointCoordinate = (wall: InteriorWall, endpoint: Endpoint, coordinate: Coordinate) =>
    endpoint === 'start'
      ? (coordinate === 'x' ? wall.x1 : wall.z1)
      : (coordinate === 'x' ? wall.x2 : wall.z2);
  const setEndpointCoordinate = (wall: InteriorWall, endpoint: Endpoint, coordinate: Coordinate, value: string) => {
    const key = coordinateKey(endpoint, coordinate);
    setCoordinateDrafts((current) => ({ ...current, [key]: value }));
    if (value.trim() === '') return;
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    updateWall(wall, endpoint === 'start'
      ? (coordinate === 'x' ? { x1: next } : { z1: next })
      : (coordinate === 'x' ? { x2: next } : { z2: next }));
  };
  const resetCoordinateDraft = (wall: InteriorWall, endpoint: Endpoint, coordinate: Coordinate) => {
    const key = coordinateKey(endpoint, coordinate);
    setCoordinateDrafts((current) => ({
      ...current,
      [key]: endpointCoordinate(wall, endpoint, coordinate).toFixed(3),
    }));
  };
  const nudgeEndpoint = (wall: InteriorWall, endpoint: Endpoint, dx: number, dz: number) => {
    updateWall(wall, endpoint === 'start'
      ? { x1: wall.x1 + dx, z1: wall.z1 + dz }
      : { x2: wall.x2 + dx, z2: wall.z2 + dz });
  };
  const straightenWall = (wall: InteriorWall) => {
    const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.z2 - wall.z1);
    updateWall(wall, horizontal ? { z2: wall.z1 } : { x2: wall.x1 });
  };
  const setWallAxis = (wall: InteriorWall, axis: 'horizontal' | 'vertical') => {
    updateWall(wall, axis === 'horizontal' ? { z2: wall.z1 } : { x2: wall.x1 });
  };
  const handleEndpointKeyDown = (event: React.KeyboardEvent<SVGCircleElement>, wall: InteriorWall, endpoint: Endpoint) => {
    const directions: Record<string, { x: number; z: number }> = {
      ArrowLeft: { x: -1, z: 0 },
      ArrowRight: { x: 1, z: 0 },
      ArrowUp: { x: 0, z: -1 },
      ArrowDown: { x: 0, z: 1 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.01 : 0.001;
    nudgeEndpoint(wall, endpoint, direction.x * step, direction.z * step);
  };
  const finishArea = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!areaStart) return;
    const end = localPoint(event);
    const minX = Math.min(areaStart.x, end.x);
    const maxX = Math.max(areaStart.x, end.x);
    const minY = Math.min(areaStart.y, end.y);
    const maxY = Math.max(areaStart.y, end.y);
    const ids = planItems.filter((item) => {
      if (!item.position) return false;
      const x = sx(item.position.x);
      const y = sy(item.position.z);
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }).map((item) => item.id);
    setAreaStart(null);
    setAreaEnd(null);
    onAreaSelect?.(ids);
  };
  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    finishArea(event);
    flushWallUpdate();
    dragRef.current = null;
    itemPositionRef.current = null;
    onPointerUp?.();
  };

  return <div ref={hostRef} className="pc-2d-editor" style={{ position: 'absolute', inset: 0, zIndex: 7 }}>
    {selectedWall && (
    <div className="pc-2d-toolbar" aria-label="2D plan araçları">
      <div className="pc-2d-toolbar__title"><span className="pc-2d-toolbar__dot" />2D PLAN</div>
      {layout.floors.length > 1 && <span style={{ display: 'inline-flex', gap: 3, pointerEvents: 'auto' }}>
        {layout.floors.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => actions.setActiveFloorIndex(index)}
            aria-label={`${entry.name} katına geç`}
            aria-pressed={index === activeFloorIndex}
            title={`${entry.name} · ${entry.items.length} eşya`}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              border: index === activeFloorIndex ? '1px solid #0891b2' : '1px solid #d6dce0',
              background: index === activeFloorIndex ? '#0891b2' : '#fff',
              color: index === activeFloorIndex ? '#fff' : '#52606a',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {index + 1}
          </button>
        ))}
      </span>}
      <div className="pc-2d-toolbar__divider" />
      <span className="pc-2d-toolbar__meta">{layout.width.toFixed(1)} × {layout.height.toFixed(1)} m</span>
      <span className="pc-2d-toolbar__hint">Sürükle · Seç · Düzenle</span>
      {selectedWall && <>
        <div className="pc-2d-toolbar__divider" />
        <button
          type="button"
          className="pc-2d-precision-toggle"
          aria-expanded={precisionOpen}
          onClick={() => {
            setCoordinateDrafts({});
            setPrecisionOpen((open) => !open);
          }}
        >
          Hassas ±1 mm
        </button>
        <button
          type="button"
          className="pc-2d-precision-toggle"
          onClick={() => straightenWall(selectedWall)}
          title="Duvarı baskın eksenine göre yatay veya dikey hizala"
        >
          Düzleştir
        </button>
        {precisionOpen && <div className="pc-2d-precision" aria-label="Duvar uç noktası hassas düzenleme">
          <span className="pc-2d-precision__title">Uç noktalar (metre)</span>
          {(['start', 'end'] as const).map((endpoint) => <div key={endpoint} className="pc-2d-precision__row">
            <span>{endpoint === 'start' ? 'Başlangıç' : 'Bitiş'}</span>
            {(['x', 'z'] as const).map((coordinate) => {
              const key = coordinateKey(endpoint, coordinate);
              const value = coordinateDrafts[key] ?? endpointCoordinate(selectedWall, endpoint, coordinate).toFixed(3);
              return <label key={key}>
                {coordinate.toUpperCase()}
                <input
                  aria-label={`${endpoint === 'start' ? 'Başlangıç' : 'Bitiş'} ${coordinate.toUpperCase()} koordinatı`}
                  type="number"
                  step="0.001"
                  value={value}
                  onChange={(event) => setEndpointCoordinate(selectedWall, endpoint, coordinate, event.target.value)}
                  onBlur={() => resetCoordinateDraft(selectedWall, endpoint, coordinate)}
                />
              </label>;
            })}
          </div>)}
          <div style={{ display: 'flex', gap: 5 }}>
            <button type="button" className="pc-2d-precision-toggle" onClick={() => setWallAxis(selectedWall, 'horizontal')}>Yatay</button>
            <button type="button" className="pc-2d-precision-toggle" onClick={() => setWallAxis(selectedWall, 'vertical')}>Dikey</button>
          </div>
          <span className="pc-2d-precision__hint">Ok tuşları: 1 mm · Shift + ok: 1 cm · Shift + sürükle: yakala.</span>
        </div>}
      </>}
    </div>
    )}
    {size.width > 0 && <svg width={size.width} height={size.height} style={{ width: '100%', height: '100%', touchAction: 'none', pointerEvents: drawWallMode ? 'none' : 'auto' }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!drawWallMode) onContextMenu?.(event.clientX, event.clientY); }} onWheel={(event) => { event.preventDefault(); onWheel?.(event.deltaY, event.clientX, event.clientY); }} onPointerMove={(event) => { onPointerMove?.(event.clientX, event.clientY); move(event); }} onPointerLeave={(event) => onItemHover?.(null, event.clientX, event.clientY)} onPointerUp={endPointer} onPointerCancel={() => { setAreaStart(null); setAreaEnd(null); flushWallUpdate(); dragRef.current = null; itemPositionRef.current = null; onPointerUp?.(); }} onPointerDownCapture={(event) => { if (event.button !== 0) { event.preventDefault(); return; } if (event.altKey && event.target === event.currentTarget && !drawWallMode && onAreaSelect) { event.preventDefault(); event.stopPropagation(); const point = localPoint(event); setAreaStart(point); setAreaEnd(point); event.currentTarget.setPointerCapture(event.pointerId); return; } if (!drawWallMode) return; event.preventDefault(); event.stopPropagation(); onPointerDown?.(event.clientX, event.clientY); }} onPointerDown={(event) => { if (event.button !== 0 || drawWallMode || areaStart) return; onPointerDown?.(event.clientX, event.clientY); onSelectWall(null); onSelectItem(null); }}>
      {areaStart && areaEnd && <rect x={Math.min(areaStart.x, areaEnd.x)} y={Math.min(areaStart.y, areaEnd.y)} width={Math.abs(areaEnd.x - areaStart.x)} height={Math.abs(areaEnd.y - areaStart.y)} fill="rgba(25,198,209,.16)" stroke="#19c6d1" strokeDasharray="6 4" pointerEvents="none" />}
      {wallDraft && pointerWorld && <>
        <line x1={sx(wallDraft.x)} y1={0} x2={sx(wallDraft.x)} y2={size.height} stroke="#22b8ff" strokeWidth="1" strokeDasharray="5 5" pointerEvents="none" />
        <line x1={0} y1={sy(wallDraft.z)} x2={size.width} y2={sy(wallDraft.z)} stroke="#22b8ff" strokeWidth="1" strokeDasharray="5 5" pointerEvents="none" />
        <line x1={sx(wallDraft.x)} y1={sy(wallDraft.z)} x2={sx(pointerWorld.x)} y2={sy(pointerWorld.z)} stroke="#19c6d1" strokeWidth="5" strokeDasharray="10 7" strokeLinecap="round" pointerEvents="none" />
        <circle cx={sx(pointerWorld.x)} cy={sy(pointerWorld.z)} r="6" fill="#19c6d1" stroke="#fff" strokeWidth="2" pointerEvents="none" />
      </>}
      {[...outerWalls.map(wall => ({ wall, kind: 'exterior' as const })),
        ...(floor.interiorWalls ?? []).map(wall => ({ wall, kind: 'interior' as const }))].map(({ wall, kind }) => {
        const selected = !drawWallMode && selectedWallId === wall.id;
        return <g key={wall.id}>
          <line x1={sx(wall.x1)} y1={sy(wall.z1)} x2={sx(wall.x2)} y2={sy(wall.z2)}
            stroke="transparent" strokeWidth={Math.max(12, .16 * scale)} strokeLinecap="square"
            style={{ cursor: 'move' }} onPointerDown={(event) => {
              if (drawWallMode) return;
              onSelectWall(wall.id, kind);
              start(event, { kind: 'wall', wall, x: event.clientX, y: event.clientY });
            }} onContextMenu={(event) => {
              if (drawWallMode) return;
              event.preventDefault();
              event.stopPropagation();
              onContextMenu?.(event.clientX, event.clientY, { kind: 'wall', id: wall.id, wallKind: kind });
            }} />
          {selected && (['start', 'end'] as const).map(endpoint => <circle key={endpoint}
            cx={sx(endpoint === 'start' ? wall.x1 : wall.x2)} cy={sy(endpoint === 'start' ? wall.z1 : wall.z2)}
            r={10} fill="#0891b2" stroke="#fff" strokeWidth={2} tabIndex={0}
            role="button"
            aria-label={`${endpoint === 'start' ? 'Başlangıç' : 'Bitiş'} uç noktası; ok tuşlarıyla 1 mm taşı`}
            style={{ cursor: 'crosshair', outline: 'none' }}
            onKeyDown={(event) => handleEndpointKeyDown(event, wall, endpoint)}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelectWall(wall.id, kind);
              start(event, { kind: 'endpoint', wall, endpoint, x: event.clientX, y: event.clientY });
            }} />)}
        </g>;
      })}
      {[...planItems].sort((a, b) => ((a.elevation ?? 0) + (a.type === 'rug' ? -1 : 0)) - ((b.elevation ?? 0) + (b.type === 'rug' ? -1 : 0))).map((item) => item.position ? <g key={item.id}
        transform={`translate(${sx(item.position.x)} ${sy(item.position.z)}) rotate(${-(item.rotation ?? 0) * 180 / Math.PI}) scale(${item.mirrored ? -1 : 1} 1)`}
        data-selected={selectedItemId === item.id || undefined}
        onPointerEnter={(event) => onItemHover?.(item.id, event.clientX, event.clientY)}
        onPointerLeave={(event) => onItemHover?.(null, event.clientX, event.clientY)}
        onPointerDown={(event) => {
          if (drawWallMode) return;
          onSelectItem(item.id);
          start(event, { kind: 'item', id: item.id, x: event.clientX, y: event.clientY });
        }} style={{ cursor: item.locked ? 'default' : 'move' }}>
        <title>{item.name}</title>
        <rect x={-(item.collisionWidth ?? item.width) * scale / 2} y={-(item.collisionDepth ?? item.depth) * scale / 2}
          width={(item.collisionWidth ?? item.width) * scale} height={(item.collisionDepth ?? item.depth) * scale} fill="transparent" />
      </g> : null)}
      {drawWallMode && <rect x="0" y="0" width={size.width} height={size.height} fill="transparent" pointerEvents="all" onPointerDown={(event) => { event.stopPropagation(); onPointerDown?.(event.clientX, event.clientY); }} />}
    </svg>}
    {drawWallMode && <div aria-label="Duvar çizim katmanı" style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'transparent', cursor: 'crosshair', touchAction: 'none' }} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onPointerDown?.(event.clientX, event.clientY); }} onPointerMove={(event) => { event.stopPropagation(); onPointerMove?.(event.clientX, event.clientY); }} onPointerUp={(event) => { event.preventDefault(); event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onPointerUp?.(); }} onPointerCancel={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onPointerUp?.(); }} onWheel={(event) => { event.preventDefault(); event.stopPropagation(); onWheel?.(event.deltaY, event.clientX, event.clientY); }} />}
  </div>;
}
