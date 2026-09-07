'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { FURNITURE_CATALOG } from './constants';
import type { CatalogItem } from './types';
import { loadCustomCatalogItems, removeCustomCatalogItem, saveCustomCatalogItem } from './custom-glb-store';
import { normaliseCustomItemDimensions } from './custom-item-sizing';

interface RegistryData { hiddenTypes: string[]; customItems: CatalogItem[]; overrides: CatalogItem[] }
const REGISTRY_STORAGE_KEY = 'standalone-room-organizer-catalog-overrides-v1';
const listeners = new Set<() => void>();
let data: RegistryData = { hiddenTypes: [], customItems: [], overrides: [] };
let loaded = false;
let catalogSnapshot: readonly CatalogItem[] = FURNITURE_CATALOG;

function rebuildSnapshot(): void {
  const hidden = new Set(data.hiddenTypes);
  const overrides = new Map(data.overrides.map((item) => [item.type, item]));
  catalogSnapshot = [
    ...FURNITURE_CATALOG.filter((item) => !hidden.has(item.type)).map((item) => overrides.get(item.type) ?? item),
    ...data.customItems,
  ];
}

function loadOverrides(): CatalogItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REGISTRY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as CatalogItem[] : [];
  } catch {
    return [];
  }
}

function persistOverrides(overrides: CatalogItem[]): void {
  try { window.localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(overrides)); } catch { /* best effort */ }
}

function persistHiddenTypes(hiddenTypes: string[]): void {
  try { window.localStorage.setItem(`${REGISTRY_STORAGE_KEY}:hidden`, JSON.stringify(hiddenTypes)); } catch { /* best effort */ }
}

function load(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  void loadCustomCatalogItems().then((records) => {
    let hiddenTypes: string[] = [];
    try {
      const rawHidden = window.localStorage.getItem(`${REGISTRY_STORAGE_KEY}:hidden`);
      const parsedHidden = rawHidden ? JSON.parse(rawHidden) : [];
      if (Array.isArray(parsedHidden)) hiddenTypes = parsedHidden.filter((value): value is string => typeof value === 'string');
    } catch { /* best effort */ }
    data = { hiddenTypes, overrides: loadOverrides(), customItems: records.map((record) => ({
      ...record.item,
      ...normaliseCustomItemDimensions(record.item),
      ...(record.thumbnailDataUrl ? { customThumbnail: record.thumbnailDataUrl } : {}),
    })) };
    rebuildSnapshot();
    listeners.forEach((listener) => listener());
  }).catch(() => undefined);
}

function save(next: RegistryData): void {
  data = next;
  persistOverrides(data.overrides);
  persistHiddenTypes(data.hiddenTypes);
  rebuildSnapshot();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
function snapshot(): readonly CatalogItem[] {
  load();
  return catalogSnapshot;
}
const serverSnapshot = FURNITURE_CATALOG;

export function useCatalogRegistry(): readonly CatalogItem[] {
  useEffect(() => { load(); }, []);
  return useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
}

export function registerCatalogItem(item: CatalogItem): void {
  load();
  const normalisedItem = { ...item, ...normaliseCustomItemDimensions(item) };
  save({ ...data, customItems: [...data.customItems.filter((entry) => entry.customModelId !== item.customModelId), normalisedItem] });
  void saveCustomCatalogItem({ item: normalisedItem, ...(normalisedItem.customThumbnail ? { thumbnailDataUrl: normalisedItem.customThumbnail } : {}) });
}

export function updateCatalogItem(item: CatalogItem): void {
  load();
  const nextItem = { ...item, ...normaliseCustomItemDimensions(item) };
  if (item.customModelId) {
    save({ ...data, customItems: data.customItems.map((entry) => entry.customModelId === item.customModelId ? nextItem : entry) });
    void saveCustomCatalogItem({ item: nextItem, ...(nextItem.customThumbnail ? { thumbnailDataUrl: nextItem.customThumbnail } : {}) });
    return;
  }
  save({ ...data, overrides: [...data.overrides.filter((entry) => entry.type !== item.type), nextItem] });
}

export function removeCatalogItem(item: CatalogItem): void {
  load();
  if (item.customModelId) {
    void removeCustomCatalogItem(item.customModelId);
    save({ ...data, customItems: data.customItems.filter((entry) => entry.customModelId !== item.customModelId) });
  } else if (!data.hiddenTypes.includes(item.type)) {
    void fetch(`/api/catalog?type=${encodeURIComponent(item.type)}`, { method: 'DELETE' }).catch(() => undefined);
    save({ ...data, hiddenTypes: [...data.hiddenTypes, item.type] });
  }
}
