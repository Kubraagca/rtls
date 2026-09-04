import type { FurnitureItem } from './types';

/**
 * Scene items that represent tracked people in RTLS live mode.
 *
 * - `office-avatar` is the bundled scanned walking-man GLB.
 * - A custom GLB placed in the `people` group is also treated as a person
 *   marker, so the number of people in RTLS live always follows what the user
 *   actually placed in the editor instead of a synthetic demo count.
 */
export function isRtlsPersonItem(item: FurnitureItem): boolean {
  return item.type === 'office-avatar' || (item.type === 'custom-glb' && item.category === 'people');
}

export function getRtlsPersonItems(items: readonly FurnitureItem[]): FurnitureItem[] {
  return items.filter((item) => item.position && isRtlsPersonItem(item));
}
