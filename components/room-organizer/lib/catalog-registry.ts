'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { CATEGORIES, FURNITURE_CATALOG } from './constants';
import { loadCustomCatalogItems, removeCustomCatalogItem, saveCustomCatalogItem } from './custom-glb-store';
import { normaliseCustomItemDimensions } from './custom-item-sizing';
import type { CatalogItem, CategoryMeta } from './types';

interface RegistryData { hiddenTypes: string[]; customItems: CatalogItem[]; overrides: CatalogItem[]; categories: CategoryMeta[] }
const REGISTRY_STORAGE_KEY = 'standalone-room-organizer-catalog-overrides-v1';
const CUSTOM_ITEMS_STORAGE_KEY = 'standalone-room-organizer-custom-catalog-items-v1';
const CATEGORIES_STORAGE_KEY = 'standalone-room-organizer-catalog-categories-v1';
const listeners = new Set<() => void>();
let data: RegistryData = { hiddenTypes: [], customItems: [], overrides: [], categories: [] };
let loaded = false;
let catalogSnapshot: readonly CatalogItem[] = FURNITURE_CATALOG;
let categorySnapshot: readonly CategoryMeta[] = CATEGORIES;

function rebuildSnapshot(): void {
  const hidden = new Set(data.hiddenTypes);
  const overrides = new Map(data.overrides.map((item) => [item.type, item]));
  catalogSnapshot = [
    ...FURNITURE_CATALOG.filter((item) => !hidden.has(item.type)).map((item) => overrides.get(item.type) ?? item),
    ...data.customItems,
  ];
  categorySnapshot = [
    ...CATEGORIES,
    ...data.categories.filter((category) => !CATEGORIES.some((entry) => entry.key === category.key)),
  ];
}

function loadStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function loadOverrides(): CatalogItem[] {
  const parsed = loadStoredJson<unknown>(REGISTRY_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed as CatalogItem[] : [];
}

function loadCustomItems(): CatalogItem[] {
  const parsed = loadStoredJson<unknown>(CUSTOM_ITEMS_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed as CatalogItem[] : [];
}

function loadCategories(): CategoryMeta[] {
  const parsed = loadStoredJson<unknown>(CATEGORIES_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is CategoryMeta => Boolean(
    entry && typeof entry === 'object'
      && typeof (entry as CategoryMeta).key === 'string'
      && typeof (entry as CategoryMeta).label === 'string'
      && typeof (entry as CategoryMeta).icon === 'string'
  ));
}

function persistOverrides(overrides: CatalogItem[]): void {
  try { window.localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(overrides)); } catch { /* best effort */ }
}

function persistHiddenTypes(hiddenTypes: string[]): void {
  try { window.localStorage.setItem(`${REGISTRY_STORAGE_KEY}:hidden`, JSON.stringify(hiddenTypes)); } catch { /* best effort */ }
}

function persistCustomItems(items: CatalogItem[]): void {
  try { window.localStorage.setItem(CUSTOM_ITEMS_STORAGE_KEY, JSON.stringify(items.filter((item) => !item.customModelId))); } catch { /* best effort */ }
}

function persistCategories(categories: CategoryMeta[]): void {
  try { window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories)); } catch { /* best effort */ }
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
    const indexedDbItems = records.map((record) => ({
      ...record.item,
      ...normaliseCustomItemDimensions(record.item),
      ...(record.thumbnailDataUrl ? { customThumbnail: record.thumbnailDataUrl } : {}),
    }));
    const customItems = [
      ...indexedDbItems,
      ...loadCustomItems().filter((localItem) => !indexedDbItems.some((indexedItem) => (
        (indexedItem.customModelId ?? indexedItem.type) === (localItem.customModelId ?? localItem.type)
      ))),
    ];
    data = { hiddenTypes, overrides: loadOverrides(), customItems, categories: loadCategories() };
    rebuildSnapshot();
    listeners.forEach((listener) => listener());
  }).catch(() => undefined);
}

