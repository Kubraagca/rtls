'use client';

import { useEffect, useRef, useState } from 'react';
import type { LayoutActions } from '../hooks/use-layout-state';
import type { FloorLayout, InteriorWall, RoomLayout } from '../lib/types';

interface FloorPlanEditorProps {
  layout: RoomLayout;
  floor: FloorLayout;
  selectedWallId: string | null;
  selectedItemId: string | null;
  planZoom?: number;
  planPanX?: number;
  planPanY?: number;
  actions: LayoutActions;
  onSelectWall(id: string | null, kind?: 'exterior' | 'interior'): void;
  onSelectItem(id: string | null): void;
  onWheel?(deltaY: number, clientX: number, clientY: number): void;
  onResizePan?(x: number, y: number): void;
  wallDraft?: { x: number; z: number } | null;
  pointerWorld?: { x: number; z: number } | null;
  onPointerMove?(clientX: number, clientY: number): void;
  onPointerDown?(clientX: number, clientY: number): void;
  onPointerUp?(): void;
  drawWallMode?: boolean;
}

type DragState = { kind: 'wall'; wall: InteriorWall; x: number; y: number } | { kind: 'endpoint'; wall: InteriorWall; endpoint: 'start' | 'end'; x: number; y: number } | { kind: 'item'; id: string; x: number; y: number } | { kind: 'edge'; edge: 'north' | 'south' | 'east' | 'west'; x: number; y: number } | null;


