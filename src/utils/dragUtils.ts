export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export function getClosestCorner(x: number, y: number): Corner {
  const isTop = y < window.innerHeight / 2;
  const isLeft = x < window.innerWidth / 2;
  if (isTop && isLeft) return 'top-left';
  if (isTop && !isLeft) return 'top-right';
  if (!isTop && isLeft) return 'bottom-left';
  return 'bottom-right';
}

export function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);

  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}
