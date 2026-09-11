import { useEffect, useRef } from 'react';
import type * as ThreeNS from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PointerLockControls as PointerLockControlsType } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { FurnitureItem } from '../lib/types';
import { prepareFirstPersonBody } from '../three/first-person-body';
import { cloneAndFitOfficeAvatar, loadOfficeSittingAvatar, loadFemaleOfficeSittingAvatar } from '../three/office-avatar';
import { disposeObject } from '../three/builder-utils';

type ThreeModule = typeof import('three');

export interface UseWalkthroughOptions {
  enabled: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  threeModuleRef: React.MutableRefObject<ThreeModule | null>;
  cameraRef: React.MutableRefObject<ThreeNS.PerspectiveCamera | null>;
  orbitRef: React.MutableRefObject<OrbitControlsType | null>;
  sceneRef: React.MutableRefObject<ThreeNS.Scene | null>;
  eyeHeight?: number;
  walkSpeed?: number;
  /** Room footprint (metres) used to clamp the walker inside the walls. */
  roomWidth?: number;
  roomDepth?: number;
  /** Optional avatar position to use as the first-person starting point. */
  startPosition?: { x: number; z: number };
  avatarId?: string;
  startRotation?: number;
  onAvatarExit?: (id: string, position: { x: number; z: number }, rotation: number) => void;
  items?: readonly FurnitureItem[];
  floorY?: number;
  /** Request a render on the next animation frame (render-on-demand). */
  invalidate?: () => void;
  /**
   * Called when the user presses Escape a second time (while pointer lock is
   * already released) to leave walkthrough entirely (see #67). The first Esc is
   * browser-reserved and only exits pointer lock.
   */
  onExit?: () => void;
}

const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);

// Keep the walker a little inside the exterior walls so the camera never clips
// through them or steps off the floor plate. A full wall-segment collision test
// is out of scope — this footprint clamp is the minimal guard (see #67).
const WALL_MARGIN = 0.35;

/**
 * First-person walkthrough mode using PointerLockControls.
 *
 * When `enabled` flips on, this hook:
 *  - Disables the orbit controls.
 *  - Lazy-loads PointerLockControls and attaches them to the canvas.
 *  - Moves the camera to eye level and listens for WASD / arrow movement,
 *    with Shift for sprint.
 *  - Clamps the walker to the room footprint so it can't leave the plate.
 *  - On disable / unmount, restores orbit controls and the camera pose.
 *
 * `eyeHeight` (which tracks the active floor) is read live from a ref so a floor
 * switch mid-walk only re-seats the camera's height — it never tears the mode
 * down and drops pointer lock (see #67).
 */
