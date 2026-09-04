'use client';

/**
 * Browser-local storage for user supplied GLB furniture.
 *
 * Security notes:
 * - Only binary glTF 2.0 (.glb) is accepted.
 * - External URI references are rejected before Three.js sees the asset, so a
 *   crafted model cannot make the browser fetch textures/buffers from the web.
 * - Assets are stored in IndexedDB as binary data. This store never contains
 *   authentication/session material.
 */

export const MAX_CUSTOM_GLB_BYTES = 32 * 1024 * 1024;

const DB_NAME = 'rtls-office-custom-assets-v1';
const STORE_NAME = 'glb-assets';
const DB_VERSION = 1;

export interface CustomGlbInspection {
  version: number;
  generator?: string;
  meshCount: number;
  animationCount: number;
  nodeCount: number;
  extensionsUsed: readonly string[];
}

interface CustomGlbRecord {
  id: string;
  fileName: string;
  byteLength: number;
  createdAt: number;
  data: ArrayBuffer;
}

const memoryFallback = new Map<string, CustomGlbRecord>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase | null> {
  if (!isBrowser()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i]!);
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  return readAscii(bytes, 0, bytes.length);
}

function isSafeEmbeddedUri(uri: unknown): boolean {
  return typeof uri !== 'string' || uri.startsWith('data:');
}

/** Validate GLB structure and reject any network-capable external resource URI. */
export function inspectGlbBinary(buffer: ArrayBuffer): CustomGlbInspection {
  if (buffer.byteLength < 20) throw new Error('GLB dosyası geçerli değil.');
  if (buffer.byteLength > MAX_CUSTOM_GLB_BYTES) {
    throw new Error(`GLB en fazla ${Math.round(MAX_CUSTOM_GLB_BYTES / 1024 / 1024)} MB olabilir.`);
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (magic !== 0x46546c67) throw new Error('Yalnızca gerçek .glb (binary glTF) dosyaları destekleniyor.');
  if (version !== 2) throw new Error('Yalnızca glTF 2.0 GLB dosyaları destekleniyor.');
  if (declaredLength !== buffer.byteLength) throw new Error('GLB dosya uzunluğu bozuk veya eksik.');

  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== 0x4e4f534a || jsonChunkLength <= 0 || 20 + jsonChunkLength > buffer.byteLength) {
    throw new Error('GLB JSON bölümü bulunamadı.');
  }

  const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLength);
  let gltf: Record<string, unknown>;
  try {
    gltf = JSON.parse(decodeUtf8(jsonBytes).replace(/\u0000+$/g, '').trim()) as Record<string, unknown>;
  } catch {
    throw new Error('GLB içindeki glTF tanımı okunamadı.');
  }

  const asset = (gltf.asset ?? {}) as Record<string, unknown>;
  if (asset.version !== '2.0') throw new Error('GLB içeriği glTF 2.0 değil.');

  const buffers = Array.isArray(gltf.buffers) ? gltf.buffers as Array<Record<string, unknown>> : [];
  const images = Array.isArray(gltf.images) ? gltf.images as Array<Record<string, unknown>> : [];
  const unsafeBuffer = buffers.find((entry) => !isSafeEmbeddedUri(entry.uri));
  const unsafeImage = images.find((entry) => !isSafeEmbeddedUri(entry.uri));
  if (unsafeBuffer || unsafeImage) {
    throw new Error('Güvenlik nedeniyle dış dosya/URL kullanan GLB kabul edilmiyor. Model tek dosya (embedded) olmalı.');
  }

  const extensionsUsed = Array.isArray(gltf.extensionsUsed)
    ? gltf.extensionsUsed.filter((value): value is string => typeof value === 'string')
    : [];
  if (extensionsUsed.includes('KHR_draco_mesh_compression')) {
    throw new Error('Bu GLB Draco sıkıştırmalı. Şimdilik Blender’dan Draco kapalı şekilde GLB dışa aktar.');
  }
  if (extensionsUsed.includes('KHR_texture_basisu')) {
    throw new Error('Bu GLB KTX2/Basis dokusu kullanıyor. Şimdilik standart embedded PNG/JPG dokulu GLB kullan.');
  }

  return {
    version,
    ...(typeof asset.generator === 'string' ? { generator: asset.generator } : {}),
    meshCount: Array.isArray(gltf.meshes) ? gltf.meshes.length : 0,
    animationCount: Array.isArray(gltf.animations) ? gltf.animations.length : 0,
    nodeCount: Array.isArray(gltf.nodes) ? gltf.nodes.length : 0,
    extensionsUsed,
  };
}

export function createCustomGlbId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `glb-${crypto.randomUUID()}`;
  }
  return `glb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveCustomGlbAsset(id: string, fileName: string, data: ArrayBuffer): Promise<void> {
  inspectGlbBinary(data);
  const record: CustomGlbRecord = {
    id,
    fileName: fileName.slice(0, 180),
    byteLength: data.byteLength,
    createdAt: Date.now(),
    data: data.slice(0),
  };
  memoryFallback.set(id, record);

  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    // Memory fallback is already populated; quota/private-mode failures must
    // not make the current editing session unusable.
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
    tx.objectStore(STORE_NAME).put(record);
  }).finally(() => db.close());
}

export async function loadCustomGlbAssetData(id: string): Promise<ArrayBuffer | null> {
  const inMemory = memoryFallback.get(id);
  if (inMemory) return inMemory.data.slice(0);

  const db = await openDb();
  if (!db) return null;
  const record = await new Promise<CustomGlbRecord | null>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve((request.result as CustomGlbRecord | undefined) ?? null);
  }).finally(() => db.close());

  if (!record?.data) return null;
  memoryFallback.set(id, record);
  return record.data.slice(0);
}
