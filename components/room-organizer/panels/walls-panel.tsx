'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRoomEditor } from '../contexts';
import { FLOOR_PATTERN_LABELS } from '../three/floor-patterns';
import { WALL_PATTERN_LABELS } from '../three/wall-patterns';
import type { FloorPattern, WallId, WallPattern } from '../lib/types';

const WALL_LABELS: Record<WallId, string> = {
  north: 'North wall',
  south: 'South wall',
  east: 'East wall',
  west: 'West wall',
};

const FLOOR_PATTERNS: ReadonlyArray<FloorPattern> = ['solid', 'wood', 'tile', 'concrete'];
const WALL_PATTERNS: ReadonlyArray<WallPattern> = ['solid', 'brick', 'panel', 'plaster'];

const DEFAULT_WALL_COLOR = '#d6d3ce';
const DEFAULT_FLOOR_COLOR = '#c9a57d';
const CORPORATE_COLORS = [
  '#ffffff', '#f7f7f5', '#eeeae3', '#e5ded2',
  '#d6d3ce', '#b8bcc0', '#8b9298', '#5f6870',
  '#343a40', '#cbbda9', '#a9957d', '#766653',
] as const;

export function WallsPanel(): JSX.Element {
  const { activeFloor, actions } = useRoomEditor();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🎨 Duvarlar ve zemin</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Zemin deseni</Label>
          <Select
            value={activeFloor.floorPattern ?? 'solid'}
            onValueChange={(value) => actions.setFloorPattern(value as FloorPattern)}
          >
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLOOR_PATTERNS.map((pattern) => (
                <SelectItem key={pattern} value={pattern}>
                  {FLOOR_PATTERN_LABELS[pattern]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="h-7 flex-1 rounded-md border px-2 text-[10px]"
              disabled={(activeFloor.floorPattern ?? 'solid') === 'solid'}
              onClick={() => actions.setFloorPattern('solid')}
            >
              Parkeyi kaldır
            </button>
            <button
              type="button"
              className="h-7 flex-1 rounded-md border px-2 text-[10px]"
              disabled={(activeFloor.floorColor ?? DEFAULT_FLOOR_COLOR).toLowerCase() === DEFAULT_FLOOR_COLOR}
              onClick={() => actions.setFloorColor(DEFAULT_FLOOR_COLOR)}
            >
              Rengi kaldır
            </button>
          </div>
        </div>
        <div>
          <Label className="text-xs">Duvar deseni</Label>
          <Select
            value={activeFloor.wallPattern ?? 'solid'}
            onValueChange={(value) => actions.setWallPattern(value as WallPattern)}
          >
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WALL_PATTERNS.map((pattern) => (
                <SelectItem key={pattern} value={pattern}>
                  {WALL_PATTERN_LABELS[pattern]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
          {(Object.keys(WALL_LABELS) as WallId[]).map((wall) => (
            <div key={wall}>
              <Label className="text-xs">{WALL_LABELS[wall]}</Label>
              <select
                value={activeFloor.wallColors?.[wall] ?? DEFAULT_WALL_COLOR}
                onChange={(event) => actions.setWallColor(wall, event.target.value)}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              >
                {CORPORATE_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
