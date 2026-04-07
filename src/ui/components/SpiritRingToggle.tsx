import React, { useRef, useState } from 'react';
import { useDraggable } from '../../utils/useDraggable';

interface Props {
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  setCorner: (corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left') => void;
  onOpen: () => void;
  unreadCount: number;
}

export function SpiritRingToggle({ corner, setCorner, onOpen, unreadCount }: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, dragPos, isDragging, didMove } = useDraggable(setCorner, dragRef);

  const getPositionStyles = () => {
    if (dragPos) return { top: dragPos.y, left: dragPos.x, right: 'auto', bottom: 'auto' };
    switch (corner) {
      case 'top-right':
        return { top: '20px', right: '20px' };
      case 'top-left':
        return { top: '20px', left: '20px' };
      case 'bottom-right':
        return { bottom: '20px', right: '20px' };
      case 'bottom-left':
        return { bottom: '20px', left: '20px' };
    }
  };

  return (
    <div
      ref={dragRef}
      role="button"
      tabIndex={0}
      aria-label="Open Spirit Ring"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerCancel={onPointerCancel}
      onPointerUp={(e) => {
        const isClick = !didMove();
        onPointerUp(e);
        if (isClick) onOpen();
      }}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        pointerEvents: 'auto',
        position: 'absolute',
        ...getPositionStyles(),
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        backgroundColor: 'rgba(10, 10, 15, 0.8)',
        border: '2px solid #C5A059',
        boxShadow: isHovered ? '0 0 15px rgba(197, 160, 89, 0.8)' : '0 0 5px rgba(0,0,0,0.5)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        opacity: isHovered || isDragging ? 1 : 0.6,
        transition: isDragging ? 'none' : 'all 0.2s ease-in-out',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#C5A059',
        fontSize: '24px',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
      title="Summon Elder Spirit"
    >
      <span aria-hidden="true" style={{ pointerEvents: 'none', userSelect: 'none' }}>☯</span>
      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            minWidth: '20px',
            height: '20px',
            padding: '0 6px',
            borderRadius: '999px',
            backgroundColor: '#C54B59',
            color: 'white',
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </div>
  );
}
