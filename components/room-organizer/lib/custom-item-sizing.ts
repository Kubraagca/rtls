const MAX_REASONABLE_CUSTOM_ITEM_DIMENSION = 3;

function saneDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0.5;
  return Math.max(0.02, Math.min(50, value));
}

/** Keep custom GLB proportions while preventing old/oversized uploads from
 * appearing as room-sized furniture when loaded from saved catalog/layout data. */
export function normaliseCustomItemDimensions(dimensions: {
  width: number;
  depth: number;
  height: number;
}): { width: number; depth: number; height: number } {
  const safe = {
    width: saneDimension(dimensions.width),
    depth: saneDimension(dimensions.depth),
    height: saneDimension(dimensions.height),
  };
  const longest = Math.max(safe.width, safe.depth, safe.height);
  if (longest <= MAX_REASONABLE_CUSTOM_ITEM_DIMENSION) return safe;
  const factor = MAX_REASONABLE_CUSTOM_ITEM_DIMENSION / longest;
  return {
    width: saneDimension(safe.width * factor),
    depth: saneDimension(safe.depth * factor),
    height: saneDimension(safe.height * factor),
  };
}
