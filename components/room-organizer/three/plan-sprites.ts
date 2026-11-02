import type { FurnitureItem } from '../lib/types';
import type * as Three from 'three';

export interface PlanSprite {
  canvas: HTMLCanvasElement;
  /** Small angled render used by the 2D-plan hover card. */
  isometricCanvas: HTMLCanvasElement;
  x: number;
  z: number;
  width: number;
  depth: number;
}

const sprites = new Map<string, PlanSprite>();
const pending = new Map<string, () => void>();
const listeners = new Set<() => void>();
let scheduled = false;

/** Remove transparent camera margin so hover previews focus on the furniture. */
function cropTransparentMargin(canvas: HTMLCanvasElement, padding = 24): HTMLCanvasElement {
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if ((pixels.data[(y * canvas.width + x) * 4 + 3] ?? 0) < 8) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || (minX === 0 && minY === 0 && maxX === canvas.width - 1 && maxY === canvas.height - 1)) return canvas;
  minX = Math.max(0, minX - padding); minY = Math.max(0, minY - padding);
  maxX = Math.min(canvas.width - 1, maxX + padding); maxY = Math.min(canvas.height - 1, maxY + padding);
  const cropped = document.createElement('canvas');
  cropped.width = maxX - minX + 1;
  cropped.height = maxY - minY + 1;
  cropped.getContext('2d')?.drawImage(canvas, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped;
}

export function planSpriteKey(item: FurnitureItem): string {
  return JSON.stringify([item.type, item.width, item.depth, item.height, item.color,
    item.customModelId, item.customModelUrl, item.sofaShape, item.curtainsOpen,
    item.lightOn, item.stairsDirection, item.cctvModelId, item.cameraBracket, item.avatarPose]);
}

export function getPlanSprite(item: FurnitureItem): PlanSprite | undefined {
  const key = planSpriteKey(item);
  const sprite = sprites.get(key);
  if (sprite) { sprites.delete(key); sprites.set(key, sprite); }
  return sprite;
}

export function onPlanSpritesReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Bake one model per frame using the existing WebGL context. No continuous 2D rendering. */
export function queuePlanSprite(
  THREE: typeof Three, renderer: Three.WebGLRenderer, item: FurnitureItem,
  source: Three.Object3D, replace = false,
): void {
  const key = planSpriteKey(item);
  if (replace) sprites.delete(key);
  if (sprites.has(key)) return;
  pending.set(key, () => {
    if (!source.parent || renderer.getContext().isContextLost()) return;
    const model = source.clone(true);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.visible = true;
    model.traverse(node => {
      if (node.userData.type === 'selection-outline' || (node as Three.Light).isLight) node.visible = false;
    });
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) return;
    const width = Math.max(0.05, bounds.max.x - bounds.min.x) * 1.08;
    const depth = Math.max(0.05, bounds.max.z - bounds.min.z) * 1.08;
    const x = (bounds.min.x + bounds.max.x) / 2;
    const z = (bounds.min.z + bounds.max.z) / 2;
    const scene = new THREE.Scene();
    scene.add(model, new THREE.HemisphereLight(0xffffff, 0x87919a, 2));
    const light = new THREE.DirectionalLight(0xfff5e9, 2.5);
    light.position.set(-3, 8, 4);
    scene.add(light);
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0.01, 1000);
    camera.position.set(x, bounds.max.y + 10, z);
    camera.up.set(0, 0, -1);
    camera.lookAt(x, 0, z);
    // Render at a larger offscreen resolution so the hover card stays sharp
    // on high-DPI displays and when the preview is scaled up.
    const size = 384;
    const target = new THREE.WebGLRenderTarget(size, size);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const previousTarget = renderer.getRenderTarget();
    const previousClear = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousShadowUpdate = renderer.shadowMap.needsUpdate;
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.shadowMap.needsUpdate = false;
      renderer.render(scene, camera);
      const pixels = new Uint8Array(size * size * 4);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      const toCanvas = (): HTMLCanvasElement | null => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const image = ctx.createImageData(size, size);
        for (let row = 0; row < size; row++) {
          image.data.set(pixels.subarray(row * size * 4, (row + 1) * size * 4), (size - row - 1) * size * 4);
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
      };
      const canvas = toCanvas();
      if (!canvas) return;

      // Render a second still from an angled camera. It shares the same model
      // and WebGL target, so opening a 2D hover card costs no extra renderer.
      const height = Math.max(0.05, bounds.max.y - bounds.min.y);
      const centreY = (bounds.min.y + bounds.max.y) / 2;
      // The previous distance made the model occupy only a small part of its
      // 192 px card. This target distance fits an angled model tightly while
      // keeping enough room for its full height.
      // Perspective framing needs considerably more room for tall avatars;
      // the old distance was sized for low furniture and clipped their heads.
      const distance = Math.max(width, depth, height) * 2.35;
      const isometricCamera = new THREE.PerspectiveCamera(34, 1, 0.01, 1000);
      isometricCamera.position.set(x + distance, centreY + distance * 0.8, z + distance);
      isometricCamera.lookAt(x, centreY, z);
      renderer.render(scene, isometricCamera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      const isometric = toCanvas();
      const isometricCanvas = isometric && cropTransparentMargin(isometric);
      if (!isometricCanvas) return;
      sprites.set(key, { canvas, isometricCanvas, x, z, width, depth });
      if (sprites.size > 512) sprites.delete(sprites.keys().next().value!);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClear, previousAlpha);
      renderer.autoClear = previousAutoClear;
      renderer.shadowMap.needsUpdate = previousShadowUpdate;
      target.dispose();
      // The clone shares geometry/materials with the live scene: never dispose them.
      scene.clear();
    }
  });
  if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
}

function flush(): void {
  const entry = pending.entries().next().value;
  if (entry) {
    pending.delete(entry[0]);
    try { entry[1](); } catch (error) { console.warn('Plan preview unavailable', error); }
    for (const listener of listeners) listener();
  }
  scheduled = pending.size > 0;
  if (scheduled) requestAnimationFrame(flush);
}
