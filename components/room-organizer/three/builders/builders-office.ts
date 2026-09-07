import { type BuilderContext, material, mesh } from '../builder-utils';
import type * as ThreeNS from 'three';

function standardMat(
  THREE: typeof import('three'),
  color: ThreeNS.ColorRepresentation,
  hasCollision: boolean,
  opacity: number,
  extra: Omit<ThreeNS.MeshStandardMaterialParameters, 'color' | 'transparent' | 'opacity'> = {}
): ThreeNS.MeshStandardMaterial {
  return material(THREE, color, hasCollision, opacity, extra);
}

function addDeskMonitor(
  THREE: typeof import('three'),
  group: ThreeNS.Group,
  item: BuilderContext['item'],
  hasCollision: boolean,
  opacity: number
): void {
  const dark = standardMat(THREE, 0x1c232b, hasCollision, opacity, { roughness: 0.28, metalness: 0.45 });
  const screenMat = standardMat(THREE, 0x172c3a, hasCollision, opacity, {
    roughness: 0.12,
    metalness: 0.35,
    emissive: 0x0b6f96,
    emissiveIntensity: 0.28,
  });
  const screen = mesh(
    THREE,
    new THREE.BoxGeometry(item.width * 0.34, item.height * 0.34, 0.035),
    dark
  );
  screen.position.set(0, item.height * 1.23, -item.depth * 0.14);
  group.add(screen);

  const display = mesh(
    THREE,
    new THREE.BoxGeometry(item.width * 0.305, item.height * 0.27, 0.008),
    screenMat
  );
  display.position.set(0, item.height * 1.23, -item.depth * 0.118);
  group.add(display);

  const stem = mesh(THREE, new THREE.CylinderGeometry(0.018, 0.022, item.height * 0.28, 12), dark);
  stem.position.set(0, item.height * 1.0, -item.depth * 0.14);
  group.add(stem);

  const base = mesh(THREE, new THREE.BoxGeometry(item.width * 0.18, 0.025, item.depth * 0.16), dark);
  base.position.set(0, item.height * 0.98, -item.depth * 0.11);
  group.add(base);

  const keyboard = mesh(
    THREE,
    new THREE.BoxGeometry(item.width * 0.34, 0.018, item.depth * 0.22),
    standardMat(THREE, 0x303841, hasCollision, opacity, { roughness: 0.45, metalness: 0.2 })
  );
  keyboard.position.set(0, item.height * 1.01, item.depth * 0.16);
  keyboard.rotation.x = -0.03;
  group.add(keyboard);
}

export function buildWorkstation({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const wood = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.48, metalness: 0.03 });
  const edge = standardMat(THREE, 0x312a25, hasCollision, opacity, { roughness: 0.55, metalness: 0.08 });
  const metal = standardMat(THREE, 0x29313a, hasCollision, opacity, { roughness: 0.32, metalness: 0.72 });

  const top = mesh(THREE, new THREE.BoxGeometry(item.width, 0.055, item.depth), wood);
  top.position.y = item.height - 0.035;
  group.add(top);

  const frontEdge = mesh(THREE, new THREE.BoxGeometry(item.width, 0.035, 0.025), edge);
  frontEdge.position.set(0, item.height - 0.045, item.depth / 2 + 0.006);
  group.add(frontEdge);

  const legH = item.height - 0.085;
  const legGeo = new THREE.BoxGeometry(0.055, legH, 0.055);
  for (const x of [-item.width * 0.43, item.width * 0.43]) {
    for (const z of [-item.depth * 0.36, item.depth * 0.36]) {
      const leg = mesh(THREE, legGeo, metal);
      leg.position.set(x, legH / 2, z);
      group.add(leg);
    }
  }

  const crossbar = mesh(THREE, new THREE.BoxGeometry(item.width * 0.76, 0.035, 0.035), metal);
  crossbar.position.set(0, item.height * 0.38, -item.depth * 0.36);
  group.add(crossbar);

  addDeskMonitor(THREE, group, item, hasCollision, opacity);
  return group;
}

