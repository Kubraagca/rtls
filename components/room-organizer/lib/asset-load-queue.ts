interface QueueEntry<T> {
  key: string;
  priority: number;
  load(): Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

const MAX_CONCURRENT_ASSET_LOADS = 2;
const queue: QueueEntry<unknown>[] = [];
const cache = new Map<string, Promise<unknown>>();
let activeLoads = 0;
let pumpScheduled = false;

function pump(): void {
  while (activeLoads < MAX_CONCURRENT_ASSET_LOADS && queue.length > 0) {
    const entry = queue.shift()!;
    activeLoads += 1;
    void entry.load()
      .then(entry.resolve, entry.reject)
      .finally(() => {
        activeLoads -= 1;
        pump();
      });
  }
}

/** Schedule model decoding by visual importance instead of starting every
 * GLB download/parse at the same time during the first scene build. */
export function scheduleAssetLoad<T>(key: string, priority: number, load: () => Promise<T>): Promise<T> {
  const cached = cache.get(key) as Promise<T> | undefined;
  if (cached) return cached;

  const promise = new Promise<T>((resolve, reject) => {
    queue.push({ key, priority, load, resolve, reject });
    queue.sort((a, b) => b.priority - a.priority);
    if (!pumpScheduled) {
      pumpScheduled = true;
      queueMicrotask(() => {
        pumpScheduled = false;
        pump();
      });
    }
  });
  cache.set(key, promise);
  return promise;
}
