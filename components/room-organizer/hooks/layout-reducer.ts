import { DEFAULT_FLOOR_COLOR, MAX_FLOORS, MAX_ROOM_DIMENSION } from '../lib/constants';
import { rotatedHalfExtents } from '../lib/geometry';
import { isOpening, settleWallMountedItem } from '../lib/opening-snap';
import type {
  CatalogItem,
  FloorLayout,
  FloorPattern,
  FloorPlanFitMode,
  FurnitureItem,
  InteriorWall,
  RoofStyle,
  RoomLayout,
  SofaShape,
  WallId,
  WallPattern,
} from '../lib/types';
import { normaliseCustomItemDimensions } from '../lib/custom-item-sizing';

// ---------------------------------------------------------------------------
// Action union
// ---------------------------------------------------------------------------

export type LayoutAction =
  | { type: 'setName'; name: string }
  | { type: 'setWidth'; width: number }
  | { type: 'setHeight'; height: number }
  | { type: 'resizeRoom'; width: number; height: number; shiftX: number; shiftZ: number }
  // floor-scoped finishes — target the active floor
  | { type: 'setFloorColor'; color: string }
  | { type: 'setFloorPattern'; pattern: FloorPattern }
  | { type: 'setWallPattern'; pattern: WallPattern }
  | { type: 'setWallColor'; wall: WallId; color: string | null }
  | { type: 'setInteriorWallColor'; id: string; color: string }
  // floor-scoped items — target the active floor
  | { type: 'addCatalogItem'; catalogItem: CatalogItem; id: string; position?: { x: number; z: number } }
  | { type: 'removeItem'; id: string }
  | { type: 'updateItem'; id: string; patch: Partial<FurnitureItem> }
  | { type: 'duplicateItem'; sourceId: string; newId: string }
  | { type: 'rotateItem'; id: string }
  | { type: 'moveItem'; id: string; x: number; z: number }
  | { type: 'resizeItem'; id: string; dimension: 'width' | 'depth' | 'height'; value: number }
  | { type: 'setSofaShape'; id: string; shape: SofaShape }
  | { type: 'setSignalRange'; id: string; range: number }
  | { type: 'setColor'; id: string; color: string }
  | { type: 'setLocked'; id: string; locked: boolean }
  | { type: 'toggleMirror'; id: string }
  | { type: 'setRotation'; id: string; rotation: number }
  | { type: 'replaceItems'; items: FurnitureItem[] }
  | { type: 'addItems'; items: FurnitureItem[] }
  | { type: 'bulkSetPositions'; positions: ReadonlyMap<string, { x: number; z: number }> }
  | { type: 'addInteriorWall'; wall: InteriorWall }
  | { type: 'addInteriorWalls'; walls: readonly InteriorWall[] }
  | { type: 'updateInteriorWall'; id: string; patch: Partial<InteriorWall> }
  | { type: 'updateBoundaryWall'; id: string; patch: Partial<InteriorWall> }
  | { type: 'removeInteriorWall'; id: string }
  | { type: 'toggleExteriorWall'; wallId: WallId }
  | { type: 'clearInteriorWalls' }
  | { type: 'rotateSelection'; ids: ReadonlySet<string>; radians: number }
  | { type: 'setLockAll'; locked: boolean }
  | { type: 'clearItems' }
  // floor / building operations
  | { type: 'setActiveFloorIndex'; index: number }
  | { type: 'addFloor'; floor: Omit<FloorLayout, 'name'> & { name?: string } }
  | { type: 'duplicateFloor'; sourceIndex: number; newId: string; idSuffix: string }
  | { type: 'removeFloor'; index: number }
  | { type: 'renameFloor'; index: number; name: string }
  | { type: 'reorderFloor'; from: number; to: number }
  | { type: 'setFloorPlan'; image: string | null }
  | { type: 'setFloorPlanOpacity'; opacity: number }
  | { type: 'setFloorPlanFitMode'; mode: FloorPlanFitMode }
  | { type: 'setRoofStyle'; style: RoofStyle }
  | { type: 'setRoofColor'; color: string }
  | { type: 'applyLayout'; layout: RoomLayout };

// ---------------------------------------------------------------------------
// State shape + defaults
// ---------------------------------------------------------------------------

export interface LayoutState {
  readonly layout: RoomLayout;
  readonly activeFloorIndex: number;
}

