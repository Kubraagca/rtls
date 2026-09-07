'use client';

import { useState } from 'react';
import { Icon, type PlotcraftIconName } from '../plotcraft/icon';
import type { FurnitureCategory } from '../lib/types';

export type BuildToolCategory = FurnitureCategory | 'all' | 'walls';

interface ToolSpec {
  key: BuildToolCategory;
  icon: PlotcraftIconName;
  label: string;
  group: 'OFİS' | 'ALTYAPI' | 'MİMARİ';
}

const TOOLS: readonly ToolSpec[] = [
  { key: 'all',         icon: 'buy',     label: 'Tümü',          group: 'OFİS' },
  { key: 'office',      icon: 'desk',    label: 'Ofis',          group: 'OFİS' },
  { key: 'seating',     icon: 'chair',   label: 'Oturma',        group: 'OFİS' },
  { key: 'tables',      icon: 'table',   label: 'Masalar',       group: 'OFİS' },
  { key: 'storage',     icon: 'cabinet', label: 'Depolama',      group: 'OFİS' },
  { key: 'kitchen',     icon: 'fireplace', label: 'Pantry',      group: 'OFİS' },
  { key: 'electronics', icon: 'wifi',    label: 'RTLS / Ağ',     group: 'ALTYAPI' },
  { key: 'security',    icon: 'cctv',    label: 'Kameralar',     group: 'ALTYAPI' },
  { key: 'people',      icon: 'person',  label: 'Personel',      group: 'ALTYAPI' },
  { key: 'decor',       icon: 'plant',   label: 'Dekor',         group: 'MİMARİ' },
  { key: 'structure',   icon: 'window',  label: 'Kapı/Pencere',  group: 'MİMARİ' },
  { key: 'walls',       icon: 'wall',    label: 'Duvarlar',      group: 'MİMARİ' },
];

const TOOL_GROUPS = ['OFİS', 'ALTYAPI', 'MİMARİ'] as const;

export interface BuildToolsPanelProps {
  active: BuildToolCategory;
  drawWallMode: boolean;
  onSelect(tool: BuildToolCategory): void;
}

export function BuildToolsPanel(props: BuildToolsPanelProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      className="pointer-events-auto pc-glass pc-build-tools"
      style={{ width: 232, padding: 'var(--pc-s-3)' }}
    >
      {/* Header doubles as the show/hide toggle. */}
      <div className="pc-build-tools-header">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          title={collapsed ? 'Araçları göster' : 'Araçları gizle'}
          className="pc-hud-header"
          style={{
            fontSize: 11,
            marginBottom: collapsed ? 0 : 8,
            paddingLeft: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
          }}
        >
          <span>Tasarım araçları</span>
          <span
            aria-hidden
            className="pc-tile"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--pc-cyan-glow)',
            }}
          >
            {collapsed ? '▸' : '▾'}
          </span>
        </button>
      </div>

      {/* Desktop: 3-col grid */}
      {!collapsed && (
      <div
        className="pc-build-tools-grid"
        style={{
          background: 'rgba(0, 0, 0, 0.20)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: 6,
          boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.35)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
        }}
      >
        {TOOL_GROUPS.map((group) => (
          <div key={group} style={{ gridColumn: '1 / -1' }}>
            <div
              className="pc-hud-header"
              style={{ fontSize: 8, opacity: 0.62, padding: '5px 3px 4px' }}
            >
              {group}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {TOOLS.filter((tool) => tool.group === group).map((tool) => {
                const isActive =
                  props.active === tool.key || (tool.key === 'walls' && props.drawWallMode);
                return (
                  <button
                    key={tool.key}
                    type="button"
                    onClick={() => props.onSelect(tool.key)}
                    title={tool.label}
                    aria-pressed={isActive}
                    className={`pc-tile${isActive ? ' pc-tile--active' : ''}`}
                    style={{
                      height: 52,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      padding: '4px 2px',
                      overflow: 'hidden',
                    }}
                  >
                    <Icon name={tool.icon} size={18} />
                    <span
                      className="pc-build-tools-label"
                      style={{
                        fontFamily: 'var(--pc-font-display)',
                        fontWeight: 600,
                        fontSize: 8,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: isActive ? 'var(--pc-cyan-glow)' : 'var(--pc-ink-soft)',
                        lineHeight: 1,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tool.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
