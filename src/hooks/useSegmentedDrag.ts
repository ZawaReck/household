import React from "react";

type SegmentedDragOptions = {
  count: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  cssVariable: `--${string}`;
  horizontalPadding?: number;
  disabled?: boolean;
};

export const useSegmentedDrag = <T extends HTMLElement>({
  count,
  selectedIndex,
  onSelect,
  cssVariable,
  horizontalPadding = 0,
  disabled = false,
}: SegmentedDragOptions) => {
  const ref = React.useRef<T>(null);
  const gesture = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    position: number;
    direction: "pending" | "horizontal" | "vertical";
    dragged: boolean;
  } | null>(null);
  const suppressClick = React.useRef(false);
  const cleanupTimer = React.useRef<number | undefined>(undefined);
  const [isDragging, setIsDragging] = React.useState(false);

  const positionFromPointer = React.useCallback((clientX: number) => {
    const element = ref.current;
    if (!element) return selectedIndex;
    const rect = element.getBoundingClientRect();
    const usableWidth = Math.max(1, rect.width - horizontalPadding * 2);
    const segmentWidth = usableWidth / count;
    return Math.max(0, Math.min(count - 1, (clientX - rect.left - horizontalPadding) / segmentWidth - 0.5));
  }, [count, horizontalPadding, selectedIndex]);

  const finish = React.useCallback((commit: boolean) => {
    const current = gesture.current;
    const element = ref.current;
    if (!current || !element) return;
    gesture.current = null;
    if (element.hasPointerCapture(current.pointerId)) element.releasePointerCapture(current.pointerId);
    if (commit && current.dragged && current.direction === "horizontal") {
      const nextIndex = Math.round(current.position);
      suppressClick.current = true;
      onSelect(nextIndex);
      element.style.setProperty(cssVariable, String(nextIndex));
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    } else if (current.dragged) {
      element.style.setProperty(cssVariable, String(selectedIndex));
    } else {
      element.style.removeProperty(cssVariable);
    }
    setIsDragging(false);
    if (cleanupTimer.current) window.clearTimeout(cleanupTimer.current);
    if (current.dragged) cleanupTimer.current = window.setTimeout(() => element.style.removeProperty(cssVariable), 160);
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  }, [cssVariable, onSelect, selectedIndex]);

  React.useEffect(() => () => {
    if (cleanupTimer.current) window.clearTimeout(cleanupTimer.current);
  }, []);

  return {
    ref,
    isDragging,
    handlers: {
      onPointerDown: (event: React.PointerEvent<T>) => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        if (cleanupTimer.current) window.clearTimeout(cleanupTimer.current);
        const position = positionFromPointer(event.clientX);
        gesture.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          position,
          direction: "pending",
          dragged: false,
        };
        suppressClick.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.style.setProperty(cssVariable, String(position));
        onSelect(Math.round(position));
      },
      onPointerMove: (event: React.PointerEvent<T>) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const deltaX = event.clientX - current.startX;
        const deltaY = event.clientY - current.startY;
        if (current.direction === "pending" && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 5) {
          current.direction = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? "horizontal" : "vertical";
        }
        if (current.direction !== "horizontal") return;
        event.preventDefault();
        current.dragged = true;
        current.position = positionFromPointer(event.clientX);
        event.currentTarget.style.setProperty(cssVariable, String(current.position));
        if (!isDragging) setIsDragging(true);
      },
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
      onClickCapture: (event: React.MouseEvent<T>) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      },
      onContextMenu: (event: React.MouseEvent<T>) => event.preventDefault(),
    },
  };
};
