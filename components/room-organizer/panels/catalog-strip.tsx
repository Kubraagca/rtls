'use client';

import { useState, type ChangeEvent } from 'react';
import { Search, X } from 'lucide-react';
import { CATALOG_DRAG_MIME } from '../lib/catalog-drag';
import { CATEGORIES } from '../lib/constants';
import { CctvMenu } from './cctv-menu';
import type { CatalogItem, FurnitureCategory } from '../lib/types';
import { removeCatalogItem, updateCatalogItem, useCatalogRegistry } from '../lib/catalog-registry';
import { CatalogThumbnail } from './catalog-thumbnail';

export interface CatalogStripProps {
  category: FurnitureCategory | 'all';
  onAdd(item: CatalogItem): void;
  onRemoveCatalogItem?(item: CatalogItem): void;
  onUpdateCatalogItem?(item: CatalogItem): void;
}

export function CatalogStrip({ category, onAdd, onRemoveCatalogItem, onUpdateCatalogItem }: CatalogStripProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<FurnitureCategory>('office');
  const [editThumbnail, setEditThumbnail] = useState<string>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const catalog = useCatalogRegistry();

  const startEdit = (item: CatalogItem) => {
    setEditing(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditThumbnail(item.customThumbnail);
  };
  const saveEdit = () => {
    if (!editing || !editName.trim()) return;
    const nextItem = { ...editing, name: editName.trim().slice(0, 100), category: editCategory, ...(editThumbnail ? { customThumbnail: editThumbnail } : {}) };
    onUpdateCatalogItem?.(nextItem);
    if (!onUpdateCatalogItem) updateCatalogItem(nextItem);
    setEditing(null);
  };
  const removeFromCatalog = (item: CatalogItem) => {
    onRemoveCatalogItem?.(item);
    if (!onRemoveCatalogItem) removeCatalogItem(item);
  };
  const handleThumbnail = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditThumbnail(String(reader.result));
    reader.readAsDataURL(file);
  };

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
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <CctvMenu variant="strip" onAdd={onAdd} />
        </div>
        )}
      </div>
    );
  }

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('tr-TR');
  const searchableCatalog = catalog.filter((item) => {
    if (!normalizedSearch) return true;
    return [item.name, item.type, item.category]
      .join(' ')
      .toLocaleLowerCase('tr-TR')
      .includes(normalizedSearch);
  });
  const items =
    category === 'all'
      ? searchableCatalog
      : searchableCatalog.filter((item) => item.category === category);
  const categoryMeta = CATEGORIES.find((entry) => entry.key === category);
  const categoryLabel =
    category === 'all' ? 'Tümü' : (categoryMeta?.label ?? String(category));
  const groupedItems = CATEGORIES
    .map((meta) => ({
      meta,
      items: searchableCatalog.filter((item) => item.category === meta.key),
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
        <button
          type="button"
          onClick={() => {
            setSearchOpen((value) => !value);
            if (searchOpen) setSearchQuery('');
          }}
          title="Katalogda ürün ara"
          aria-label="Katalogda ürün ara"
          aria-expanded={searchOpen}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 7,
            color: 'var(--pc-ink)',
            background: searchOpen ? 'rgba(37, 99, 235, .16)' : 'rgba(15,23,42,.08)',
          }}
        >
          {searchOpen ? <X size={14} /> : <Search size={14} />}
        </button>
        <button
          type="button"
          onClick={() => setManage((value) => !value)}
          title="Katalog ürünlerini düzenle"
          style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, color: 'var(--pc-ink)', background: 'rgba(15,23,42,.08)' }}
        >
          {manage ? 'Bitti' : 'Yönet'}
        </button>
      </div>

      {searchOpen && (
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search
            size={14}
            aria-hidden
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'rgba(15,23,42,.58)' }}
          />
          <input
            autoFocus
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Ürün adı veya kategori ara..."
            aria-label="Katalog ürünlerinde ara"
            style={{
              width: '100%',
              height: 32,
              padding: '0 10px 0 30px',
              borderRadius: 8,
              border: '1px solid rgba(15,23,42,.18)',
              background: 'rgba(255,255,255,.9)',
              color: 'var(--pc-ink)',
              outline: 'none',
              fontSize: 11,
            }}
          />
        </div>
      )}

      {editing && (
        <div style={{ marginBottom: 8, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.95)', color: 'var(--pc-ink)', display: 'grid', gap: 6, fontSize: 11 }}>
          <strong>Eşyayı düzenle</strong>
          <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Eşya adı" />
          <select value={editCategory} onChange={(event) => setEditCategory(event.target.value as FurnitureCategory)}>
            {CATEGORIES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleThumbnail} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button type="button" onClick={() => setEditing(null)}>Vazgeç</button>
            <button type="button" onClick={saveEdit}>Kaydet</button>
          </div>
        </div>
      )}

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
            <div style={{ height: 310, maxHeight: 310, overflowY: 'auto', overflowX: 'hidden', padding: '2px 2px 8px 0', minWidth: 0, overscrollBehavior: 'contain' }}>
              {groupedItems.map(({ meta, items: groupItems }) => (
                <section key={meta.key} style={{ marginBottom: 10, minWidth: 0, overflow: 'hidden' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, minWidth: 0 }}>
                    {groupItems.map((item) => (
                      <CatalogTile key={`${item.type}-${item.name}-${item.customModelId ?? ''}`} item={item} onAdd={onAdd} onEdit={startEdit} onRemove={removeFromCatalog} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                maxHeight: 260,
                overflowY: 'auto',
                overflowX: 'hidden',
                gap: 6,
                paddingBottom: 4,
                minWidth: 0,
              }}
            >
              {items.map((item) => <CatalogTile key={`${item.type}-${item.name}-${item.customModelId ?? ''}`} item={item} onAdd={onAdd} onEdit={startEdit} onRemove={removeFromCatalog} />)}
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
  onEdit?(item: CatalogItem): void;
  onRemove?(item: CatalogItem): void;
}

function CatalogTile({ item, onAdd, onEdit, onRemove }: CatalogTileProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      title={`${item.name}. Drag onto the 3D view to place precisely.`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(CATALOG_DRAG_MIME, item.type);
        event.dataTransfer.setData(`${CATALOG_DRAG_MIME}:data`, JSON.stringify(item));
        event.dataTransfer.setData('text/plain', item.name);
      }}
      className="pc-tile"
      style={{
        height: item.customThumbnail ? 76 : 64,
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: 4,
        cursor: 'grab',
      }}
    >
      <CatalogThumbnail item={item} size={item.customThumbnail ? 34 : 30} />
      <span style={{ position: 'absolute', top: 3, left: 3, display: 'flex', gap: 3 }}>
        <span role="button" tabIndex={0} aria-label={`${item.name} düzenle`} title="Eşyayı düzenle" onClick={(event) => { event.stopPropagation(); onEdit?.(item); }} style={{ background: '#2563eb', color: 'white', borderRadius: 4, padding: '2px 4px', fontSize: 12, lineHeight: 1 }}>✎</span>
        <span role="button" tabIndex={0} aria-label={`${item.name} sil`} title="Katalogdan ve sahneden sil" onClick={(event) => { event.stopPropagation(); onRemove?.(item); }} style={{ background: '#dc2626', color: 'white', borderRadius: 4, padding: '2px 4px', fontSize: 11, lineHeight: 1 }}>🗑</span>
      </span>
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
        <span style={{ display: 'block', width: '100%', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </span>
      </span>
    </button>
  );
}