export const INITIAL_GROUND_FLOOR: FloorLayout = {
  id: 'ground',
  name: 'Ana Ofis',
  floorColor: DEFAULT_FLOOR_COLOR,
  floorPattern: 'concrete',
  wallPattern: 'plaster',
  wallColors: {
    north: '#e3e4e6',
    south: '#e3e4e6',
    east: '#d5d7da',
    west: '#d5d7da',
  },
  items: [
    // Reception + waiting area (south/front)
    { id: 'reception-1', type: 'reception-desk', category: 'office', name: 'Resepsiyon Bankosu', width: 2.4, depth: 0.9, height: 1.08, color: '#d4d7d6', icon: '▤', price: 1850, position: { x: -5.7, z: 4.45 }, rotation: Math.PI },
    { id: 'reception-chair', type: 'office-chair', category: 'office', name: 'Resepsiyon Koltuğu', width: 0.68, depth: 0.68, height: 1.12, color: '#333b43', icon: '🪑', price: 420, position: { x: -5.7, z: 3.25 }, rotation: 0 },
    { id: 'waiting-sofa', type: 'gltf-sofa', category: 'seating', name: 'Bekleme Koltuğu', width: 2.2, depth: 1.0, height: 1.0, color: '#6f7882', icon: '🛋️', price: 650, position: { x: -1.7, z: 4.35 }, rotation: Math.PI },
    { id: 'guest-chair-1', type: 'gltf-chair', category: 'seating', name: 'Misafir Koltuğu 1', width: 0.72, depth: 0.72, height: 0.96, color: '#6f7882', icon: '🪑', price: 380, position: { x: 0.15, z: 4.35 }, rotation: -Math.PI * 0.84 },
    { id: 'guest-chair-2', type: 'gltf-chair', category: 'seating', name: 'Misafir Koltuğu 2', width: 0.72, depth: 0.72, height: 0.96, color: '#6f7882', icon: '🪑', price: 380, position: { x: 1.05, z: 4.15 }, rotation: Math.PI * 0.82 },
    { id: 'reception-lamp', type: 'gltf-lamp', category: 'electronics', name: 'Resepsiyon Lambası', width: 0.52, depth: 0.52, height: 1.45, color: '#d7a84a', icon: '◉', price: 180, position: { x: 1.85, z: 5.0 }, rotation: 0 },
    { id: 'plant-reception', type: 'gltf-plant', category: 'decor', name: 'Resepsiyon Bitkisi', width: 0.55, depth: 0.55, height: 1.2, color: '#4d8b57', icon: '🪴', price: 90, position: { x: -8.05, z: 4.85 }, rotation: 0 },
    { id: 'reception-table', type: 'side-table', category: 'tables', name: 'Bekleme Sehpası', width: 0.5, depth: 0.5, height: 0.55, color: '#a88962', icon: '🟫', price: 180, position: { x: 2.9, z: 4.65 }, rotation: 0 },
    { id: 'reception-vase', type: 'gltf-vase', category: 'decor', name: 'Karşılama Vazosu', width: 0.35, depth: 0.35, height: 0.7, color: '#d7b4d8', icon: '♢', price: 75, position: { x: 2.9, z: 4.65 }, rotation: 0 },
    { id: 'coat-rack-1', type: 'coat-rack', category: 'office', name: 'Giriş Askılığı', width: 0.58, depth: 0.58, height: 1.8, color: '#866447', icon: '🧥', price: 120, position: { x: -8.35, z: 3.95 }, rotation: 0 },

    // Open-office workstations
    { id: 'ws-1', type: 'workstation', category: 'office', name: 'Çalışma Masası 1', width: 1.6, depth: 0.8, height: 0.76, color: '#9b734d', icon: '🖥️', price: 620, position: { x: -6.4, z: 0.75 }, rotation: 0 },
    { id: 'chair-1', type: 'office-chair', category: 'office', name: 'Ofis Koltuğu 1', width: 0.68, depth: 0.68, height: 1.12, color: '#303842', icon: '🪑', price: 420, position: { x: -6.4, z: 1.75 }, rotation: Math.PI },
    { id: 'worker-1', type: 'office-avatar', category: 'people', name: 'Çalışan Avatar 1', width: 0.62, depth: 0.45, height: 1.78, color: '#4f6f86', icon: '🧑‍💻', price: 0, position: { x: -6.4, z: 1.75 }, rotation: Math.PI, avatarPose: 'working' },
    { id: 'ws-2', type: 'workstation', category: 'office', name: 'Çalışma Masası 2', width: 1.6, depth: 0.8, height: 0.76, color: '#9b734d', icon: '🖥️', price: 620, position: { x: -4.15, z: 0.75 }, rotation: 0 },
    { id: 'chair-2', type: 'office-chair', category: 'office', name: 'Ofis Koltuğu 2', width: 0.68, depth: 0.68, height: 1.12, color: '#303842', icon: '🪑', price: 420, position: { x: -4.15, z: 1.75 }, rotation: Math.PI },
    { id: 'worker-2', type: 'female-office-avatar', category: 'people', name: 'Çalışan Avatar 2', width: 0.62, depth: 0.45, height: 1.78, color: '#9b6fa8', icon: '👩‍💻', price: 0, position: { x: -4.15, z: 1.75 }, rotation: Math.PI, avatarPose: 'working' },
    { id: 'ws-3', type: 'workstation', category: 'office', name: 'Çalışma Masası 3', width: 1.6, depth: 0.8, height: 0.76, color: '#9b734d', icon: '🖥️', price: 620, position: { x: -6.4, z: -2.0 }, rotation: Math.PI },
    { id: 'chair-3', type: 'office-chair', category: 'office', name: 'Ofis Koltuğu 3', width: 0.68, depth: 0.68, height: 1.12, color: '#303842', icon: '🪑', price: 420, position: { x: -6.4, z: -3.0 }, rotation: 0 },
    { id: 'worker-3', type: 'office-avatar', category: 'people', name: 'Çalışan Avatar 3', width: 0.62, depth: 0.45, height: 1.78, color: '#4f6f86', icon: '🧑‍💻', price: 0, position: { x: -6.4, z: -3.0 }, rotation: 0, avatarPose: 'working' },
    { id: 'ws-4', type: 'workstation', category: 'office', name: 'Çalışma Masası 4', width: 1.6, depth: 0.8, height: 0.76, color: '#9b734d', icon: '🖥️', price: 620, position: { x: -4.15, z: -2.0 }, rotation: Math.PI },
    { id: 'chair-4', type: 'office-chair', category: 'office', name: 'Ofis Koltuğu 4', width: 0.68, depth: 0.68, height: 1.12, color: '#303842', icon: '🪑', price: 420, position: { x: -4.15, z: -3.0 }, rotation: 0 },
    { id: 'worker-4', type: 'female-office-avatar', category: 'people', name: 'Çalışan Avatar 4', width: 0.62, depth: 0.45, height: 1.78, color: '#9b6fa8', icon: '👩‍💻', price: 0, position: { x: -4.15, z: -3.0 }, rotation: 0, avatarPose: 'working' },
    { id: 'files-1', type: 'filing-cabinet', category: 'office', name: 'Dosya Dolabı', width: 0.72, depth: 0.48, height: 1.28, color: '#aeb7bf', icon: '▥', price: 440, position: { x: -8.1, z: -4.65 }, rotation: 0 },
    { id: 'printer-1', type: 'printer', category: 'office', name: 'Ofis Yazıcısı', width: 0.62, depth: 0.55, height: 0.46, color: '#e4e7e9', icon: '▧', price: 690, position: { x: -7.0, z: -4.65 }, rotation: 0 },
    { id: 'locker-1', type: 'storage-locker', category: 'office', name: 'Personel Dolabı', width: 1.35, depth: 0.5, height: 1.9, color: '#b7c1c9', icon: '🗄️', price: 860, position: { x: -5.55, z: -4.75 }, rotation: 0 },
    { id: 'bookcase-1', type: 'bookshelf', category: 'storage', name: 'Arşiv Rafı', width: 1.1, depth: 0.34, height: 1.95, color: '#74583f', icon: '📚', price: 260, position: { x: -3.65, z: -4.9 }, rotation: 0 },
    { id: 'cabinet-1', type: 'cabinet', category: 'storage', name: 'Evrak Dolabı', width: 1.1, depth: 0.45, height: 1.45, color: '#6a5a4b', icon: '🗃️', price: 310, position: { x: -2.15, z: -4.85 }, rotation: 0 },
    { id: 'bin-open-1', type: 'trash-bin', category: 'office', name: 'Çöp Kovası', width: 0.34, depth: 0.34, height: 0.46, color: '#5c6670', icon: '🗑️', price: 45, position: { x: -7.95, z: 0.95 }, rotation: 0 },
    { id: 'bin-open-2', type: 'trash-bin', category: 'office', name: 'Çöp Kovası', width: 0.34, depth: 0.34, height: 0.46, color: '#5c6670', icon: '🗑️', price: 45, position: { x: -7.95, z: -1.85 }, rotation: 0 },

    // Meeting room — glass separator + conference furniture
    { id: 'glass-1', type: 'partition', category: 'office', name: 'Cam Bölme 1', width: 2.4, depth: 0.08, height: 2.55, color: '#bdd8e4', icon: '▥', price: 780, position: { x: 1.45, z: -4.3 }, rotation: Math.PI / 2 },
    { id: 'glass-2', type: 'partition', category: 'office', name: 'Cam Bölme 2', width: 2.4, depth: 0.08, height: 2.55, color: '#bdd8e4', icon: '▥', price: 780, position: { x: 1.45, z: -1.9 }, rotation: Math.PI / 2 },
    { id: 'meeting-rug', type: 'rug', category: 'decor', name: 'Toplantı Halısı', width: 5.4, depth: 3.8, height: 0.025, color: '#4c5358', icon: '▰', price: 540, position: { x: 5.2, z: -2.7 }, rotation: 0 },
    { id: 'meeting-table', type: 'meeting-table', category: 'office', name: 'Toplantı Masası', width: 3.0, depth: 1.25, height: 0.76, color: '#896747', icon: '▦', price: 1450, position: { x: 5.2, z: -2.7 }, rotation: 0 },
    { id: 'meet-chair-n1', type: 'conference-chair', category: 'office', name: 'Toplantı Sandalyesi', width: 0.58, depth: 0.58, height: 0.92, color: '#596675', icon: '🪑', price: 280, position: { x: 4.35, z: -1.5 }, rotation: Math.PI },
    { id: 'meet-chair-n2', type: 'conference-chair', category: 'office', name: 'Toplantı Sandalyesi', width: 0.58, depth: 0.58, height: 0.92, color: '#596675', icon: '🪑', price: 280, position: { x: 6.05, z: -1.5 }, rotation: Math.PI },
    { id: 'meet-chair-s1', type: 'conference-chair', category: 'office', name: 'Toplantı Sandalyesi', width: 0.58, depth: 0.58, height: 0.92, color: '#596675', icon: '🪑', price: 280, position: { x: 4.35, z: -3.9 }, rotation: 0 },
    { id: 'meet-chair-s2', type: 'conference-chair', category: 'office', name: 'Toplantı Sandalyesi', width: 0.58, depth: 0.58, height: 0.92, color: '#596675', icon: '🪑', price: 280, position: { x: 6.05, z: -3.9 }, rotation: 0 },
    { id: 'meet-chair-w', type: 'conference-chair', category: 'office', name: 'Toplantı Sandalyesi', width: 0.58, depth: 0.58, height: 0.92, color: '#596675', icon: '🪑', price: 280, position: { x: 3.25, z: -2.7 }, rotation: -Math.PI / 2 },
    { id: 'meet-chair-e', type: 'conference-chair', category: 'office', name: 'Toplantı Sandalyesi', width: 0.58, depth: 0.58, height: 0.92, color: '#596675', icon: '🪑', price: 280, position: { x: 7.15, z: -2.7 }, rotation: Math.PI / 2 },
    { id: 'whiteboard-1', type: 'whiteboard', category: 'office', name: 'Toplantı Beyaz Tahtası', width: 1.8, depth: 0.08, height: 1.25, color: '#f6f8f8', icon: '□', price: 320, position: { x: 5.2, z: -5.35 }, rotation: 0 },
    { id: 'plant-meeting', type: 'gltf-plant', category: 'decor', name: 'Toplantı Odası Bitkisi', width: 0.55, depth: 0.55, height: 1.2, color: '#4d8b57', icon: '🪴', price: 90, position: { x: 8.0, z: -4.9 }, rotation: 0 },
    { id: 'meeting-screen', type: 'tv', category: 'electronics', name: 'Toplantı Ekranı', width: 1.8, depth: 0.18, height: 1.05, color: '#1f2933', icon: '📺', price: 780, position: { x: 8.05, z: -2.7 }, rotation: -Math.PI / 2 },
    { id: 'acoustic-meeting-1', type: 'acoustic-panel', category: 'office', name: 'Akustik Panel', width: 1.2, depth: 0.08, height: 0.8, color: '#70889b', icon: '▥', price: 150, position: { x: 5.2, z: -0.92 }, rotation: Math.PI },
    { id: 'acoustic-meeting-2', type: 'acoustic-panel', category: 'office', name: 'Akustik Panel', width: 1.2, depth: 0.08, height: 0.8, color: '#70889b', icon: '▥', price: 150, position: { x: 2.45, z: -2.7 }, rotation: -Math.PI / 2 },

    // Lighting / RTLS / camera infrastructure
    { id: 'light-1', type: 'ceiling-panel-light', category: 'office', name: 'LED Panel 1', width: 1.2, depth: 0.32, height: 2.85, color: '#fff4da', icon: '💡', price: 190, position: { x: -5.4, z: -1.0 }, rotation: 0 },
    { id: 'light-2', type: 'ceiling-panel-light', category: 'office', name: 'LED Panel 2', width: 1.2, depth: 0.32, height: 2.85, color: '#fff4da', icon: '💡', price: 190, position: { x: -1.8, z: -1.0 }, rotation: 0 },
    { id: 'light-3', type: 'ceiling-panel-light', category: 'office', name: 'LED Panel 3', width: 1.2, depth: 0.32, height: 2.85, color: '#fff4da', icon: '💡', price: 190, position: { x: 3.1, z: -2.5 }, rotation: 0 },
    { id: 'light-4', type: 'ceiling-panel-light', category: 'office', name: 'LED Panel 4', width: 1.2, depth: 0.32, height: 2.85, color: '#fff4da', icon: '💡', price: 190, position: { x: 6.4, z: -2.5 }, rotation: 0 },
    { id: 'light-5', type: 'ceiling-panel-light', category: 'office', name: 'LED Panel 5', width: 1.2, depth: 0.32, height: 2.85, color: '#fff4da', icon: '💡', price: 190, position: { x: -4.0, z: 3.8 }, rotation: 0 },
    { id: 'light-6', type: 'ceiling-panel-light', category: 'office', name: 'LED Panel 6', width: 1.2, depth: 0.32, height: 2.85, color: '#fff4da', icon: '💡', price: 190, position: { x: 2.3, z: 3.8 }, rotation: 0 },
    { id: 'gateway-1', type: 'rtls-gateway', category: 'electronics', name: 'RTLS Gateway', width: 0.34, depth: 0.24, height: 2.55, color: '#eef2f4', icon: '📡', price: 850, position: { x: 0, z: 0.2 }, rotation: 0, signalRange: 12 },
    { id: 'beacon-nw', type: 'rtls-beacon', category: 'electronics', name: 'RTLS Anchor NW', width: 0.18, depth: 0.18, height: 2.5, color: '#f3f6f7', icon: '◉', price: 140, position: { x: -7.5, z: -4.8 }, rotation: 0, signalRange: 7 },
    { id: 'beacon-ne', type: 'rtls-beacon', category: 'electronics', name: 'RTLS Anchor NE', width: 0.18, depth: 0.18, height: 2.5, color: '#f3f6f7', icon: '◉', price: 140, position: { x: 7.4, z: -4.8 }, rotation: 0, signalRange: 7 },
    { id: 'beacon-sw', type: 'rtls-beacon', category: 'electronics', name: 'RTLS Anchor SW', width: 0.18, depth: 0.18, height: 2.5, color: '#f3f6f7', icon: '◉', price: 140, position: { x: -7.5, z: 4.7 }, rotation: 0, signalRange: 7 },
    { id: 'beacon-se', type: 'rtls-beacon', category: 'electronics', name: 'RTLS Anchor SE', width: 0.18, depth: 0.18, height: 2.5, color: '#f3f6f7', icon: '◉', price: 140, position: { x: 7.4, z: 4.7 }, rotation: 0, signalRange: 7 },
    { id: 'beacon-center-west', type: 'rtls-beacon', category: 'electronics', name: 'RTLS Anchor CW', width: 0.18, depth: 0.18, height: 2.5, color: '#f3f6f7', icon: '◉', price: 140, position: { x: -1.9, z: -0.3 }, rotation: 0, signalRange: 7 },
    { id: 'beacon-center-east', type: 'rtls-beacon', category: 'electronics', name: 'RTLS Anchor CE', width: 0.18, depth: 0.18, height: 2.5, color: '#f3f6f7', icon: '◉', price: 140, position: { x: 2.1, z: 1.5 }, rotation: 0, signalRange: 7 },
    { id: 'camera-north', type: 'security-camera', category: 'security', name: 'Kuzey Kamera', width: 0.25, depth: 0.2, height: 2.4, color: '#f0f2f3', icon: '🎥', price: 520, position: { x: 0, z: -6 }, rotation: 0, wallRotation: 0, hasVisionCone: true, visionRange: 12, visionFov: 103, cctvModelId: 'hik-2cd2143g2' },
    { id: 'camera-east', type: 'security-camera', category: 'security', name: 'Doğu Kamera', width: 0.25, depth: 0.2, height: 2.4, color: '#f0f2f3', icon: '🎥', price: 520, position: { x: 9, z: 1.8 }, rotation: -Math.PI / 2, wallRotation: -Math.PI / 2, hasVisionCone: true, visionRange: 12, visionFov: 103, cctvModelId: 'hik-2cd2143g2' },

    // Natural light and entrance
    { id: 'window-n1', type: 'window', category: 'structure', name: 'Pencere 1', width: 1.8, depth: 0.12, height: 1.25, color: '#a9d6e8', icon: '🪟', price: 420, position: { x: -5.5, z: -6 }, rotation: 0 },
    { id: 'window-n2', type: 'window', category: 'structure', name: 'Pencere 2', width: 1.8, depth: 0.12, height: 1.25, color: '#a9d6e8', icon: '🪟', price: 420, position: { x: -2.8, z: -6 }, rotation: 0 },
    { id: 'window-n3', type: 'window', category: 'structure', name: 'Pencere 3', width: 1.8, depth: 0.12, height: 1.25, color: '#a9d6e8', icon: '🪟', price: 420, position: { x: 2.8, z: -6 }, rotation: 0 },
    { id: 'window-n4', type: 'window', category: 'structure', name: 'Pencere 4', width: 1.8, depth: 0.12, height: 1.25, color: '#a9d6e8', icon: '🪟', price: 420, position: { x: 7.0, z: -6 }, rotation: 0 },
    { id: 'door-main', type: 'door', category: 'structure', name: 'Ana Giriş', width: 0.95, depth: 0.12, height: 2.1, color: '#6d5138', icon: '🚪', price: 360, position: { x: -7.2, z: 6 }, rotation: Math.PI },

    // Breakout / kitchenette corner
    { id: 'pantry-counter-1', type: 'counter', category: 'kitchen', name: 'Pantry Tezgâhı 1', width: 1.25, depth: 0.65, height: 0.92, color: '#d2cbc2', icon: '🟫', price: 280, position: { x: 4.9, z: 4.95 }, rotation: 0 },
    { id: 'pantry-counter-2', type: 'counter', category: 'kitchen', name: 'Pantry Tezgâhı 2', width: 1.25, depth: 0.65, height: 0.92, color: '#d2cbc2', icon: '🟫', price: 280, position: { x: 6.25, z: 4.95 }, rotation: 0 },
    { id: 'pantry-fridge', type: 'fridge', category: 'kitchen', name: 'Mini Buzdolabı', width: 0.7, depth: 0.7, height: 1.8, color: '#dfe3e5', icon: '🧊', price: 1200, position: { x: 7.95, z: 5.0 }, rotation: 0 },
    { id: 'coffee-machine-1', type: 'coffee-machine', category: 'office', name: 'Kahve Makinesi', width: 0.42, depth: 0.34, height: 0.48, color: '#262d34', icon: '☕', price: 290, position: { x: 4.55, z: 4.78 }, rotation: 0 },
    { id: 'water-cooler-1', type: 'water-cooler', category: 'office', name: 'Su Sebili', width: 0.42, depth: 0.42, height: 1.35, color: '#eef2f5', icon: '💧', price: 260, position: { x: 8.1, z: 3.65 }, rotation: 0 },
    { id: 'pantry-plant', type: 'gltf-plant', category: 'decor', name: 'Pantry Bitkisi', width: 0.55, depth: 0.55, height: 1.2, color: '#4d8b57', icon: '🪴', price: 90, position: { x: 3.7, z: 5.15 }, rotation: 0 },
    { id: 'pantry-bin', type: 'trash-bin', category: 'office', name: 'Çöp Kovası', width: 0.34, depth: 0.34, height: 0.46, color: '#5c6670', icon: '🗑️', price: 45, position: { x: 7.25, z: 3.9 }, rotation: 0 },

    // Acoustic comfort
    { id: 'acoustic-open-1', type: 'acoustic-panel', category: 'office', name: 'Akustik Panel', width: 1.2, depth: 0.08, height: 0.8, color: '#90a4b8', icon: '▥', price: 150, position: { x: -1.15, z: 0.35 }, rotation: Math.PI / 2 },
    { id: 'acoustic-open-2', type: 'acoustic-panel', category: 'office', name: 'Akustik Panel', width: 1.2, depth: 0.08, height: 0.8, color: '#90a4b8', icon: '▥', price: 150, position: { x: -1.15, z: -2.2 }, rotation: Math.PI / 2 },
  ],
};

