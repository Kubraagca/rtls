'use client';

import { useRoomEditor } from '../contexts';
import { Icon, type PlotcraftIconName } from '../plotcraft/icon';
import type { GameMode } from '../lib/types';

export type { GameMode };

export interface ModePanelProps {
  onSetMode(mode: GameMode): void;
  onSurprise(): void;
}

export function ModePanel({ onSetMode }: ModePanelProps): JSX.Element {
  const { history, gameMode } = useRoomEditor();

  if (gameMode === 'live') {
    return (
      <div className="pointer-events-auto pc-glass pc-mode-panel" style={{ padding: 6, borderRadius: 13 }}>
        <button
          type="button"
          onClick={() => onSetMode('build')}
          className="twz-edit-return"
          aria-label="Düzenleme moduna dön"
        >
          ← DÜZENLE
        </button>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto pc-glass pc-mode-panel"
      style={{
        width: 248,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 5,
          padding: 4,
          borderRadius: 12,
          background: 'rgba(0, 0, 0, 0.24)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <ModeButton active label="DÜZENLE" onClick={() => onSetMode('build')} />
        <ModeButton active={false} label="RTLS CANLI" live onClick={() => onSetMode('live')} />
      </div>

      <div
        style={{
          background: 'rgba(0, 0, 0, 0.20)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: 4,
          boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.30)',
          display: 'flex',
          gap: 4,
        }}
      >
        <ActionButton label="Geri al" icon="undo" disabled={!history.canUndo} onClick={history.undo} />
      </div>
    </div>
  );
}

function ModeButton({ active, label, live, onClick }: { active: boolean; label: string; live?: boolean; onClick(): void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight: 34,
        border: active ? `1px solid ${live ? 'rgba(76, 226, 220, 0.62)' : 'rgba(255,255,255,0.24)'}` : '1px solid transparent',
        borderRadius: 9,
        background: active ? (live ? 'rgba(20, 121, 123, 0.34)' : 'rgba(255,255,255,0.10)') : 'transparent',
        color: active && live ? '#91f7f2' : '#f4f7f8',
        fontFamily: 'var(--pc-font-display)',
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: '0.06em',
        cursor: 'pointer',
      }}
    >
      {live && active ? '● ' : ''}{label}
    </button>
  );
}

interface ActionButtonProps {
  icon: PlotcraftIconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
}

function ActionButton({ icon, label, active, disabled, onClick }: ActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`pc-tile${active ? ' pc-tile--active' : ''}`}
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