export function buildMeetingTable({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const topMat = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.42, metalness: 0.04 });
  const metal = standardMat(THREE, 0x2d343b, hasCollision, opacity, { roughness: 0.3, metalness: 0.78 });

  const top = mesh(THREE, new THREE.BoxGeometry(item.width, 0.07, item.depth), topMat);
  top.position.y = item.height - 0.04;
  group.add(top);

  const baseGeo = new THREE.BoxGeometry(item.width * 0.12, item.height * 0.87, item.depth * 0.5);
  for (const x of [-item.width * 0.3, item.width * 0.3]) {
    const pedestal = mesh(THREE, baseGeo, metal);
    pedestal.position.set(x, item.height * 0.44, 0);
    group.add(pedestal);
  }

  const cableBox = mesh(
    THREE,
    new THREE.BoxGeometry(item.width * 0.18, 0.018, item.depth * 0.18),
    standardMat(THREE, 0x15191d, hasCollision, opacity, { roughness: 0.35, metalness: 0.65 })
  );
  cableBox.position.set(0, item.height + 0.012, 0);
  group.add(cableBox);
  return group;
}

function addOfficeChairBase(
  THREE: typeof import('three'),
  group: ThreeNS.Group,
  item: BuilderContext['item'],
  hasCollision: boolean,
  opacity: number
): void {
  const metal = standardMat(THREE, 0x232a31, hasCollision, opacity, { roughness: 0.32, metalness: 0.78 });
  const wheel = standardMat(THREE, 0x111417, hasCollision, opacity, { roughness: 0.72, metalness: 0.22 });

  const column = mesh(THREE, new THREE.CylinderGeometry(0.026, 0.032, item.height * 0.36, 14), metal);
  column.position.y = item.height * 0.25;
  group.add(column);

  const hub = mesh(THREE, new THREE.CylinderGeometry(0.055, 0.055, 0.045, 18), metal);
  hub.position.y = 0.075;
  group.add(hub);

  const armLength = item.width * 0.37;
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = mesh(THREE, new THREE.BoxGeometry(armLength, 0.028, 0.034), metal);
    arm.position.set(Math.cos(angle) * armLength * 0.46, 0.065, Math.sin(angle) * armLength * 0.46);
    arm.rotation.y = -angle;
    group.add(arm);

    const caster = mesh(THREE, new THREE.CylinderGeometry(0.025, 0.025, 0.025, 10), wheel);
    caster.rotation.z = Math.PI / 2;
    caster.position.set(Math.cos(angle) * armLength * 0.9, 0.035, Math.sin(angle) * armLength * 0.9);
    group.add(caster);
  }
}

export function buildOfficeChair({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const fabric = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.83, metalness: 0.04 });
  const dark = standardMat(THREE, 0x232a31, hasCollision, opacity, { roughness: 0.42, metalness: 0.5 });
  addOfficeChairBase(THREE, group, item, hasCollision, opacity);

  const seat = mesh(THREE, new THREE.BoxGeometry(item.width * 0.78, 0.11, item.depth * 0.68), fabric);
  seat.position.set(0, item.height * 0.43, item.depth * 0.03);
  seat.rotation.x = -0.04;
  group.add(seat);

  const back = mesh(THREE, new THREE.BoxGeometry(item.width * 0.7, item.height * 0.42, 0.09), fabric);
  back.position.set(0, item.height * 0.72, -item.depth * 0.29);
  back.rotation.x = -0.08;
  group.add(back);

  const backStem = mesh(THREE, new THREE.BoxGeometry(0.045, item.height * 0.34, 0.045), dark);
  backStem.position.set(0, item.height * 0.57, -item.depth * 0.29);
  group.add(backStem);

  const armPostGeo = new THREE.BoxGeometry(0.035, item.height * 0.2, 0.035);
  const armTopGeo = new THREE.BoxGeometry(item.width * 0.22, 0.035, item.depth * 0.28);
  for (const x of [-item.width * 0.36, item.width * 0.36]) {
    const post = mesh(THREE, armPostGeo, dark);
    post.position.set(x, item.height * 0.52, item.depth * 0.02);
    group.add(post);
    const arm = mesh(THREE, armTopGeo, dark);
    arm.position.set(x, item.height * 0.62, -item.depth * 0.02);
    group.add(arm);
  }
  return group;
}

