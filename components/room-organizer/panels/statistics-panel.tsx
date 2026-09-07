'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRoomEditor } from '../contexts';
import { useLayout } from '../hooks/use-layout-store';
import { CATEGORIES } from '../lib/constants';
import { footprintArea, itemCountByCategory } from '../lib/geometry';

export function StatisticsPanel(): JSX.Element {
  const layout = useLayout();
  const { collidingIds } = useRoomEditor();
  const allItems = useMemo(() => layout.floors.flatMap((floor) => floor.items), [layout.floors]);
  const footprint = useMemo(() => footprintArea(allItems), [allItems]);
  const roomArea = layout.width * layout.height;
  const totalArea = roomArea * layout.floors.length;
  const density = totalArea > 0 ? Math.min(100, (footprint / totalArea) * 100) : 0;
  const counts = useMemo(() => itemCountByCategory(allItems), [allItems]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">İstatistikler</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-xs">
        <StatRow label="Eşyalar">{allItems.length}</StatRow>
        <StatRow label="Katlar">{layout.floors.length}</StatRow>
        <StatRow label="Kat alanı">{roomArea.toFixed(1)} m²</StatRow>
        <StatRow label="Toplam alan">{totalArea.toFixed(1)} m²</StatRow>
        <StatRow label="Eşya kapladığı alan">{footprint.toFixed(1)} m² ({density.toFixed(0)}%)</StatRow>
        <ProgressBar value={density / 100} />
        {collidingIds.size > 0 && <StatRow label="Çakışmalar" highlight>{collidingIds.size}</StatRow>}
        {counts.size > 0 && <div className="pt-2 border-t space-y-1">
          <p className="text-muted-foreground">Kategoriye göre</p>
          {CATEGORIES.filter((category) => counts.has(category.key)).map((category) => (
            <StatRow key={category.key} label={`${category.icon} ${category.label}`}>{counts.get(category.key) ?? 0}</StatRow>
          ))}
        </div>}
        {layout.floors.length > 1 && <div className="pt-2 border-t space-y-1">
          <p className="text-muted-foreground">Katlara göre eşya sayısı</p>
          {layout.floors.map((floor) => <StatRow key={floor.id} label={floor.name}>{floor.items.length}</StatRow>)}
        </div>}
      </CardContent>
    </Card>
  );
}

function StatRow({ label, highlight = false, children }: { label: string; highlight?: boolean; children: React.ReactNode }): JSX.Element {
  return <div className="flex justify-between items-baseline"><span className="text-muted-foreground">{label}</span><span className={highlight ? 'font-semibold text-red-600' : 'font-medium'}>{children}</span></div>;
}

function ProgressBar({ value }: { value: number }): JSX.Element {
  return <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}
