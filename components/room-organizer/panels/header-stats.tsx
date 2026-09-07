'use client';

import { useEffect, useState } from 'react';
import { useLayout } from '../hooks/use-layout-store';
import { Icon, type PlotcraftIconName } from '../plotcraft/icon';

export interface HeaderStatsProps {
  lastSavedAt?: number | null;
  saving?: boolean;
  saveError?: boolean;
}

export function HeaderStats({
  lastSavedAt = null,
  saving = false,
  saveError = false,
}: HeaderStatsProps): JSX.Element {
  // `layout` from the store selector — re-renders only on layout changes.
  const layout = useLayout();
  const allItems = layout.floors.flatMap((floor) => floor.items);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Chip icon="box" label="Eşya" value={allItems.length.toString()} />
      <Chip icon="stairs" label="Kat" value={layout.floors.length.toString()} />
      <Chip icon="ruler" label="Alan" value={`${layout.width}m × ${layout.height}m`} />
      <SaveIndicator lastSavedAt={lastSavedAt} saving={saving} saveError={saveError} />
    </div>
  );
}

interface SaveIndicatorProps {
  lastSavedAt: number | null;
  saving: boolean;
  saveError: boolean;
}

function SaveIndicator({ lastSavedAt, saving, saveError }: SaveIndicatorProps): JSX.Element {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  // A failed save (typically an oversized floor-plan blowing the localStorage
  // budget) takes precedence — never claim "Saved" for a layout that didn't
  // actually persist.
  let label = 'Otomatik kayıt açık';
  if (saveError) label = 'Kayıt başarısız — depolama dolu';
  else if (saving) label = 'Kaydediliyor…';
  else if (lastSavedAt) label = `${formatRelative(Date.now() - lastSavedAt)} kaydedildi`;

  const iconColor = saveError
    ? 'var(--pc-danger, #f87171)'
    : saving
      ? 'var(--pc-cyan-glow)'
      : 'var(--pc-paper-soft)';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        color: saveError ? 'var(--pc-danger, #f87171)' : 'var(--pc-paper-soft)',
        fontFamily: 'var(--pc-font-body)',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <span
        aria-hidden
        style={{
          color: iconColor,
          display: 'inline-flex',
          animation: saving && !saveError ? 'pcHaloPulse 1.6s ease-in-out infinite' : undefined,
        }}
      >
        <Icon name="save" size={14} />
      </span>
      <span>{label}</span>
    </div>
  );
}

function formatRelative(ms: number): string {
  if (ms < 5_000) return 'az önce';
  if (ms < 60_000) return `${Math.floor(ms / 1000)} sn önce`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} dk önce`;
  return `${Math.floor(ms / 3_600_000)} sa önce`;
}

interface ChipProps {
  icon: PlotcraftIconName;
  label: string;
  value: string;
  intent?: 'normal' | 'warning' | 'danger';
}

function Chip({ icon, label, value, intent = 'normal' }: ChipProps): JSX.Element {
  const intentStyles: Record<NonNullable<ChipProps['intent']>, React.CSSProperties> = {
    normal: {
      background: 'rgba(255,255,255,0.10)',
      borderColor: 'var(--pc-glass-stroke)',
      color: 'var(--pc-paper)',
    },
    warning: {
      background: 'rgba(242,181,61,0.18)',
      borderColor: 'var(--pc-warn-amber)',
      color: 'var(--pc-warn-amber)',
    },
    danger: {
      background: 'rgba(228,82,72,0.20)',
      borderColor: 'var(--pc-demolish)',
      color: 'var(--pc-demolish)',
    },
  };
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        border: '1px solid',
        padding: '4px 12px 4px 10px',
        fontFamily: 'var(--pc-font-display)',
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: '0.02em',
        fontVariantNumeric: 'tabular-nums',
        ...intentStyles[intent],
      }}
    >
      <Icon name={icon} size={14} />
      <span
        style={{
          opacity: 0.7,
          fontWeight: 600,
          letterSpacing: 'var(--pc-tr-caps)',
          textTransform: 'uppercase',
          fontSize: 10,
        }}
      >
        {label}:
      </span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}
