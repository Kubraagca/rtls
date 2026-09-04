'use client';

import { useState } from 'react';
import { CATALOG_DRAG_MIME } from '../lib/catalog-drag';
import { CATEGORIES, CURRENCY_SYMBOL, FURNITURE_CATALOG } from '../lib/constants';
import { Icon, iconForItem } from '../plotcraft/icon';
import { CctvMenu } from './cctv-menu';
import type { CatalogItem, FurnitureCategory } from '../lib/types';

export interface CatalogStripProps {
  category: FurnitureCategory | 'all';
  onAdd(item: CatalogItem): void;
}

export function CatalogStrip({ category, onAdd }: CatalogStripProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);

  // Cameras get a dedicated, type-grouped menu rather than the paged grid.
  if (category === 'security') {
    return (
      <div
        className="pointer-events-auto pc-glass pc-catalog-strip"
        style={{ width: 540, maxWidth: '100%', padding: '10px 14px 12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collapsed ? 0 : 8 }}>
          <StripToggle
            label="Güvenlik kameraları"
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
          />
          <div style={{ flex: 1, height: 1, background: 'var(--pc-glass-inner)' }} />
        </div>
        {!collapsed && (
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.20)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 14,
            padding: 8,
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.35)',
          }}
        >
          <CctvMenu variant="strip" onAdd={onAdd} />
        </div>
        )}
      </div>
    );
  }

  const items =
    category === 'all'
      ? FURNITURE_CATALOG
      : FURNITURE_CATALOG.filter((item) => item.category === category);
  const categoryMeta = CATEGORIES.find((entry) => entry.key === category);
  const categoryLabel =
    category === 'all' ? 'Tümü' : (categoryMeta?.label ?? String(category));
  const groupedItems = CATEGORIES
    .map((meta) => ({
      meta,
      items: FURNITURE_CATALOG.filter((item) => item.category === meta.key),
    }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div
      className="pointer-events-auto pc-glass pc-catalog-strip"
      style={{ width: 540, maxWidth: '100%', padding: '10px 14px 12px' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: collapsed ? 0 : 8,
        }}
      >
        <StripToggle
          label={`Katalog: ${categoryLabel}`}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
        <div
          style={{ flex: 1, height: 1, background: 'var(--pc-glass-inner)' }}
        />
        <div
          className="pc-blurb"
          style={{
            fontSize: 11,
            fontFamily: 'var(--pc-font-display)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {items.length} items
        </div>
      </div>

      {!collapsed && (
      <div
        style={{
          display: 'grid',
        gridTemplateColumns: '1fr',
          alignItems: 'stretch',
        }}
      >
        {/* Recessed inner panel — the catalog "well" that holds the tiles */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.20)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 14,
            padding: 8,
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div
            className="pc-hud-header"
            style={{
              fontSize: 9,
              marginBottom: 6,
              opacity: 0.7,
              paddingLeft: 2,
            }}
          >
            Eşya kataloğu
          </div>
          {category === 'all' ? (
            <div style={{ maxHeight: 310, overflowY: 'auto', paddingRight: 2 }}>
              {groupedItems.map(({ meta, items: groupItems }) => (
                <section key={meta.key} style={{ marginBottom: 10 }}>
                  <div
                    className="pc-hud-header"
                    style={{
                      fontSize: 9,
                      marginBottom: 5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--pc-cyan-glow)',
                    }}
                  >
                    <span aria-hidden>{meta.icon}</span>
                    <span>{meta.label}</span>
                    <span style={{ opacity: 0.55 }}>({groupItems.length})</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {groupItems.map((item) => (
                      <CatalogTile key={`${item.type}-${item.name}`} item={item} onAdd={onAdd} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                maxHeight: 260,
                overflowY: 'auto',
                gap: 6,
              }}
            >
              {items.map((item) => <CatalogTile key={`${item.type}-${item.name}`} item={item} onAdd={onAdd} />)}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

interface StripToggleProps {
  label: string;
  collapsed: boolean;
  onToggle(): void;
}

/** Strip header that doubles as the show/hide toggle. */
function StripToggle({ label, collapsed, onToggle }: StripToggleProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      title={collapsed ? 'Kataloğu göster' : 'Kataloğu gizle'}
      className="pc-hud-header"
      style={{
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'inherit',
        padding: 0,
      }}
    >
      <span>{label}</span>
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
  );
}

interface CatalogTileProps {
  item: CatalogItem;
  onAdd(item: CatalogItem): void;
}

function CatalogTile({ item, onAdd }: CatalogTileProps): JSX.Element {
  const icon = iconForItem(item.type, item.category);
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      title={`${item.name} — ${CURRENCY_SYMBOL}${item.price.toLocaleString()}. Drag onto the 3D view to place precisely.`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(CATALOG_DRAG_MIME, item.type);
        event.dataTransfer.setData('text/plain', item.name);
      }}
      className="pc-tile"
      style={{
        height: 56,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: 4,
        cursor: 'grab',
      }}
    >
      <Icon name={icon} size={20} />
      <span
        style={{
          fontFamily: 'var(--pc-font-display)',
          fontWeight: 700,
          fontSize: 9,
          letterSpacing: '0.03em',
          color: 'var(--pc-money)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        <span style={{ maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </span>
        {CURRENCY_SYMBOL}
        {item.price.toLocaleString()}
      </span>
    </button>
  );
}
