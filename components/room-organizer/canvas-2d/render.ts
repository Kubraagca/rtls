import { OFFICE_DIGITAL_TWIN_AREAS, OFFICE_DIGITAL_TWIN_PATHS } from '../lib/digital-twin-layers';
import { rotatedHalfExtents } from '../lib/geometry';
import { getPlanSprite, onPlanSpritesReady } from '../three/plan-sprites';
import { getPlanFloorPattern } from '../three/floor-patterns';
import { findFloorLoops } from '../three/room-floor-zones';
import { isRtlsPersonItem } from '../lib/rtls-person-items';
import type { FloorLayout, FurnitureItem, RoomLayout } from '../lib/types';

export interface Render2DOptions {
  canvas: HTMLCanvasElement;
  /** The building (used for width/height and the optional floor-plan image). */
  layout: RoomLayout;
  /** The floor to render — its items, floor colour, etc. */
  floor: FloorLayout;
  selectedItemId: string | null;
  selectedWallId?: string | null;
  /** Multi-select extras — outlined like the primary so group state is visible (#118). */
  extraSelectedIds?: ReadonlySet<string>;
  showMeasurements: boolean;
  showWiFiSignals: boolean;
  showHeatmap?: boolean;
  showAreas?: boolean;
  showPaths?: boolean;
  showDigitalTwinLabels?: boolean;
  trackedDevices?: readonly { id: string; x: number; z: number; status: string; battery: number }[];
  hasCollision: (item: FurnitureItem) => boolean;
  /**
   * Margin (CSS px) around the room. The default suits the full-screen 2D
   * view; small consumers (the 180×130 minimap) must pass a small value or
   * the margin consumes the whole canvas (#118).
   */
  padding?: number;
  /** Interactive 2D plan camera. */
  zoom?: number;
  panX?: number;
  panY?: number;
  wallPreview?: { start: { x: number; z: number }; end: { x: number; z: number } } | null;
  backgroundColor?: string;
  backgroundImage?: string | null;
}

const PADDING = 60;
// The 2D planner uses a neutral architectural-paper floor so furniture and
// annotations remain legible, independently of the rendered 3D material.
const PLAN_FLOOR_COLOR = '#85817b';
const PLAN_PAPER_COLOR = '#fbfcfd';
const PLAN_WALL_COLOR = '#42474a';
const PLAN_WALL_WIDTH_METERS = 0.18;
// Matches the 0.16 m thickness modelled in three/interior-walls.ts.

/** Convert a screen click on the full-size 2D plan into room coordinates. */
export function worldPositionFrom2DClient(
  canvas: HTMLCanvasElement,
  layout: RoomLayout,
  clientX: number,
  clientY: number,
  view: { zoom?: number; panX?: number; panY?: number; allowOutside?: boolean } = {}
): { x: number; z: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const padding = PADDING;
  const baseScale = Math.min(
    (rect.width - padding * 2) / layout.width,
    (rect.height - padding * 2) / layout.height
  );
  const scale = baseScale * Math.max(0.5, view.zoom ?? 1);
  if (scale <= 0) return null;
  const offsetX = (rect.width - layout.width * scale) / 2 + (view.panX ?? 0);
  const offsetY = (rect.height - layout.height * scale) / 2 + (view.panY ?? 0);
  const x = (clientX - rect.left - offsetX) / scale - layout.width / 2;
  const z = (clientY - rect.top - offsetY) / scale - layout.height / 2;
  if (!view.allowOutside && (x < -layout.width / 2 || x > layout.width / 2 || z < -layout.height / 2 || z > layout.height / 2)) {
    return null;
  }
  return { x, z };
}

// Decoded floor-plan image cache, keyed on the data-URL. Decoding a multi-MB
// data-URL is async: the first render kicks off the load and re-renders once
// the pixels are ready (so the image never paints over grid/furniture drawn
// after it). Subsequent renders reuse the cached, already-decoded Image and
// draw it synchronously in the correct layer order.
let floorPlanImageCache: { url: string; image: HTMLImageElement } | null = null;
let backgroundImageCache: { url: string; image: HTMLImageElement } | null = null;

/**
 * Callbacks the consumers install so the async floor-plan decode can trigger
 * a full repaint (redrawing the whole scene in the right layer order) once
 * the image is ready. A set, not a single slot: the 2D view AND the minimap
 * render concurrently, and a single-slot handler dropped whichever consumer
 * didn't own it — the minimap never repainted after a decode (#118).
 */
const repaintHandlers = new Set<() => void>();

/** Register a repaint handler; returns the disposer that unregisters it. */
export function addFloorPlanRepaintHandler(handler: () => void): () => void {
  repaintHandlers.add(handler);
  const unsubscribe = onPlanSpritesReady(handler);
  return () => { repaintHandlers.delete(handler); unsubscribe(); };
}