export function buildConferenceChair({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const shell = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.72, metalness: 0.05 });
  const metal = standardMat(THREE, 0x343a40, hasCollision, opacity, { roughness: 0.28, metalness: 0.82 });

  const seat = mesh(THREE, new THREE.BoxGeometry(item.width * 0.86, 0.08, item.depth * 0.72), shell);
  seat.position.y = item.height * 0.48;
  group.add(seat);
  const back = mesh(THREE, new THREE.BoxGeometry(item.width * 0.82, item.height * 0.43, 0.065), shell);
  back.position.set(0, item.height * 0.72, -item.depth * 0.31);
  back.rotation.x = -0.06;
  group.add(back);

  const legGeo = new THREE.CylinderGeometry(0.018, 0.018, item.height * 0.46, 10);
  for (const x of [-item.width * 0.34, item.width * 0.34]) {
    for (const z of [-item.depth * 0.27, item.depth * 0.27]) {
      const leg = mesh(THREE, legGeo, metal);
      leg.position.set(x, item.height * 0.23, z);
      group.add(leg);
    }
  }
  return group;
}

export function buildReceptionDesk({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const shell = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.58, metalness: 0.06 });
  const accent = standardMat(THREE, 0x8a6a47, hasCollision, opacity, { roughness: 0.5, metalness: 0.02 });
  const dark = standardMat(THREE, 0x252c33, hasCollision, opacity, { roughness: 0.36, metalness: 0.65 });

  const body = mesh(THREE, new THREE.BoxGeometry(item.width, item.height * 0.72, item.depth * 0.72), shell);
  body.position.set(0, item.height * 0.36, item.depth * 0.08);
  group.add(body);

  const worktop = mesh(THREE, new THREE.BoxGeometry(item.width * 0.92, 0.055, item.depth * 0.72), accent);
  worktop.position.set(0, item.height * 0.72, item.depth * 0.02);
  group.add(worktop);

  const privacy = mesh(THREE, new THREE.BoxGeometry(item.width, item.height * 0.38, 0.08), shell);
  privacy.position.set(0, item.height * 0.88, item.depth * 0.34);
  group.add(privacy);

  const cap = mesh(THREE, new THREE.BoxGeometry(item.width * 1.03, 0.06, item.depth * 0.28), accent);
  cap.position.set(0, item.height * 1.08, item.depth * 0.32);
  group.add(cap);

  for (let i = -2; i <= 2; i += 1) {
    const inset = mesh(THREE, new THREE.BoxGeometry(item.width * 0.13, item.height * 0.46, 0.015), dark);
    inset.position.set(i * item.width * 0.17, item.height * 0.38, item.depth * 0.445);
    group.add(inset);
  }
  return group;
}

export function buildFilingCabinet({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const body = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.42, metalness: 0.48 });
  const trim = standardMat(THREE, 0x59636d, hasCollision, opacity, { roughness: 0.28, metalness: 0.72 });
  const shell = mesh(THREE, new THREE.BoxGeometry(item.width, item.height, item.depth), body);
  shell.position.y = item.height / 2;
  group.add(shell);

  const drawerCount = 4;
  for (let i = 0; i < drawerCount; i += 1) {
    const h = item.height / drawerCount;
    const front = mesh(THREE, new THREE.BoxGeometry(item.width * 0.9, h * 0.83, 0.025), body);
    front.position.set(0, h * (i + 0.5), item.depth / 2 + 0.014);
    group.add(front);
    const handle = mesh(THREE, new THREE.BoxGeometry(item.width * 0.24, 0.025, 0.028), trim);
    handle.position.set(0, h * (i + 0.5) + h * 0.18, item.depth / 2 + 0.038);
    group.add(handle);
  }
  return group;
}

