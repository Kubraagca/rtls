'use client';

import { useState } from 'react';
import { useRoomEditor } from '../contexts';
import { Icon } from '../plotcraft/icon';
import type {
  FloorPattern,
  WallId,
  WallPattern,
} from '../lib/types';

// ============================================================================
// Pattern + style metadata
// ============================================================================

const WALL_PATTERNS: ReadonlyArray<{ id: WallPattern; label: string; thumb: PatternThumbName }> = [
  { id: 'solid',     label: 'Düz boya',     thumb: 'solid'   },
  { id: 'brick',     label: 'Tuğla',        thumb: 'brick'   },
  { id: 'panel',     label: 'Ahşap panel',  thumb: 'panel'   },
  { id: 'plaster',   label: 'Sıva',         thumb: 'speckle' },
];

const FLOOR_PATTERNS: ReadonlyArray<{ id: FloorPattern; label: string; thumb: PatternThumbName }> = [
  { id: 'wood',     label: 'Ahşap parke', thumb: 'wood'    },
  { id: 'tile',     label: 'Fayans',      thumb: 'tile'    },
  { id: 'concrete', label: 'Beton',       thumb: 'solid'   },
  { id: 'solid',    label: 'Düz',         thumb: 'solid'   },
];

// ============================================================================
// Colour palettes — Interactive, grouped by mood the way the reference does
// ============================================================================

interface SwatchGroup {
  id: string;
  label: string;
  colors: readonly string[];
}

const WALL_PALETTES: readonly SwatchGroup[] = [
  {
    id: 'corporate',
    label: 'Kurumsal',
    colors: [
      '#ffffff', '#f7f7f5', '#eeeae3', '#e5ded2',
      '#d6d3ce', '#b8bcc0', '#8b9298', '#5f6870',
      '#343a40', '#cbbda9', '#a9957d', '#766653',
    ],
  },
];

const FLOOR_PALETTES: readonly SwatchGroup[] = [
  {
    id: 'corporate',
    label: 'Kurumsal',
    colors: [
      '#ffffff', '#f7f7f5', '#eeeae3', '#e5ded2',
      '#d6d3ce', '#b8bcc0', '#8b9298', '#5f6870',
    ],
  },
  {
    id: 'stone',
    label: 'Stone',
    colors: [
      '#f0e8da', '#d8c4a0', '#b4afa3', '#8a8580',
      '#b0b0b0', '#7c7c7c', '#444448', '#2d2d2d',
    ],
  },
];

const DEFAULT_FLOOR_COLOR = '#686d73';

// ============================================================================
// Apply-to + active-tab state
// ============================================================================

const APPLY_TARGETS: ReadonlyArray<{ id: WallId | 'all'; label: string }> = [
  { id: 'all',   label: 'All' },
  { id: 'north', label: 'N' },
  { id: 'east',  label: 'E' },
  { id: 'south', label: 'S' },
  { id: 'west',  label: 'W' },
];

type Surface = 'walls' | 'floor';

export interface WallPaintPanelProps {
  /** Optional pre-selected wall (from 3D click) — pre-targets the Apply-to chip. */
  selectedWall: { id: string; kind: 'exterior' | 'interior' } | null;
  onSelectedWallChange(wall: { id: string; kind: 'exterior' | 'interior' } | null): void;
  /** Open directly on the requested surface when launched from a contextual tool. */
  initialSurface?: Surface;
  /** Lock the dialog to the surface that was right-clicked. */
  surfaceOnly?: Surface;
  /** Hide wall controls when the panel is used as the 2D floor colour picker. */
  floorOnly?: boolean;
  onClose?(): void;
}

/**
 * Interactive wall + floor finish picker. Surface tabs (Walls / Floor),
 * pattern row with mini thumbnails, then a categorized swatch palette with
 * mood tabs (Pastels / Warm / Cool / Neutral on walls, Wood / Stone / Bold on
 * floors) — roughly 48 wall colours and 24 floor colours one click away.
 */
