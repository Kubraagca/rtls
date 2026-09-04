import { useEffect } from 'react';
import { disposeObject } from '../three/builder-utils';
import {
  OFFICE_DIGITAL_TWIN_AREAS,
  OFFICE_DIGITAL_TWIN_HEAT_SPOTS,
  OFFICE_DIGITAL_TWIN_PATHS,
  type DigitalTwinLayerState,
} from '../lib/digital-twin-layers';
import type * as ThreeNS from 'three';

const OVERLAY_TAG = 'digital-twin-live-overlay';

type ThreeModule = typeof import('three');

export interface UseDigitalTwinOverlaysOptions {
  enabled: boolean;
  layers: DigitalTwinLayerState;
  threeModuleRef: React.MutableRefObject<ThreeModule | null>;
  sceneRef: React.MutableRefObject<ThreeNS.Scene | null>;
  floorY: number;
  invalidate?: () => void;
}

export function useDigitalTwinOverlays({
  enabled,
  layers,
  threeModuleRef,
  sceneRef,
  floorY,
  invalidate,
}: UseDigitalTwinOverlaysOptions): void {
  useEffect(() => {
    const THREE = threeModuleRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return undefined;

    clearOverlays(scene);
    invalidate?.();
    if (!enabled) return undefined;

    const root = new THREE.Group();
    root.userData.type = OVERLAY_TAG;
    root.renderOrder = 800;
    scene.add(root);

    if (layers.areas) addAreas(THREE, root, floorY, layers.labels);
    if (layers.paths) addPaths(THREE, root, floorY);
    if (layers.heatmap) addHeatmap(THREE, root, floorY);
    invalidate?.();

    return () => {
      if (root.parent) root.parent.remove(root);
      disposeObject(root);
      invalidate?.();
    };
  }, [enabled, layers.areas, layers.paths, layers.heatmap, layers.labels, floorY, invalidate, threeModuleRef, sceneRef]);
}

function clearOverlays(scene: ThreeNS.Scene): void {
  for (const child of [...scene.children]) {
    if (child.userData.type !== OVERLAY_TAG) continue;
    scene.remove(child);
    disposeObject(child);
  }
}

function addAreas(THREE: ThreeModule, root: ThreeNS.Group, floorY: number, showLabels: boolean): void {
  for (const area of OFFICE_DIGITAL_TWIN_AREAS) {
    const fill = new THREE.MeshBasicMaterial({
      color: area.color,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(area.width, area.depth), fill);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(area.x, floorY + 0.028, area.z);
    plane.renderOrder = 805;
    root.add(plane);

    const shape = new THREE.Shape();
    shape.moveTo(-area.width / 2, -area.depth / 2);
    shape.lineTo(area.width / 2, -area.depth / 2);
    shape.lineTo(area.width / 2, area.depth / 2);
    shape.lineTo(-area.width / 2, area.depth / 2);
    shape.lineTo(-area.width / 2, -area.depth / 2);
    const points = shape.getPoints();
    const vertices: number[] = [];
    for (const point of points) vertices.push(point.x + area.x, floorY + 0.042, point.y + area.z);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const border = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: area.color, transparent: true, opacity: 0.86, depthWrite: false, toneMapped: false })
    );
    border.renderOrder = 810;
    root.add(border);

    if (showLabels) {
      const sprite = makeTextSprite(THREE, area.label, area.color);
      sprite.position.set(area.x, floorY + 0.12, area.z - area.depth * 0.36);
      root.add(sprite);
    }
  }
}

function addPaths(THREE: ThreeModule, root: ThreeNS.Group, floorY: number): void {
  const pathMaterial = new THREE.MeshBasicMaterial({
    color: 0x4dd9d3,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    toneMapped: false,
  });
  for (const route of OFFICE_DIGITAL_TWIN_PATHS) {
    if (route.points.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(
      route.points.map((point) => new THREE.Vector3(point.x, floorY + 0.058, point.z)),
      false,
      'catmullrom',
      0.15
    );
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.035, 8, false), pathMaterial.clone());
    tube.renderOrder = 820;
    root.add(tube);

    // Small direction markers make the route readable without relying on line width.
    for (const t of [0.28, 0.58, 0.82]) {
      const p = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.10, 0.23, 3),
        new THREE.MeshBasicMaterial({ color: 0x9af5ef, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })
      );
      marker.position.copy(p);
      marker.position.y += 0.025;
      marker.rotation.x = Math.PI / 2;
      marker.rotation.z = -Math.atan2(tangent.z, tangent.x) - Math.PI / 2;
      marker.renderOrder = 825;
      root.add(marker);
    }
  }
}

function addHeatmap(THREE: ThreeModule, root: ThreeNS.Group, floorY: number): void {
  for (const spot of OFFICE_DIGITAL_TWIN_HEAT_SPOTS) {
    const texture = createHeatTexture(THREE, spot.intensity);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(spot.radius * 2, spot.radius * 2), material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(spot.x, floorY + 0.052, spot.z);
    plane.renderOrder = 815;
    root.add(plane);
  }
}

function createHeatTexture(THREE: ThreeModule, intensity: number): ThreeNS.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
    const alpha = Math.max(0.3, Math.min(1, intensity));
    gradient.addColorStop(0, `rgba(255, 58, 48, ${0.82 * alpha})`);
    gradient.addColorStop(0.28, `rgba(255, 171, 51, ${0.62 * alpha})`);
    gradient.addColorStop(0.58, `rgba(255, 232, 90, ${0.34 * alpha})`);
    gradient.addColorStop(0.82, `rgba(78, 218, 163, ${0.14 * alpha})`);
    gradient.addColorStop(1, 'rgba(78, 218, 163, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeTextSprite(THREE: ThreeModule, text: string, accent: string): ThreeNS.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 112);
    ctx.fillStyle = 'rgba(22, 27, 31, 0.86)';
    ctx.beginPath();
    ctx.roundRect(8, 10, 496, 92, 22);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#f7fafb';
    ctx.font = '700 31px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 56);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.9, 0.42, 1);
  sprite.renderOrder = 900;
  return sprite;
}