export function buildPrinter({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const shell = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.48, metalness: 0.14 });
  const dark = standardMat(THREE, 0x20262c, hasCollision, opacity, { roughness: 0.36, metalness: 0.4 });
  const paperMat = standardMat(THREE, 0xf5f7f8, hasCollision, opacity, { roughness: 0.9, metalness: 0 });

  const lower = mesh(THREE, new THREE.BoxGeometry(item.width, item.height * 0.56, item.depth), shell);
  lower.position.y = item.height * 0.28;
  group.add(lower);
  const upper = mesh(THREE, new THREE.BoxGeometry(item.width * 0.9, item.height * 0.34, item.depth * 0.82), shell);
  upper.position.set(0, item.height * 0.68, -item.depth * 0.05);
  group.add(upper);

  const output = mesh(THREE, new THREE.BoxGeometry(item.width * 0.58, 0.025, item.depth * 0.32), dark);
  output.position.set(0, item.height * 0.47, item.depth * 0.42);
  output.rotation.x = -0.12;
  group.add(output);

  const paper = mesh(THREE, new THREE.BoxGeometry(item.width * 0.52, 0.01, item.depth * 0.3), paperMat);
  paper.position.set(0, item.height * 0.48, item.depth * 0.47);
  paper.rotation.x = -0.12;
  group.add(paper);

  const panel = mesh(THREE, new THREE.BoxGeometry(item.width * 0.26, 0.025, item.depth * 0.18), dark);
  panel.position.set(item.width * 0.25, item.height * 0.88, item.depth * 0.24);
  panel.rotation.x = -0.28;
  group.add(panel);
  return group;
}

