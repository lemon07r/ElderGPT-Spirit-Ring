import { RefObject, useEffect, useRef, useState } from 'react';
import { clampToViewport, Corner, getClosestCorner } from './dragUtils';

export function useDraggable(
  setCorner: (corner: Corner) => void,
  dragRef: RefObject<HTMLDivElement | null>,
  onDragEnd?: (pos: { x: number; y: number }) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);

  useEffect(() => {
    if (typeof document === 'undefined' || !isDragging) {
      return;
    }

    const { style } = document.body;
    const previousUserSelect = style.userSelect;
    const previousWebkitUserSelect = style.webkitUserSelect;
    const previousCursor = style.cursor;

    style.userSelect = 'none';
    style.webkitUserSelect = 'none';
    style.cursor = 'grabbing';

    return () => {
      style.userSelect = previousUserSelect;
      style.webkitUserSelect = previousWebkitUserSelect;
      style.cursor = previousCursor;
    };
  }, [isDragging]);

  const updateDragPos = (nextPos: { x: number; y: number } | null) => {
    dragPosRef.current = nextPos;
    setDragPos(nextPos);
  };

  const getClampedPosition = (clientX: number, clientY: number) => {
    const rect = dragRef.current?.getBoundingClientRect();
    return clampToViewport(
      clientX - offsetRef.current.x,
      clientY - offsetRef.current.y,
      rect?.width ?? 0,
      rect?.height ?? 0,
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click
    if (!dragRef.current) return;

    const target = e.target as HTMLElement;
    if (target.closest('input, button, textarea, select, option, a')) {
      return;
    }

    const rect = dragRef.current.getBoundingClientRect();
    startPosRef.current = { x: e.clientX, y: e.clientY };
    hasMovedRef.current = false;
    offsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    updateDragPos({ x: rect.left, y: rect.top });
    isDraggingRef.current = true;
    setIsDragging(true);
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (!hasMovedRef.current && Math.sqrt(dx * dx + dy * dy) > 5) {
      hasMovedRef.current = true;
    }

    updateDragPos(getClampedPosition(e.clientX, e.clientY));
    e.preventDefault();
  };

  const stopDragging = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    updateDragPos(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const moved = hasMovedRef.current;
    const position = dragPosRef.current ?? getClampedPosition(e.clientX, e.clientY);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopDragging();

    if (moved) {
      if (onDragEnd) {
        onDragEnd(position);
      } else {
        const rect = dragRef.current?.getBoundingClientRect();
        const centerX = position.x + (rect?.width ?? 0) / 2;
        const centerY = position.y + (rect?.height ?? 0) / 2;
        const newCorner = getClosestCorner(centerX, centerY);
        setCorner(newCorner);
      }
    }
    hasMovedRef.current = false;
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopDragging();
    hasMovedRef.current = false;
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    dragPos,
    isDragging,
    didMove: () => hasMovedRef.current,
  };
}
