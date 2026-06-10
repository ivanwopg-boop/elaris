'use client';

import React, { useRef, useState, useCallback } from 'react';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  className?: string;
  deleting?: boolean;
}

const DELETE_BTN_WIDTH = 80;
const SWIPE_THRESHOLD = DELETE_BTN_WIDTH / 2;

export function SwipeableRow({
  children,
  onDelete,
  deleteLabel = 'Delete',
  className = '',
  deleting = false,
}: SwipeableRowProps) {
  const [translateX, setTranslateX] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const startTranslateX = useRef(0);
  const isDragging = useRef(false);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const snapTo = useCallback((x: number) => {
    setTranslateX(x);
  }, []);

  const resetSwipeState = useCallback(() => {
    isDragging.current = false;
    isHorizontalSwipe.current = null;
  }, []);

  // ── Touch handlers ──

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    startTranslateX.current = translateX;
    isDragging.current = true;
    isHorizontalSwipe.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }
    if (isHorizontalSwipe.current === false) return;

    let newX = startTranslateX.current + deltaX;
    // Clamp: don't go right of 0 or left beyond the delete button
    newX = Math.max(-DELETE_BTN_WIDTH - 20, Math.min(20, newX));
    setTranslateX(newX);
  };

  const onTouchEnd = () => {
    isDragging.current = false;
    if (translateX < -SWIPE_THRESHOLD) {
      snapTo(-DELETE_BTN_WIDTH);
    } else {
      snapTo(0);
    }
  };

  // ── Mouse handlers (desktop swipe support) ──

  const onMouseDown = (e: React.MouseEvent) => {
    touchStartX.current = e.clientX;
    touchStartY.current = e.clientY;
    startTranslateX.current = translateX;
    isDragging.current = true;
    isHorizontalSwipe.current = null;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - touchStartX.current;
    const deltaY = e.clientY - touchStartY.current;

    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }
    if (isHorizontalSwipe.current === false) return;

    let newX = startTranslateX.current + deltaX;
    newX = Math.max(-DELETE_BTN_WIDTH - 20, Math.min(20, newX));
    setTranslateX(newX);
  };

  const onMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (translateX < -SWIPE_THRESHOLD) {
      snapTo(-DELETE_BTN_WIDTH);
    } else {
      snapTo(0);
    }
  };

  const onMouseLeave = () => {
    if (isDragging.current) {
      onMouseUp();
    }
    resetSwipeState();
  };

  // ── Delete button tap ──

  const handleDeleteTap = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDelete();
      snapTo(0);
    },
    [onDelete, snapTo],
  );

  const isOpen = translateX < -SWIPE_THRESHOLD;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Background: delete button (revealed on swipe) */}
      <div
        className="absolute top-0 right-0 bottom-0 flex items-center justify-center bg-[#FF3B30] text-white font-light text-sm cursor-pointer select-none transition-opacity duration-200 z-0"
        style={{
          width: `${DELETE_BTN_WIDTH}px`,
          opacity: isOpen ? 1 : 0,
        }}
        onClick={handleDeleteTap}
        onTouchEnd={handleDeleteTap}
      >
        {deleting ? (
          <span className="w-4 h-4 rounded-full border-2 border-white/60 border-t-white animate-spin inline-block" />
        ) : (
          deleteLabel
        )}
      </div>

      {/* Foreground: actual content (slides left on swipe) */}
      <div
        className="relative bg-white w-full z-10"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1.0)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    </div>
  );
}
