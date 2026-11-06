'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CATALOG_DRAG_MIME } from '../lib/catalog-drag';
import { CCTV_MODELS } from '../lib/cctv-models';
import { CctvMenu } from './cctv-menu';
import type { CatalogItem, CategoryMeta, FurnitureCategory } from '../lib/types';
import { removeCatalogItem, updateCatalogItem, useCatalogCategories, useCatalogRegistry } from '../lib/catalog-registry';
import { CatalogThumbnail } from './catalog-thumbnail';
import { CatalogEditDialog } from './catalog-edit-dialog';

type FilterKey = 'all' | FurnitureCategory;

export interface FurnitureCatalogPanelProps {
  query?: string;
  onQueryChange?(query: string): void;
  onAdd(item: CatalogItem): void;
  onRemoveCatalogItem?(item: CatalogItem): void;
  onUpdateCatalogItem?(item: CatalogItem): void;
}

export function FurnitureCatalogPanel({
  onAdd,
  onRemoveCatalogItem,
  onUpdateCatalogItem,
  query: controlledQuery,
  onQueryChange,
}: FurnitureCatalogPanelProps): JSX.Element {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [internalQuery, setInternalQuery] = useState('');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [actionItem, setActionItem] = useState<CatalogItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<FurnitureCategory>('office');
  const [editThumbnail, setEditThumbnail] = useState<string | undefined>();
  const catalog = useCatalogRegistry();
  const categories = useCatalogCategories();
  const query = controlledQuery ?? internalQuery;
  const setQuery = (next: string) => {
    if (onQueryChange) onQueryChange(next);
    else setInternalQuery(next);
  };

  const startEdit = (item: CatalogItem) => {
    setActionItem(null);
    setEditing(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditThumbnail(item.customThumbnail);
  };

  const saveEdit = () => {
    if (!editing || !editName.trim()) return;
    const nextItem = {
      ...editing,
      name: editName.trim().slice(0, 100),
      category: editCategory,
      ...(editThumbnail ? { customThumbnail: editThumbnail } : {}),
    };
    if (onUpdateCatalogItem) onUpdateCatalogItem(nextItem);
    else updateCatalogItem(nextItem);
    setEditing(null);
  };

  const removeFromCatalog = (item: CatalogItem) => {
    setActionItem(null);
    onRemoveCatalogItem?.(item);
    if (!onRemoveCatalogItem) removeCatalogItem(item);
    if (editing?.type === item.type) setEditing(null);
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (filter !== 'all' && item.category !== filter) return false;
      if (!normalizedQuery) return true;
      return item.name.toLowerCase().includes(normalizedQuery) || item.type.toLowerCase().includes(normalizedQuery);
    });
  }, [catalog, filter, query]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 bg-gradient-to-b from-slate-50 to-transparent">
        <CardTitle className="flex items-center justify-between">
          <span>Eşya Kataloğu</span>
          <span className="flex items-center gap-2 text-[10px] font-normal text-muted-foreground">
            {filtered.length} items
          </span>
        </CardTitle>
        <Input
          placeholder="🔍 Eşya ara…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="text-xs"
        />
        <CategoryRail filter={filter} onSelect={setFilter} />
      </CardHeader>
      <CardContent className="pt-3">
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
        {filter === 'security' ? (
          <CctvMenu variant="panel" onAdd={onAdd} />
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            Bu filtreyle eşleşen eşya yok.
            <br />
            Daha geniş bir kategori seçin veya aramayı temizleyin.
          </p>
        ) : filter === 'all' && query.trim() === '' ? (
          <div className="max-h-[500px] overflow-y-auto pr-1 space-y-4">
            {categories.map((category) => {
              const groupItems = filtered.filter((item) => item.category === category.key);
              if (groupItems.length === 0) return null;
              return (
                <section key={category.key}>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <span aria-hidden>{category.icon}</span>
                    <span>{category.label}</span>
                    <span className="text-muted-foreground">({groupItems.length})</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
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
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-[460px] overflow-y-auto pr-1">
            {filtered.map((item) => (
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
        <p className="text-[10px] text-muted-foreground mt-3 text-center">
          Ortaya eklemek için tıklayın; hassas yerleştirmek için 3D görünüme sürükleyin
        </p>
      </CardContent>
    </Card>
  );
}

interface CategoryRailProps {
  filter: FilterKey;
  onSelect(filter: FilterKey): void;
}

function CategoryRail({ filter, onSelect }: CategoryRailProps): JSX.Element {
  const catalog = useCatalogRegistry();
  const categories = useCatalogCategories();
  const counts = new Map<FurnitureCategory, number>();
  catalog.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
  return (
    <div className="grid grid-cols-6 gap-1">
      <CategoryButton
        active={filter === 'all'}
        icon="✨"
        label="Tümü"
        count={catalog.length}
        onClick={() => onSelect('all')}
      />
      {categories.filter((category) => category.key === 'security' || (counts.get(category.key) ?? 0) > 0).map((category) => (
        <CategoryButton
          key={category.key}
          active={filter === category.key}
          icon={category.icon}
          label={category.label}
          count={category.key === 'security' ? CCTV_MODELS.length : (counts.get(category.key) ?? 0)}
          onClick={() => onSelect(category.key)}
        />
      ))}
    </div>
  );
}

interface CategoryButtonProps {
  active: boolean;
  icon: string;
  label: string;
  count: number;
  onClick(): void;
}

function CategoryButton({ active, icon, label, count, onClick }: CategoryButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} (${count})`}
      aria-pressed={active}
      className={`flex flex-col items-center justify-center rounded-lg py-1.5 transition-all ${
        active
          ? 'bg-amber-300 text-slate-900 shadow-md scale-[1.05]'
          : 'bg-muted/50 hover:bg-muted text-muted-foreground'
      }`}
    >
      <span className="text-base leading-none" aria-hidden>
        {icon}
      </span>
      <span className="text-[9px] mt-0.5 truncate w-full text-center">{label}</span>
    </button>
  );
}

interface CatalogTileProps {
  item: CatalogItem;
  onAdd(item: CatalogItem): void;
  onRemove?(item: CatalogItem): void;
  onEdit?(item: CatalogItem): void;
  actionOpen: boolean;
  onToggleActions(): void;
}

function CatalogTile({ item, onAdd, onRemove, onEdit, actionOpen, onToggleActions }: CatalogTileProps): JSX.Element {
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
      title={`${item.name} — 3D alana sürükle veya ortaya eklemek için tıkla`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(CATALOG_DRAG_MIME, item.type);
        event.dataTransfer.setData(`${CATALOG_DRAG_MIME}:data`, JSON.stringify(item));
        event.dataTransfer.setData('text/plain', item.name);
      }}
      className="group relative flex flex-col items-stretch overflow-hidden rounded-xl border bg-gradient-to-b from-white to-slate-50 hover:from-amber-50 hover:to-amber-100 hover:border-amber-300 active:scale-[0.97] transition-all cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md"
    >
      <div className="relative flex items-center justify-center aspect-square text-3xl bg-slate-50 group-hover:bg-amber-50/60">
        <CatalogThumbnail item={item} size={58} />
        <button
          type="button"
          aria-label={`${item.name} işlemleri`}
          aria-expanded={actionOpen}
          title="Eşya işlemleri"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onToggleActions(); }}
          className="absolute right-1 top-1 z-10 grid h-6 w-6 place-items-center rounded-md border border-white/70 bg-slate-900/70 text-white shadow-sm transition-colors hover:bg-blue-600"
        >
          <Pencil size={12} strokeWidth={2.5} />
        </button>
        {actionOpen && (
          <div
            role="menu"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute right-1 top-8 z-20 grid min-w-[88px] gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 text-white shadow-lg"
          >
            <button type="button" role="menuitem" onClick={() => onEdit?.(item)} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] hover:bg-slate-700">
              <Pencil size={11} /> Düzenle
            </button>
            <button type="button" role="menuitem" onClick={() => onRemove?.(item)} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-red-200 hover:bg-red-900/60">
              <Trash2 size={11} /> Sil
            </button>
          </div>
        )}
      </div>
      <div className="px-1.5 py-1 text-center bg-background">
        <p className="text-[10px] leading-tight font-medium truncate">{item.name}</p>
      </div>
    </div>
  );
}

// Re-export so the existing TS surface area stays unchanged for unrelated callers.
export type { CategoryMeta };
