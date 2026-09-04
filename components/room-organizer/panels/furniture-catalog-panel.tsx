'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CATALOG_DRAG_MIME } from '../lib/catalog-drag';
import { CCTV_MODELS } from '../lib/cctv-models';
import { CATEGORIES, CURRENCY_SYMBOL, FURNITURE_CATALOG } from '../lib/constants';
import { CctvMenu } from './cctv-menu';
import type { CatalogItem, CategoryMeta, FurnitureCategory } from '../lib/types';

type FilterKey = 'all' | FurnitureCategory;

const COUNTS_BY_CATEGORY: ReadonlyMap<FurnitureCategory, number> = (() => {
  const counts = new Map<FurnitureCategory, number>();
  for (const item of FURNITURE_CATALOG) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return counts;
})();

export interface FurnitureCatalogPanelProps {
  query?: string;
  onQueryChange?(query: string): void;
  onAdd(item: CatalogItem): void;
}

export function FurnitureCatalogPanel({
  onAdd,
  query: controlledQuery,
  onQueryChange,
}: FurnitureCatalogPanelProps): JSX.Element {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [internalQuery, setInternalQuery] = useState('');
  const query = controlledQuery ?? internalQuery;
  const setQuery = (next: string) => {
    if (onQueryChange) onQueryChange(next);
    else setInternalQuery(next);
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return FURNITURE_CATALOG.filter((item) => {
      if (filter !== 'all' && item.category !== filter) return false;
      if (!normalizedQuery) return true;
      return item.name.toLowerCase().includes(normalizedQuery) || item.type.toLowerCase().includes(normalizedQuery);
    });
  }, [filter, query]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 bg-gradient-to-b from-slate-50 to-transparent">
        <CardTitle className="flex items-center justify-between">
          <span>Eşya Kataloğu</span>
          <span className="text-[10px] font-normal text-muted-foreground">{filtered.length} items</span>
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
                      <CatalogTile key={`${item.type}-${item.name}`} item={item} onAdd={onAdd} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-[460px] overflow-y-auto pr-1">
            {filtered.map((item) => (
              <CatalogTile key={`${item.type}-${item.name}`} item={item} onAdd={onAdd} />
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
  return (
    <div className="grid grid-cols-6 gap-1">
      <CategoryButton
        active={filter === 'all'}
        icon="✨"
        label="Tümü"
        count={FURNITURE_CATALOG.length}
        onClick={() => onSelect('all')}
      />
      {CATEGORIES.filter((category) => category.key === 'security' || (COUNTS_BY_CATEGORY.get(category.key) ?? 0) > 0).map((category) => (
        <CategoryButton
          key={category.key}
          active={filter === category.key}
          icon={category.icon}
          label={category.label}
          count={category.key === 'security' ? CCTV_MODELS.length : (COUNTS_BY_CATEGORY.get(category.key) ?? 0)}
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
}

function CatalogTile({ item, onAdd }: CatalogTileProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      title={`${item.name} — 3D alana sürükle veya ortaya eklemek için tıkla`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(CATALOG_DRAG_MIME, item.type);
        event.dataTransfer.setData('text/plain', item.name);
      }}
      className="group relative flex flex-col items-stretch overflow-hidden rounded-xl border bg-gradient-to-b from-white to-slate-50 hover:from-amber-50 hover:to-amber-100 hover:border-amber-300 active:scale-[0.97] transition-all cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md"
    >
      <div className="flex items-center justify-center aspect-square text-3xl bg-slate-50 group-hover:bg-amber-50/60">
        <span aria-hidden>{item.icon}</span>
      </div>
      <div className="px-1.5 py-1 text-center bg-background">
        <p className="text-[10px] leading-tight font-medium truncate">{item.name}</p>
        <p className="text-[9px] text-amber-700 font-semibold">
          {CURRENCY_SYMBOL}
          {item.price.toLocaleString()}
        </p>
      </div>
    </button>
  );
}

// Re-export so the existing TS surface area stays unchanged for unrelated callers.
export type { CategoryMeta };
