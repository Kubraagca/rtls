'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { CATEGORIES, MAX_ITEM_DIMENSION } from '../lib/constants';
import { createCustomGlbId, inspectGlbBinary, MAX_CUSTOM_GLB_BYTES, saveCustomGlbAsset, type CustomGlbInspection } from '../lib/custom-glb-store';
import type { CatalogItem, FurnitureCategory } from '../lib/types';
import { inspectCustomGlbScene, renderCustomGlbTopThumbnail } from '../three/custom-gltf-assets';
import { registerCatalogItem } from '../lib/catalog-registry';

interface PreviewInfo extends CustomGlbInspection {
  width: number;
  depth: number;
  height: number;
  collisionWidth: number;
  collisionDepth: number;
}

export interface CustomGlbUploadProps {
  onAdd(item: CatalogItem): void;
}

function cleanBaseName(fileName: string): string {
  return fileName.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 80) || 'Özel GLB';
}

function toField(value: number): string {
  return Math.max(0.02, value).toFixed(2);
}

function parseDimension(value: string): number | null {
  const n = Number(value.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > MAX_ITEM_DIMENSION) return null;
  return n;
}

export function CustomGlbUpload({ onAdd }: CustomGlbUploadProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [fileName, setFileName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState<FurnitureCategory>('office');
  const [width, setWidth] = useState('1.00');
  const [depth, setDepth] = useState('1.00');
  const [height, setHeight] = useState('1.00');
  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setBusy(false);
    setError(null);
    setPreview(null);
    setFileName('');
    setDisplayName('');
    setCategory('office');
    setWidth('1.00');
    setDepth('1.00');
    setHeight('1.00');
    fileBufferRef.current = null;
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    fileBufferRef.current = null;

    if (!/\.glb$/i.test(file.name)) {
      setError('Yalnızca .glb dosyası yükleyebilirsin.');
      return;
    }
    if (file.size > MAX_CUSTOM_GLB_BYTES) {
      setError(`Dosya çok büyük. Üst sınır ${Math.round(MAX_CUSTOM_GLB_BYTES / 1024 / 1024)} MB.`);
      return;
    }

    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      const binaryInfo = inspectGlbBinary(data);
      const THREE = await import('three');
      const sceneInfo = await inspectCustomGlbScene(THREE, data);
      fileBufferRef.current = data;
      setFileName(file.name);
      setDisplayName(cleanBaseName(file.name));
      setWidth(toField(sceneInfo.width));
      setDepth(toField(sceneInfo.depth));
      setHeight(toField(sceneInfo.height));
      setPreview({ ...binaryInfo, ...sceneInfo });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'GLB dosyası okunamadı.');
    } finally {
      setBusy(false);
    }
  };

  const addToScene = async () => {
    const data = fileBufferRef.current;
    const w = parseDimension(width);
    const d = parseDimension(depth);
    const h = parseDimension(height);
    if (!data || !preview) {
      setError('Önce bir GLB dosyası seç.');
      return;
    }
    if (!displayName.trim()) {
      setError('Eşya adı boş olamaz.');
      return;
    }
    if (w === null || d === null || h === null) {
      setError(`Ölçüler 0 ile ${MAX_ITEM_DIMENSION} metre arasında olmalı.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const THREE = await import('three');
      const thumbnailDataUrl = await renderCustomGlbTopThumbnail(THREE, data);
      const id = createCustomGlbId();
      await saveCustomGlbAsset(id, fileName, data);
      const catalogItem = {
        type: id,
        name: displayName.trim().slice(0, 100),
        category,
        icon: '◇',
        color: '#cbd5e1',
        price: 0,
        width: w,
        depth: d,
        height: h,
        customModelId: id,
        customModelFileName: fileName,
        customModelBytes: data.byteLength,
        customThumbnail: thumbnailDataUrl,
        collisionWidth: preview.collisionWidth,
        collisionDepth: preview.collisionDepth,
      } as CatalogItem;
      registerCatalogItem(catalogItem);
      onAdd(catalogItem);
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'GLB sahneye eklenemedi.');
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="pc-glass pc-glass--dark pc-tile"
        onClick={() => setOpen(true)}
        style={{
          padding: '9px 13px',
          borderRadius: 10,
          fontFamily: 'var(--pc-font-display)',
          fontSize: 10,
          fontWeight: 850,
          letterSpacing: '0.04em',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          border: '1px solid rgba(89, 240, 230, 0.45)',
        }}
        aria-label="GLB eşyayı sahneye ekle"
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
        SAHNEYE EKLE
      </button>

      {open && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(5, 12, 18, 0.64)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            pointerEvents: 'auto',
          }}
        >
          <div
            className="pc-glass pc-glass--dark"
            style={{
              width: 'min(560px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 40px)',
              overflowY: 'auto',
              borderRadius: 18,
              padding: 18,
              boxShadow: '0 24px 80px rgba(0,0,0,.45)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--pc-font-display)' }}>GLB Eşya Ekle</div>
                <div style={{ marginTop: 4, opacity: 0.68, fontSize: 12 }}>
                  Model bu cihazın tarayıcı depolamasında tutulur; katalog ve 2D plan için üstten görünüm otomatik oluşturulur.
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="pc-tile"
                style={{ width: 34, height: 34, borderRadius: 9, fontSize: 18 }}
                aria-label="Pencereyi kapat"
              >
                ×
              </button>
            </div>

            <label
              style={{
                marginTop: 16,
                minHeight: 104,
                border: '1px dashed rgba(125, 235, 228, .48)',
                borderRadius: 14,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                cursor: busy ? 'wait' : 'pointer',
                background: 'rgba(48, 105, 110, .12)',
                padding: 16,
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".glb,model/gltf-binary,application/octet-stream"
                onChange={handleFile}
                disabled={busy}
                style={{ display: 'none' }}
              />
              <strong>{busy ? 'GLB kontrol ediliyor…' : fileName || 'GLB dosyasını seç'}</strong>
              <span style={{ opacity: 0.58, fontSize: 11 }}>Tek dosya · glTF 2.0 · en fazla 32 MB</span>
            </label>

            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(220, 70, 70, .15)',
                  border: '1px solid rgba(255, 105, 105, .32)',
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            {preview && (
              <>
                <div style={{ marginTop: 15, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 6, fontSize: 11, opacity: 0.9 }}>
                    Eşya adı
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={100}
                      style={{ padding: '9px 10px', borderRadius: 9, background: 'rgba(0,0,0,.24)', color: 'inherit', border: '1px solid rgba(255,255,255,.13)' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6, fontSize: 11, opacity: 0.9 }}>
                    Grup
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
                      style={{ padding: '9px 10px', borderRadius: 9, background: '#17232d', color: 'white', border: '1px solid rgba(255,255,255,.13)' }}
                    >
                      {CATEGORIES.map((entry) => (
                        <option key={entry.key} value={entry.key}>{entry.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {([
                    ['Genişlik (m)', width, setWidth],
                    ['Derinlik (m)', depth, setDepth],
                    ['Yükseklik (m)', height, setHeight],
                  ] as const).map(([label, value, setter]) => (
                    <label key={label} style={{ display: 'grid', gap: 6, fontSize: 11, opacity: 0.9 }}>
                      {label}
                      <input
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        style={{ padding: '9px 10px', borderRadius: 9, background: 'rgba(0,0,0,.24)', color: 'inherit', border: '1px solid rgba(255,255,255,.13)' }}
                      />
                    </label>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.055)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                    fontSize: 10,
                  }}
                >
                  <span><b>{preview.meshCount}</b><br />mesh</span>
                  <span><b>{preview.nodeCount}</b><br />node</span>
                  <span><b>{preview.animationCount}</b><br />animasyon</span>
                  <span><b>{(fileBufferRef.current?.byteLength ?? 0) / 1024 / 1024 < 0.1 ? '<0.1' : ((fileBufferRef.current?.byteLength ?? 0) / 1024 / 1024).toFixed(1)}</b><br />MB</span>
                </div>

                {preview.animationCount > 0 && (
                  <div style={{ marginTop: 9, opacity: 0.62, fontSize: 11 }}>
                    Bu ekran eşya yüklemek içindir; GLB içindeki animasyonlar saklanır ancak eşya sahnede statik gösterilir.
                  </div>
                )}
              </>
            )}

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <button type="button" className="pc-tile" onClick={close} style={{ padding: '9px 14px', borderRadius: 9 }}>
                Vazgeç
              </button>
              <button
                type="button"
                className="pc-tile"
                onClick={addToScene}
                disabled={!preview || busy}
                style={{
                  padding: '9px 15px',
                  borderRadius: 9,
                  fontWeight: 900,
                  opacity: !preview || busy ? 0.5 : 1,
                  border: '1px solid rgba(89, 240, 230, .48)',
                }}
              >
                {busy ? 'Ekleniyor…' : 'Sahneye Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
