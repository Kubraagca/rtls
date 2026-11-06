'use client';

import { useState } from 'react';
import { useRoomEditor } from '../contexts';
import { useSelection } from '../contexts';
import { generateRoomShape } from '../lib/room-shapes';
import { surpriseLayout } from '../lib/surprise';
import { BuildToolsPanel, type BuildToolCategory } from './build-tools-panel';
import { CatalogStrip } from './catalog-strip';
import { CatalogCreateDialog } from './catalog-create-dialog';
import { ModePanel } from './mode-panel';
import { RoomShapesPanel } from './room-shapes-panel';
import type { CatalogItem } from '../lib/types';

export interface BottomHudProps {
  placeCatalogItem(catalogItem: CatalogItem, position?: { x: number; z: number }): string;
  onRemoveCatalogItem(item: CatalogItem): void;
  onUpdateCatalogItem(item: CatalogItem): void;
}

export function BottomHud({ placeCatalogItem, onRemoveCatalogItem, onUpdateCatalogItem }: BottomHudProps): JSX.Element {
  const { layout, activeFloor, actions, view, toggle, setView, isReady, error, gameMode, setGameMode, playCue } = useRoomEditor();
  const { selectOnly, setSelectedItemId, setExtraSelectedIds } = useSelection();
  const [buildToolCategory, setBuildToolCategory] = useState<BuildToolCategory>('seating');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogCreateOpen, setCatalogCreateOpen] = useState(false);

  if (!isReady || error) return <></>;

  return (
    <div
      className="pointer-events-none pc-bottom-hud"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: 16,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 25,
      }}
    >
      {gameMode !== 'live' && !view.view2D ? (
        <div
          className="pc-bottom-hud-tools"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            position: 'relative',
            height: 'calc(100vh - 128px)',
          }}
        >
          <div
            className="pc-build-tools-column"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'flex-start',
              maxHeight: 'none',
              height: 'auto',
              overflowY: 'visible',
              overflowX: 'visible',
              paddingRight: 4,
            }}
          >
            {view.drawWallMode && (
              <>
                <RoomShapesPanel
                  maxWidth={layout.width}
                  maxDepth={layout.height}
                  onStamp={({ shape, width, depth, centerX, centerZ }) => {
                    // Random suffix so two stamps in the same millisecond can't
                    // produce colliding wall ids.
                    const seed = `stamp-${shape}-${Date.now().toString(36)}-${Math.random()
                      .toString(36)
                      .slice(2, 6)}`;
                    const walls = generateRoomShape(
                      shape,
                      centerX,
                      centerZ,
                      width,
                      depth,
                      seed,
                      undefined,
                      { width: layout.width, depth: layout.height }
                    );
                    // Batch all segments into one dispatch so the whole stamp is a
                    // single undo entry rather than N steps.
                    actions.addInteriorWalls(walls);
                    playCue('place');
                  }}
                />
              </>
            )}
            {!view.view2D && <BuildToolsPanel
              active={buildToolCategory}
              drawWallMode={view.drawWallMode}
              compact
              onAddCatalog={() => setCatalogCreateOpen(true)}
              onSelect={(tool) => {
                setBuildToolCategory(tool);
                setCatalogOpen(true);
                if (tool === 'walls') {
                  if (!view.drawWallMode) toggle('drawWallMode');
                } else if (view.drawWallMode) {
                  toggle('drawWallMode');
                }
              }}
            />}
          </div>

          {catalogOpen && (
            <div
              className="pc-catalog-popover"
              style={{
                width: 380,
                height: '100%',
                flex: '0 0 380px',
                alignSelf: 'flex-start',
              }}
              role="dialog"
              aria-label="Eşya kataloğu"
            >
              <CatalogStrip
                category={buildToolCategory === 'walls' ? 'all' : buildToolCategory}
                onClose={() => setCatalogOpen(false)}
                onRemoveCatalogItem={onRemoveCatalogItem}
                onUpdateCatalogItem={onUpdateCatalogItem}
                onAdd={(catalogItem) => {
                  const id = placeCatalogItem(catalogItem);
                  selectOnly(id);
                  playCue('place');
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div />
      )}

      {catalogCreateOpen && (
        <CatalogCreateDialog
          onClose={() => setCatalogCreateOpen(false)}
          onItemAdded={(catalogItem) => {
            const id = placeCatalogItem(catalogItem);
            selectOnly(id);
            playCue('place');
          }}
        />
      )}

      <ModePanel
        onSetMode={(mode) => {
          setGameMode(mode);
          if (mode === 'live') {
            // RTLS Live is an observer/dashboard mode. Keep the orbit camera
            // so the whole office and tracked employees remain visible.
            setView((v) => ({ ...v, view2D: false, walkthroughMode: false, showNpcs: true }));
          } else {
            setView((v) => ({ ...v, walkthroughMode: false, showNpcs: false }));
          }
        }}
        onSurprise={() => {
          // Surprise replaces the whole floor — never wipe placed furniture
          // without asking (#105). An empty floor proceeds silently.
          if (
            activeFloor.items.length > 0 &&
            !window.confirm('Replace everything on this floor with a surprise layout?')
          ) {
            return;
          }
          const items = surpriseLayout({
            roomWidth: layout.width,
            roomDepth: layout.height,
          });
          actions.replaceItems(items);
          setSelectedItemId(null);
          setExtraSelectedIds(new Set());
        }}
      />
    </div>
  );
}