export function useWalkthrough(options: UseWalkthroughOptions): void {
  const {
    enabled,
    canvasRef,
    threeModuleRef,
    cameraRef,
    orbitRef,
    sceneRef,
    eyeHeight = 1.6,
    walkSpeed = 3.0,
    roomWidth = Infinity,
    roomDepth = Infinity,
    startPosition,
    avatarId,
    startRotation = 0,
    onAvatarExit,
    items = [],
    floorY = 0,
    invalidate,
    onExit,
  } = options;

  // Live values the RAF loop / Esc handler read without re-running the init
  // effect (which would drop pointer lock). Updated every render.
  const eyeHeightRef = useRef(eyeHeight);
  const walkSpeedRef = useRef(walkSpeed);
  const roomWidthRef = useRef(roomWidth);
  const roomDepthRef = useRef(roomDepth);
  const invalidateRef = useRef(invalidate);
  const onExitRef = useRef(onExit);
  const onAvatarExitRef = useRef(onAvatarExit);
  onAvatarExitRef.current = onAvatarExit;
  eyeHeightRef.current = eyeHeight;
  walkSpeedRef.current = walkSpeed;
  roomWidthRef.current = roomWidth;
  roomDepthRef.current = roomDepth;
  invalidateRef.current = invalidate;
  onExitRef.current = onExit;

  // Re-seat the camera's height when the active floor (eyeHeight) changes while
  // walking, preserving x/z. Deliberately separate from the init effect so a
  // floor switch never re-inits and drops pointer lock (see #67).
  useEffect(() => {
    if (!enabled) return;
    const camera = cameraRef.current;
    if (!camera) return;
    camera.position.y = eyeHeight;
    invalidateRef.current?.();
  }, [enabled, eyeHeight, cameraRef]);

  useEffect(() => {
    if (!enabled || !avatarId || !startPosition) return undefined;

    const canvas = canvasRef.current;
    const THREE = threeModuleRef.current;
    const camera = cameraRef.current;
    if (!canvas || !THREE || !camera) return undefined;

    const orbit = orbitRef.current;
    if (orbit) orbit.enabled = false;

    const cleanup: Array<() => void> = [];
    const pressed = new Set<string>();
    let cancelled = false;
    let controls: PointerLockControlsType | null = null;
    let savedCameraPosition: ThreeNS.Vector3 | null = null;
    let avatarGroup: ThreeNS.Object3D | null = null;
    let sitting = false;
    let standingPosition: ThreeNS.Vector3 | null = null;
    const bodyEye = new THREE.Vector3();
    const bodyMaterials = prepareFirstPersonBody(bodyEye);
    let bodyYaw = startRotation;
    let seatYaw = startRotation;
    let seatedModel: ThreeNS.Group | null = null;
    let seatedMixer: ThreeNS.AnimationMixer | null = null;
    const childVisibility = new Map<ThreeNS.Object3D, boolean>();
    const avatarItem = items.find((item) => item.id === avatarId);
    const loader = avatarItem?.type === 'female-office-avatar' ? loadFemaleOfficeSittingAvatar : loadOfficeSittingAvatar;
    if (avatarItem?.type === 'office-avatar' || avatarItem?.type === 'female-office-avatar') {
      void loader(THREE).then((asset) => {
        if (!asset || cancelled) return;
        const instance = cloneAndFitOfficeAvatar(THREE, asset, avatarItem.height, { addBadge: false, castShadow: false });
        seatedModel = instance.model;
        const clip = instance.animations[avatarItem.type === 'female-office-avatar' && instance.animations.length > 1 ? 1 : 0];
        if (clip) {
          seatedMixer = new THREE.AnimationMixer(seatedModel);
          seatedMixer.clipAction(clip).play();
          seatedMixer.update(0.1);
        }
        syncAvatar();
        invalidateRef.current?.();
      });
    }
    const savedQuaternion = camera.quaternion.clone();
    const facing = new THREE.Vector3();
    let rafId = 0;

    const syncAvatar = (): void => {
      if (!avatarId) return;
      if (!avatarGroup?.parent) {
        avatarGroup = null;
        sceneRef.current?.traverse((node) => {
          if (!avatarGroup && node.userData.id === avatarId) avatarGroup = node;
        });
      }
      if (!avatarGroup) return;
      camera.getWorldDirection(facing);
      if (!sitting && Math.hypot(facing.x, facing.z) > 0.01) bodyYaw = Math.atan2(facing.x, facing.z);
      const yaw = sitting ? seatYaw : bodyYaw;
      avatarGroup.position.x = camera.position.x - Math.sin(yaw) * 0.08;
      avatarGroup.position.z = camera.position.z - Math.cos(yaw) * 0.08;
      avatarGroup.rotation.y = yaw;
      if (seatedModel && seatedModel.parent !== avatarGroup) avatarGroup.add(seatedModel);
      for (const child of avatarGroup.children) {
        if (child === seatedModel) { child.visible = sitting; continue; }
        if (!childVisibility.has(child)) childVisibility.set(child, child.visible);
        child.visible = sitting && seatedModel ? false : childVisibility.get(child)!;
      }
      bodyEye.copy(camera.position);
      bodyMaterials.attach(avatarGroup);
    };

    const clampSeatedLook = (): void => {
      if (!sitting) return;
      camera.rotation.reorder('YXZ');
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      const seatedCenterYaw = seatYaw + Math.PI;
      let yawDelta = euler.y - seatedCenterYaw;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      const limitedYaw = Math.max(-Math.PI * 0.55, Math.min(Math.PI * 0.55, yawDelta));
      const limitedPitch = Math.max(-Math.PI * 0.42, Math.min(Math.PI * 0.42, euler.x));
      camera.rotation.set(limitedPitch, seatedCenterYaw + limitedYaw, 0, 'YXZ');
    };

    const isSeat = (type: string): boolean => ['office-chair', 'conference-chair', 'chair', 'dining-chair', 'armchair', 'sofa', 'gltf-chair', 'gltf-sofa'].includes(type);
    const toggleSitting = (): void => {
      if (sitting) {
        sitting = false;
        if (standingPosition) camera.position.copy(standingPosition);
        camera.position.y = eyeHeightRef.current;
        standingPosition = null;
        syncAvatar();
        invalidateRef.current?.();
        return;
      }
      let nearest: FurnitureItem | null = null;
      let nearestDistance = 1.45;
      for (const item of items) {
        if (!item.position || !isSeat(item.type)) continue;
        const distance = Math.hypot(item.position.x - camera.position.x, item.position.z - camera.position.z);
        if (distance < nearestDistance) { nearest = item; nearestDistance = distance; }
      }
      if (!nearest?.position) return;
      standingPosition = camera.position.clone();
      camera.position.set(nearest.position.x, floorY + 1.05, nearest.position.z);
      sitting = true;
      seatYaw = nearest.rotation ?? 0;
      pressed.clear();
      camera.lookAt(camera.position.x + Math.sin(seatYaw), camera.position.y, camera.position.z + Math.cos(seatYaw));
      syncAvatar();
      invalidateRef.current?.();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!controls?.isLocked) return;
      if (event.code === 'KeyE') { event.preventDefault(); if (!event.repeat) toggleSitting(); return; }
      if (MOVEMENT_KEYS.has(event.code)) { event.preventDefault(); pressed.add(event.code); }
    };
    const onKeyUp = (event: KeyboardEvent) => pressed.delete(event.code);
    // Escape exit: the browser reserves the first Escape to release pointer
    // lock, so we only act on an Escape received while already unlocked — that
    // second press leaves walkthrough mode entirely (see #67).
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (controls?.isLocked) return;
      onExitRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('keydown', onEscape);
    cleanup.push(() => window.removeEventListener('keydown', onKeyDown));
    cleanup.push(() => window.removeEventListener('keyup', onKeyUp));
    cleanup.push(() => window.removeEventListener('keydown', onEscape));

    const clampToFootprint = (): void => {
      const halfW = roomWidthRef.current / 2 - WALL_MARGIN;
      const halfD = roomDepthRef.current / 2 - WALL_MARGIN;
      if (Number.isFinite(halfW) && halfW > 0) {
        camera.position.x = Math.max(-halfW, Math.min(halfW, camera.position.x));
      }
      if (Number.isFinite(halfD) && halfD > 0) {
        camera.position.z = Math.max(-halfD, Math.min(halfD, camera.position.z));
      }
    };

    // Treat the avatar as a small cylinder and furniture as rotated boxes on
    // the floor. Testing the proposed position instead of raycasting the view
    // lets the player pass through any real gap and naturally slide along the
    // first blocked axis rather than getting stuck at a corner.
    // Keep only a small body clearance around furniture. The furniture
    // footprint itself is already the solid area; a 20 cm expansion made
    // desks and chairs feel surrounded by an invisible wide wall.
    const AVATAR_COLLISION_RADIUS = 0.08;
    const NON_BLOCKING_TYPES = new Set([
      'rug', 'painting', 'mirror', 'curtains', 'wall-shelf', 'wall-clock',
      'pendant-light', 'door', 'window', 'security-camera', 'wifi', 'router',
      'cctv', 'computer', 'printer', 'books', 'candles', 'vase',
    ]);
    const canOccupy = (x: number, z: number): boolean => {
      for (const item of items) {
        if (!item.position || item.id === avatarId) continue;
        // Items placed on top of furniture and wall/ceiling decorations do
        // not occupy walking space. Their editor footprint can otherwise
        // falsely close a corridor that is visibly open in the scene.
        if ((item.elevation ?? 0) > 0.05 || NON_BLOCKING_TYPES.has(item.type)) continue;
        const halfWidth = Math.max(0.06, item.width / 2);
        const halfDepth = Math.max(0.06, item.depth / 2);
        const rotation = item.rotation ?? 0;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const dx = x - item.position.x;
        const dz = z - item.position.z;
        const localX = cos * dx - sin * dz;
        const localZ = sin * dx + cos * dz;
        const nearestX = Math.max(-halfWidth, Math.min(halfWidth, localX));
        const nearestZ = Math.max(-halfDepth, Math.min(halfDepth, localZ));
        const distanceX = localX - nearestX;
        const distanceZ = localZ - nearestZ;
        if (distanceX * distanceX + distanceZ * distanceZ < AVATAR_COLLISION_RADIUS ** 2) return false;
      }
      return true;
    };

    const moveWithCollisions = (dx: number, dz: number): void => {
      const nextX = camera.position.x + dx;
      const nextZ = camera.position.z + dz;
      if (canOccupy(nextX, nextZ)) {
        camera.position.x = nextX;
        camera.position.z = nextZ;
        return;
      }
      // Sliding one axis at a time keeps the movement responsive when only a
      // diagonal corner is blocked, and allows the player to walk around it.
      if (canOccupy(nextX, camera.position.z)) camera.position.x = nextX;
      if (canOccupy(camera.position.x, nextZ)) camera.position.z = nextZ;
    };

    void (async () => {
      const controlsModule = await import('three/examples/jsm/controls/PointerLockControls.js');
      if (cancelled) return;

      controls = new controlsModule.PointerLockControls(camera, canvas);
      const clearKeys = () => pressed.clear();
      controls.addEventListener('unlock', clearKeys);
      window.addEventListener('blur', clearKeys);
      cleanup.push(() => { controls?.removeEventListener('unlock', clearKeys); window.removeEventListener('blur', clearKeys); });
      savedCameraPosition = camera.position.clone();
      camera.position.set(startPosition?.x ?? 0, eyeHeightRef.current, startPosition?.z ?? 3);
      camera.lookAt(camera.position.x + Math.sin(startRotation), eyeHeightRef.current, camera.position.z + Math.cos(startRotation));
      clampToFootprint();
      syncAvatar();

      const requestLock = () => controls?.lock();
      canvas.addEventListener('click', requestLock);
      cleanup.push(() => canvas.removeEventListener('click', requestLock));
      // Release pointer lock BEFORE disconnecting: an exit path that tears the
      // mode down while still locked would otherwise leave the cursor captured
      // with no mousemove handler attached (#114). No-op when already unlocked.
      cleanup.push(() => controls?.unlock());
      cleanup.push(() => controls?.disconnect());
      cleanup.push(() => {
        if (sitting && standingPosition) {
          sitting = false;
          camera.position.copy(standingPosition);
          syncAvatar();
        }
        bodyMaterials.dispose();
        childVisibility.forEach((visible, node) => { node.visible = visible; });
        if (avatarGroup) onAvatarExitRef.current?.(avatarId, { x: avatarGroup.position.x, z: avatarGroup.position.z }, avatarGroup.rotation.y);
        seatedMixer?.stopAllAction();
        if (seatedModel) { seatedModel.removeFromParent(); disposeObject(seatedModel); }
      });
      cleanup.push(() => {
        if (savedCameraPosition) camera.position.copy(savedCameraPosition);
        camera.quaternion.copy(savedQuaternion);
        invalidateRef.current?.();
      });
      // Paint the eye-level starting pose. The main RAF tick no longer calls
      // OrbitControls.update() in this mode (#114), so nothing else marks the
      // first walkthrough frame dirty.
      invalidateRef.current?.();

      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      let lastTime = performance.now();
      const step = () => {
        rafId = requestAnimationFrame(step);
        const now = performance.now();
        const delta = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        clampSeatedLook();
        syncAvatar();
        if (!controls?.isLocked) return;
        // Walkthrough is an active mode: mouse-look mutates the camera outside
        // this loop, so render every frame while pointer lock is engaged.
        invalidateRef.current?.();

        const sprint = pressed.has('ShiftLeft') || pressed.has('ShiftRight');
        if (sitting) { seatedMixer?.update(delta); return; }
        const speed = walkSpeedRef.current * (sprint ? 2 : 1);

        let dz = 0;
        let dx = 0;
        if (pressed.has('KeyW') || pressed.has('ArrowUp')) dz -= 1;
        if (pressed.has('KeyS') || pressed.has('ArrowDown')) dz += 1;
        if (pressed.has('KeyA') || pressed.has('ArrowLeft')) dx -= 1;
        if (pressed.has('KeyD') || pressed.has('ArrowRight')) dx += 1;

        if (dx === 0 && dz === 0) return;
        const len = Math.hypot(dx, dz);
        dx /= len;
        dz /= len;

        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        right.crossVectors(forward, camera.up).normalize();

        const distance = speed * delta;
        const moveForward = -dz * distance;
        const moveRight = dx * distance;
        moveWithCollisions(
          forward.x * moveForward + right.x * moveRight,
          forward.z * moveForward + right.z * moveRight,
        );
        camera.position.y = eyeHeightRef.current;
        clampToFootprint();
        syncAvatar();
      };
      rafId = requestAnimationFrame(step);
      cleanup.push(() => cancelAnimationFrame(rafId));
    })();

    return () => {
      cancelled = true;
      for (const fn of cleanup) {
        try {
          fn();
        } catch {
          /* swallow */
        }
      }
      if (orbit) orbit.enabled = true;
    };
  }, [enabled, canvasRef, threeModuleRef, cameraRef, orbitRef, sceneRef, avatarId, startPosition, startRotation, items, floorY]);
}
