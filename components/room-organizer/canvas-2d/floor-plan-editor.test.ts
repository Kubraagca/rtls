// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFloor, makeItem, makeLayout } from '../lib/__testfixtures__/fixtures';
import { FloorPlanEditor } from './floor-plan-editor';
import type { LayoutActions } from '../hooks/use-layout-state';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(920);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(920);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(selectedWallId: string | null = null) {
  const onSelectItem = vi.fn();
  const floor = makeFloor({ items: [makeItem({ rotation: Math.PI / 4, mirrored: true, locked: true })] });
  const result = render(React.createElement(FloorPlanEditor, {
    layout: makeLayout({ floors: [floor] }), floor, selectedWallId, selectedItemId: null,
    actions: {} as LayoutActions, onSelectWall: vi.fn(), onSelectItem,
  }));
  return { ...result, onSelectItem };
}

describe('2D interaction overlay', () => {
  it('leaves the shared floor and model rendering visible and matches arbitrary model angles', () => {
    const { container, onSelectItem } = setup();
    const svg = container.querySelector('svg')!;
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
    const footprint = svg.querySelector('rect')!;
    expect(footprint.getAttribute('fill')).toBe('transparent');
    expect(footprint.getAttribute('width')).toBe('100');
    expect(footprint.parentElement!.getAttribute('transform')).toContain('rotate(-45) scale(-1 1)');
    expect([...svg.querySelectorAll('line')].every(line => line.getAttribute('stroke') === 'transparent')).toBe(true);
    fireEvent.pointerDown(footprint, { button: 0 });
    expect(onSelectItem).toHaveBeenCalledWith('item-1');
  });

  it('shows endpoint handles only for the selected wall', () => {
    const first = setup();
    expect(first.container.querySelectorAll('circle')).toHaveLength(0);
    first.unmount();
    const selected = setup('outer-north');
    expect(selected.container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('allows an exact one-millimetre endpoint correction', () => {
    const updateBoundaryWall = vi.fn();
    const floor = makeFloor();
    const result = render(React.createElement(FloorPlanEditor, {
      layout: makeLayout({ floors: [floor] }), floor, selectedWallId: 'outer-north', selectedItemId: null,
      actions: { updateBoundaryWall } as unknown as LayoutActions,
      onSelectWall: vi.fn(), onSelectItem: vi.fn(),
    }));

    fireEvent.click(result.getByRole('button', { name: 'Hassas ±1 mm' }));
    fireEvent.change(result.getByRole('spinbutton', { name: 'Başlangıç Z koordinatı' }), { target: { value: '-3.999' } });

    expect(updateBoundaryWall).toHaveBeenCalledWith('outer-north', { z1: -3.999 });
  });

  it('straightens a selected wall with one click', () => {
    const updateInteriorWall = vi.fn();
    const floor = makeFloor({
      interiorWalls: [{ id: 'partition', x1: -2, z1: 0, x2: 2, z2: 0.37 }],
    });
    const result = render(React.createElement(FloorPlanEditor, {
      layout: makeLayout({ floors: [floor] }), floor, selectedWallId: 'partition', selectedItemId: null,
      actions: { updateInteriorWall } as unknown as LayoutActions,
      onSelectWall: vi.fn(), onSelectItem: vi.fn(),
    }));

    fireEvent.click(result.getByRole('button', { name: 'Düzleştir' }));

    expect(updateInteriorWall).toHaveBeenCalledWith('partition', { z2: 0 });
  });

  it('moves a focused endpoint by one millimetre with an arrow key', () => {
    const updateInteriorWall = vi.fn();
    const floor = makeFloor({
      interiorWalls: [{ id: 'partition', x1: -2, z1: 0, x2: 2, z2: 0.37 }],
    });
    const result = render(React.createElement(FloorPlanEditor, {
      layout: makeLayout({ floors: [floor] }), floor, selectedWallId: 'partition', selectedItemId: null,
      actions: { updateInteriorWall } as unknown as LayoutActions,
      onSelectWall: vi.fn(), onSelectItem: vi.fn(),
    }));

    fireEvent.keyDown(result.getByRole('button', { name: /Bitiş uç noktası/ }), { key: 'ArrowUp' });

    expect(updateInteriorWall).toHaveBeenCalledWith('partition', { x2: 2, z2: 0.369 });
  });
});
