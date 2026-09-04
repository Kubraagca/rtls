'use client';

import {
  Activity,
  Boxes,
  Camera,
  ChevronLeft,
  Crosshair,
  Eye,
  Flame,
  Layers3,
  Map,
  MapPin,
  Menu,
  Pause,
  Play,
  Radio,
  Route,
  Search,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { RtlsDeviceSnapshot, RtlsPerformanceSnapshot } from '../hooks/use-npcs';
import type { DigitalTwinLayerState } from '../lib/digital-twin-layers';

type LiveLayerKey = keyof DigitalTwinLayerState;

export interface TwinzoLiveHudProps {
  layoutName: string;
  floorName: string;
  view2D: boolean;
  layers: DigitalTwinLayerState;
  devices: readonly RtlsDeviceSnapshot[];
  selectedDeviceId: string | null;
  paused: boolean;
  performance: RtlsPerformanceSnapshot;
  measurementActive: boolean;
  onToggleView(): void;
  onToggleLayer(key: LiveLayerKey): void;
  onSelectDevice(id: string | null): void;
  onFocusDevice(id: string): void;
  onFit(): void;
  onTogglePaused(): void;
  onToggleMeasurement(): void;
}

const LAYER_BUTTONS: ReadonlyArray<{
  key: LiveLayerKey;
  label: string;
  group: 'GÖRÜNÜM' | 'RTLS' | 'ANALİZ';
  icon: typeof Tag;
}> = [
  { key: 'labels', label: 'Etiketler', group: 'GÖRÜNÜM', icon: Tag },
  { key: 'areas', label: 'Alanlar', group: 'GÖRÜNÜM', icon: MapPin },
  { key: 'paths', label: 'Rotalar', group: 'GÖRÜNÜM', icon: Route },
  { key: 'devices', label: 'Cihazlar', group: 'RTLS', icon: Users },
  { key: 'signals', label: 'Sinyaller', group: 'RTLS', icon: Radio },
  { key: 'cameras', label: 'Kameralar', group: 'RTLS', icon: Camera },
  { key: 'heatmap', label: 'Isı Haritası', group: 'ANALİZ', icon: Flame },
];

const GROUPS = ['GÖRÜNÜM', 'RTLS', 'ANALİZ'] as const;

export function TwinzoLiveHud(props: TwinzoLiveHudProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedDevice = props.devices.find((device) => device.id === props.selectedDeviceId) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.devices;
    return props.devices.filter((device) => device.id.toLowerCase().includes(q) || device.status.toLowerCase().includes(q));
  }, [props.devices, query]);

  return (
    <>
      {/* Compact left navigation — Twinzo-like controls, adapted for the office RTLS use case. */}
      <div className="twz-left-stack pointer-events-auto" aria-label="Canlı dijital ikiz kontrolleri">
        <RoundButton label="Menü" active={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </RoundButton>
        <RoundButton label="Tüm ofisi göster" onClick={props.onFit}><Crosshair size={19} /></RoundButton>
        <RoundButton label={props.view2D ? '3D görünüm' : '2D plan'} active={props.view2D} onClick={props.onToggleView}>
          {props.view2D ? <Boxes size={19} /> : <Map size={19} />}
        </RoundButton>
        <RoundButton label="Ölçüm" active={props.measurementActive} onClick={props.onToggleMeasurement}>
          <Activity size={19} />
        </RoundButton>
        <div className="twz-device-counter">
          <Users size={15} />
          <span>Cihazlar</span>
          <strong>{props.devices.length}/{props.devices.length || 3}</strong>
        </div>
      </div>

      {menuOpen && (
        <aside className="twz-side-panel pointer-events-auto" aria-label="Cihaz listesi">
          <div className="twz-side-panel__heading">
            <div>
              <div className="twz-kicker">CANLI DİJİTAL İKİZ</div>
              <strong>{props.layoutName}</strong>
              <small>{props.floorName}</small>
            </div>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Paneli kapat"><ChevronLeft size={19} /></button>
          </div>
          <div className="twz-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cihaz ara…" />
          </div>
          <div className="twz-panel-section-title">TAKİP EDİLENLER</div>
          <div className="twz-device-list">
            {filtered.map((device) => (
              <button
                key={device.id}
                type="button"
                className={`twz-device-row${props.selectedDeviceId === device.id ? ' is-selected' : ''}`}
                onClick={() => props.onSelectDevice(device.id)}
              >
                <span className={`twz-status-dot is-${device.mode}`} />
                <span className="twz-device-row__copy">
                  <strong>{device.id}</strong>
                  <small>{device.status}</small>
                </span>
                <span className="twz-device-row__battery">{device.battery}%</span>
              </button>
            ))}
          </div>
          <div className="twz-panel-section-title">KATMANLAR</div>
          <div className="twz-layer-summary">
            {LAYER_BUTTONS.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => props.onToggleLayer(key)} className={props.layers[key] ? 'is-active' : ''}>
                <span>{label}</span><span>{props.layers[key] ? 'Açık' : 'Kapalı'}</span>
              </button>
            ))}
          </div>
        </aside>
      )}

      <div className="twz-top-status pointer-events-none">
        <div className="twz-top-status__dot" />
        <div>
          <strong>RTLS CANLI</strong>
          <span>Demo veri akışı · {props.floorName}</span>
        </div>
        <div className="twz-perf-inline" title="RTLS crowd performansı">
          <b>{props.performance.fps || '—'} FPS</b>
          <span>{props.performance.fullAvatars} GLB yakın</span>
          <span>{props.performance.proxyAvatars} GLB instanced</span>
          <span>{props.performance.drawCalls} draw</span>
        </div>
      </div>

      {selectedDevice && (
        <div className="twz-device-card pointer-events-auto">
          <div className="twz-device-card__title">
            <div><Users size={16} /> <strong>{selectedDevice.id}</strong></div>
            <button type="button" onClick={() => props.onSelectDevice(null)} aria-label="Detayı kapat"><X size={16} /></button>
          </div>
          <div className="twz-device-card__stats">
            <StatCell label="Durum" value="Aktif" good />
            <StatCell label="Cihaz Tipi" value="Personel" />
            <StatCell label="Batarya" value={`${selectedDevice.battery}%`} warn={selectedDevice.battery < 50} />
          </div>
          <div className="twz-device-card__position">
            <MapPin size={14} /> X {selectedDevice.x.toFixed(2)} m · Z {selectedDevice.z.toFixed(2)} m · {selectedDevice.status}
          </div>
          <div className="twz-device-card__actions">
            <button type="button" className={props.layers.heatmap ? 'is-active' : ''} onClick={() => props.onToggleLayer('heatmap')}>
              <Flame size={16} /><span>Analiz</span>
            </button>
            <button type="button" className={props.layers.areas ? 'is-active' : ''} onClick={() => props.onToggleLayer('areas')}>
              <Eye size={16} /><span>Alanlar</span>
            </button>
            <button type="button" onClick={() => props.onFocusDevice(selectedDevice.id)}>
              <Crosshair size={16} /><span>Odakla</span>
            </button>
          </div>
        </div>
      )}

      <div className="twz-live-timeline pointer-events-auto">
        <button type="button" onClick={props.onTogglePaused} aria-label={props.paused ? 'Canlı hareketi sürdür' : 'Canlı hareketi duraklat'}>
          {props.paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <span className={`twz-live-dot${props.paused ? ' is-paused' : ''}`} />
        <strong>{props.paused ? 'DURAKLATILDI' : 'CANLI'}</strong>
        <div className="twz-timeline-track"><span style={{ width: props.paused ? '72%' : '100%' }} /></div>
        <time suppressHydrationWarning>{new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>

      <div className="twz-dock pointer-events-auto" aria-label="Canlı katmanlar">
        {GROUPS.map((group) => (
          <div key={group} className="twz-dock-group">
            <div className="twz-dock-group__label">{group}</div>
            <div className="twz-dock-group__buttons">
              {LAYER_BUTTONS.filter((item) => item.group === group).map(({ key, label, icon: LayerIcon }) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={props.layers[key]}
                  className={props.layers[key] ? 'is-active' : ''}
                  onClick={() => props.onToggleLayer(key)}
                >
                  <LayerIcon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="twz-dock-brand" aria-label="RTLS Digital Twin"><Layers3 size={19} /><span>RTLS</span></div>
      </div>
    </>
  );
}

function RoundButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick(): void; children: ReactNode }): JSX.Element {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} className={`twz-round-button${active ? ' is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function StatCell({ label, value, good, warn }: { label: string; value: string; good?: boolean; warn?: boolean }): JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong className={good ? 'is-good' : warn ? 'is-warn' : ''}>{value}</strong>
    </div>
  );
}