function save(next: RegistryData): void {
  data = next;
  persistOverrides(data.overrides);
  persistHiddenTypes(data.hiddenTypes);
  persistCustomItems(data.customItems);
  persistCategories(data.categories);
  rebuildSnapshot();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
function snapshot(): readonly CatalogItem[] {
  load();
  return catalogSnapshot;
}
function categorySnapshotValue(): readonly CategoryMeta[] {
  load();
  return categorySnapshot;
}
const serverSnapshot = FURNITURE_CATALOG;
const serverCategorySnapshot = CATEGORIES;

export function useCatalogRegistry(): readonly CatalogItem[] {
  useEffect(() => { load(); }, []);
  return useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
}

export function useCatalogCategories(): readonly CategoryMeta[] {
  useEffect(() => { load(); }, []);
  return useSyncExternalStore(subscribe, categorySnapshotValue, () => serverCategorySnapshot);
}

export function registerCatalogCategory(label: string, icon = '▦'): CategoryMeta {
  load();
  const cleanLabel = label.trim().slice(0, 48);
  const base = cleanLabel.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/gi, '-').replace(/^-+|-+$/g, '') || 'kategori';
  const existingKeys = new Set([...CATEGORIES.map((category) => category.key), ...data.categories.map((category) => category.key)]);
  let key = `custom-${base}`;
  let suffix = 2;
  while (existingKeys.has(key)) key = `custom-${base}-${suffix++}`;
  const category: CategoryMeta = { key, label: cleanLabel, icon: icon.trim().slice(0, 4) || '▦' };
  save({ ...data, categories: [...data.categories, category] });
  return category;
}

export function registerCatalogItem(item: CatalogItem): void {
  load();
  const normalisedItem = { ...item, ...normaliseCustomItemDimensions(item) };
  const isCustomItem = Boolean(item.customModelId || item.type.startsWith('custom-item-'));
  if (isCustomItem) {
    const itemKey = item.customModelId ?? item.type;
    save({ ...data, customItems: [...data.customItems.filter((entry) => (entry.customModelId ?? entry.type) !== itemKey), normalisedItem] });
    if (normalisedItem.customModelId) {
      void saveCustomCatalogItem({ item: normalisedItem, ...(normalisedItem.customThumbnail ? { thumbnailDataUrl: normalisedItem.customThumbnail } : {}) });
    }
    return;
  }
  save({ ...data, overrides: [...data.overrides.filter((entry) => entry.type !== item.type), normalisedItem] });
}

export function updateCatalogItem(item: CatalogItem): void {
  load();
  const nextItem = { ...item, ...normaliseCustomItemDimensions(item) };
  if (item.customModelId || item.type.startsWith('custom-item-')) {
    const itemKey = item.customModelId ?? item.type;
    save({ ...data, customItems: data.customItems.map((entry) => (entry.customModelId ?? entry.type) === itemKey ? nextItem : entry) });
    if (nextItem.customModelId) {
      void saveCustomCatalogItem({ item: nextItem, ...(nextItem.customThumbnail ? { thumbnailDataUrl: nextItem.customThumbnail } : {}) });
    }
    return;
  }
  save({ ...data, overrides: [...data.overrides.filter((entry) => entry.type !== item.type), nextItem] });
}

export function removeCatalogItem(item: CatalogItem): void {
  load();
  if (item.customModelId || item.type.startsWith('custom-item-')) {
    if (item.customModelId) void removeCustomCatalogItem(item.customModelId);
    const itemKey = item.customModelId ?? item.type;
    save({ ...data, customItems: data.customItems.filter((entry) => (entry.customModelId ?? entry.type) !== itemKey) });
  } else if (!data.hiddenTypes.includes(item.type)) {
    void fetch(`/api/catalog?type=${encodeURIComponent(item.type)}`, { method: 'DELETE' }).catch(() => undefined);
    save({ ...data, hiddenTypes: [...data.hiddenTypes, item.type] });
  }
}
