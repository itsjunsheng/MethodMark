import { useState } from 'react';

export type InkPoint = [number, number];
export type InkStroke = InkPoint[];
export type InkDrawing = Record<string, InkStroke[]>;
export type InkTool = 'scroll' | 'pen' | 'eraser';

// Coordinates are fractions of each answer space, independent of screen size.
function isDrawing(value: unknown): value is InkDrawing {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(strokes => Array.isArray(strokes)
      && strokes.every(stroke => Array.isArray(stroke) && stroke.length > 0
        && stroke.every(point => Array.isArray(point) && point.length === 2
          && point.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1))));
}

function readDrawing(key: string): { drawing: InkDrawing; error: string } {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return { drawing: {}, error: '' };
    const drawing: unknown = JSON.parse(stored);
    if (!isDrawing(drawing)) throw new Error('Invalid handwriting');
    return { drawing, error: '' };
  } catch {
    return { drawing: {}, error: 'Your saved handwriting could not be opened on this device.' };
  }
}

export function useHandwriting(key: string) {
  const [initial] = useState(() => readDrawing(key));
  const [history, setHistory] = useState<{ past: InkDrawing[]; present: InkDrawing; future: InkDrawing[] }>(
    () => ({ past: [], present: initial.drawing, future: [] }),
  );
  const [saveError, setSaveError] = useState(initial.error);

  // Save after each completed gesture, including undo and erase; never on every pointer move.
  const save = (drawing: InkDrawing) => {
    try {
      localStorage.setItem(key, JSON.stringify(drawing));
      setSaveError('');
    } catch {
      setSaveError('Your latest handwriting could not be saved. Keep this tab open and use Print / Save PDF to keep a copy.');
    }
  };
  const change = (area: string, strokes: InkStroke[]) => {
    const next = { ...history.present, [area]: strokes };
    setHistory({ past: [...history.past.slice(-49), history.present], present: next, future: [] });
    save(next);
  };
  const undo = () => {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] });
    save(previous);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, history.present], present: next, future: history.future.slice(1) });
    save(next);
  };

  return { drawing: history.present, change, undo, redo, canUndo: history.past.length > 0,
    canRedo: history.future.length > 0, saveError };
}