export const INITIAL_LAYOUT: RoomLayout = {
  name: 'RTLS Ofis - Demo Katı',
  width: 18,
  height: 12,
  floors: [INITIAL_GROUND_FLOOR],
  roof: { style: 'flat', color: '#3d444a' },
  floorPlanOpacity: 0.5,
  floorPlanFitMode: 'stretch',
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    // -- building-level properties ------------------------------------------
    case 'setName':
      return withLayout(state, (layout) => ({ ...layout, name: action.name }));
    // Width/height must be clamped here, not only in normaliseLayout: an
    // out-of-range dimension that reaches localStorage fails schema validation
    // on the next load, and the fallback layout then autosaves over the
    // user's house (#113).
    case 'setWidth':
      return withLayout(state, (layout) => ({ ...layout, width: clampRoomDimension(action.width) }));
    case 'setHeight':
      return withLayout(state, (layout) => ({ ...layout, height: clampRoomDimension(action.height) }));

    case 'resizeRoom':
      return withLayout(state, (layout) => {
        const width = clampRoomDimension(action.width);
        const height = clampRoomDimension(action.height);
        const resizeWalls = (walls: readonly InteriorWall[] | undefined): InteriorWall[] | undefined =>
          walls?.map((wall) => resizeWallWithAnchoredEndpoints(
            wall,
            layout.width,
            layout.height,
            width,
            height,
            action.shiftX,
            action.shiftZ,
          ));
        const next = {
          ...layout,
          width,
          height,
          boundaryWalls: resizeWalls(layout.boundaryWalls),
          floors: layout.floors.map((floor, index) => index === state.activeFloorIndex ? {
            ...floor,
            items: floor.items.map((item) => item.position ? {
              ...item,
              position: { x: item.position.x + action.shiftX, z: item.position.z + action.shiftZ },
            } : item),
            interiorWalls: resizeWalls(floor.interiorWalls),
          } : floor),
        };
        return normaliseBoundarySize(next);
      });

    // -- floor-scoped finishes ----------------------------------------------
    case 'setFloorColor':
      return withActiveFloor(state, (floor) => ({ ...floor, floorColor: action.color }));
    case 'setFloorPattern':
      return withActiveFloor(state, (floor) => ({ ...floor, floorPattern: action.pattern }));
    case 'setWallPattern':
      return withActiveFloor(state, (floor) => ({ ...floor, wallPattern: action.pattern }));
    case 'setWallColor':
      return withActiveFloor(state, (floor) => {
        const next = { ...(floor.wallColors ?? {}) };
        if (action.color === null) delete next[action.wall];
        else next[action.wall] = action.color;
        return { ...floor, wallColors: next };
      });
    case 'setInteriorWallColor':
      return withActiveFloor(state, (floor) => ({
        ...floor,
        interiorWalls: (floor.interiorWalls ?? []).map((wall) =>
          wall.id === action.id ? { ...wall, color: action.color } : wall
        ),
      }));

    // -- floor plan ---------------------------------------------------------
    case 'setFloorPlan': {
      if (action.image === null) {
        return withLayout(state, (layout) => {
          const next = { ...layout };
          delete next.floorPlanImage;
          return next;
        });
      }
      return withLayout(state, (layout) => ({ ...layout, floorPlanImage: action.image! }));
    }
    case 'setFloorPlanOpacity':
      return withLayout(state, (layout) => ({ ...layout, floorPlanOpacity: action.opacity }));
    case 'setFloorPlanFitMode':
      return withLayout(state, (layout) => ({ ...layout, floorPlanFitMode: action.mode }));

    // -- roof ---------------------------------------------------------------
    case 'setRoofStyle':
      return withLayout(state, (layout) => ({
        ...layout,
        roof: { ...(layout.roof ?? { style: 'none' }), style: action.style },
      }));
    case 'setRoofColor':
      return withLayout(state, (layout) => ({
        ...layout,
        roof: { ...(layout.roof ?? { style: 'flat' }), color: action.color },
      }));

    // -- item CRUD ----------------------------------------------------------
    case 'addCatalogItem': {
      const dimensions = action.catalogItem.customModelId
        ? normaliseCustomItemDimensions(action.catalogItem)
        : undefined;
      const newItem: FurnitureItem = {
        ...action.catalogItem,
        ...(dimensions ?? {}),
        id: action.id,
        locked: false,
        position: action.position ?? { x: 0, z: 0 },
        rotation: 0,
        ...(action.catalogItem.type === 'sofa' ? { sofaShape: 'standard' as const } : {}),
      };
      return withActiveFloor(state, (floor) => ({ ...floor, items: [...floor.items, newItem] }));
    }

    case 'removeItem':
      return withActiveFloor(state, (floor) => ({
        ...floor,
        items: floor.items.filter((item) => item.id !== action.id),
      }));

    case 'updateItem':
      return withActiveFloor(state, (floor) => ({
        ...floor,
        items: floor.items.map((item) =>
          item.id === action.id ? { ...item, ...action.patch } : item
        ),
      }));

    case 'duplicateItem':
      return withActiveFloor(state, (floor) => {
        const source = floor.items.find((item) => item.id === action.sourceId);
        if (!source) return floor;
        const position = source.position ?? { x: 0, z: 0 };
        const offset = { x: position.x + 0.5, z: position.z + 0.5 };
        // The raw +0.5/+0.5 offset stranded duplicated doors/windows/cameras
        // off their wall and pushed copies near the +x/+z walls outside the
        // room (#116): wall-mounted copies re-snap onto the wall (shifted
        // along it) and indoor items clamp to the footprint. Outdoor items
        // belong outside and keep the raw offset.
        const settled = settleWallMountedItem(
          source,
          offset,
          state.layout.width,
          state.layout.height,
          floor.interiorWalls ?? []
        );
        const copy: FurnitureItem = settled
          ? { ...source, id: action.newId, ...settled }
          : {
              ...source,
              id: action.newId,
              position:
                source.category === 'outdoor'
                  ? offset
                  : clampToFootprint(source, offset, state.layout.width, state.layout.height),
            };
        return { ...floor, items: [...floor.items, copy] };
      });

    case 'rotateItem':
      return patchItem(state, action.id, (item) => ({
        rotation: ((item.rotation ?? 0) + Math.PI / 2) % (Math.PI * 2),
      }));

    case 'moveItem':
      return patchItem(state, action.id, (item) => {
        const position = { x: action.x, z: action.z };
        const floor = state.layout.floors[state.activeFloorIndex];
        if (isOpening(item.type)) {
          return settleWallMountedItem(item, position, state.layout.width, state.layout.height,
            floor?.interiorWalls, state.layout.boundaryWalls) ?? {};
        }
        return { position };
      });

    case 'resizeItem':
      return patchItem(state, action.id, () => ({
        [action.dimension]: Math.max(0.1, action.value),
      }));

    case 'setSofaShape':
      return patchItem(state, action.id, () => ({ sofaShape: action.shape }));

    case 'setSignalRange':
      return patchItem(state, action.id, () => ({ signalRange: action.range }));

    case 'setColor':
      return patchItem(state, action.id, () => ({ color: action.color }));

    case 'setLocked':
      return patchItem(state, action.id, () => ({ locked: action.locked }));

    case 'toggleMirror':
      return patchItem(state, action.id, (item) => ({ mirrored: !item.mirrored }));

    case 'setRotation':
      return patchItem(state, action.id, () => ({ rotation: action.rotation }));

    // -- bulk item operations -----------------------------------------------
    case 'replaceItems':
      return withActiveFloor(state, (floor) => ({ ...floor, items: action.items }));

    case 'addItems':
      return withActiveFloor(state, (floor) => ({ ...floor, items: [...floor.items, ...action.items] }));

    case 'bulkSetPositions':
      return withActiveFloor(state, (floor) => ({
        ...floor,
        items: floor.items.map((item) => {
          // Locked items are immune to bulk moves (group drag, align,
          // distribute) — enforced here so no caller can shove them (#115).
          if (item.locked) return item;
          const next = action.positions.get(item.id);
          return next ? { ...item, position: { x: next.x, z: next.z } } : item;
        }),
      }));

    case 'rotateSelection':
      return withActiveFloor(state, (floor) => {
        // Rotate the whole group about its centroid: each selected item both
        // spins in place (its own rotation) AND orbits the centroid, so the
        // arrangement is preserved instead of every piece twisting individually.
        const selected = floor.items.filter(
          (item) => action.ids.has(item.id) && item.position
        );
        if (selected.length === 0) return floor;
        let cx = 0;
        let cz = 0;
        for (const item of selected) {
          cx += item.position!.x;
          cz += item.position!.z;
        }
        cx /= selected.length;
        cz /= selected.length;
        // `group.rotation.y = rotation` (Three RY) maps a local offset (dx, dz)
        // to world (dx·cosθ + dz·sinθ, −dx·sinθ + dz·cosθ). Use that same matrix
        // for the orbit so the position sweep matches the rendered spin.
        const theta = action.radians;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        return {
          ...floor,
          items: floor.items.map((item) => {
            if (!action.ids.has(item.id)) return item;
            const nextRotation = ((item.rotation ?? 0) + theta) % (Math.PI * 2);
            if (!item.position) {
              return { ...item, rotation: nextRotation };
            }
            const dx = item.position.x - cx;
            const dz = item.position.z - cz;
            return {
              ...item,
              rotation: nextRotation,
              position: {
                x: cx + dx * cos + dz * sin,
                z: cz - dx * sin + dz * cos,
              },
            };
          }),
        };
      });

    case 'setLockAll':
      return withActiveFloor(state, (floor) => ({
        ...floor,
        items: floor.items.map((item) => ({ ...item, locked: action.locked })),
      }));

    case 'clearItems':
      return withActiveFloor(state, (floor) => ({ ...floor, items: [] }));

    // -- interior walls -----------------------------------------------------
    case 'addInteriorWall':
      return withActiveFloor(state, (floor) => ({
        ...floor,
        interiorWalls: [...(floor.interiorWalls ?? []), action.wall],
      }));

    // Batch insert — a room-shape stamp adds every segment in one dispatch so
    // the whole stamp is a single history/undo entry rather than N of them.
    case 'addInteriorWalls': {
      if (action.walls.length === 0) return state;
      return withActiveFloor(state, (floor) => ({
        ...floor,
        interiorWalls: [...(floor.interiorWalls ?? []), ...action.walls],
      }));
    }

    case 'updateInteriorWall':
      return withActiveFloor(state, (floor) => ({
        ...floor,
        interiorWalls: (floor.interiorWalls ?? []).map((wall) =>
          wall.id === action.id ? { ...wall, ...action.patch } : wall
        ),
      }));

    case 'updateBoundaryWall':
      return withLayout(state, (layout) => {
        const walls = layout.boundaryWalls ?? [
          { id: 'outer-north', x1: -layout.width / 2, z1: -layout.height / 2, x2: layout.width / 2, z2: -layout.height / 2 },
          { id: 'outer-east', x1: layout.width / 2, z1: -layout.height / 2, x2: layout.width / 2, z2: layout.height / 2 },
          { id: 'outer-south', x1: layout.width / 2, z1: layout.height / 2, x2: -layout.width / 2, z2: layout.height / 2 },
          { id: 'outer-west', x1: -layout.width / 2, z1: layout.height / 2, x2: -layout.width / 2, z2: -layout.height / 2 },
        ];
        const target = walls.find((wall) => wall.id === action.id);
        if (!target) return layout;
        const nextTarget = { ...target, ...action.patch };
        const samePoint = (ax: number, az: number, bx: number, bz: number) =>
          Math.abs(ax - bx) < 0.001 && Math.abs(az - bz) < 0.001;
        const updatePoint = (wall: InteriorWall, x: number, z: number, nx: number, nz: number): InteriorWall => ({
          ...wall,
          ...(samePoint(wall.x1, wall.z1, x, z) ? { x1: nx, z1: nz } : {}),
          ...(samePoint(wall.x2, wall.z2, x, z) ? { x2: nx, z2: nz } : {}),
        });
        const movedPoints = [
          { x: target.x1, z: target.z1, nx: nextTarget.x1, nz: nextTarget.z1 },
          { x: target.x2, z: target.z2, nx: nextTarget.x2, nz: nextTarget.z2 },
        ];
        return normaliseBoundarySize({
          ...layout,
          boundaryWalls: walls.map((wall) => {
            if (wall.id === action.id) return nextTarget;
            return movedPoints.reduce((current, point) => updatePoint(current, point.x, point.z, point.nx, point.nz), wall);
          }),
        });
      });

    case 'removeInteriorWall':
      return withActiveFloor(state, (floor) => ({
        ...floor,
        interiorWalls: (floor.interiorWalls ?? []).filter((wall) => wall.id !== action.id),
      }));

    case 'toggleExteriorWall':
      return withActiveFloor(state, (floor) => {
        const hidden = floor.hiddenWalls ?? [];
        const isHidden = hidden.includes(action.wallId);
        return {
          ...floor,
          hiddenWalls: isHidden
            ? hidden.filter((w) => w !== action.wallId)
            : [...hidden, action.wallId],
        };
    });

    case 'clearInteriorWalls':
      return withActiveFloor(state, (floor) => ({ ...floor, interiorWalls: [] }));

    // -- floor / building operations ----------------------------------------
    case 'setActiveFloorIndex':
      return { ...state, activeFloorIndex: clampActiveIndex(action.index, state.layout.floors.length) };

    case 'addFloor': {
      if (state.layout.floors.length >= MAX_FLOORS) return state;
      const name = action.floor.name ?? defaultFloorName(state.layout.floors);
      const floor: FloorLayout = { ...action.floor, name };
      const floors = [...state.layout.floors, floor];
      return {
        layout: { ...state.layout, floors },
        activeFloorIndex: floors.length - 1,
      };
    }

    case 'duplicateFloor': {
      if (state.layout.floors.length >= MAX_FLOORS) return state;
      const source = state.layout.floors[action.sourceIndex];
      if (!source) return state;
      // `action.idSuffix` is a per-duplication random tag generated OUTSIDE the
      // reducer (see use-layout-store.ts): it alone makes the cloned ids
      // unique, keeping the reducer fully deterministic in its inputs — the
      // Date.now() stamp it used to mix in broke that purity for no extra
      // collision protection (#122).
      const clonedItems: FurnitureItem[] = source.items.map((item, idx) => ({
        ...item,
        id: `${item.type}-${action.idSuffix}-${idx}`,
      }));
      const clonedWalls: InteriorWall[] | undefined = source.interiorWalls?.map((wall, idx) => ({
        ...wall,
        id: `wall-${action.idSuffix}-${idx}`,
      }));
      const floor: FloorLayout = {
        ...source,
        id: action.newId,
        name: `${source.name} copy`,
        items: clonedItems,
        ...(clonedWalls ? { interiorWalls: clonedWalls } : {}),
      };
      const floors = [...state.layout.floors, floor];
      return { layout: { ...state.layout, floors }, activeFloorIndex: floors.length - 1 };
    }

    case 'removeFloor': {
      if (state.layout.floors.length <= 1) return state;
      const floors = state.layout.floors.filter((_, index) => index !== action.index);
      // Removing a floor below the active one shifts the active floor down a
      // slot; without the adjustment the editor silently switches floors.
      const nextActive =
        action.index < state.activeFloorIndex ? state.activeFloorIndex - 1 : state.activeFloorIndex;
      return {
        layout: { ...state.layout, floors },
        activeFloorIndex: clampActiveIndex(nextActive, floors.length),
      };
    }

    case 'renameFloor': {
      const floors = state.layout.floors.map((floor, index) =>
        index === action.index ? { ...floor, name: action.name } : floor
      );
      return { ...state, layout: { ...state.layout, floors } };
    }

    case 'reorderFloor': {
      const { from, to } = action;
      if (from === to || from < 0 || to < 0) return state;
      if (from >= state.layout.floors.length || to >= state.layout.floors.length) return state;
      const floors = [...state.layout.floors];
      const [moved] = floors.splice(from, 1);
      if (moved !== undefined) floors.splice(to, 0, moved);
      // The same floor stays active through the move — reordering a different
      // floor must not jump the editor to it.
      let active = state.activeFloorIndex;
      if (from === active) {
        active = to;
      } else {
        if (from < active) active -= 1;
        if (to <= active) active += 1;
      }
      return {
        layout: { ...state.layout, floors },
        activeFloorIndex: clampActiveIndex(active, floors.length),
      };
    }

    case 'applyLayout': {
      const layout = normaliseBoundarySize(normaliseLayout(action.layout));
      // Clamp instead of resetting to 0 so undo/redo of an edit made on an
      // upper floor doesn't jump the view back to the ground floor.
      return {
        layout,
        activeFloorIndex: clampActiveIndex(state.activeFloorIndex, layout.floors.length),
      };
    }

    default:
      return assertNever(action);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Move a wall with the room, while keeping endpoints attached to moved edges. */
function resizeWallWithAnchoredEndpoints(
  wall: InteriorWall,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  shiftX: number,
  shiftZ: number,
): InteriorWall {
  const oldMinX = -oldWidth / 2;
  const oldMaxX = oldWidth / 2;
  const oldMinZ = -oldHeight / 2;
  const oldMaxZ = oldHeight / 2;
  const newMinX = -newWidth / 2 + shiftX;
  const newMaxX = newWidth / 2 + shiftX;
  const newMinZ = -newHeight / 2 + shiftZ;
  const newMaxZ = newHeight / 2 + shiftZ;
  const tolerance = 0.08;
  const resizePoint = (x: number, z: number): { x: number; z: number } => {
    const point = { x: x + shiftX, z: z + shiftZ };
    if (Math.abs(x - oldMinX) <= tolerance) point.x = newMinX;
    else if (Math.abs(x - oldMaxX) <= tolerance) point.x = newMaxX;
    if (Math.abs(z - oldMinZ) <= tolerance) point.z = newMinZ;
    else if (Math.abs(z - oldMaxZ) <= tolerance) point.z = newMaxZ;
    return point;
  };
  const start = resizePoint(wall.x1, wall.z1);
  const end = resizePoint(wall.x2, wall.z2);
  return { ...wall, x1: start.x, z1: start.z, x2: end.x, z2: end.z };
}

function normaliseBoundarySize(layout: RoomLayout): RoomLayout {
  const walls = layout.boundaryWalls;
  if (!walls || walls.length < 3) return layout;
  const xs = walls.flatMap((wall) => [wall.x1, wall.x2]);
  const zs = walls.flatMap((wall) => [wall.z1, wall.z2]);
  const width = Math.max(1, Math.max(...xs) - Math.min(...xs));
  const height = Math.max(1, Math.max(...zs) - Math.min(...zs));
  return { ...layout, width, height };
}

function withLayout(state: LayoutState, update: (layout: RoomLayout) => RoomLayout): LayoutState {
  return { ...state, layout: update(state.layout) };
}

function withActiveFloor(state: LayoutState, update: (floor: FloorLayout) => FloorLayout): LayoutState {
  const floors = state.layout.floors;
  const current = floors[state.activeFloorIndex];
  if (!current) return state;
  const next = update(current);
  if (next === current) return state;
  const nextFloors = floors.map((floor, index) => (index === state.activeFloorIndex ? next : floor));
  return { ...state, layout: { ...state.layout, floors: nextFloors } };
}

function patchItem(
  state: LayoutState,
  id: string,
  patch: (item: FurnitureItem) => Partial<FurnitureItem>
): LayoutState {
  return withActiveFloor(state, (floor) => ({
    ...floor,
    items: floor.items.map((item) =>
      item.id === id ? { ...item, ...patch(item) } : item
    ),
  }));
}

function clampRoomDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(value, MAX_ROOM_DIMENSION);
}

