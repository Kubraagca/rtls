export interface DigitalTwinPoint {
  x: number;
  z: number;
}

export interface DigitalTwinArea {
  id: string;
  label: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
}

export interface DigitalTwinPath {
  id: string;
  label: string;
  points: readonly DigitalTwinPoint[];
}

export interface DigitalTwinHeatSpot extends DigitalTwinPoint {
  radius: number;
  intensity: number;
}

/**
 * Demo spatial metadata for the starter office. These are deliberately kept
 * separate from the furniture list so the live Digital Twin layer can later
 * be replaced by areas/paths coming from the RTLS backend without rewriting
 * the renderer.
 */
export const OFFICE_DIGITAL_TWIN_AREAS: readonly DigitalTwinArea[] = [
  { id: 'area-reception', label: 'Resepsiyon', x: -3.5, z: 4.25, width: 10.0, depth: 2.7, color: '#55c7a6' },
  { id: 'area-open-office', label: 'Açık Ofis', x: -5.05, z: -1.15, width: 7.25, depth: 6.55, color: '#5da8ff' },
  { id: 'area-meeting', label: 'Toplantı Odası', x: 5.25, z: -2.75, width: 6.55, depth: 4.85, color: '#b28cff' },
  { id: 'area-pantry', label: 'Pantry', x: 5.95, z: 4.55, width: 5.45, depth: 2.45, color: '#f0b85e' },
];

export const OFFICE_DIGITAL_TWIN_PATHS: readonly DigitalTwinPath[] = [
  {
    id: 'path-main',
    label: 'Ana dolaşım',
    points: [
      { x: -7.2, z: 5.45 },
      { x: -5.7, z: 3.05 },
      { x: -2.0, z: 2.55 },
      { x: 0.25, z: 1.25 },
      { x: 1.65, z: -0.25 },
      { x: 3.1, z: -1.1 },
      { x: 5.2, z: -2.7 },
    ],
  },
  {
    id: 'path-pantry',
    label: 'Pantry rotası',
    points: [
      { x: -0.25, z: 1.45 },
      { x: 1.1, z: 2.55 },
      { x: 3.2, z: 3.55 },
      { x: 5.7, z: 4.25 },
      { x: 7.6, z: 4.25 },
    ],
  },
  {
    id: 'path-workstations',
    label: 'Çalışma alanı rotası',
    points: [
      { x: -2.0, z: 2.55 },
      { x: -4.1, z: 1.65 },
      { x: -6.25, z: 1.55 },
      { x: -6.25, z: -2.95 },
      { x: -4.1, z: -2.95 },
    ],
  },
];

export const OFFICE_DIGITAL_TWIN_HEAT_SPOTS: readonly DigitalTwinHeatSpot[] = [
  { x: -5.25, z: 0.2, radius: 2.0, intensity: 0.95 },
  { x: -4.9, z: -2.25, radius: 1.7, intensity: 0.82 },
  { x: 5.2, z: -2.7, radius: 1.9, intensity: 0.74 },
  { x: -2.0, z: 3.95, radius: 1.6, intensity: 0.58 },
  { x: 6.1, z: 4.45, radius: 1.4, intensity: 0.48 },
];

export interface DigitalTwinLayerState {
  labels: boolean;
  devices: boolean;
  areas: boolean;
  paths: boolean;
  heatmap: boolean;
  cameras: boolean;
  signals: boolean;
}

export const DEFAULT_DIGITAL_TWIN_LAYERS: DigitalTwinLayerState = {
  labels: true,
  devices: true,
  areas: true,
  paths: false,
  heatmap: false,
  cameras: false,
  signals: false,
};
