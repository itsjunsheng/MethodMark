import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { InkPoint, InkStroke, InkTool } from '../lib/useHandwriting';

type Props = {
  label: string;
  strokes: InkStroke[];
  tool: InkTool;
  onChange: (strokes: InkStroke[]) => void;
};
type Gesture = { pointerId: number; rect: DOMRect; points: InkStroke; erased: Set<number> };

function pointAt(event: PointerEvent<SVGSVGElement>, rect: DOMRect): InkPoint {
  const fraction = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 10000) / 10000;
  return [fraction((event.clientX - rect.left) / rect.width), fraction((event.clientY - rect.top) / rect.height)];
}

function touchesStroke(point: InkPoint, stroke: InkStroke, rect: DOMRect) {
  // Test distance to segments, so fast strokes can still be erased between sampled points.
  return stroke.some((end, i) => {
    const start = stroke[Math.max(0, i - 1)];
    const dx = (end[0] - start[0]) * rect.width, dy = (end[1] - start[1]) * rect.height;
    const x = (point[0] - start[0]) * rect.width, y = (point[1] - start[1]) * rect.height;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, (x * dx + y * dy) / length)) : 0;
    return Math.hypot(x - t * dx, y - t * dy) <= 10;
  });
}

function strokePath(stroke: InkStroke) {
  const path = stroke.map(([x, y], i) => `${i ? 'L' : 'M'}${x * 1000},${y * 1000}`).join(' ');
  return stroke.length === 1 ? `${path} l0.01,0` : path;
}

export function HandwritingArea({ label, strokes, tool, onChange }: Props) {
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<InkStroke[] | null>(null);

  const update = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = pointAt(event, active.rect);
    if (tool === 'pen') {
      const last = active.points.at(-1);
      if (!last || Math.hypot((point[0] - last[0]) * active.rect.width, (point[1] - last[1]) * active.rect.height) >= 1) {
        active.points.push(point);
      }
      setPreview([...strokes, [...active.points]]);
    } else {
      strokes.forEach((stroke, index) => {
        if (touchesStroke(point, stroke, active.rect)) active.erased.add(index);
      });
      setPreview(strokes.filter((_, index) => !active.erased.has(index)));
    }
  };
  const cancel = () => {
    gesture.current = null;
    setPreview(null);
  };

  return <svg className={`handwriting-area handwriting-${tool}`} viewBox="0 0 1000 1000"
    preserveAspectRatio="none" role="img" aria-label={label} aria-describedby="handwriting-help"
    onContextMenu={event => { if (tool !== 'scroll') event.preventDefault(); }}
    onPointerDown={event => {
      if (tool === 'scroll' || gesture.current || !event.isPrimary || event.button !== 0
        || event.pointerType === 'touch') return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { pointerId: event.pointerId, rect: event.currentTarget.getBoundingClientRect(), points: [], erased: new Set() };
      update(event);
    }}
    onPointerMove={update}
    onPointerUp={event => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      update(event);
      if (tool === 'pen' && active.points.length) onChange([...strokes, active.points]);
      if (tool === 'eraser' && active.erased.size) onChange(strokes.filter((_, index) => !active.erased.has(index)));
      cancel();
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) cancel(); }}
    onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId) cancel(); }}>
    {(preview ?? strokes).map((stroke, index) => <path key={index} d={strokePath(stroke)} fill="none"
      stroke="#183958" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
  </svg>;
}