/** Clamp a position so the item's rotated footprint stays inside the room. */
function clampToFootprint(
  item: Pick<FurnitureItem, 'width' | 'depth' | 'rotation'>,
  position: { x: number; z: number },
  roomWidth: number,
  roomDepth: number
): { x: number; z: number } {
  const { halfW, halfD } = rotatedHalfExtents(item);
  const maxX = Math.max(0, roomWidth / 2 - halfW);
  const maxZ = Math.max(0, roomDepth / 2 - halfD);
  return {
    x: Math.min(maxX, Math.max(-maxX, position.x)),
    z: Math.min(maxZ, Math.max(-maxZ, position.z)),
  };
}

function normaliseLayout(layout: RoomLayout): RoomLayout {
  // Defense in depth: even after schema validation, clamp dimensions and floor
  // count here so any layout reaching the reducer stays within safe bounds.
  const width = clampRoomDimension(layout.width);
  const height = clampRoomDimension(layout.height);
  const floors =
    layout.floors.length === 0
      ? [INITIAL_GROUND_FLOOR]
      : layout.floors.slice(0, MAX_FLOORS).map((floor) => ({
          ...floor,
          floorColor: floor.floorColor || DEFAULT_FLOOR_COLOR,
          items: floor.items.map((item) => ({
            ...item,
            color: item.color || '#cbd5e1',
            position: item.position ?? { x: 0, z: 0 },
          })),
        }));
  return { ...layout, width, height, floors };
}

function clampActiveIndex(index: number, floorCount: number): number {
  if (floorCount <= 0) return 0;
  return Math.max(0, Math.min(floorCount - 1, index));
}

function assertNever(value: never): never {
  throw new Error(`Unexpected action: ${JSON.stringify(value)}`);
}

const FLOOR_NAMES = ['First Floor', 'Second Floor', 'Third Floor', 'Fourth Floor'] as const;

function defaultFloorName(existing: ReadonlyArray<FloorLayout>): string {
  if (existing.length === 0) return 'Ground Floor';
  const fallback = FLOOR_NAMES[existing.length - 1];
  return fallback ?? `Floor ${existing.length + 1}`;
}
