import type { FurnitureItem, RoomLayout } from './types';

const items: FurnitureItem[] = [];
function place(type: string, name: string, x: number, z: number, width: number, depth: number, height: number, color: string, rotation = 0): void {
  items.push({ id: `studio-${items.length}`, type, name, position: { x, z }, width, depth, height, color, rotation, icon: '' });
}

// A 108 m² office with a clear central circulation spine and generous chair clearances.
place('reception-desk', 'Karşılama', -3.9, 2.9, 2.3, 0.85, 1.05, '#d3b48b', Math.PI);
place('office-chair', 'Karşılama koltuğu', -3.9, 3.8, 0.65, 0.65, 1, '#495b60');
place('rug', 'Bekleme alanı halısı', -3.7, -1.6, 3.6, 3.8, 0.02, '#cbc6bb');
place('armchair', 'Bekleme koltuğu', -4.7, -2.6, 0.85, 0.85, 0.86, '#547572');
place('armchair', 'Bekleme koltuğu', -3.3, -2.6, 0.85, 0.85, 0.86, '#547572');
place('armchair', 'Misafir koltuğu', -4.7, -0.3, 0.85, 0.85, 0.86, '#c5a67e', Math.PI);
place('coffee-table', 'Meşe sehpa', -4, -1.5, 1.5, 0.7, 0.4, '#b99569');
place('meeting-table', 'Toplantı masası', 3.3, -2.3, 3.1, 1.1, 0.76, '#c4a276');
for (const x of [2.2, 3.3, 4.4]) {
  place('conference-chair', 'Toplantı koltuğu', x, -3.4, 0.6, 0.6, 0.86, '#46585c');
  place('conference-chair', 'Toplantı koltuğu', x, -1.2, 0.6, 0.6, 0.86, '#46585c', Math.PI);
}
for (const x of [2, 4.5]) {
  place('workstation', 'Çalışma masası', x, 1.4, 1.65, 0.75, 0.76, '#c4a276');
  place('office-chair', 'Çalışma koltuğu', x, 2.4, 0.65, 0.65, 1.05, '#52696b', Math.PI);
  place('filing-cabinet', 'Dosya dolabı', x, 3.9, 1.3, 0.42, 0.85, '#d9d9d2');
}
for (const [x, z] of [[-5.35, -3.8], [-1.8, -3.8], [5.4, -3.8], [-5.35, 0.9]]) {
  place('flowerpot', 'İç mekân bitkisi', x!, z!, 0.5, 0.5, 0.9, '#57775c');
}
place('whiteboard', 'Toplantı panosu', 5.65, -2.25, 1.8, 0.12, 1.8, '#eeeee8', Math.PI / 2);
for (const [x, z] of [[-5, -3.9], [5, -3.9], [-5, 3.9], [5, 3.9]]) {
  place('rtls-beacon', 'RTLS referans noktası', x!, z!, 0.16, 0.16, 0.08, '#e2eeec');
  items[items.length - 1]!.elevation = 2.5;
}

export const RTLS_STUDIO_TEMPLATE: Omit<RoomLayout, 'id'> = {
  name: 'RTLS Studio · Ofis', width: 12, height: 9,
  floors: [{
    id: 'rtls-studio-ground', name: 'Zemin kat', floorColor: '#c9b99f', floorPattern: 'wood',
    wallColors: { north: '#ecebe6', south: '#ecebe6', east: '#ecebe6', west: '#ecebe6' },
    interiorWalls: [
      { id: 'meeting-divider', x1: 0.7, z1: -4.5, x2: 0.7, z2: -0.5, color: '#ecebe6' },
      { id: 'meeting-front', x1: 2, z1: -0.1, x2: 6, z2: -0.1, color: '#ecebe6' },
    ],
    items,
  }],
};
