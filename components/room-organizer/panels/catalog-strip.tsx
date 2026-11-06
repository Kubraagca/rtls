'use client';

import { Pencil, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { CATALOG_DRAG_MIME } from '../lib/catalog-drag';
import { CctvMenu } from './cctv-menu';
import type { CatalogItem, FurnitureCategory } from '../lib/types';
import { removeCatalogItem, updateCatalogItem, useCatalogCategories, useCatalogRegistry } from '../lib/catalog-registry';
import { CatalogThumbnail } from './catalog-thumbnail';
import { CatalogEditDialog } from './catalog-edit-dialog';

export interface CatalogStripProps {
  category: FurnitureCategory | 'all';
  onAdd(item: CatalogItem): void;
  onClose?(): void;
  onRemoveCatalogItem?(item: CatalogItem): void;
  onUpdateCatalogItem?(item: CatalogItem): void;
}

export function CatalogStrip({ category, onAdd, onClose, onRemoveCatalogItem, onUpdateCatalogItem }: CatalogStripProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [actionItem, setActionItem] = useState<CatalogItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<FurnitureCategory>('office');
  const [editThumbnail, setEditThumbnail] = useState<string>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const catalog = useCatalogRegistry();
  const categories = useCatalogCategories();

  const startEdit = (item: CatalogItem) => {
    setActionItem(null);
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
    setActionItem(null);
    onRemoveCatalogItem?.(item);
    if (!onRemoveCatalogItem) removeCatalogItem(item);
  };
  // Cameras get a dedicated, type-grouped menu rather than the paged grid.
  if (category === 'security') {
    return (
      <div
        className="pointer-events-auto pc-glass pc-catalog-strip"
        style={{ width: '100%', maxWidth: '100%', height: '100%', minHeight: 0, boxSizing: 'border-box', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', position: 'relative' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: collapsed ? 0 : 8 }}>
          <StripToggle
            label="Güvenlik kameraları"
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
          />
          <div style={{ flex: 1, height: 1, background: 'var(--pc-glass-inner)' }} />
          {onClose && <CloseButton onClose={onClose} />}
        </div>
        {!collapsed && (
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.20)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 14,
            padding: 8,
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.35)',
            position: 'absolute',
            top: 52,
            right: 14,
            bottom: 12,
            left: 14,
            overflow: 'hidden',
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
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
  const categoryMeta = categories.find((entry) => entry.key === category);
  const categoryLabel =
    category === 'all' ? 'Tümü' : (categoryMeta?.label ?? String(category));
  const groupedItems = categories
    .map((meta) => ({
      meta,
      items: searchableCatalog.filter((item) => item.category === meta.key),
    }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div
      className="pointer-events-auto pc-glass pc-catalog-strip"
      style={{ width: '100%', maxWidth: '100%', height: '100%', minHeight: 0, boxSizing: 'border-box', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', position: 'relative' }}
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
        {onClose && <CloseButton onClose={onClose} />}
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
        <CatalogEditDialog
          item={editing}
          name={editName}
          category={editCategory}
          onNameChange={setEditName}
          onCategoryChange={setEditCategory}
          onThumbnailChange={setEditThumbnail}
          onCancel={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}

      {!collapsed && (
      <div
        style={{
            position: 'absolute',
            top: searchOpen ? 94 : 52,
            right: 14,
            bottom: 12,
            left: 14,
            display: 'flex',
            minHeight: 0,
            flexDirection: 'column',
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
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
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
            <div className="pc-catalog-scroll" style={{ height: '100%', maxHeight: 'none', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '2px 2px 8px 0', minWidth: 0, overscrollBehavior: 'contain' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, minWidth: 0 }}>
                    {groupItems.map((item) => (
                      <CatalogTile
                        key={`${item.type}-${item.name}-${item.customModelId ?? ''}`}
                        item={item}
                        onAdd={onAdd}
                        onEdit={startEdit}
                        onRemove={removeFromCatalog}
                        actionOpen={actionItem === item}
                        onToggleActions={() => setActionItem((current) => current === item ? null : item)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div
              className="pc-catalog-scroll"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gridAutoRows: 'max-content',
                alignContent: 'start',
                height: '100%',
                maxHeight: 'none',
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                gap: 6,
                paddingBottom: 4,
                minWidth: 0,
              }}
            >
              {items.map((item) => (
                <CatalogTile
                  key={`${item.type}-${item.name}-${item.customModelId ?? ''}`}
                  item={item}
                  onAdd={onAdd}
                  onEdit={startEdit}
                  onRemove={removeFromCatalog}
                  actionOpen={actionItem === item}
                  onToggleActions={() => setActionItem((current) => current === item ? null : item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function CloseButton({ onClose }: { onClose(): void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClose}
      title="Kataloğu kapat"
      aria-label="Kataloğu kapat"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 7,
        color: 'var(--pc-ink)',
        background: 'rgba(15,23,42,.08)',
      }}
    >
      <X size={14} />
    </button>
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
        fontSize: 10.5,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        flexShrink: 1,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'inherit',
        padding: 0,
      }}
    >
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      <span
        aria-hidden
        className="pc-tile"
        style={{
          display: 'none',
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
  actionOpen: boolean;
  onToggleActions(): void;
}

function CatalogTile({ item, onAdd, onEdit, onRemove, actionOpen, onToggleActions }: CatalogTileProps): JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onAdd(item);
        }
      }}
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
        position: 'relative',
        height: 88,
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        padding: '3px 4px 4px',
        cursor: 'grab',
      }}
    >
      <CatalogThumbnail item={item} size={62} />
      <button
        type="button"
        aria-label={`${item.name} işlemleri`}
        aria-expanded={actionOpen}
        title="Eşya işlemleri"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onToggleActions(); }}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 22,
          height: 22,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid rgba(255,255,255,.65)',
          borderRadius: 6,
          background: actionOpen ? 'rgba(37,99,235,.92)' : 'rgba(15,23,42,.62)',
          color: '#fff',
          cursor: 'pointer',
          zIndex: 2,
        }}
      >
        <Pencil size={11} strokeWidth={2.5} />
      </button>
      {actionOpen && (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: 'absolute',
            top: 29,
            right: 4,
            display: 'grid',
            gap: 3,
            minWidth: 88,
            padding: 4,
            border: '1px solid rgba(255,255,255,.25)',
            borderRadius: 8,
            background: 'rgba(15,23,42,.96)',
            boxShadow: '0 8px 18px rgba(15,23,42,.28)',
            zIndex: 3,
          }}
        >
          <button type="button" role="menuitem" onClick={() => onEdit?.(item)} style={menuActionStyle}>
            <Pencil size={11} /> Düzenle
          </button>
          <button type="button" role="menuitem" onClick={() => onRemove?.(item)} style={{ ...menuActionStyle, color: '#fecaca' }}>
            <Trash2 size={11} /> Sil
          </button>
        </div>
      )}
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
    </div>
  );
}

const menuActionStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  padding: '5px 6px',
  border: 0,
  borderRadius: 5,
  background: 'transparent',
  color: '#fff',
  fontSize: 10,
  textAlign: 'left' as const,
  cursor: 'pointer',
};
