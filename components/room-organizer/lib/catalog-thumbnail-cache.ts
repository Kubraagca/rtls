const thumbnails = new Map<string, HTMLImageElement>();

export function setCatalogThumbnail(type: string, source: string): void {
  if (typeof window === 'undefined' || thumbnails.has(type)) return;
  const image = new Image();
  image.onload = () => window.dispatchEvent(new Event('catalog-thumbnails-ready'));
  image.src = source;
  thumbnails.set(type, image);
}

export function getCatalogThumbnail(type: string): HTMLImageElement | undefined {
  const image = thumbnails.get(type);
  return image?.complete && image.naturalWidth > 0 ? image : undefined;
}
