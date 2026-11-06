'use client';

import { ImagePlus, Plus, X } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { MAX_ITEM_DIMENSION } from '../lib/constants';
import { registerCatalogCategory, registerCatalogItem, useCatalogCategories } from '../lib/catalog-registry';
import type { CatalogItem, FurnitureCategory } from '../lib/types';

export interface CatalogCreateDialogProps {
  onClose(): void;
  onItemAdded(item: CatalogItem): void;
}

function newItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `custom-item-${crypto.randomUUID()}`;
  return `custom-item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function dimension(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_ITEM_DIMENSION ? parsed : null;
}

export function CatalogCreateDialog({ onClose, onItemAdded }: CatalogCreateDialogProps): JSX.Element {
  const categories = useCatalogCategories();
  const [mode, setMode] = useState<'category' | 'item'>('category');
  const [categoryName, setCategoryName] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('▦');
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState<FurnitureCategory>('office');
  const [itemIcon, setItemIcon] = useState('▦');
  const [itemColor, setItemColor] = useState('#8aa1b5');
  const [width, setWidth] = useState('1.00');
  const [depth, setDepth] = useState('1.00');
  const [height, setHeight] = useState('1.00');
  const [thumbnail, setThumbnail] = useState<string>();
  const [error, setError] = useState('');

  const addCategory = () => {
    if (!categoryName.trim()) {
      setError('Kategori adı boş olamaz.');
      return;
    }
    const category = registerCatalogCategory(categoryName, categoryIcon);
    setItemCategory(category.key);
    setCategoryName('');
    setError('Kategori oluşturuldu. Şimdi bu kategoriye eşya ekleyebilirsin.');
    setMode('item');
  };

  const handleThumbnail = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setThumbnail(String(reader.result));
    reader.readAsDataURL(file);
  };

  const addItem = () => {
    const itemWidth = dimension(width);
    const itemDepth = dimension(depth);
    const itemHeight = dimension(height);
    if (!itemName.trim()) {
      setError('Eşya adı boş olamaz.');
      return;
    }
    if (itemWidth === null || itemDepth === null || itemHeight === null) {
      setError(`Ölçüler 0 ile ${MAX_ITEM_DIMENSION} metre arasında olmalı.`);
      return;
    }
    const item: CatalogItem = {
      type: newItemId(),
      name: itemName.trim().slice(0, 100),
      category: itemCategory,
      icon: itemIcon.trim().slice(0, 4) || '▦',
      color: itemColor,
      price: 0,
      width: itemWidth,
      depth: itemDepth,
      height: itemHeight,
      ...(thumbnail ? { customThumbnail: thumbnail } : {}),
    };
    registerCatalogItem(item);
    onItemAdded(item);
    onClose();
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(5, 12, 18, .62)', backdropFilter: 'blur(5px)', pointerEvents: 'auto' }}
    >
      <div role="dialog" aria-modal="true" aria-label="Kataloga kategori veya eşya ekle" onMouseDown={(event) => event.stopPropagation()} style={{ width: 'min(470px, 100%)', maxHeight: 'calc(100vh - 36px)', overflowY: 'auto', borderRadius: 18, background: '#fff', color: '#24313b', boxShadow: '0 24px 80px rgba(0,0,0,.36)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid #e7ebee' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 850 }}>Kataloğa ekle</h2>
            <p style={{ margin: '4px 0 0', color: '#697782', fontSize: 11 }}>Yeni kategori oluştur veya mevcut kategoriye eşya ekle.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Pencereyi kapat" style={iconButtonStyle}><X size={17} /></button>
        </header>

        <div style={{ display: 'flex', gap: 8, padding: '14px 18px 0' }}>
          <button type="button" onClick={() => { setMode('category'); setError(''); }} style={tabStyle(mode === 'category')}>Yeni kategori</button>
          <button type="button" onClick={() => { setMode('item'); setError(''); }} style={tabStyle(mode === 'item')}>Yeni eşya</button>
        </div>

        <div style={{ display: 'grid', gap: 12, padding: 18 }}>
          {mode === 'category' ? (
            <>
              <label style={labelStyle}>Kategori adı<input autoFocus value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Örn. Laboratuvar" style={fieldStyle} /></label>
              <label style={labelStyle}>Kategori ikonu<input value={categoryIcon} onChange={(event) => setCategoryIcon(event.target.value)} maxLength={4} placeholder="▦" style={fieldStyle} /></label>
              <button type="button" onClick={addCategory} style={primaryButtonStyle}><Plus size={15} /> Kategori oluştur</button>
            </>
          ) : (
            <>
              <label style={labelStyle}>Eşya adı<input autoFocus value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Örn. Ölçüm Masası" style={fieldStyle} /></label>
              <label style={labelStyle}>Kategori<select value={itemCategory} onChange={(event) => setItemCategory(event.target.value as FurnitureCategory)} style={fieldStyle}>{categories.map((category) => <option key={category.key} value={category.key}>{category.icon} {category.label}</option>)}</select></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={labelStyle}>İkon<input value={itemIcon} onChange={(event) => setItemIcon(event.target.value)} maxLength={4} style={fieldStyle} /></label>
                <label style={labelStyle}>Renk<input type="color" value={itemColor} onChange={(event) => setItemColor(event.target.value)} style={{ ...fieldStyle, padding: 3 }} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {([['Genişlik', width, setWidth], ['Derinlik', depth, setDepth], ['Yükseklik', height, setHeight]] as const).map(([label, value, setter]) => <label key={label} style={labelStyle}>{label} (m)<input inputMode="decimal" value={value} onChange={(event) => setter(event.target.value)} style={fieldStyle} /></label>)}
              </div>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, padding: 10, border: '1px dashed #cbd5dc', borderRadius: 9, cursor: 'pointer' }}><ImagePlus size={16} /> Küçük görsel ekle<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleThumbnail} style={{ display: 'none' }} /></label>
              {error && <p role="alert" style={{ margin: 0, color: error.includes('oluşturuldu') ? '#087f6c' : '#c0392b', fontSize: 11 }}>{error}</p>}
              <button type="button" onClick={addItem} style={primaryButtonStyle}><Plus size={15} /> Eşyayı kataloğa ekle</button>
            </>
          )}
          {mode === 'category' && error && <p role="alert" style={{ margin: 0, color: '#c0392b', fontSize: 11 }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: 'grid', gap: 5, color: '#465661', fontSize: 11, fontWeight: 700 };
const fieldStyle = { width: '100%', height: 36, boxSizing: 'border-box' as const, padding: '0 10px', border: '1px solid #cbd5dc', borderRadius: 8, background: '#fff', color: '#24313b', fontSize: 12 };
const iconButtonStyle = { display: 'grid', placeItems: 'center', width: 30, height: 30, border: 0, borderRadius: 8, background: '#eef2f5', color: '#44525c', cursor: 'pointer' };
const tabStyle = (active: boolean) => ({ flex: 1, height: 34, border: `1px solid ${active ? '#1c9db0' : '#d5dde2'}`, borderRadius: 8, background: active ? '#e8fbfd' : '#fff', color: active ? '#087f8e' : '#52616b', fontSize: 11, fontWeight: 800, cursor: 'pointer' });
const primaryButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 36, padding: '0 14px', border: '1px solid #168fa1', borderRadius: 9, background: '#168fa1', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