export function buildWhiteboard({ THREE, item, hasCollision, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const frame = standardMat(THREE, 0x8f979f, hasCollision, opacity, { roughness: 0.25, metalness: 0.78 });
  const board = standardMat(THREE, 0xf4f7f7, hasCollision, opacity, { roughness: 0.22, metalness: 0.05 });
  const marker = standardMat(THREE, 0x263238, hasCollision, opacity, { roughness: 0.55, metalness: 0.12 });

  // Treat item.height as the board's panel height, then mount it at a realistic
  // standing-eye level instead of starting on the floor.
  const bottom = 0.86;
  const top = bottom + item.height;
  const panel = mesh(THREE, new THREE.BoxGeometry(item.width * 0.94, item.height * 0.9, item.depth * 0.45), board);
  panel.position.y = bottom + item.height * 0.5;
  group.add(panel);

  const t = Math.max(0.025, item.height * 0.025);
  const horiz = new THREE.BoxGeometry(item.width, t, item.depth);
  for (const y of [bottom, top]) {
    const bar = mesh(THREE, horiz, frame);
    bar.position.y = y;
    group.add(bar);
  }
  const vert = new THREE.BoxGeometry(t, item.height, item.depth);
  for (const x of [-item.width / 2 + t / 2, item.width / 2 - t / 2]) {
    const bar = mesh(THREE, vert, frame);
    bar.position.set(x, bottom + item.height * 0.5, 0);
    group.add(bar);
  }
  const tray = mesh(THREE, new THREE.BoxGeometry(item.width * 0.5, 0.025, item.depth * 2.2), frame);
  tray.position.set(0, bottom - 0.025, item.depth * 0.75);
  group.add(tray);
  const pen = mesh(THREE, new THREE.CylinderGeometry(0.012, 0.012, item.width * 0.25, 10), marker);
  pen.rotation.z = Math.PI / 2;
  pen.position.set(0, bottom + 0.01, item.depth * 1.05);
  group.add(pen);
  return group;
}

export function buildPartition({ THREE, item, hasCollision, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const frame = standardMat(THREE, 0x333c44, hasCollision, opacity, { roughness: 0.26, metalness: 0.82 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: hasCollision ? 0xff6b6b : 0xbdd8e4,
    roughness: 0.12,
    metalness: 0.02,
    transparent: true,
    opacity: hasCollision ? 0.38 : 0.3,
    transmission: hasCollision ? 0 : 0.42,
    thickness: 0.035,
    ior: 1.45,
    side: THREE.DoubleSide,
  });

  const panel = mesh(THREE, new THREE.BoxGeometry(item.width * 0.94, item.height * 0.9, item.depth * 0.35), glass);
  panel.position.y = item.height * 0.52;
  group.add(panel);

  const t = 0.035;
  const sideGeo = new THREE.BoxGeometry(t, item.height, item.depth);
  for (const x of [-item.width / 2 + t / 2, item.width / 2 - t / 2]) {
    const side = mesh(THREE, sideGeo, frame);
    side.position.set(x, item.height / 2, 0);
    group.add(side);
  }
  const railGeo = new THREE.BoxGeometry(item.width, t, item.depth);
  for (const y of [t / 2, item.height - t / 2]) {
    const rail = mesh(THREE, railGeo, frame);
    rail.position.y = y;
    group.add(rail);
  }
  return group;
}

export function buildCeilingPanelLight({ THREE, item, hasCollision, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const lightOn = item.lightOn !== false;
  const rim = standardMat(THREE, 0xdde2e5, hasCollision, opacity, { roughness: 0.3, metalness: 0.42 });
  const diffuser = standardMat(THREE, 0xfff7df, hasCollision, opacity, {
    roughness: 0.2,
    metalness: 0,
    emissive: 0xffe8b7,
    emissiveIntensity: lightOn ? 1.9 : 0.04,
  });
  const y = Math.max(2.55, Math.min(2.92, item.height));
  const frame = mesh(THREE, new THREE.BoxGeometry(item.width, 0.055, item.depth), rim);
  frame.position.y = y;
  group.add(frame);
  const lightPanel = mesh(THREE, new THREE.BoxGeometry(item.width * 0.9, 0.018, item.depth * 0.82), diffuser);
  lightPanel.position.y = y - 0.035;
  group.add(lightPanel);

  if (!hasCollision) {
    const light = new THREE.PointLight(0xfff2d6, lightOn ? 0.7 : 0, 5.5, 2);
    light.position.set(0, y - 0.25, 0);
    light.castShadow = false;
    group.add(light);
  }
  return group;
}

export function buildRtlsGateway({ THREE, item, hasCollision, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const shell = standardMat(THREE, 0xf2f4f5, hasCollision, opacity, { roughness: 0.35, metalness: 0.18 });
  const dark = standardMat(THREE, 0x2d343b, hasCollision, opacity, { roughness: 0.38, metalness: 0.48 });
  const led = standardMat(THREE, 0x2ee59d, hasCollision, opacity, { emissive: 0x2ee59d, emissiveIntensity: 1.2 });
  const y = Math.max(2.2, Math.min(2.75, item.height));

  const body = mesh(THREE, new THREE.BoxGeometry(item.width, 0.09, item.depth), shell);
  body.position.y = y;
  group.add(body);
  const underside = mesh(THREE, new THREE.BoxGeometry(item.width * 0.8, 0.025, item.depth * 0.78), dark);
  underside.position.y = y - 0.058;
  group.add(underside);
  const status = mesh(THREE, new THREE.SphereGeometry(0.018, 12, 10), led);
  status.position.set(item.width * 0.28, y - 0.075, item.depth * 0.28);
  group.add(status);
  return group;
}


export function buildStorageLocker({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const body = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.48, metalness: 0.62 });
  const trim = standardMat(THREE, 0x6b7782, hasCollision, opacity, { roughness: 0.32, metalness: 0.72 });
  const shell = mesh(THREE, new THREE.BoxGeometry(item.width, item.height, item.depth), body);
  shell.position.y = item.height / 2;
  group.add(shell);

  const doorCount = Math.max(2, Math.round(item.width / 0.45));
  const doorWidth = item.width * 0.92 / doorCount;
  for (let i = 0; i < doorCount; i += 1) {
    const x = -item.width * 0.46 + doorWidth * 0.5 + i * doorWidth;
    const door = mesh(THREE, new THREE.BoxGeometry(doorWidth * 0.92, item.height * 0.92, 0.022), body);
    door.position.set(x, item.height / 2, item.depth / 2 + 0.012);
    group.add(door);

    const handle = mesh(THREE, new THREE.BoxGeometry(0.018, item.height * 0.18, 0.02), trim);
    handle.position.set(x + doorWidth * 0.26, item.height * 0.54, item.depth / 2 + 0.028);
    group.add(handle);

    for (const y of [item.height * 0.24, item.height * 0.74]) {
      const vent = mesh(THREE, new THREE.BoxGeometry(doorWidth * 0.55, 0.012, 0.01), trim);
      vent.position.set(x, y, item.depth / 2 + 0.024);
      group.add(vent);
    }
  }
  return group;
}

export function buildCoffeeMachine({ THREE, item, hasCollision, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const dark = standardMat(THREE, 0x22282e, hasCollision, opacity, { roughness: 0.34, metalness: 0.46 });
  const metal = standardMat(THREE, 0xd4d8dc, hasCollision, opacity, { roughness: 0.22, metalness: 0.76 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: hasCollision ? 0xff6b6b : 0x462f1b,
    roughness: 0.08,
    metalness: 0.02,
    transparent: true,
    opacity: hasCollision ? 0.65 : Math.min(opacity, 0.78),
    transmission: hasCollision ? 0 : 0.18,
    thickness: 0.03,
  });
  const accent = standardMat(THREE, 0x33d17a, hasCollision, opacity, { emissive: 0x33d17a, emissiveIntensity: 0.6 });

  const body = mesh(THREE, new THREE.BoxGeometry(item.width, item.height * 0.95, item.depth), dark);
  body.position.y = item.height * 0.475;
  group.add(body);
  const top = mesh(THREE, new THREE.BoxGeometry(item.width * 0.92, 0.022, item.depth * 0.84), metal);
  top.position.y = item.height * 0.97;
  group.add(top);
  const panel = mesh(THREE, new THREE.BoxGeometry(item.width * 0.48, item.height * 0.18, 0.015), metal);
  panel.position.set(0, item.height * 0.72, item.depth / 2 + 0.012);
  group.add(panel);
  const led = mesh(THREE, new THREE.BoxGeometry(item.width * 0.16, 0.022, 0.012), accent);
  led.position.set(0, item.height * 0.73, item.depth / 2 + 0.021);
  group.add(led);
  const cup = mesh(THREE, new THREE.CylinderGeometry(item.width * 0.11, item.width * 0.095, item.height * 0.24, 14), glass);
  cup.position.set(0, item.height * 0.18, item.depth * 0.03);
  group.add(cup);
  const spout = mesh(THREE, new THREE.CylinderGeometry(0.012, 0.012, item.depth * 0.3, 10), metal);
  spout.rotation.x = Math.PI / 2;
  spout.position.set(0, item.height * 0.48, item.depth * 0.13);
  group.add(spout);
  return group;
}

export function buildWaterCooler({ THREE, item, hasCollision, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const shell = standardMat(THREE, 0xe8edf0, hasCollision, opacity, { roughness: 0.38, metalness: 0.16 });
  const dark = standardMat(THREE, 0x2d343b, hasCollision, opacity, { roughness: 0.32, metalness: 0.52 });
  const water = new THREE.MeshPhysicalMaterial({
    color: hasCollision ? 0xff6b6b : 0x87c8f8,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: hasCollision ? 0.55 : Math.min(opacity, 0.58),
    transmission: hasCollision ? 0 : 0.72,
    thickness: 0.08,
    ior: 1.33,
  });
  const body = mesh(THREE, new THREE.BoxGeometry(item.width * 0.86, item.height * 0.68, item.depth * 0.82), shell);
  body.position.y = item.height * 0.34;
  group.add(body);
  const alcove = mesh(THREE, new THREE.BoxGeometry(item.width * 0.42, item.height * 0.22, item.depth * 0.18), dark);
  alcove.position.set(0, item.height * 0.36, item.depth * 0.18);
  group.add(alcove);
  const bottle = mesh(THREE, new THREE.CylinderGeometry(item.width * 0.22, item.width * 0.18, item.height * 0.34, 18), water);
  bottle.position.y = item.height * 0.77;
  group.add(bottle);
  const dispenser = mesh(THREE, new THREE.BoxGeometry(item.width * 0.48, 0.05, item.depth * 0.32), shell);
  dispenser.position.set(0, item.height * 0.56, 0);
  group.add(dispenser);
  for (const [x, color] of [[-0.05, 0x4aa3ff], [0.05, 0xff5a5a]] as const) {
    const tap = mesh(THREE, new THREE.BoxGeometry(0.03, 0.03, 0.07), standardMat(THREE, color, hasCollision, opacity, { roughness: 0.26, metalness: 0.16 }));
    tap.position.set(x, item.height * 0.5, item.depth * 0.28);
    group.add(tap);
  }
  return group;
}

export function buildCoatRack({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const wood = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.58, metalness: 0.04 });
  const metal = standardMat(THREE, 0x4a525a, hasCollision, opacity, { roughness: 0.28, metalness: 0.76 });

  const pole = mesh(THREE, new THREE.CylinderGeometry(0.03, 0.035, item.height * 0.88, 14), wood);
  pole.position.y = item.height * 0.44;
  group.add(pole);
  const hub = mesh(THREE, new THREE.SphereGeometry(0.04, 12, 10), wood);
  hub.position.y = item.height * 0.84;
  group.add(hub);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const hook = mesh(THREE, new THREE.CylinderGeometry(0.012, 0.012, item.width * 0.46, 10), metal);
    hook.rotation.z = Math.PI / 2;
    hook.rotation.y = angle;
    hook.position.set(Math.cos(angle) * item.width * 0.17, item.height * 0.84, Math.sin(angle) * item.width * 0.17);
    group.add(hook);
  }
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = mesh(THREE, new THREE.BoxGeometry(item.width * 0.38, 0.028, 0.04), wood);
    foot.position.set(Math.cos(angle) * item.width * 0.12, 0.03, Math.sin(angle) * item.width * 0.12);
    foot.rotation.y = angle;
    group.add(foot);
  }
  return group;
}

export function buildTrashBin({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const shell = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.4, metalness: 0.54 });
  const liner = standardMat(THREE, 0x1f2328, hasCollision, opacity, { roughness: 0.72, metalness: 0.08 });
  const body = mesh(THREE, new THREE.CylinderGeometry(item.width * 0.48, item.width * 0.42, item.height * 0.92, 18), shell);
  body.position.y = item.height * 0.46;
  group.add(body);
  const rim = mesh(THREE, new THREE.TorusGeometry(item.width * 0.48, 0.02, 8, 24), shell);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = item.height * 0.93;
  group.add(rim);
  const inner = mesh(THREE, new THREE.CylinderGeometry(item.width * 0.38, item.width * 0.34, item.height * 0.72, 16), liner);
  inner.position.y = item.height * 0.48;
  group.add(inner);
  return group;
}

export function buildAcousticPanel({ THREE, item, hasCollision, baseColor, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const fabric = standardMat(THREE, baseColor, hasCollision, opacity, { roughness: 0.92, metalness: 0.01 });
  const frame = standardMat(THREE, 0x434b53, hasCollision, opacity, { roughness: 0.38, metalness: 0.28 });
  const bottom = 1.1;
  const panel = mesh(THREE, new THREE.BoxGeometry(item.width * 0.96, item.height * 0.9, item.depth * 0.8), fabric);
  panel.position.y = bottom + item.height * 0.45;
  group.add(panel);
  const railTop = mesh(THREE, new THREE.BoxGeometry(item.width, 0.025, item.depth), frame);
  railTop.position.y = bottom + item.height * 0.92;
  group.add(railTop);
  const railBottom = mesh(THREE, new THREE.BoxGeometry(item.width, 0.025, item.depth), frame);
  railBottom.position.y = bottom - 0.01;
  group.add(railBottom);
  return group;
}

export function buildRtlsBeacon({ THREE, item, hasCollision, opacity }: BuilderContext): ThreeNS.Group {
  const group = new THREE.Group();
  const shell = standardMat(THREE, 0xf3f6f7, hasCollision, opacity, { roughness: 0.34, metalness: 0.18 });
  const ring = standardMat(THREE, 0x39434b, hasCollision, opacity, { roughness: 0.28, metalness: 0.58 });
  const led = standardMat(THREE, 0x55e0d4, hasCollision, opacity, { emissive: 0x1a8e87, emissiveIntensity: 1.25, roughness: 0.18 });
  const y = Math.max(2.2, Math.min(2.78, item.height));

  const puck = mesh(THREE, new THREE.CylinderGeometry(item.width * 0.48, item.width * 0.48, 0.075, 28), shell);
  puck.position.y = y;
  group.add(puck);

  const trim = mesh(THREE, new THREE.TorusGeometry(item.width * 0.37, 0.014, 10, 28), ring);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = y - 0.043;
  group.add(trim);

  const status = mesh(THREE, new THREE.SphereGeometry(0.018, 12, 10), led);
  status.position.set(item.width * 0.23, y - 0.048, item.depth * 0.12);
  group.add(status);
  return group;
}
