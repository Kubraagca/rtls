import type { CatalogItem } from './types';

/**
 * Custom GLB assets shipped with the demo. They must be part of the static
 * catalog as well as the default layout: browser-local IndexedDB entries are
 * intentionally not shared between browsers or devices.
 */
export const BUNDLED_CUSTOM_MODEL_PATHS: Readonly<Record<string, string>> = {
  'glb-01af2111-c1c5-499b-a855-4c852e26cfa5': 'models/custom/masa_optimized.glb',
  'glb-f0883e91-e13c-4629-bea2-a11a24b4cd9d': 'models/custom/desk-chair_optimized.glb',
};

export const BUNDLED_CUSTOM_CATALOG_ITEMS = [
  {
    type: 'glb-01af2111-c1c5-499b-a855-4c852e26cfa5',
    name: 'Barfas Masa',
    category: 'tables',
    width: 2.9285714285714284,
    depth: 3,
    height: 0.9285714285714286,
    color: '#cbd5e1',
    icon: '◇',
    price: 0,
    customModelId: 'glb-01af2111-c1c5-499b-a855-4c852e26cfa5',
    customModelFileName: 'masa_optimized.glb',
    customModelBytes: 6053632,
    customModelUrl: 'models/custom/masa_optimized.glb',
  },
  {
    type: 'glb-f0883e91-e13c-4629-bea2-a11a24b4cd9d',
    name: 'Barfas Sandalye',
    category: 'seating',
    width: 1.1,
    depth: 1.5,
    height: 1.2,
    color: '#cbd5e1',
    icon: '♧',
    price: 0,
    customModelId: 'glb-f0883e91-e13c-4629-bea2-a11a24b4cd9d',
    customModelFileName: 'desk-chair_optimized.glb',
    customModelBytes: 1470312,
    customModelUrl: 'models/custom/desk-chair_optimized.glb',
  },
] as const satisfies readonly CatalogItem[];