export function WallPaintPanel(props: WallPaintPanelProps): JSX.Element {
  const { activeFloor: floor, actions } = useRoomEditor();

  const applyWallColor = (target: WallId | 'all', color: string) => {
    // A selected INTERIOR wall gets painted itself — previously an interior
    // selection fell through to 'all' and silently repainted the four
    // exterior walls instead (#122).
    if (selectedInteriorId !== null) {
      actions.setInteriorWallColor(selectedInteriorId, color);
      return;
    }
    if (target === 'all') {
      actions.setWallColor('north', color);
      actions.setWallColor('south', color);
      actions.setWallColor('east', color);
      actions.setWallColor('west', color);
    } else {
      actions.setWallColor(target, color);
    }
  };
  const [surface, setSurface] = useState<Surface>(props.surfaceOnly ?? props.initialSurface ?? 'walls');
  const [wallGroup, setWallGroup] = useState<string>('corporate');
  const [floorGroup, setFloorGroup] = useState<string>('corporate');

  // Apply-to driven by the 3D click selection: when the user clicks a wall in
  // the world, the chip jumps to that wall automatically; otherwise default
  // to "All".
  const selectedExteriorId =
    props.selectedWall && props.selectedWall.kind === 'exterior'
      ? (props.selectedWall.id as WallId)
      : null;
  const selectedInteriorId =
    props.selectedWall && props.selectedWall.kind === 'interior' ? props.selectedWall.id : null;
  const applyTo: WallId | 'all' = selectedExteriorId ?? 'all';

  const currentWallPattern = floor.wallPattern ?? 'solid';
  const currentFloorPattern = floor.floorPattern ?? 'solid';
  const currentWallColor =
    (selectedInteriorId
      ? floor.interiorWalls?.find((wall) => wall.id === selectedInteriorId)?.color ?? '#e0e0e0'
      : selectedExteriorId
        ? floor.wallColors?.[selectedExteriorId]
        : floor.wallColors?.north) ?? '#e8dcc4';

  const activeWallPalette =
    WALL_PALETTES.find((g) => g.id === wallGroup) ?? WALL_PALETTES[0]!;
  const activeFloorPalette =
    FLOOR_PALETTES.find((g) => g.id === floorGroup) ?? FLOOR_PALETTES[0]!;

  return (
    <div
      className="pointer-events-auto pc-glass pc-wall-paint"
      style={{ width: 280, padding: '10px 12px' }}
    >
      {/* Title + Surface toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          marginBottom: 8,
        }}
      >
        <div
          className="pc-hud-header"
          style={{
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Icon name="sparkle" size={12} />
          Paint
        </div>
        {!props.floorOnly && !props.surfaceOnly && <SurfaceTabs surface={surface} onChange={setSurface} />}
        {props.onClose && (
          <button
            type="button"
            aria-label="Boya panelini kapat"
            title="Kapat"
            onClick={props.onClose}
            className="pc-tile"
            style={{ width: 22, height: 22, padding: 0, borderRadius: 5, fontSize: 15, lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>

      {surface === 'walls' && !props.floorOnly && props.surfaceOnly !== 'floor' ? (
        <>
          <SectionLabel>Duvar deseni</SectionLabel>
          <PatternGrid>
            {WALL_PATTERNS.map((p) => (
              <PatternTile
                key={p.id}
                label={p.label}
                thumb={p.thumb}
                active={currentWallPattern === p.id}
                onClick={() => actions.setWallPattern(p.id)}
              />
            ))}
          </PatternGrid>

          <SectionLabel>
            Apply To
            {props.selectedWall && (
              <span
                style={{
                  marginLeft: 6,
                  fontFamily: 'var(--pc-font-display)',
                  fontWeight: 700,
                  fontSize: 9,
                  color: 'var(--pc-cyan-glow)',
                }}
              >
                {selectedInteriorId ? '· Interior wall selected' : '· Wall selected'}
              </span>
            )}
          </SectionLabel>
          <ApplyToggle
            value={applyTo}
            onChange={(v) => {
              if (v === 'all') {
                props.onSelectedWallChange(null);
              } else {
                props.onSelectedWallChange({ id: v, kind: 'exterior' });
              }
            }}
          />

          <SectionLabel>Duvar görünürlüğü</SectionLabel>
          <WallVisibilityToggle
            hiddenWalls={floor.hiddenWalls ?? []}
            onToggle={(wallId) => actions.toggleExteriorWall(wallId)}
          />

          <SectionLabel>Wall Colour · {activeWallPalette.label}</SectionLabel>
          <CurrentColorPreview value={currentWallColor} />
          <GroupTabs
            groups={WALL_PALETTES}
            active={wallGroup}
            onChange={setWallGroup}
          />
          <SwatchGrid
            swatches={activeWallPalette.colors}
            value={currentWallColor}
            onChange={(color) => applyWallColor(applyTo, color)}
          />
        </>
      ) : (
        <>
          <SectionLabel>Zemin deseni</SectionLabel>
          <PatternGrid>
            {FLOOR_PATTERNS.map((p) => (
              <PatternTile
                key={p.id}
                label={p.label}
                thumb={p.thumb}
                active={currentFloorPattern === p.id}
                onClick={() => actions.setFloorPattern(p.id)}
              />
            ))}
          </PatternGrid>

          <FloorResetRow
            patternActive={currentFloorPattern !== 'solid'}
            colorActive={floor.floorColor.toLowerCase() !== DEFAULT_FLOOR_COLOR}
            onRemovePattern={() => actions.setFloorPattern('solid')}
            onRemoveColor={() => actions.setFloorColor(DEFAULT_FLOOR_COLOR)}
          />

          <SectionLabel>Floor Colour · {activeFloorPalette.label}</SectionLabel>
          <CurrentColorPreview value={floor.floorColor} />
          <GroupTabs
            groups={FLOOR_PALETTES}
            active={floorGroup}
            onChange={setFloorGroup}
          />
          <SwatchGrid
            swatches={activeFloorPalette.colors}
            value={floor.floorColor}
            onChange={(color) => actions.setFloorColor(color)}
            onCustomChange={(color) => actions.setFloorColor(color)}
          />
        </>
      )}
    </div>
  );
}

function FloorResetRow({
  patternActive,
  colorActive,
  onRemovePattern,
  onRemoveColor,
}: {
  patternActive: boolean;
  colorActive: boolean;
  onRemovePattern(): void;
  onRemoveColor(): void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
      <button
        type="button"
        onClick={onRemovePattern}
        disabled={!patternActive}
        title="Seçili parke desenini kaldır"
        className="pc-tile"
        style={{ flex: 1, height: 22, fontSize: 8, fontWeight: 800, opacity: patternActive ? 1 : 0.45 }}
      >
        × Parkeyi kaldır
      </button>
      <button
        type="button"
        onClick={onRemoveColor}
        disabled={!colorActive}
        title="Seçili zemin rengini kaldır"
        className="pc-tile"
        style={{ flex: 1, height: 22, fontSize: 8, fontWeight: 800, opacity: colorActive ? 1 : 0.45 }}
      >
        × Rengi kaldır
      </button>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

interface SurfaceTabsProps {
  surface: Surface;
  onChange(surface: Surface): void;
}

function SurfaceTabs({ surface, onChange }: SurfaceTabsProps): JSX.Element {
  const tabs: ReadonlyArray<{ id: Surface; label: string }> = [
    { id: 'walls', label: 'Duvarlar' },
    { id: 'floor', label: 'Floor' },
  ];
  return (
    <div
      role="tablist"
      className="pc-glass--inset"
      style={{
        display: 'inline-flex',
        gap: 3,
      }}
    >
      {tabs.map((t) => {
        const active = surface === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`pc-tile${active ? ' pc-tile--active' : ''}`}
            style={{
              padding: '4px 10px',
              height: 22,
              borderRadius: 5,
              fontFamily: 'var(--pc-font-display)',
              fontWeight: 800,
              fontSize: 9,
              letterSpacing: 'var(--pc-tr-caps)',
              textTransform: 'uppercase',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

interface ApplyToggleProps {
  value: WallId | 'all';
  onChange(v: WallId | 'all'): void;
}

function ApplyToggle({ value, onChange }: ApplyToggleProps): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Apply paint to"
      className="pc-glass--inset"
      style={{
        display: 'flex',
        gap: 3,
      }}
    >
      {APPLY_TARGETS.map((target) => {
        const active = value === target.id;
        return (
          <button
            key={target.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(target.id)}
            title={target.id === 'all' ? 'Apply to every exterior wall' : `Apply to ${target.id} wall only`}
            className={`pc-tile${active ? ' pc-tile--active' : ''}`}
            style={{
              flex: 1,
              height: 22,
              borderRadius: 6,
              fontFamily: 'var(--pc-font-display)',
              fontWeight: 800,
              fontSize: 9,
              letterSpacing: 'var(--pc-tr-caps)',
              textTransform: 'uppercase',
            }}
          >
            {target.label}
          </button>
        );
      })}
    </div>
  );
}

interface WallVisibilityToggleProps {
  hiddenWalls: readonly WallId[];
  onToggle(wallId: WallId): void;
}

const VISIBILITY_WALLS: ReadonlyArray<{ id: WallId; label: string }> = [
  { id: 'north', label: 'N' },
  { id: 'east',  label: 'E' },
  { id: 'south', label: 'S' },
  { id: 'west',  label: 'W' },
];

function WallVisibilityToggle({ hiddenWalls, onToggle }: WallVisibilityToggleProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Wall visibility"
      className="pc-glass--inset"
      style={{
        display: 'flex',
        gap: 3,
      }}
    >
      {VISIBILITY_WALLS.map((wall) => {
        const hidden = hiddenWalls.includes(wall.id);
        return (
          <button
            key={wall.id}
            type="button"
            aria-pressed={!hidden}
            onClick={() => onToggle(wall.id)}
            title={hidden ? `Restore ${wall.id} wall` : `Remove ${wall.id} wall (open side)`}
            className={`pc-tile${!hidden ? ' pc-tile--active' : ''}`}
            style={{
              flex: 1,
              height: 22,
              borderRadius: 6,
              fontFamily: 'var(--pc-font-display)',
              fontWeight: 800,
              fontSize: 9,
              letterSpacing: 'var(--pc-tr-caps)',
              textTransform: 'uppercase',
              opacity: hidden ? 0.45 : 1,
              textDecoration: hidden ? 'line-through' : 'none',
            }}
          >
            {wall.label}
          </button>
        );
      })}
    </div>
  );
}

interface GroupTabsProps {
  groups: readonly SwatchGroup[];
  active: string;
  onChange(id: string): void;
}

function GroupTabs({ groups, active, onChange }: GroupTabsProps): JSX.Element {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: 3,
        marginBottom: 4,
      }}
    >
      {groups.map((g) => {
        const isActive = g.id === active;
        return (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(g.id)}
            className={`pc-tile${isActive ? ' pc-tile--active' : ''}`}
            style={{
              flex: 1,
              height: 20,
              borderRadius: 6,
              padding: '0 4px',
              fontFamily: 'var(--pc-font-display)',
              fontWeight: 700,
              fontSize: 8,
              letterSpacing: 'var(--pc-tr-caps)',
              textTransform: 'uppercase',
            }}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <p
      className="pc-hud-header"
      style={{
        fontSize: 9,
        opacity: 0.75,
        marginTop: 6,
        marginBottom: 4,
        paddingLeft: 2,
      }}
    >
      {children}
    </p>
  );
}

function CurrentColorPreview({ value }: { value: string | undefined }): JSX.Element {
  const color = value ?? '#ffffff';
  const textColor = readableTextColor(color);
  return (
    <div
      aria-label={`Selected colour ${color}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minHeight: 24,
        marginBottom: 4,
        padding: '3px 7px',
        borderRadius: 7,
        background: color,
        color: textColor,
        border: '2px solid var(--pc-cyan-glow)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.9), var(--pc-halo-cyan-soft)',
        fontFamily: 'var(--pc-font-display)',
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      <span>Seçili renk</span>
      <span>{color}</span>
    </div>
  );
}

function readableTextColor(color: string): string {
  const match = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return '#1f2933';
  const hex = match[1];
  if (!hex) return '#1f2933';
  const value = Number.parseInt(hex, 16);
  const luminance = (0.299 * ((value >> 16) & 0xff) + 0.587 * ((value >> 8) & 0xff) + 0.114 * (value & 0xff)) / 255;
  return luminance < 0.58 ? '#ffffff' : '#1f2933';
}

function PatternGrid({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      className="pc-glass--inset"
      style={{
        borderRadius: 10,
        padding: 4,
        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.35)',
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 4,
      }}
    >
      {children}
    </div>
  );
}

interface PatternTileProps {
  label: string;
  thumb: PatternThumbName;
  active: boolean;
  onClick(): void;
}

function PatternTile({ label, thumb, active, onClick }: PatternTileProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={`pc-tile${active ? ' pc-tile--active' : ''}`}
      style={{
        height: 36,
        padding: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        overflow: 'hidden',
      }}
    >
      <PatternThumb name={thumb} />
      <span
        style={{
          fontFamily: 'var(--pc-font-display)',
          fontWeight: 700,
          fontSize: 7,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: active ? 'var(--pc-cyan-glow)' : 'var(--pc-paper-soft)',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </button>
  );
}

type PatternThumbName =
  | 'solid'
  | 'siding'
  | 'brick'
  | 'panel'
  | 'dots'
  | 'speckle'
  | 'wood'
  | 'tile';

function PatternThumb({ name }: { name: PatternThumbName }): JSX.Element {
  const common = { width: 22, height: 12 };
  switch (name) {
    case 'siding':
      return (
        <svg viewBox="0 0 22 12" {...common} aria-hidden>
          <rect width="22" height="12" fill="rgba(255,255,255,0.20)" />
          <path d="M0 3 L22 3 M0 6 L22 6 M0 9 L22 9" stroke="rgba(0,0,0,0.35)" strokeWidth="0.6" />
        </svg>
      );
    case 'brick':
      return (
        <svg viewBox="0 0 22 12" {...common} aria-hidden>
          <rect width="22" height="12" fill="rgba(179,86,61,0.5)" />
          <path d="M0 4 L22 4 M0 8 L22 8 M5 0 L5 4 M16 0 L16 4 M11 4 L11 8 M6 8 L6 12 M16 8 L16 12" stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
        </svg>
      );
    case 'panel':
      return (
        <svg viewBox="0 0 22 12" {...common} aria-hidden>
          <rect width="22" height="12" fill="rgba(185,133,81,0.55)" />
          <path d="M5.5 0 L5.5 12 M11 0 L11 12 M16.5 0 L16.5 12" stroke="rgba(0,0,0,0.40)" strokeWidth="0.6" />
        </svg>
      );
    case 'dots':
      return (
        <svg viewBox="0 0 22 12" {...common} aria-hidden>
          <rect width="22" height="12" fill="rgba(232,220,196,0.7)" />
          {[2, 7, 12, 17].flatMap((x, i) =>
            [3, 7, 11].map((y, j) => (
              <circle key={`${i}-${j}`} cx={x + (j % 2 ? 2 : 0)} cy={y} r="0.7" fill="rgba(0,0,0,0.40)" />
            ))
          )}
        </svg>
      );
    case 'speckle':
      return (
        <svg viewBox="0 0 22 12" {...common} aria-hidden>
          <rect width="22" height="12" fill="rgba(217,201,168,0.6)" />
          {Array.from({ length: 22 }).map((_, i) => (
            <circle
              key={i}
              cx={(i * 11) % 22}
              cy={(i * 5) % 12}
              r="0.45"
              fill="rgba(0,0,0,0.30)"
            />
          ))}
        </svg>
      );
    case 'wood':
      return (
        <svg viewBox="0 0 22 12" {...common} aria-hidden>
          <rect width="22" height="12" fill="rgba(201,165,125,0.85)" />
          <path d="M0 4 L22 4 M0 8 L22 8" stroke="rgba(0,0,0,0.45)" strokeWidth="0.6" />
          <path d="M6 0 L6 4 M14 4 L14 8 M9 8 L9 12" stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
        </svg>
      );
    case 'tile':
      return (
        <svg viewBox="0 0 22 12" {...common} aria-hidden>
          <rect width="22" height="12" fill="rgba(240,232,218,0.85)" />
          <path d="M11 0 L11 12 M0 6 L22 6" stroke="rgba(0,0,0,0.40)" strokeWidth="0.6" />
        </svg>
      );
    case 'solid':
    default:
      return (
        <svg viewBox="0 0 22 12" {...common} aria-hidden>
          <rect width="22" height="12" fill="rgba(255,255,255,0.20)" />
        </svg>
      );
  }
}

interface SwatchGridProps {
  swatches: readonly string[];
  value: string | undefined;
  onChange(color: string): void;
  onCustomChange?(color: string): void;
}

function SwatchGrid({ swatches, value, onChange, onCustomChange }: SwatchGridProps): JSX.Element {
  const normalized = (value ?? '').toLowerCase();
  return (
    <div
      className="pc-glass--inset"
      style={{
        borderRadius: 10,
        padding: 4,
        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.35)',
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 3,
      }}
    >
      {swatches.map((swatch) => {
        const active = swatch.toLowerCase() === normalized;
        return (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            aria-label={`Use color ${swatch}`}
            title={swatch}
            style={{
              height: 22,
              borderRadius: 5,
              backgroundColor: swatch,
              border: active ? '3px solid #168cff' : '1px solid rgba(255,255,255,0.30)',
              outline: active ? '2px solid #ffffff' : 'none',
              boxShadow: active ? '0 0 0 1px #168cff, 0 0 10px rgba(22,140,255,0.75)' : 'inset 0 1px 0 rgba(255,255,255,0.40)',
              cursor: 'pointer',
              padding: 0,
              position: 'relative',
            }}
          >
            {active && <span aria-hidden style={{ color: readableTextColor(swatch), fontSize: 14, fontWeight: 900, lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>✓</span>}
          </button>
        );
      })}
      {onCustomChange && (
        <label
          title="Pick a custom colour"
          style={{
            height: 22,
            borderRadius: 5,
            border: '1px dashed rgba(255,255,255,0.45)',
            background:
              'conic-gradient(from 0deg, #ff5b6a, #ffd24a, #79e08a, #4fc3f7, #c77bff, #ff5b6a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            gridColumn: 'span 1',
          }}
        >
          <input
            type="color"
            value={value ?? '#ffffff'}
            onChange={(event) => onCustomChange(event.target.value)}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              cursor: 'pointer',
              border: 'none',
              padding: 0,
            }}
          />
        </label>
      )}
    </div>
  );
}