function requestRepaint(): void {
  for (const handler of repaintHandlers) handler();
}
const WIFI_RING_FILLS = ['rgba(0, 255, 0, 0.15)', 'rgba(255, 255, 0, 0.10)', 'rgba(255, 102, 0, 0.08)'];
const WIFI_RING_STROKES = ['rgba(0, 255, 0, 0.4)', 'rgba(255, 255, 0, 0.3)', 'rgba(255, 102, 0, 0.2)'];
const CCTV_RING_FILLS = ['rgba(0, 136, 255, 0.12)', 'rgba(0, 221, 255, 0.08)', 'rgba(136, 0, 255, 0.06)'];
const CCTV_RING_STROKES = ['rgba(0, 136, 255, 0.4)', 'rgba(0, 221, 255, 0.3)', 'rgba(136, 0, 255, 0.2)'];
const RTLS_RING_FILLS = ['rgba(80, 227, 213, 0.12)', 'rgba(97, 201, 255, 0.08)', 'rgba(154, 140, 255, 0.06)'];
const RTLS_RING_STROKES = ['rgba(80, 227, 213, 0.42)', 'rgba(97, 201, 255, 0.30)', 'rgba(154, 140, 255, 0.22)'];

// Keep floor furniture readable when a chair is intentionally tucked slightly
// under a desk/table. The surface must be painted after the chair so the chair
// can never look like it is sitting on top of the tabletop in plan view.
const PLAN_SEAT_TYPES = new Set([
  'chair', 'dining-chair', 'office-chair', 'conference-chair', 'gltf-chair',
  'armchair', 'bench', 'garden-bench',
]);
const PLAN_SURFACE_TYPES = new Set([
  'table', 'dining-table', 'coffee-table', 'side-table', 'desk',
  'workstation', 'meeting-table', 'reception-desk', 'counter', 'nightstand',
]);
const PLAN_TABLETOP_TYPES = new Set([
  'computer', 'lamp', 'plant', 'books', 'candles', 'flowerpot', 'wifi',
  'coffee-machine', 'vase', 'gltf-vase',
]);

function planFurnitureLayer(item: FurnitureItem): number {
  if (item.type === 'rug' || item.height <= 0.05) return 0;
  const isSeat = PLAN_SEAT_TYPES.has(item.type)
    || item.type.includes('chair')
    || item.name.toLocaleLowerCase().includes('sandalye');
  if (isSeat) return 10;
  const isSurface = PLAN_SURFACE_TYPES.has(item.type)
    || item.type.includes('table')
    || item.type.includes('desk')
    || item.type.includes('workstation')
    || item.name.toLocaleLowerCase().includes('masa');
  if (isSurface) return 20;
  if (PLAN_TABLETOP_TYPES.has(item.type) || (item.elevation ?? 0) > 0) return 30;
  return 15;
}

export function render2DTopDown(options: Render2DOptions): void {
  const { canvas, layout, floor } = options;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // The backing store is sized clientWidth/clientHeight × devicePixelRatio (by
  // the ResizeObserver in use-scene-effects), but all drawing below works in
  // CSS-pixel (logical) coordinates. Reset the transform to a DPR scale so 1
  // logical unit maps to `dpr` device pixels — that keeps strokes and text
  // crisp on retina while the layout maths stays resolution-independent.
  const dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
  const viewWidth = canvas.width / dpr;
  const viewHeight = canvas.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewWidth, viewHeight);
  // The 2D editor is presented as a drafting sheet; the 3D background colour
  // should not tint this view.
  ctx.fillStyle = PLAN_PAPER_COLOR;
  ctx.fillRect(0, 0, viewWidth, viewHeight);
  drawCanvasBackgroundImage(ctx, options.backgroundImage, viewWidth, viewHeight);
  drawBackgroundGrid(ctx, viewWidth, viewHeight);

  const padding = options.padding ?? PADDING;
  const baseScale = Math.min(
    (viewWidth - padding * 2) / layout.width,
    (viewHeight - padding * 2) / layout.height
  );
  const scale = baseScale * Math.max(0.5, options.zoom ?? 1);
  const offsetX = (viewWidth - layout.width * scale) / 2 + (options.panX ?? 0);
  const offsetY = (viewHeight - layout.height * scale) / 2 + (options.panY ?? 0);

  drawFloor(ctx, layout, floor, offsetX, offsetY, scale);
  drawClosedFloorZones(ctx, layout, floor, offsetX, offsetY, scale);
  drawFloorPattern(ctx, layout, floor, offsetX, offsetY, scale);
  // The blueprint grid stays on the paper outside the room. Do not draw a
  // second grid over the floor itself; the reference uses a clean concrete
  // surface there.
  drawRoomOutline(ctx, layout, floor, offsetX, offsetY, scale, options.selectedWallId);
  drawInteriorWalls(ctx, layout, floor, offsetX, offsetY, scale, options.selectedWallId);
  drawPlanDoors(ctx, layout, floor, offsetX, offsetY, scale, options.selectedItemId);
  if (options.wallPreview) {
    drawWallPreview(ctx, layout, options.wallPreview, offsetX, offsetY, scale);
  }

  if (options.showHeatmap) {
    drawHeatmap(ctx, layout, floor.items, offsetX, offsetY, scale, viewWidth, viewHeight);
  }

  if (options.showAreas) {
    drawDigitalTwinAreas(ctx, layout, offsetX, offsetY, scale, options.showDigitalTwinLabels !== false);
  }

  if (options.showPaths) {
    drawDigitalTwinPaths(ctx, layout, offsetX, offsetY, scale);
  }

  if (options.showWiFiSignals) {
    drawSignalRings(ctx, floor.items, offsetX, offsetY, scale, layout, 'wifi');
    drawSignalRings(ctx, floor.items, offsetX, offsetY, scale, layout, 'cctv');
    drawSignalRings(ctx, floor.items, offsetX, offsetY, scale, layout, 'rtls');
  }

  drawFurniture(ctx, options, offsetX, offsetY, scale);

  if (options.trackedDevices?.length) {
    drawTrackedDevices(ctx, layout, options.trackedDevices, offsetX, offsetY, scale, options.showDigitalTwinLabels !== false);
  }

  if (options.showMeasurements) {
    drawRoomDimensions(ctx, layout, offsetX, offsetY, scale);
  }
}

