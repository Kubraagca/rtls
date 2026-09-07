'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFurnitureModel } from '../three/furniture-builders';
import type { CatalogItem } from '../lib/types';
import { setCatalogThumbnail } from '../lib/catalog-thumbnail-cache';

const MODEL_PATHS: Record<string, string> = {
  'gltf-chair': '/models/gltf-sample-assets/ChairDamaskPurplegold.glb',
  'gltf-sofa': '/models/gltf-sample-assets/GlamVelvetSofa.glb',
  'gltf-plant': '/models/gltf-sample-assets/DiffuseTransmissionPlant.glb',
  'gltf-vase': '/models/gltf-sample-assets/GlassVaseFlowers.glb',
  'gltf-lamp': '/models/gltf-sample-assets/AnisotropyBarnLamp.glb',
  'gltf-fridge': '/models/gltf-sample-assets/CommercialRefrigerator.glb',
};
let sharedRenderer: THREE.WebGLRenderer | null = null;

function FallbackPreview({ item, size }: { item: CatalogItem; size: number }): JSX.Element {
  return <svg aria-label={`${item.name} önizleme`} role="img" viewBox="0 0 76 58" width={size + 18} height={size + 8}>
    <ellipse cx="38" cy="53" rx="27" ry="3" fill="rgba(15,23,42,.18)" />
    <rect x="14" y="18" width="52" height="28" rx="5" fill={item.color || '#64748b'} />
    <path d="M20 18V9h40v9M25 46v6M55 46v6" stroke="#263241" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>;
}

export function CatalogThumbnail({ item, size = 34 }: { item: CatalogItem; size?: number }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (item.customThumbnail || !canvasRef.current) return undefined;
    setRendered(false);
    const canvas = canvasRef.current;
    canvas.width = size + 18;
    canvas.height = size + 8;
    if (!sharedRenderer) sharedRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    const renderer = sharedRenderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size + 18, size + 8, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, (size + 18) / (size + 8), 0.01, 100);
    camera.position.set(2.4, 1.7, 2.8);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(3, 5, 4);
    scene.add(key);
    let model: THREE.Object3D | null = null;
    let cancelled = false;

    const fitAndRender = (source: THREE.Object3D) => {
      if (cancelled) return;
      model = source;
      const bounds = new THREE.Box3().setFromObject(model);
      const dimensions = bounds.getSize(new THREE.Vector3());
      const longest = Math.max(dimensions.x, dimensions.y, dimensions.z, 0.01);
      model.scale.setScalar(1.35 / longest);
      const fitted = new THREE.Box3().setFromObject(model);
      const center = fitted.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.position.y += fitted.getSize(new THREE.Vector3()).y / 2;
      scene.add(model);
      camera.lookAt(0, 0.35, 0);
      renderer.render(scene, camera);
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
        setCatalogThumbnail(item.type, canvas.toDataURL('image/png'));
        setRendered(true);
      }
    };

    const path = MODEL_PATHS[item.type];
    if (path) {
      new GLTFLoader().load(path, (gltf) => fitAndRender(gltf.scene.clone(true)), undefined, () => undefined);
    } else {
      fitAndRender(createFurnitureModel(THREE, {
        ...item,
        id: 'catalog-thumbnail',
        position: { x: 0, z: 0 },
        rotation: 0,
      }, false));
    }
    return () => {
      cancelled = true;
      if (model) scene.remove(model);
    };
  }, [item, size]);

  if (item.customThumbnail) {
    setCatalogThumbnail(item.type, item.customThumbnail);
    return <img src={item.customThumbnail} alt={`${item.name} önizleme`} style={{ width: size + 18, height: size + 8, maxWidth: '100%', objectFit: 'contain' }} />;
  }
  return <span style={{ position: 'relative', display: 'inline-block', width: size + 18, height: size + 8 }}>
    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: rendered ? 0 : 1 }}><FallbackPreview item={item} size={size} /></span>
    <canvas ref={canvasRef} aria-label={`${item.name} gerçek model önizleme`} style={{ position: 'relative', display: 'block', width: size + 18, height: size + 8, opacity: rendered ? 1 : 0 }} />
  </span>;
}
