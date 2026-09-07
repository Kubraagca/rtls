'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CATALOG_DRAG_MIME } from '../lib/catalog-drag';
import { CCTV_MODELS } from '../lib/cctv-models';
import { CATEGORIES } from '../lib/constants';
import { CctvMenu } from './cctv-menu';
import type { CatalogItem, CategoryMeta, FurnitureCategory } from '../lib/types';
import { removeCatalogItem, updateCatalogItem, useCatalogRegistry } from '../lib/catalog-registry';
import { CatalogThumbnail } from './catalog-thumbnail';

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
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<FurnitureCategory>('office');
  const [editThumbnail, setEditThumbnail] = useState<string | undefined>();
  const catalog = useCatalogRegistry();
  const query = controlledQuery ?? internalQuery;
  const setQuery = (next: string) => {
    if (onQueryChange) onQueryChange(next);
    else setInternalQuery(next);
  };

  const startEdit = (item: CatalogItem) => {
    setEditing(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditThumbnail(item.customThumbnail);
  };

  const handleThumbnail = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditThumbnail(String(reader.result));
    reader.readAsDataURL(file);
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
            <button type="button" className="rounded border px-1.5 py-0.5" onClick={() => setManage((value) => !value)}>
              {manage ? 'Bitti' : 'Yönet'}
            </button>
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
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-800">
            <div className="mb-2 font-semibold">Eşya bilgilerini düzenle</div>
            <div className="grid gap-2">
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Eşya adı" />
              <select className="h-9 rounded-md border bg-white px-2" value={editCategory} onChange={(event) => setEditCategory(event.target.value as FurnitureCategory)}>
                {CATEGORIES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
              </select>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleThumbnail} />
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded border px-2 py-1" onClick={() => setEditing(null)}>Vazgeç</button>
                <button type="button" className="rounded bg-blue-600 px-2 py-1 text-white" onClick={saveEdit}>Kaydet</button>
              </div>
            </div>
          </div>
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
            {CATEGORIES.map((category) => {
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
                      <CatalogTile key={`${item.type}-${item.name}-${item.customModelId ?? ''}`} item={item} onAdd={onAdd} manage={manage} onEdit={startEdit} onRemove={removeFromCatalog} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-[460px] overflow-y-auto pr-1">
            {filtered.map((item) => (
              <CatalogTile key={`${item.type}-${item.name}-${item.customModelId ?? ''}`} item={item} onAdd={onAdd} manage={manage} onEdit={startEdit} onRemove={removeFromCatalog} />
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
      {CATEGORIES.filter((category) => category.key === 'security' || (counts.get(category.key) ?? 0) > 0).map((category) => (
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
  manage?: boolean;
  onRemove?(item: CatalogItem): void;
  onEdit?(item: CatalogItem): void;
}

function CatalogTile({ item, onAdd, manage = false, onRemove, onEdit }: CatalogTileProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => { if (!manage) onAdd(item); }}
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
        <CatalogThumbnail item={item} size={34} />
        <button type="button" aria-label={`${item.name} sil`} title="Katalogdan ve sahneden sil" className="absolute right-1 top-1 rounded bg-red-600 px-1.5 py-1 text-sm leading-none text-white" onClick={(event) => { event.stopPropagation(); onRemove?.(item); }}>🗑</button>
        <button type="button" aria-label={`${item.name} düzenle`} title="Eşyayı düzenle" className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-1 text-sm leading-none text-white" onClick={(event) => { event.stopPropagation(); onEdit?.(item); }}>✎</button>
      </div>
      <div className="px-1.5 py-1 text-center bg-background">
        <p className="text-[10px] leading-tight font-medium truncate">{item.name}</p>
      </div>
    </button>
  );
}

// Re-export so the existing TS surface area stays unchanged for unrelated callers.
export type { CategoryMeta };