function drawCanvasBackgroundImage(
  ctx: CanvasRenderingContext2D,
  url: string | null | undefined,
  width: number,
  height: number
): void {
  if (!url) return;
  if (backgroundImageCache?.url !== url) {
    const image = new Image();
    backgroundImageCache = { url, image };
    image.onload = () => {
      if (backgroundImageCache?.image === image) requestRepaint();
    };
    image.src = url;
    return;
  }
  const image = backgroundImageCache.image;
  if (!image.complete || image.naturalWidth === 0) return;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawWallPreview(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  preview: { start: { x: number; z: number }; end: { x: number; z: number } },
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  const halfW = layout.width / 2;
  const halfD = layout.height / 2;
  const x1 = offsetX + (preview.start.x + halfW) * scale;
  const y1 = offsetY + (preview.start.z + halfD) * scale;
  const x2 = offsetX + (preview.end.x + halfW) * scale;
  const y2 = offsetY + (preview.end.z + halfD) * scale;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const pixelLength = Math.hypot(dx, dy);
  const worldLength = Math.hypot(preview.end.x - preview.start.x, preview.end.z - preview.start.z);
  ctx.save();
  // Canva/BAI-style alignment guides: the current endpoint projects a clear
  // horizontal and vertical reference across the plan before the wall exists.
  ctx.strokeStyle = 'rgba(25, 150, 210, 0.78)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(x2, 0);
  ctx.lineTo(x2, ctx.canvas.height / (ctx.canvas.width / Math.max(1, ctx.canvas.clientWidth || ctx.canvas.width)));
  ctx.moveTo(0, y2);
  ctx.lineTo(ctx.canvas.width / (ctx.canvas.width / Math.max(1, ctx.canvas.clientWidth || ctx.canvas.width)), y2);
  ctx.stroke();
  ctx.setLineDash([10, 7]);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  for (const [x, y] of [[x1, y1], [x2, y2]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Planner-style live dimension: keep it just outside the wall so the
  // measurement stays readable while the user is choosing the second point.
  if (pixelLength > 18 && worldLength > 0.01) {
    const normalX = -dy / pixelLength;
    const normalY = dx / pixelLength;
    const gap = 18;
    const ax = x1 + normalX * gap;
    const ay = y1 + normalY * gap;
    const bx = x2 + normalX * gap;
    const by = y2 + normalY * gap;
    ctx.strokeStyle = 'rgba(42, 51, 57, .72)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    drawDimensionArrow(ctx, ax, ay, bx, by);
    drawDimensionArrow(ctx, bx, by, ax, ay);

    const label = `${worldLength.toFixed(2)} m`;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    ctx.font = '700 11px Inter, Arial, sans-serif';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255, 255, 255, .96)';
    roundRect(ctx, mx - textWidth / 2 - 7, my - 10, textWidth + 14, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#30383e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, my);
  }
  ctx.restore();
}

function drawDimensionArrow(ctx: CanvasRenderingContext2D, x: number, y: number, targetX: number, targetY: number): void {
  const angle = Math.atan2(targetY - y, targetX - x);
  const size = 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle + Math.PI * .82) * size, y + Math.sin(angle + Math.PI * .82) * size);
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle - Math.PI * .82) * size, y + Math.sin(angle - Math.PI * .82) * size);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBackgroundGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const minorSpacing = 16;
  const majorSpacing = minorSpacing * 5;
  ctx.save();
  ctx.strokeStyle = '#e7ebee';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += minorSpacing) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += minorSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = '#cbd3d9';
  for (let x = 0; x <= width; x += majorSpacing) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += majorSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrackedDevices(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  devices: readonly { id: string; x: number; z: number; status: string; battery: number }[],
  offsetX: number,
  offsetY: number,
  scale: number,
  showLabels: boolean
): void {
  const halfW = layout.width / 2;
  const halfD = layout.height / 2;
  for (const device of devices) {
    const x = offsetX + (device.x + halfW) * scale;
    const y = offsetY + (device.z + halfD) * scale;
    ctx.save();
    ctx.shadowColor = 'rgba(66, 230, 220, 0.5)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#43ded7';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(210, 255, 252, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.stroke();
    if (showLabels) {
      ctx.font = '700 11px system-ui, sans-serif';
      const label = `${device.id} · ${device.battery}%`;
      const width = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(18, 24, 28, 0.88)';
      ctx.fillRect(x + 13, y - 17, width, 22);
      ctx.fillStyle = '#eefcfa';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 20, y - 6);
    }
    ctx.restore();
  }
}

