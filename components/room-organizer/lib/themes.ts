import type { FloorLayout, FloorPattern, RoomLayout, ThemeKey, WallId, WallPattern } from './types';

export interface ThemeMeta {
  key: ThemeKey;
  label: string;
  icon: string;
  description: string;
}

export interface ThemeDefinition extends ThemeMeta {
  floorColor: string;
  floorPattern: FloorPattern;
  wallPattern: WallPattern;
  wallColors: Record<WallId, string>;
  /** Mapping from furniture category to a representative color. */
  furniturePalette: Partial<Record<string, string>>;
}

export const THEMES: Record<ThemeKey, ThemeDefinition> = {
  modern: {
    key: 'modern',
    label: 'Modern',
    icon: '🏙️',
    description: 'Serin griler, şık yüzeyler ve mavi vurgular.',
    floorColor: '#cfd8dc',
    floorPattern: 'tile',
    wallPattern: 'solid',
    wallColors: { north: '#eceff1', south: '#eceff1', east: '#cfd8dc', west: '#cfd8dc' },
    furniturePalette: {
      office: '#64748b',
      seating: '#37474f',
      tables: '#263238',
      bedroom: '#90a4ae',
      kitchen: '#9e9e9e',
      bathroom: '#cfd8dc',
      decor: '#1976d2',
      electronics: '#212121',
      storage: '#455a64',
      outdoor: '#607d8b',
    },
  },
  rustic: {
    key: 'rustic',
    label: 'Rustik',
    icon: '🪵',
    description: 'Sıcak kahveler, doğal ahşap ve toprak tonları.',
    floorColor: '#a0522d',
    floorPattern: 'wood',
    wallPattern: 'panel',
    wallColors: { north: '#bcaaa4', south: '#bcaaa4', east: '#8d6e63', west: '#8d6e63' },
    furniturePalette: {
      office: '#8b6b4a',
      seating: '#6d4c41',
      tables: '#5d4037',
      bedroom: '#8d6e63',
      kitchen: '#a1887f',
      bathroom: '#bcaaa4',
      decor: '#8e6e3a',
      electronics: '#3e2723',
      storage: '#4e342e',
      outdoor: '#558b2f',
    },
  },
  minimalist: {
    key: 'minimalist',
    label: 'Minimalist',
    icon: '⚪',
    description: 'Beyaz, siyah ve tek bir vurgu rengi.',
    floorColor: '#f5f5f5',
    floorPattern: 'concrete',
    wallPattern: 'plaster',
    wallColors: { north: '#fafafa', south: '#fafafa', east: '#eeeeee', west: '#eeeeee' },
    furniturePalette: {
      office: '#e2e8f0',
      seating: '#212121',
      tables: '#fafafa',
      bedroom: '#fafafa',
      kitchen: '#212121',
      bathroom: '#ffffff',
      decor: '#ff5722',
      electronics: '#212121',
      storage: '#fafafa',
      outdoor: '#bdbdbd',
    },
  },
  cozy: {
    key: 'cozy',
    label: 'Rahat',
    icon: '🛋️',
    description: 'Yumuşak kahveler, turuncular ve sıcak dokular.',
    floorColor: '#d7ccc8',
    floorPattern: 'carpet',
    wallPattern: 'wallpaper',
    wallColors: { north: '#ffe0b2', south: '#ffe0b2', east: '#ffccbc', west: '#ffccbc' },
    furniturePalette: {
      office: '#8d6e63',
      seating: '#8d6e63',
      tables: '#a1887f',
      bedroom: '#ffab91',
      kitchen: '#bcaaa4',
      bathroom: '#ffe0b2',
      decor: '#ff7043',
      electronics: '#4e342e',
      storage: '#6d4c41',
      outdoor: '#aed581',
    },
  },
  tropical: {
    key: 'tropical',
    label: 'Tropik',
    icon: '🌴',
    description: 'Canlı yeşiller, deniz mavileri ve kum tonları.',
    floorColor: '#fff8e1',
    floorPattern: 'tile',
    wallPattern: 'plaster',
    wallColors: { north: '#b2ebf2', south: '#b2ebf2', east: '#ffecb3', west: '#ffecb3' },
    furniturePalette: {
      office: '#26a69a',
      seating: '#26a69a',
      tables: '#a1887f',
      bedroom: '#80deea',
      kitchen: '#fff59d',
      bathroom: '#b2ebf2',
      decor: '#43a047',
      electronics: '#00695c',
      storage: '#26c6da',
      outdoor: '#2e7d32',
    },
  },
};

export const THEME_LIST: readonly ThemeMeta[] = (Object.values(THEMES) as ThemeMeta[]).map(
  ({ key, label, icon, description }) => ({ key, label, icon, description })
);

/**
 * Apply a theme to a layout. Walls and floor finishes are updated on every
 * floor; items keep their existing color unless they belong to a known
 * category, in which case they get the theme's palette color.
 */
export function applyTheme(layout: RoomLayout, themeKey: ThemeKey): RoomLayout {
  const theme = THEMES[themeKey];
  const themedFloors: FloorLayout[] = layout.floors.map((floor) => ({
    ...floor,
    floorColor: theme.floorColor,
    floorPattern: theme.floorPattern,
    wallPattern: theme.wallPattern,
    wallColors: { ...theme.wallColors },
    items: floor.items.map((item) => {
      const color = item.category ? theme.furniturePalette[item.category] : undefined;
      return color ? { ...item, color } : item;
    }),
  }));
  return { ...layout, floors: themedFloors };
}
