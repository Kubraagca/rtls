'use client';

import { X } from 'lucide-react';
import { useId, type ChangeEvent } from 'react';
import { useCatalogCategories } from '../lib/catalog-registry';
import type { CatalogItem, FurnitureCategory } from '../lib/types';

interface CatalogEditDialogProps {
  item: CatalogItem;
  name: string;
  category: FurnitureCategory;
  onNameChange(value: string): void;
  onCategoryChange(value: FurnitureCategory): void;
  onThumbnailChange(value: string): void;
  onCancel(): void;
  onSave(): void;
}

export function CatalogEditDialog({ item, name, category, onNameChange, onCategoryChange, onThumbnailChange, onCancel, onSave }: CatalogEditDialogProps): JSX.Element {
  const nameId = useId();
  const categoryId = useId();
  const categories = useCatalogCategories();

  const handleThumbnail = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onThumbnailChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(15, 23, 42, .48)', backdropFilter: 'blur(3px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={nameId}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: 'min(420px, 100%)', border: '1px solid rgba(148, 163, 184, .35)', borderRadius: 16, background: '#fff', color: '#0f172a', boxShadow: '0 24px 70px rgba(15, 23, 42, .30)', overflow: 'hidden' }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 id={nameId} style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Eşyayı düzenle</h2>
            <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: 11 }}>{item.name}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Dialogu kapat" title="Kapat" style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, border: 0, borderRadius: 8, background: '#f1f5f9', color: '#475569', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </header>

        <div style={{ display: 'grid', gap: 12, padding: 16 }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 650, color: '#334155' }}>
            Eşya adı
            <input autoFocus value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Eşya adı" style={fieldStyle} />
          </label>
          <label htmlFor={categoryId} style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 650, color: '#334155' }}>
            Kategori
            <select id={categoryId} value={category} onChange={(event) => onCategoryChange(event.target.value as FurnitureCategory)} style={fieldStyle}>
              {categories.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 650, color: '#334155' }}>
            Küçük görsel
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleThumbnail} style={{ fontSize: 11, fontWeight: 400 }} />
          </label>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button type="button" onClick={onCancel} style={secondaryButtonStyle}>Vazgeç</button>
          <button type="button" onClick={onSave} disabled={!name.trim()} style={{ ...primaryButtonStyle, opacity: name.trim() ? 1 : .55 }}>Kaydet</button>
        </footer>
      </div>
    </div>
  );
}

const fieldStyle = { width: '100%', height: 36, boxSizing: 'border-box' as const, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#0f172a', fontSize: 12 };
const secondaryButtonStyle = { height: 34, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#334155', fontSize: 11, fontWeight: 650, cursor: 'pointer' };
const primaryButtonStyle = { ...secondaryButtonStyle, borderColor: '#2563eb', background: '#2563eb', color: '#fff' };
