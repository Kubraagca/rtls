import { type BuilderContext, type FurnitureBuilder, type ThreeModule } from './builder-utils';
import { buildToilet, buildBathtub, buildShower } from './builders/builders-bathroom';
import { buildBed, buildNightstand, buildDresser } from './builders/builders-bedroom';
import {
  buildRug, buildPainting, buildVase, buildMirror, buildCurtains,
  buildWallShelf, buildWallClock, buildCandles, buildBooksStack,
} from './builders/builders-decor';
import { buildTV, buildComputer, buildWiFi, buildRouter, buildCCTV, buildSecurityCamera } from './builders/builders-electronics';
import { buildFridge, buildStove, buildSink, buildCounter } from './builders/builders-kitchen';
import { buildLamp, buildPendantLight, buildLamppost } from './builders/builders-lighting';
import {
  buildFence, buildPool, buildBbq, buildMailbox, buildBirdbath,
  buildSteppingStone, buildGardenBench, buildPicnicTable, buildPond,
} from './builders/builders-outdoor';
import { buildPerson, buildPet } from './builders/builders-people';
import {
  buildPlant, buildFlowerpot, buildTree, buildPineTree, buildBush,
  buildHedge, buildFlowerBed, buildTulips, buildSunflower, buildRoseBush,
} from './builders/builders-plants';
import { buildChair, buildArmchair, buildBench, buildSofa } from './builders/builders-seating';
import { buildBookshelf, buildCabinet } from './builders/builders-storage';
import { buildDoor, buildWindow, buildStairs } from './builders/builders-structure';
import { buildTableOrDesk } from './builders/builders-tables';
import {
  buildAcousticPanel,
  buildCeilingPanelLight,
  buildCoatRack,
  buildCoffeeMachine,
  buildConferenceChair,
  buildFilingCabinet,
  buildMeetingTable,
  buildOfficeChair,
  buildPartition,
  buildPrinter,
  buildReceptionDesk,
  buildRtlsGateway,
  buildRtlsBeacon,
  buildStorageLocker,
  buildTrashBin,
  buildWaterCooler,
  buildWhiteboard,
  buildWorkstation,
} from './builders/builders-office';
import type { FurnitureItem } from '../lib/types';

const BUILDERS: Record<string, FurnitureBuilder> = {
  bed: buildBed,
  chair: buildChair,
  'dining-chair': buildChair,
  armchair: buildArmchair,
  bench: buildBench,
  sofa: buildSofa,
  table: buildTableOrDesk,
  'dining-table': buildTableOrDesk,
  'coffee-table': buildTableOrDesk,
  'side-table': buildTableOrDesk,
  desk: buildTableOrDesk,
  workstation: buildWorkstation,
  'meeting-table': buildMeetingTable,
  'reception-desk': buildReceptionDesk,
  'office-chair': buildOfficeChair,
  'conference-chair': buildConferenceChair,
  'filing-cabinet': buildFilingCabinet,
  printer: buildPrinter,
  whiteboard: buildWhiteboard,
  partition: buildPartition,
  'ceiling-panel-light': buildCeilingPanelLight,
  'storage-locker': buildStorageLocker,
  'coffee-machine': buildCoffeeMachine,
  'water-cooler': buildWaterCooler,
  'coat-rack': buildCoatRack,
  'trash-bin': buildTrashBin,
  'acoustic-panel': buildAcousticPanel,
  'rtls-gateway': buildRtlsGateway,
  'rtls-beacon': buildRtlsBeacon,
  bookshelf: buildBookshelf,
  cabinet: buildCabinet,
  wardrobe: buildCabinet,
  dresser: buildDresser,
  lamp: buildLamp,
  'floor-lamp': buildLamp,
  plant: buildPlant,
  flowerpot: buildFlowerpot,
  tree: buildTree,
  tv: buildTV,
  computer: buildComputer,
  nightstand: buildNightstand,
  wifi: buildWiFi,
  router: buildRouter,
  cctv: buildCCTV,
  'security-camera': buildSecurityCamera,
  fridge: buildFridge,
  stove: buildStove,
  dishwasher: buildCabinet,
  'kitchen-sink': buildSink,
  'bathroom-sink': buildSink,
  counter: buildCounter,
  toilet: buildToilet,
  bathtub: buildBathtub,
  shower: buildShower,
  rug: buildRug,
  painting: buildPainting,
  vase: buildVase,
  mirror: buildMirror,
  curtains: buildCurtains,
  'pendant-light': buildPendantLight,
  'wall-shelf': buildWallShelf,
  'wall-clock': buildWallClock,
  candles: buildCandles,
  books: buildBooksStack,
  fence: buildFence,
  pool: buildPool,
  'pine-tree': buildPineTree,
  bush: buildBush,
  hedge: buildHedge,
  flowerbed: buildFlowerBed,
  tulips: buildTulips,
  sunflower: buildSunflower,
  'rose-bush': buildRoseBush,
  bbq: buildBbq,
  mailbox: buildMailbox,
  birdbath: buildBirdbath,
  lamppost: buildLamppost,
  'stepping-stone': buildSteppingStone,
  'garden-bench': buildGardenBench,
  'picnic-table': buildPicnicTable,
  pond: buildPond,
  person: buildPerson,
  pet: buildPet,
  stairs: buildStairs,
  door: buildDoor,
  window: buildWindow,
};

function buildEmpty({ THREE }: BuilderContext): ReturnType<FurnitureBuilder> {
  return new THREE.Group();
}

function buildCustomGlbPlaceholder({ THREE, item, hasCollision }: BuilderContext): ReturnType<FurnitureBuilder> {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(item.width, item.height, item.depth);
  const material = new THREE.MeshStandardMaterial({
    color: hasCollision ? 0xff5555 : 0x58d7d0,
    transparent: true,
    opacity: 0.18,
    roughness: 0.8,
    metalness: 0.05,
  });
  const box = new THREE.Mesh(geometry, material);
  box.position.y = item.height / 2;
  group.add(box);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: hasCollision ? 0xff7777 : 0x78fff6, transparent: true, opacity: 0.8 })
  );
  edges.position.copy(box.position);
  group.add(edges);
  return group;
}


export function createFurnitureModel(
  THREE: ThreeModule,
  item: FurnitureItem,
  hasCollision: boolean
): ReturnType<FurnitureBuilder> {
  const ctx: BuilderContext = {
    THREE,
    item,
    hasCollision,
    baseColor: hasCollision ? 0xff0000 : item.color,
    opacity: hasCollision ? 0.7 : 1.0,
  };
  // Prefer a real GLTF asset when the item explicitly requests one. All
  // office/RTLS primitives remain available as detailed procedural models so
  // the editor never renders an empty placeholder while an asset is missing.
  const builder: FurnitureBuilder = item.type === 'custom-glb'
    ? buildCustomGlbPlaceholder
    : item.type.startsWith('gltf-') || item.type === 'office-avatar'
      ? buildEmpty
      : (BUILDERS[item.type] ?? buildEmpty);
  return builder(ctx);
}