function drawDigitalTwinAreas(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  offsetX: number,
  offsetY: number,
  scale: number,
  showLabels: boolean
): void {
  const halfW = layout.width / 2;
  const halfD = layout.height / 2;
  for (const area of OFFICE_DIGITAL_TWIN_AREAS) {
    const x = offsetX + (area.x - area.width / 2 + halfW) * scale;
    const y = offsetY + (area.z - area.depth / 2 + halfD) * scale;
    const w = area.width * scale;
    const h = area.depth * scale;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = area.color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = area.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (showLabels) {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(27, 33, 37, 0.86)';
      const labelX = offsetX + (area.x + halfW) * scale;
      const labelY = offsetY + (area.z - area.depth * 0.34 + halfD) * scale;
      const textWidth = Math.max(72, ctx.measureText(area.label).width + 26);
      ctx.beginPath();
      ctx.roundRect(labelX - textWidth / 2, labelY - 13, textWidth, 26, 8);
      ctx.fill();
      ctx.strokeStyle = area.color;
      ctx.stroke();
      ctx.fillStyle = '#f7fafb';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(area.label, labelX, labelY);
    }
    ctx.restore();
  }
}

function drawDigitalTwinPaths(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  const halfW = layout.width / 2;
  const halfD = layout.height / 2;
  ctx.save();
  ctx.lineWidth = Math.max(3, scale * 0.065);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(75, 218, 208, 0.9)';
  ctx.shadowColor = 'rgba(75, 218, 208, 0.35)';
  ctx.shadowBlur = 7;
  for (const route of OFFICE_DIGITAL_TWIN_PATHS) {
    if (route.points.length < 2) continue;
    ctx.beginPath();
    route.points.forEach((point, index) => {
      const x = offsetX + (point.x + halfW) * scale;
      const y = offsetY + (point.z + halfD) * scale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  floor: FloorLayout,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  const floorColor = floor.floorColor || PLAN_FLOOR_COLOR;

  const boundary = layout.boundaryWalls && layout.boundaryWalls.length >= 3 ? layout.boundaryWalls : null;
  const fillFloor = () => {
    if (!boundary) {
      ctx.fillRect(offsetX, offsetY, layout.width * scale, layout.height * scale);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(offsetX + (boundary[0]!.x1 + layout.width / 2) * scale, offsetY + (boundary[0]!.z1 + layout.height / 2) * scale);
    for (const wall of boundary) ctx.lineTo(offsetX + (wall.x2 + layout.width / 2) * scale, offsetY + (wall.z2 + layout.height / 2) * scale);
    ctx.closePath();
    ctx.fill();
  };
  const url = layout.floorPlanImage;
  if (url) {
    // Fill the floor colour first so there's a base while (or if) the image is
    // still decoding — avoids a flash of the raw canvas background.
    ctx.fillStyle = floorColor;
    fillFloor();

    // naturalWidth guard: a broken image also reports `complete`, and
    // drawImage on it throws InvalidStateError — which would abort the whole
    // paint (grid and furniture never drawn) on every repaint (#118).
    if (floorPlanImageCache?.url === url && floorPlanImageCache.image.complete) {
      const img = floorPlanImageCache.image;
      if (img.naturalWidth > 0) {
        ctx.globalAlpha = layout.floorPlanOpacity ?? 1;
        if (boundary) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(offsetX + (boundary[0]!.x1 + layout.width / 2) * scale, offsetY + (boundary[0]!.z1 + layout.height / 2) * scale);
          for (const wall of boundary) ctx.lineTo(offsetX + (wall.x2 + layout.width / 2) * scale, offsetY + (wall.z2 + layout.height / 2) * scale);
          ctx.closePath();
          ctx.clip();
        }
        ctx.drawImage(img, offsetX, offsetY, layout.width * scale, layout.height * scale);
        if (boundary) ctx.restore();
        ctx.globalAlpha = 1;

        // Keep an uploaded plan image visible, but let the active floor colour
        // tint it as well. Without this overlay the image completely hid
        // floor-colour changes made from the 2D paint tool.
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = floorColor;
        fillFloor();
        ctx.restore();
      }
      return;
    }

    // Not cached (or a different plan): decode once, then trigger a full
    // repaint so grid/furniture end up on top of the image instead of the
    // async onload painting over them.
    if (floorPlanImageCache?.url !== url) {
      const img = new Image();
      floorPlanImageCache = { url, image: img };
      img.onload = () => {
        // Ignore stale loads if the plan changed again before this resolved.
        if (floorPlanImageCache?.image === img) requestRepaint?.();
      };
      img.src = url;
    }
  } else {
    ctx.fillStyle = floorColor;
    fillFloor();
  }
}

/** Paint the selected floor pattern after enclosed zones so it stays visible. */
function drawFloorPattern(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  floor: FloorLayout,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  const pattern = getPlanFloorPattern(
    ctx,
    floor.floorPattern ?? 'solid',
    floor.floorColor || PLAN_FLOOR_COLOR,
    scale
  );
  if (!pattern) return;

  const boundary = layout.boundaryWalls && layout.boundaryWalls.length >= 3
    ? layout.boundaryWalls
    : null;
  ctx.save();
  ctx.globalAlpha = layout.floorPlanImage ? 0.5 : 1;
  ctx.fillStyle = pattern;
  if (!boundary) {
    ctx.fillRect(offsetX, offsetY, layout.width * scale, layout.height * scale);
  } else {
    ctx.beginPath();
    ctx.moveTo(offsetX + (boundary[0]!.x1 + layout.width / 2) * scale, offsetY + (boundary[0]!.z1 + layout.height / 2) * scale);
    for (const wall of boundary) {
      ctx.lineTo(offsetX + (wall.x2 + layout.width / 2) * scale, offsetY + (wall.z2 + layout.height / 2) * scale);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawRoomOutline(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  floor: FloorLayout,
  offsetX: number,
  offsetY: number,
  scale: number,
  selectedWallId?: string | null
): void {
  if (layout.boundaryWalls && layout.boundaryWalls.length >= 3) {
    const hidden = new Set(floor.hiddenWalls ?? []);
    ctx.save();
    ctx.lineCap = 'square';
    for (const wall of layout.boundaryWalls) {
      const hiddenWall = hidden.has(wall.id.replace(/^outer-/, '') as 'north' | 'south' | 'east' | 'west');
      ctx.strokeStyle = wall.id === selectedWallId ? '#19c6d1' : hiddenWall ? '#cbd1d5' : PLAN_WALL_COLOR;
      ctx.lineWidth = Math.max(1, PLAN_WALL_WIDTH_METERS * scale) + (wall.id === selectedWallId ? 2 : 0);
      ctx.setLineDash([]);
      if (hiddenWall) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(offsetX + (wall.x1 + layout.width / 2) * scale, offsetY + (wall.z1 + layout.height / 2) * scale);
      ctx.lineTo(offsetX + (wall.x2 + layout.width / 2) * scale, offsetY + (wall.z2 + layout.height / 2) * scale);
      ctx.stroke();
      drawWallLengthLabel(
        ctx,
        offsetX + ((wall.x1 + wall.x2) / 2 + layout.width / 2) * scale,
        offsetY + ((wall.z1 + wall.z2) / 2 + layout.height / 2) * scale,
        Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1)
      );
    }
    ctx.restore();
    return;
  }
  // Per-edge, not strokeRect: a wall hidden via Wall Visibility (or Delete)
  // reads as a light dashed boundary instead of a solid wall (#118).
  const hidden = new Set(floor.hiddenWalls ?? []);
  const x0 = offsetX;
  const y0 = offsetY;
  const x1 = offsetX + layout.width * scale;
  const y1 = offsetY + layout.height * scale;
  const edges = [
    { id: 'north', from: [x0, y0], to: [x1, y0] },
    { id: 'south', from: [x0, y1], to: [x1, y1] },
    { id: 'west', from: [x0, y0], to: [x0, y1] },
    { id: 'east', from: [x1, y0], to: [x1, y1] },
  ] as const;
  for (const edge of edges) {
    const isHidden = hidden.has(edge.id);
    ctx.save();
    const selected = edge.id === selectedWallId || `outer-${edge.id}` === selectedWallId;
    ctx.strokeStyle = selected ? '#19c6d1' : isHidden ? '#cbd1d5' : PLAN_WALL_COLOR;
    ctx.lineWidth = Math.max(1, PLAN_WALL_WIDTH_METERS * scale) + (selected ? 2 : 0);
    if (isHidden) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(edge.from[0], edge.from[1]);
    ctx.lineTo(edge.to[0], edge.to[1]);
    ctx.stroke();
    ctx.restore();
  }
}

function drawInteriorWalls(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  floor: FloorLayout,
  offsetX: number,
  offsetY: number,
  scale: number,
  selectedWallId?: string | null
): void {
  const walls = floor.interiorWalls ?? [];
  if (walls.length === 0) return;
  const halfW = layout.width / 2;
  const halfD = layout.height / 2;
  ctx.save();
  ctx.lineCap = 'butt';
  for (const wall of walls) {
    ctx.strokeStyle = wall.id === selectedWallId ? '#19c6d1' : PLAN_WALL_COLOR;
    ctx.lineWidth = Math.max(1, PLAN_WALL_WIDTH_METERS * scale) + (wall.id === selectedWallId ? 2 : 0);
    const x1 = offsetX + (wall.x1 + halfW) * scale;
    const y1 = offsetY + (wall.z1 + halfD) * scale;
    const x2 = offsetX + (wall.x2 + halfW) * scale;
    const y2 = offsetY + (wall.z2 + halfD) * scale;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    drawWallLengthLabel(ctx, (x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1));
  }
  ctx.restore();
}

/** Draw doors as architectural plan symbols instead of top-down furniture. */
function drawPlanDoors(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  floor: FloorLayout,
  offsetX: number,
  offsetY: number,
  scale: number,
  selectedItemId: string | null,
): void {
  const floorColor = floor.floorColor || PLAN_FLOOR_COLOR;
  const halfW = layout.width / 2;
  const halfD = layout.height / 2;
  for (const door of floor.items) {
    if (door.type !== 'door' || !door.position) continue;
    const rotation = door.rotation ?? 0;
    const centerX = offsetX + (door.position.x + halfW) * scale;
    const centerY = offsetY + (door.position.z + halfD) * scale;
    const width = Math.max(0.1, door.width * scale);
    // Leave a little clearance at both jambs so the dark wall stroke cannot
    // visually close the opening at low zoom levels.
    const openingWidth = width + Math.max(3, 0.05 * scale);
    // Local X follows the wall. Local +Z is the opening's facing direction.
    const tangentX = Math.cos(rotation);
    const tangentY = -Math.sin(rotation);
    const normalX = Math.sin(rotation);
    const normalY = Math.cos(rotation);
    const hingeX = centerX - tangentX * width / 2;
    const hingeY = centerY - tangentY * width / 2;

    ctx.save();
    // Cut the wall line cleanly at the opening.
    ctx.strokeStyle = floorColor;
    ctx.lineWidth = PLAN_WALL_WIDTH_METERS * scale + Math.max(3, 0.05 * scale);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(centerX - tangentX * openingWidth / 2, centerY - tangentY * openingWidth / 2);
    ctx.lineTo(centerX + tangentX * openingWidth / 2, centerY + tangentY * openingWidth / 2);
    ctx.stroke();

    const selected = door.id === selectedItemId;
    // The leaf is deliberately thicker than the wall's plan stroke so the
    // open state is obvious even when the plan is zoomed out.
    ctx.strokeStyle = selected ? '#0891b2' : (door.color || '#7a4b2c');
    ctx.lineWidth = selected ? Math.max(3, 0.06 * scale) : Math.max(3, 0.05 * scale);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(hingeX, hingeY);
    ctx.lineTo(hingeX + normalX * width, hingeY + normalY * width);
    ctx.stroke();

    const closedAngle = Math.atan2(tangentY, tangentX);
    // A light sector makes the swing area readable without hiding furniture;
    // the solid arc is the conventional architectural open-door marker.
    ctx.fillStyle = selected ? 'rgba(8, 145, 178, .10)' : 'rgba(122, 75, 44, .10)';
    ctx.beginPath();
    ctx.moveTo(hingeX, hingeY);
    ctx.arc(hingeX, hingeY, width, closedAngle, closedAngle + Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = selected ? '#087f98' : '#4a403a';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(hingeX, hingeY, width, closedAngle, closedAngle + Math.PI / 2);
    ctx.stroke();

    ctx.fillStyle = selected ? '#087f98' : '#4a403a';
    ctx.beginPath();
    ctx.arc(hingeX, hingeY, Math.max(2, Math.min(3.5, scale * 0.035)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Paint every newly enclosed wall loop. The largest loop is the original
 * building footprint and already has a base floor, so it is deliberately
 * omitted. This makes annexes and corner rooms visible immediately in 2D. */
function drawClosedFloorZones(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  floor: FloorLayout,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  const interior = floor.interiorWalls ?? [];
  if (interior.length === 0) return;
  const loops = findFloorLoops([...(layout.boundaryWalls ?? []), ...interior]);
  if (loops.length === 0) return;
  // Keep the original room visible as well as any attached/open room zones.
  // The largest loop is not necessarily the original footprint.
  const largest = -1;

  ctx.save();
  ctx.fillStyle = floor.floorColor || PLAN_FLOOR_COLOR;
  for (const [index, loop] of loops.entries()) {
    if (index === largest) continue;
    ctx.beginPath();
    loop.forEach((point, pointIndex) => {
      const x = offsetX + (point.x + layout.width / 2) * scale;
      const y = offsetY + (point.z + layout.height / 2) * scale;
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWallLengthLabel(ctx: CanvasRenderingContext2D, x: number, y: number, lengthMeters: number): void {
  if (lengthMeters < 0.25) return;
  const label = `${lengthMeters.toFixed(2)} m`;
  ctx.save();
  ctx.font = '11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeText(label, x, y);
  ctx.fillStyle = '#2f3438';
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawSignalRings(
  ctx: CanvasRenderingContext2D,
  items: readonly FurnitureItem[],
  offsetX: number,
  offsetY: number,
  scale: number,
  layout: RoomLayout,
  kind: 'wifi' | 'cctv' | 'rtls'
): void {
  const fills = kind === 'wifi' ? WIFI_RING_FILLS : kind === 'cctv' ? CCTV_RING_FILLS : RTLS_RING_FILLS;
  const strokes = kind === 'wifi' ? WIFI_RING_STROKES : kind === 'cctv' ? CCTV_RING_STROKES : RTLS_RING_STROKES;
  const predicate = (item: FurnitureItem) =>
    Boolean(
      item.position &&
      item.signalRange &&
      (kind === 'wifi'
        ? item.isWiFiAccessPoint
        : kind === 'cctv'
          ? item.isCCTV
          : item.type === 'rtls-gateway' || item.type === 'rtls-beacon')
    );

  for (const item of items.filter(predicate)) {
    if (!item.position || !item.signalRange) continue;
    const cx = offsetX + (item.position.x + layout.width / 2) * scale;
    const cy = offsetY + (item.position.z + layout.height / 2) * scale;

    for (let ring = 3; ring >= 1; ring--) {
      const radius = (item.signalRange * ring * scale) / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = fills[ring - 1] ?? 'transparent';
      ctx.fill();
      ctx.strokeStyle = strokes[ring - 1] ?? 'transparent';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawFurniture(
  ctx: CanvasRenderingContext2D,
  options: Render2DOptions,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  for (const item of [...options.floor.items].sort((a, b) => {
    const layerOrder = planFurnitureLayer(a) - planFurnitureLayer(b);
    return layerOrder || (a.elevation ?? 0) - (b.elevation ?? 0);
  })) {
    if (!item.position) continue;
    // Doors have a dedicated architectural symbol placed directly on walls.
    if (item.type === 'door') continue;
    const cx = offsetX + (item.position.x + options.layout.width / 2) * scale;
    const cy = offsetY + (item.position.z + options.layout.height / 2) * scale;
    // The room and wall dimensions are world-space metres. Use the measured
    // solid footprint when an imported model provides one; otherwise fall back
    // to its catalog footprint so every item shares the wall's metre-to-pixel
    // scale instead of using the model's untrimmed visual bounds.
    const w = (item.collisionWidth ?? item.width) * scale;
    const d = (item.collisionDepth ?? item.depth) * scale;

    ctx.save();
    ctx.translate(cx, cy);
    // Canvas rotate() is clockwise while Three's rotateY is CCW; negate so the
    // 2D footprint matches the 3D scene's orientation.
    ctx.rotate(-(item.rotation ?? 0));
    if (item.mirrored) ctx.scale(-1, 1);
    const sprite = getPlanSprite(item);
    ctx.shadowColor = 'rgba(28, 39, 48, 0.18)';
    ctx.shadowBlur = Math.min(5, scale * 0.07);
    ctx.shadowOffsetY = 1.5;
    if (isRtlsPersonItem(item)) {
      drawTopDownAvatar(ctx, item, w, d);
    } else if (sprite) {
      // The baked model bounds can be larger than the item's declared plan
      // footprint (notably office/conference chairs). Always fit the sprite to
      // the item's footprint so a chair cannot visually grow into a table.
      ctx.drawImage(sprite.canvas, -w / 2, -d / 2, w, d);
    } else {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -d / 2, w, d, Math.max(0, Math.min(4, w / 5, d / 5)));
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (options.selectedItemId === item.id) {
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = 3;
    } else if (options.extraSelectedIds?.has(item.id)) {
      // Multi-select extras share the primary's green, slightly thinner.
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'transparent';
      ctx.lineWidth = 0;
    }
    if (options.selectedItemId === item.id || options.extraSelectedIds?.has(item.id)) {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
    }

    ctx.restore();

  }
}

/** Draw a compact, unmistakable person marker when the 3D avatar is viewed from above. */
function drawTopDownAvatar(ctx: CanvasRenderingContext2D, item: FurnitureItem, width: number, depth: number): void {
  const radius = Math.max(8, Math.min(width, depth) * 0.42);
  const fill = item.color || '#2563eb';
  ctx.shadowColor = 'rgba(28, 39, 48, 0.22)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1.5, radius * 0.12);
  ctx.stroke();

  // White head and shoulders silhouette, readable even at small plan scales.
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, -radius * 0.28, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, radius * 0.25, radius * 0.43, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
}

function drawRoomDimensions(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  ctx.fillStyle = '#333';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${layout.width.toFixed(2)}m`, offsetX + (layout.width * scale) / 2, offsetY - 10);
  ctx.save();
  ctx.translate(offsetX - 10, offsetY + (layout.height * scale) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${layout.height.toFixed(2)}m`, 0, 0);
  ctx.restore();
}

/**
 * Paint a price-per-area heatmap onto the 2D canvas. The floor is bucketed
 * into a 20×20 grid; each cell aggregates the price of any item whose
 * footprint overlaps the cell, then colour-maps the density. Also draws a
 * compact legend showing the per-square-metre value range.
 */
function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  items: readonly FurnitureItem[],
  offsetX: number,
  offsetY: number,
  scale: number,
  viewWidth: number,
  viewHeight: number
): void {
  const COLS = 20;
  const ROWS = 20;
  const cellWidth = layout.width / COLS;
  const cellDepth = layout.height / ROWS;
  const cellArea = cellWidth * cellDepth;
  if (cellArea <= 0) return;

  const grid: number[] = new Array(COLS * ROWS).fill(0);

  for (const item of items) {
    if (!item.position || (item.price ?? 0) <= 0) continue;
    const itemArea = item.width * item.depth;
    if (itemArea <= 0) continue;
    const pricePerArea = (item.price ?? 0) / itemArea;

    // Use the rotation-aware AABB so a rotated item shades the cells its
    // oriented footprint actually covers.
    const { halfW, halfD } = rotatedHalfExtents(item);
    const minX = item.position.x - halfW + layout.width / 2;
    const maxX = item.position.x + halfW + layout.width / 2;
    const minZ = item.position.z - halfD + layout.height / 2;
    const maxZ = item.position.z + halfD + layout.height / 2;

    const col0 = Math.max(0, Math.floor(minX / cellWidth));
    const col1 = Math.min(COLS - 1, Math.floor(maxX / cellWidth));
    const row0 = Math.max(0, Math.floor(minZ / cellDepth));
    const row1 = Math.min(ROWS - 1, Math.floor(maxZ / cellDepth));

    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const idx = row * COLS + col;
        grid[idx] = (grid[idx] ?? 0) + pricePerArea * cellArea;
      }
    }
  }

  const max = Math.max(...grid);
  if (max <= 0) return;

  // Cells.
  ctx.save();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const value = grid[row * COLS + col] ?? 0;
      if (value <= 0) continue;
      const ratio = value / max;
      ctx.fillStyle = heatColor(ratio);
      ctx.fillRect(
        offsetX + col * cellWidth * scale,
        offsetY + row * cellDepth * scale,
        cellWidth * scale + 1,
        cellDepth * scale + 1
      );
    }
  }
  ctx.restore();

  drawHeatmapLegend(ctx, max / cellArea, viewWidth, viewHeight);
}

function drawHeatmapLegend(
  ctx: CanvasRenderingContext2D,
  maxPricePerSqM: number,
  viewWidth: number,
  viewHeight: number
): void {
  const padding = 12;
  const barWidth = 140;
  const barHeight = 12;
  // Position in logical (CSS-pixel) space — ctx is DPR-scaled, so using the raw
  // backing-store size (ctx.canvas.width) would push the legend off-screen on
  // retina.
  const x = viewWidth - barWidth - padding;
  const y = viewHeight - barHeight - padding - 18;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  const boxX = x - 8;
  const boxY = y - 14;
  const boxW = barWidth + 16;
  const boxH = barHeight + 36;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Gradient bar.
  const gradient = ctx.createLinearGradient(x, 0, x + barWidth, 0);
  gradient.addColorStop(0, 'rgba(0, 200, 0, 0.9)');
  gradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.9)');
  gradient.addColorStop(1, 'rgba(255, 0, 0, 0.9)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, barWidth, barHeight);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(x, y, barWidth, barHeight);

  ctx.fillStyle = '#333';
  ctx.font = '10px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('§/m² density', x, y - 4);
  ctx.fillText('0', x, y + barHeight + 12);
  ctx.textAlign = 'right';
  ctx.fillText(`§${Math.round(maxPricePerSqM).toLocaleString()}`, x + barWidth, y + barHeight + 12);
  ctx.restore();
}

function heatColor(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  // Green (low) → yellow (mid) → red (high), with constant alpha.
  if (t < 0.5) {
    const k = t / 0.5;
    const r = Math.round(k * 255);
    return `rgba(${r}, 200, 0, 0.35)`;
  }
  const k = (t - 0.5) / 0.5;
  const g = Math.round((1 - k) * 200);
  return `rgba(255, ${g}, 0, 0.45)`;
}
