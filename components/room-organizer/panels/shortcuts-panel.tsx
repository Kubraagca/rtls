'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Shortcut {
  label: string;
  keys: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  { label: 'Undo / Redo', keys: 'Ctrl+Z / Ctrl+⇧+Z' },
  { label: 'Delete item', keys: 'Del' },
  { label: 'Çoğalt', keys: 'Ctrl+D' },
  { label: 'Rotate', keys: 'R (⇧R = 15°)' },
  { label: 'Move', keys: 'Arrows' },
  { label: 'Deselect', keys: 'Esc' },
  { label: 'Focus on item', keys: 'F' },
  { label: 'Multi-select', keys: 'Ctrl+click' },
  { label: 'Toggle 2D', keys: '2' },
  { label: 'Measurements', keys: 'M' },
  { label: 'Snap to grid', keys: 'G' },
  { label: 'Sinyal/Kapsama', keys: 'W' },
  { label: 'Günün saati', keys: '[ / ]' },
  { label: 'Kat değiştir', keys: 'PgUp / PgDn' },
];

export function ShortcutsPanel(): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">⌨️ Kısayollar</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xs space-y-1">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="flex justify-between">
              <span className="text-muted-foreground">{shortcut.label}:</span>
              <code className="bg-muted px-1 rounded">{shortcut.keys}</code>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
