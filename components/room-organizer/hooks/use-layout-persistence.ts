import { useEffect, useRef, useState } from 'react';
import { AUTOSAVE_DEBOUNCE_MS, DEFAULT_FLOOR_COLOR } from '../lib/constants';
import { backupUnreadableLayout, loadLayout, saveLayout } from '../lib/persistence';
import { parseStoredLayout } from '../lib/schema';
import { decodeShareUrl, isShareHash } from '../lib/share';
import type { RoomLayout } from '../lib/types';

const BUNDLED_DEFAULT_LAYOUT = 'default-layout.json';

async function loadBundledDefaultLayout(): Promise<RoomLayout | null> {
  if (typeof window === 'undefined') return null;
  try {
    // Resolve relative to the current document so the asset works on both
    // localhost and the GitHub Pages `/rtls/` base path.
    const response = await fetch(new URL(BUNDLED_DEFAULT_LAYOUT, document.baseURI).toString(), {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return parseStoredLayout(await response.json());
  } catch (error) {
    console.warn('Failed to load bundled default layout:', error);
    return null;
  }
}

export interface UseLayoutPersistenceOptions {
  layout: RoomLayout;
  onHydrate: (layout: RoomLayout) => void;
  debounceMs?: number;
}

export interface UseLayoutPersistenceResult {
  /** Milliseconds-since-epoch of the last successful save, or null. */
  lastSavedAt: number | null;
  /** True while the debounce window is pending — the next save is on the way. */
  saving: boolean;
  /**
   * True when the most recent save attempt failed (e.g. QuotaExceededError from
   * an oversized floor-plan image). The HUD uses this to avoid falsely showing
   * "Saved" when the layout never actually made it to localStorage.
   */
  saveError: boolean;
}

export function useLayoutPersistence({
  layout,
  onHydrate,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
}: UseLayoutPersistenceOptions): UseLayoutPersistenceResult {
  const hasHydratedRef = useRef(false);
  // While set, autosave is suppressed until the layout moves past the stored
  // pre-hydration value — i.e. until the hydration dispatch has landed. This
  // stops a freshly opened share link (or a plain reload) from overwriting the
  // local save before the user has actually edited anything.
  const hydrationBaseRef = useRef<RoomLayout | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const persistedFloorCountRef = useRef(layout.floors.length);
  const pendingRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    // Share-URL takes precedence over the local auto-save so opening a
    // shared link always lands you on that layout.
    if (typeof window !== 'undefined') {
      const shared = decodeShareUrl(window.location.hash);
      if (shared) {
        hydrationBaseRef.current = layout;
        // A corrupt-but-parseable layout can still throw while it's applied to
        // the scene. Guard the dispatch so a bad share link doesn't crash the
        // whole mount — the error boundary's reset path is the recovery.
        try {
          onHydrate(shared);
        } catch (error) {
          console.warn('Failed to apply shared layout:', error);
          hydrationBaseRef.current = null;
        }
        // Clear the hash so reloading after edits doesn't restore the
        // shared version.
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }
      // The hash looks like a share link (`#layout=…`) but failed to decode —
      // truncated or corrupted. Surface a visible notice instead of silently
      // falling back to the local save, and clear the broken hash so a reload
      // doesn't repeat the warning.
      if (isShareHash(window.location.hash)) {
        window.alert(
          'This shared layout link is broken or incomplete and could not be opened. Loading your last saved layout instead.'
        );
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    const saved = loadLayout();
    // The former default was an empty layout named "My Home". Do not let that
    // old starter save hide the new populated office starter project.
    const isOlderOfficeDemoStarter = Boolean(
      saved &&
      saved.name === 'RTLS Ofis - Demo Katı' &&
      !saved.floors.some((floor) => floor.items.some((item) => item.id === 'water-cooler-1' || item.id === 'locker-1'))
    );
    void isOlderOfficeDemoStarter;
    const isExistingBuiltInOffice = Boolean(
      saved?.floors.some((floor) =>
        floor.name === 'Ana Ofis' && floor.items.some((item) => item.id === 'ws-1')
      )
    );
    const shouldLoadBundledDefault = !saved || isExistingBuiltInOffice;
    if (shouldLoadBundledDefault) {
      // The published default is kept as a static asset rather than in the
      // bundle, so the exact Barfas plan is shared by localhost and GitHub
      // Pages. Keep the old in-code starter as a safe offline fallback.
      void loadBundledDefaultLayout().then((bundled) => {
        if (!bundled) {
          if (!saved) backupUnreadableLayout();
          return;
        }
        hydrationBaseRef.current = layout;
        try {
          onHydrate(bundled);
        } catch (error) {
          console.warn('Failed to apply bundled default layout:', error);
          hydrationBaseRef.current = null;
        }
      });
      return;
    }
    // A schema-valid saved layout is user data, including edited demo layouts
    // with additional floors. Never discard it based on its display name.
    if (saved) {
      // Upgrade the built-in office demo in-place so an existing browser save
      // also receives the concrete palette and seated working avatars. Other
      // user-created layouts are left untouched.
      const isOfficeDemo = saved.name === 'RTLS Ofis - Demo Katı'
        || saved.floors.some((floor) => floor.name === 'Ana Ofis' && floor.items.some((item) => item.id === 'ws-1'));
      const hasWorkingAvatars = saved.floors.some((floor) =>
        floor.items.some((item) => item.id.startsWith('worker-'))
      );
      const hydratedLayout = isOfficeDemo && !hasWorkingAvatars
        ? {
            ...saved,
            floors: saved.floors.map((floor) => ({
              ...floor,
              floorColor: DEFAULT_FLOOR_COLOR,
              floorPattern: 'concrete' as const,
              items: [
                ...floor.items,
                {
                  id: 'worker-1', type: 'office-avatar', category: 'people' as const,
                  name: 'Çalışan Avatar 1', width: 0.62, depth: 0.45, height: 1.78,
                  color: '#4f6f86', icon: '🧑‍💻', price: 0,
                  position: { x: -6.4, z: 1.75 }, rotation: Math.PI, avatarPose: 'working' as const,
                },
                {
                  id: 'worker-2', type: 'female-office-avatar', category: 'people' as const,
                  name: 'Çalışan Avatar 2', width: 0.62, depth: 0.45, height: 1.78,
                  color: '#9b6fa8', icon: '👩‍💻', price: 0,
                  position: { x: -4.15, z: 1.75 }, rotation: Math.PI, avatarPose: 'working' as const,
                },
                {
                  id: 'worker-3', type: 'office-avatar', category: 'people' as const,
                  name: 'Çalışan Avatar 3', width: 0.62, depth: 0.45, height: 1.78,
                  color: '#4f6f86', icon: '🧑‍💻', price: 0,
                  position: { x: -6.4, z: -3.0 }, rotation: 0, avatarPose: 'working' as const,
                },
                {
                  id: 'worker-4', type: 'female-office-avatar', category: 'people' as const,
                  name: 'Çalışan Avatar 4', width: 0.62, depth: 0.45, height: 1.78,
                  color: '#9b6fa8', icon: '👩‍💻', price: 0,
                  position: { x: -4.15, z: -3.0 }, rotation: 0, avatarPose: 'working' as const,
                },
              ],
            })),
          }
        : saved;
      hydrationBaseRef.current = layout;
      // As above: a stored layout that parses but throws on apply must not
      // white-screen mount.
      try {
        onHydrate(hydratedLayout);
      } catch (error) {
        console.warn('Failed to apply saved layout:', error);
        hydrationBaseRef.current = null;
      }
    } else {
      // A blob that exists but failed to load would otherwise be overwritten
      // by the autosave of the fallback layout ~debounceMs after mount —
      // permanent data loss. Stash a copy first (#113).
      backupUnreadableLayout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydration; `layout` is only read as the pre-hydration baseline
  }, [onHydrate]);

  useEffect(() => {
    if (hydrationBaseRef.current) {
      if (Object.is(layout, hydrationBaseRef.current)) return;
      // First layout change after hydration is the hydration dispatch itself,
      // not a user edit — swallow it and resume normal autosave afterwards.
      hydrationBaseRef.current = null;
      return;
    }
    // Floor creation/removal is structural data. Persist it immediately so a
    // refresh cannot land inside the normal debounce window and restore the
    // previous one-floor layout.
    if (layout.floors.length !== persistedFloorCountRef.current) {
      persistedFloorCountRef.current = layout.floors.length;
      const ok = saveLayout(layout);
      pendingRef.current = !ok;
      setSaving(!ok);
      setSaveError(!ok);
      if (ok) setLastSavedAt(Date.now());
      return;
    }
    persistedFloorCountRef.current = layout.floors.length;
    setSaving(true);
    pendingRef.current = true;
    const handle = window.setTimeout(() => {
      const ok = saveLayout(layout);
      if (ok) {
        // Only mark the edit persisted on a real success — otherwise the HUD
        // would show "Saved" for a layout that never reached localStorage.
        pendingRef.current = false;
        setLastSavedAt(Date.now());
        setSaving(false);
        setSaveError(false);
      } else {
        // Keep `saving`/pending truthy and flag the error so the HUD reports
        // the failure instead of a false "Saved". A later successful edit
        // clears the flag.
        setSaveError(true);
      }
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [layout, debounceMs]);

  // Flush a still-debouncing save when the editor unmounts or the page goes
  // away — without this, edits made in the last debounceMs are silently lost
  // on tab close.
  useEffect(() => {
    const flush = () => {
      if (!pendingRef.current) return;
      pendingRef.current = false;
      saveLayout(layoutRef.current);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return { lastSavedAt, saving, saveError };
}
