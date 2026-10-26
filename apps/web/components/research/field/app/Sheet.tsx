'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type SheetStop = 'peek' | 'half' | 'full';

const ORDER: SheetStop[] = ['peek', 'half', 'full'];
const TOP_GAP = 64;

/**
 * Bottom sheet with three stops (Apple Maps style). Drag the grip, or tap it
 * to step between stops. The peek stop shows the header (the log buttons);
 * half and full reveal the body. The sheet renders at full height and moves
 * with a transform, so dragging never reflows the content.
 */
export default function Sheet({
  stop,
  onStop,
  header,
  children,
  onHeight,
  label,
}: {
  stop: SheetStop;
  onStop: (stop: SheetStop) => void;
  header: ReactNode;
  children: ReactNode;
  /** Reports how much of the screen the sheet covers, for map framing. */
  onHeight: (visible: number) => void;
  label: string;
}) {
  const [viewport, setViewport] = useState(800);
  const [peek, setPeek] = useState(200);
  const [drag, setDrag] = useState<number | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; visible: number; t: number } | null>(null);
  const moved = useRef(false);

  useLayoutEffect(() => {
    const measure = () => setViewport(window.visualViewport?.height ?? window.innerHeight);
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    const observer = new ResizeObserver(() => {
      if (top.current) setPeek(Math.ceil(top.current.getBoundingClientRect().height));
    });
    if (top.current) observer.observe(top.current);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, []);

  const full = Math.max(peek, viewport - TOP_GAP);
  const heights: Record<SheetStop, number> = useMemo(
    () => ({ peek, half: Math.min(full, Math.max(peek + 120, Math.round(viewport * 0.56))), full }),
    [peek, full, viewport],
  );
  const visible = drag ?? heights[stop];

  useEffect(() => {
    onHeight(heights[stop]);
  }, [heights[stop], onHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = useCallback(
    (finalVisible: number, velocity: number) => {
      // A flick moves one stop in its direction; otherwise snap to the nearest.
      const current = ORDER.indexOf(stop);
      const next =
        Math.abs(velocity) > 0.6
          ? ORDER[Math.min(ORDER.length - 1, Math.max(0, current + (velocity > 0 ? 1 : -1)))]
          : ORDER.reduce((best, s) => (Math.abs(heights[s] - finalVisible) < Math.abs(heights[best] - finalVisible) ? s : best), 'peek' as SheetStop);
      onStop(next);
    },
    [heights, onStop, stop],
  );

  return (
    <section
      className="field-sheet"
      aria-label={label}
      data-dragging={drag !== null || undefined}
      style={{ height: full, transform: `translateY(${full - visible}px)` }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && stop !== 'peek') {
          event.stopPropagation();
          onStop('peek');
        }
      }}
    >
      <div ref={top}>
        <button
          type="button"
          className="field-sheet-grip"
          aria-expanded={stop !== 'peek'}
          aria-label={stop === 'full' ? 'Show less' : 'Show more'}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            start.current = { y: event.clientY, visible: heights[stop], t: performance.now() };
            moved.current = false;
          }}
          onPointerMove={(event) => {
            if (!start.current) return;
            const dy = start.current.y - event.clientY;
            if (Math.abs(dy) > 4) moved.current = true;
            if (moved.current) setDrag(Math.min(full, Math.max(peek - 40, start.current.visible + dy)));
          }}
          onPointerUp={(event) => {
            const origin = start.current;
            start.current = null;
            if (!origin || !moved.current) return;
            const dy = origin.y - event.clientY;
            setDrag(null);
            settle(origin.visible + dy, dy / Math.max(1, performance.now() - origin.t));
          }}
          onPointerCancel={() => {
            start.current = null;
            setDrag(null);
          }}
          onClick={() => {
            if (moved.current) return;
            onStop(stop === 'peek' ? 'half' : stop === 'half' ? 'full' : 'peek');
          }}
        >
          <span aria-hidden className="field-sheet-bar" />
        </button>
        {header}
      </div>
      <div className="field-sheet-body" style={{ height: Math.max(0, visible - peek) }} inert={stop === 'peek' && drag === null}>
        {children}
      </div>
    </section>
  );
}