export function FloorPlanEditor({ layout, floor, selectedWallId, selectedItemId, planZoom = 1, planPanX = 0, planPanY = 0, actions, onSelectWall, onSelectItem, onWheel, onResizePan, wallDraft, pointerWorld, onPointerMove, onPointerDown, onPointerUp, drawWallMode }: FloorPlanEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
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
  const scale = Math.max(0.1, Math.min((size.width - 120) / layout.width, (size.height - 120) / layout.height) * planZoom);
  const ox = (size.width - layout.width * scale) / 2 + planPanX;
  const oy = (size.height - layout.height * scale) / 2 + planPanY;
  const sx = (x: number) => ox + (x + layout.width / 2) * scale;
  const sy = (z: number) => oy + (z + layout.height / 2) * scale;
  const start = (event: React.PointerEvent<SVGElement>, drag: Exclude<DragState, null>) => { event.stopPropagation(); event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { ...drag, x: event.clientX, y: event.clientY } as DragState; };
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.x) / scale;
    const dz = (event.clientY - drag.y) / scale;
    drag.x = event.clientX; drag.y = event.clientY;
    if (drag.kind === 'wall') {
      drag.wall = { ...drag.wall, x1: drag.wall.x1 + dx, z1: drag.wall.z1 + dz, x2: drag.wall.x2 + dx, z2: drag.wall.z2 + dz };
      if (drag.wall.id.startsWith('outer-')) actions.updateBoundaryWall(drag.wall.id, drag.wall);
      else actions.updateInteriorWall(drag.wall.id, drag.wall);
    } else if (drag.kind === 'endpoint') {
      drag.wall = drag.endpoint === 'start' ? { ...drag.wall, x1: drag.wall.x1 + dx, z1: drag.wall.z1 + dz } : { ...drag.wall, x2: drag.wall.x2 + dx, z2: drag.wall.z2 + dz };
      if (drag.wall.id.startsWith('outer-')) actions.updateBoundaryWall(drag.wall.id, drag.wall);
      else actions.updateInteriorWall(drag.wall.id, drag.wall);
    }
    else if (drag.kind === 'item') { const item = floor.items.find((entry) => entry.id === drag.id); if (item?.position) actions.moveItem(drag.id, item.position.x + dx, item.position.z + dz); }
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
  return <div ref={hostRef} style={{ position: 'absolute', inset: 0, zIndex: 7 }}>
    {size.width > 0 && <svg width={size.width} height={size.height} style={{ width: '100%', height: '100%', touchAction: 'none', pointerEvents: drawWallMode ? 'none' : 'auto' }} onWheel={(event) => { event.preventDefault(); onWheel?.(event.deltaY, event.clientX, event.clientY); }} onPointerMove={(event) => { onPointerMove?.(event.clientX, event.clientY); move(event); }} onPointerUp={() => { dragRef.current = null; onPointerUp?.(); }} onPointerCancel={() => { dragRef.current = null; onPointerUp?.(); }} onPointerDownCapture={(event) => { if (!drawWallMode) return; event.preventDefault(); event.stopPropagation(); onPointerDown?.(event.clientX, event.clientY); }} onPointerDown={(event) => { if (drawWallMode) return; onPointerDown?.(event.clientX, event.clientY); onSelectWall(null); onSelectItem(null); }}>
      {wallDraft && pointerWorld && <>
        <line x1={sx(wallDraft.x)} y1={0} x2={sx(wallDraft.x)} y2={size.height} stroke="#22b8ff" strokeWidth="1" strokeDasharray="5 5" pointerEvents="none" />
        <line x1={0} y1={sy(wallDraft.z)} x2={size.width} y2={sy(wallDraft.z)} stroke="#22b8ff" strokeWidth="1" strokeDasharray="5 5" pointerEvents="none" />
        <line x1={sx(wallDraft.x)} y1={sy(wallDraft.z)} x2={sx(pointerWorld.x)} y2={sy(pointerWorld.z)} stroke="#19c6d1" strokeWidth="5" strokeDasharray="10 7" strokeLinecap="round" pointerEvents="none" />
        <circle cx={sx(pointerWorld.x)} cy={sy(pointerWorld.z)} r="6" fill="#19c6d1" stroke="#fff" strokeWidth="2" pointerEvents="none" />
      </>}
      {outerWalls.map((wall) => { const selected = !drawWallMode && selectedWallId === wall.id; return <g key={wall.id}><line x1={sx(wall.x1)} y1={sy(wall.z1)} x2={sx(wall.x2)} y2={sy(wall.z2)} stroke={selected ? '#19c6d1' : '#77838a'} strokeWidth={selected ? 10 : 6} strokeLinecap="square" style={{ cursor: drawWallMode ? 'crosshair' : 'move' }} onPointerDown={(event) => { if (drawWallMode) return; onSelectWall(wall.id, 'exterior'); start(event, { kind: 'wall', wall, x: event.clientX, y: event.clientY }); }} />{selected && <><circle cx={sx(wall.x1)} cy={sy(wall.z1)} r="8" fill="#19c6d1" stroke="#fff" strokeWidth="2" onPointerDown={(event) => { onSelectWall(wall.id, 'exterior'); start(event, { kind: 'endpoint', wall, endpoint: 'start', x: event.clientX, y: event.clientY }); }} /><circle cx={sx(wall.x2)} cy={sy(wall.z2)} r="8" fill="#19c6d1" stroke="#fff" strokeWidth="2" onPointerDown={(event) => { onSelectWall(wall.id, 'exterior'); start(event, { kind: 'endpoint', wall, endpoint: 'end', x: event.clientX, y: event.clientY }); }} /></>}</g>; })}
      {(floor.interiorWalls ?? []).map((wall) => (
        <g key={wall.id}>
          <line x1={sx(wall.x1)} y1={sy(wall.z1)} x2={sx(wall.x2)} y2={sy(wall.z2)} stroke={!drawWallMode && selectedWallId === wall.id ? '#19c6d1' : '#77838a'} strokeWidth={!drawWallMode && selectedWallId === wall.id ? 10 : 6} strokeLinecap="square" style={{ cursor: drawWallMode ? 'crosshair' : 'move' }} onPointerDown={(event) => { if (drawWallMode) return; onSelectWall(wall.id, 'interior'); start(event, { kind: 'wall', wall, x: event.clientX, y: event.clientY }); }} />
          {!drawWallMode && selectedWallId === wall.id && <>
            <circle cx={sx(wall.x1)} cy={sy(wall.z1)} r="8" fill="#19c6d1" stroke="#fff" strokeWidth="2" style={{ cursor: 'crosshair' }} onPointerDown={(event) => { onSelectWall(wall.id, 'interior'); start(event, { kind: 'endpoint', wall, endpoint: 'start', x: event.clientX, y: event.clientY }); }} />
            <circle cx={sx(wall.x2)} cy={sy(wall.z2)} r="8" fill="#19c6d1" stroke="#fff" strokeWidth="2" style={{ cursor: 'crosshair' }} onPointerDown={(event) => { onSelectWall(wall.id, 'interior'); start(event, { kind: 'endpoint', wall, endpoint: 'end', x: event.clientX, y: event.clientY }); }} />
          </>}
        </g>
      ))}
      {floor.items.map((item) => item.position ? <g key={item.id} transform={`translate(${sx(item.position.x)} ${sy(item.position.z)}) rotate(${-(Math.round((item.rotation ?? 0) / (Math.PI / 2)) * 90)})`} onPointerDown={(event) => { if (drawWallMode) return; onSelectItem(item.id); start(event, { kind: 'item', id: item.id, x: event.clientX, y: event.clientY }); }} style={{ cursor: drawWallMode ? 'crosshair' : 'move' }}><rect x={-Math.max(8, item.width * scale) / 2} y={-Math.max(8, item.depth * scale) / 2} width={Math.max(8, item.width * scale)} height={Math.max(8, item.depth * scale)} fill={!drawWallMode && selectedItemId === item.id ? 'rgba(25,198,209,.35)' : 'rgba(217,237,240,.08)'} stroke={!drawWallMode && selectedItemId === item.id ? '#19c6d1' : 'rgba(53,84,90,.25)'} strokeWidth={!drawWallMode && selectedItemId === item.id ? 3 : 1.5} rx="3" /></g> : null)}
      {drawWallMode && <rect x="0" y="0" width={size.width} height={size.height} fill="transparent" pointerEvents="all" onPointerDown={(event) => { event.stopPropagation(); onPointerDown?.(event.clientX, event.clientY); }} />}
    </svg>}
    {drawWallMode && <div aria-label="Duvar çizim katmanı" style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'transparent', cursor: 'crosshair', touchAction: 'none' }} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onPointerDown?.(event.clientX, event.clientY); }} onPointerMove={(event) => { event.stopPropagation(); onPointerMove?.(event.clientX, event.clientY); }} onPointerUp={(event) => { event.preventDefault(); event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onPointerUp?.(); }} onPointerCancel={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onPointerUp?.(); }} onWheel={(event) => { event.preventDefault(); event.stopPropagation(); onWheel?.(event.deltaY, event.clientX, event.clientY); }} />}
  </div>;
}
