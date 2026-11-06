'use client';

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Icon, type PlotcraftIconName } from '../plotcraft/icon';
import type { FurnitureCategory } from '../lib/types';
import { useCatalogCategories } from '../lib/catalog-registry';
import { CATEGORIES } from '../lib/constants';

export type BuildToolCategory = FurnitureCategory | 'all' | 'walls';

interface ToolSpec {
  key: BuildToolCategory;
  icon: PlotcraftIconName;
  label: string;
  group: 'OFİS' | 'ALTYAPI' | 'MİMARİ' | 'KULLANICI';
  categoryIcon?: string;
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

const TOOL_GROUPS = ['OFİS', 'ALTYAPI', 'MİMARİ', 'KULLANICI'] as const;

export interface BuildToolsPanelProps {
  active: BuildToolCategory;
  drawWallMode: boolean;
  onSelect(tool: BuildToolCategory): void;
  /** Use the compact vertical tool rail shown beside the scene. */
  compact?: boolean;
  onAddCatalog?(): void;
}

export function BuildToolsPanel(props: BuildToolsPanelProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const [compactExpanded, setCompactExpanded] = useState(false);
  const categories = useCatalogCategories();
  const customTools: readonly ToolSpec[] = categories
    .filter((category) => !CATEGORIES.some((entry) => entry.key === category.key))
    .map((category) => ({ key: category.key, icon: 'box', categoryIcon: category.icon, label: category.label, group: 'KULLANICI' }));
  const tools = [...TOOLS, ...customTools];

  if (props.compact) {
    return (
      <div
        className="pointer-events-auto pc-glass pc-build-tools pc-build-tools--compact"
        aria-label="Tasarım araçları"
        style={{ width: compactExpanded ? 158 : 58, height: 'auto', padding: 6, borderRadius: 14, transition: 'width 160ms ease', position: 'relative' }}
      >
        <button
          type="button"
          onClick={() => setCompactExpanded((expanded) => !expanded)}
          aria-label={compactExpanded ? 'Araç isimlerini gizle' : 'Araç isimlerini göster'}
          title={compactExpanded ? 'Araç isimlerini gizle' : 'Araç isimlerini göster'}
          className="pc-tile"
          style={{
            width: '100%',
            height: 24,
            marginBottom: 4,
            padding: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 7,
          }}
        >
          {compactExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
        <div
          className="pc-build-tools-grid"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: 2,
            maxHeight: 'none',
            overflowY: 'visible',
          }}
        >
          {tools.map((tool, index) => {
            const previous = tools[index - 1];
            const isActive = props.active === tool.key || (tool.key === 'walls' && props.drawWallMode);
            return (
              <span key={tool.key} style={{ display: 'contents' }}>
                {previous && previous.group !== tool.group && (
                  <span aria-hidden style={{ width: 28, height: 1, margin: '2px 0', background: 'var(--pc-glass-inner)' }} />
                )}
                <button
                  type="button"
                  onClick={() => props.onSelect(tool.key)}
                  title={tool.label}
                  aria-label={tool.label}
                  aria-pressed={isActive}
                  className={`pc-tile${isActive ? ' pc-tile--active' : ''}`}
                  style={{
                    width: compactExpanded ? 136 : 42,
                    height: 42,
                    minHeight: 42,
                    padding: 0,
                    display: 'grid',
                    placeItems: 'center',
                    justifyContent: compactExpanded ? 'flex-start' : 'center',
                    gridTemplateColumns: compactExpanded ? '20px 1fr' : undefined,
                    gap: compactExpanded ? 9 : 0,
                    borderRadius: 9,
                  }}
                >
                  {tool.categoryIcon ? <span aria-hidden style={{ fontSize: 19, lineHeight: 1, position: 'relative', left: compactExpanded ? 4 : 0 }}>{tool.categoryIcon}</span> : <span style={{ position: 'relative', left: compactExpanded ? 4 : 0 }}><Icon name={tool.icon} size={20} /></span>}
                  {compactExpanded && (
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'var(--pc-font-display)',
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: isActive ? 'var(--pc-cyan-glow)' : 'var(--pc-ink-soft)',
                      }}
                    >
                      {tool.label}
                    </span>
                  )}
                </button>
              </span>
            );
          })}
          {props.onAddCatalog && (
            <button
              type="button"
              onClick={props.onAddCatalog}
              aria-label="Yeni kategori veya eşya ekle"
              title="Yeni kategori veya eşya ekle"
              className="pc-tile pc-catalog-add-button"
              style={{
                width: compactExpanded ? 136 : 42,
                height: 42,
                minHeight: 42,
                marginTop: 4,
                padding: 0,
                display: 'grid',
                placeItems: 'center',
                gridTemplateColumns: compactExpanded ? '20px 1fr' : undefined,
                gap: compactExpanded ? 9 : 0,
                borderRadius: 9,
              }}
            >
              <span style={{ position: 'relative', left: compactExpanded ? 4 : 0 }}><Plus size={21} strokeWidth={2.4} /></span>
              {compactExpanded && <span style={{ fontFamily: 'var(--pc-font-display)', fontSize: 9, fontWeight: 800, color: 'var(--pc-cyan-glow)' }}>EKLE</span>}
            </button>
          )}
        </div>
        {false && props.onAddCatalog && (
          <button
            type="button"
            onClick={props.onAddCatalog}
            aria-label="Yeni kategori veya eşya ekle"
            title="Yeni kategori veya eşya ekle"
            className="pc-tile pc-catalog-add-button"
            style={{
              position: 'absolute',
              left: 6,
              bottom: 6,
              width: compactExpanded ? 136 : 42,
              height: 42,
              padding: 0,
              display: 'none',
              placeItems: 'center',
              gridTemplateColumns: compactExpanded ? '20px 1fr' : undefined,
              gap: compactExpanded ? 9 : 0,
              borderRadius: 9,
            }}
          >
            <Plus size={21} strokeWidth={2.4} />
            {compactExpanded && <span style={{ fontFamily: 'var(--pc-font-display)', fontSize: 9, fontWeight: 800, color: 'var(--pc-cyan-glow)' }}>EKLE</span>}
          </button>
        )}
      </div>
    );
  }

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
              {tools.filter((tool) => tool.group === group).map((tool) => {
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
                    {tool.categoryIcon ? <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>{tool.categoryIcon}</span> : <Icon name={tool.icon} size={18} />}
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
