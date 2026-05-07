import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createObjectId,
  evaluateFunctionExpression,
  formatNumber,
  type GeomObject,
  type Tool,
} from '../lib/geometry';
import { computeIntersections } from '../lib/intersections';

type CanvasProps = {
  objects: GeomObject[];
  activeTool: Tool;
  onAddObject: (object: GeomObject) => void;
  onUpdateObject: (object: GeomObject) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

type HandleKind =
  | { type: 'point-move' }
  | { type: 'line-end'; index: 0 | 1 }
  | { type: 'rect-corner'; cornerIndex: 0 | 1 | 2 | 3 }
  | { type: 'circle-radius' }
  | { type: 'polygon-vertex'; index: number }
  | { type: 'translate' };

type Handle = {
  kind: HandleKind;
  world: [number, number];
};

type Editing = {
  pointerId: number;
  handle: HandleKind;
  original: GeomObject;
  preview: GeomObject;
  anchorWorld: [number, number];
  startScreenX: number;
  startScreenY: number;
};

type View = {
  centerX: number;
  centerY: number;
  scale: number;
};

type Size = {
  width: number;
  height: number;
};

type Drawing =
  | { kind: 'idle' }
  | { kind: 'line'; start: [number, number]; current: [number, number] }
  | { kind: 'circle'; center: [number, number]; current: [number, number] }
  | { kind: 'rectangle'; start: [number, number]; current: [number, number] }
  | { kind: 'polygon'; points: [number, number][]; current: [number, number] };

const MIN_SCALE = 1e-6;
const MAX_SCALE = 1e8;
const INITIAL_SCALE = 60;
const ZOOM_PER_PIXEL = 1.0015;
const MIN_DRAG_PX = 2;
const SNAP_PX = 10;

export function Canvas({ objects, activeTool, onAddObject, onUpdateObject, selectedId, onSelect }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ centerX: 0, centerY: 0, scale: INITIAL_SCALE });
  const [drawing, setDrawing] = useState<Drawing>({ kind: 'idle' });
  const [snapHint, setSnapHint] = useState<[number, number] | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [selectedIntersection, setSelectedIntersection] = useState<[number, number] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const effectiveTool: Tool = spaceHeld ? 'move' : activeTool;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const worldToScreen = useCallback(
    (wx: number, wy: number): [number, number] => [
      size.width / 2 + (wx - view.centerX) * view.scale,
      size.height / 2 - (wy - view.centerY) * view.scale,
    ],
    [size.width, size.height, view],
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number): [number, number] => [
      (sx - size.width / 2) / view.scale + view.centerX,
      -(sy - size.height / 2) / view.scale + view.centerY,
    ],
    [size.width, size.height, view],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      setView((current) => {
        const factor = Math.pow(ZOOM_PER_PIXEL, -event.deltaY);
        const nextScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
        if (nextScale === current.scale) return current;
        const dx = sx - rect.width / 2;
        const dy = sy - rect.height / 2;
        return {
          scale: nextScale,
          centerX: current.centerX + dx / current.scale - dx / nextScale,
          centerY: current.centerY - dy / current.scale + dy / nextScale,
        };
      });
    },
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Reset any in-progress drawing whenever the active tool changes (including
  // the temporary spacebar-induced switch to Move).
  useEffect(() => {
    setDrawing({ kind: 'idle' });
    setSnapHint(null);
  }, [effectiveTool]);

  // Hold spacebar to temporarily pan, regardless of the selected tool.
  useEffect(() => {
    function handleSpaceDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return;
      if (isInteractiveTarget(event.target)) return;
      event.preventDefault();
      setSpaceHeld(true);
    }
    function handleSpaceUp(event: KeyboardEvent) {
      if (event.code !== 'Space') return;
      setSpaceHeld(false);
    }
    function handleBlur() {
      setSpaceHeld(false);
    }
    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Keyboard shortcuts while drawing.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && drawing.kind !== 'idle') {
        event.preventDefault();
        setDrawing({ kind: 'idle' });
        return;
      }
      if (event.key === 'Enter' && drawing.kind === 'polygon' && drawing.points.length >= 3) {
        event.preventDefault();
        onAddObject({
          id: createObjectId('poly'),
          type: 'polygon',
          points: drawing.points,
        });
        setDrawing({ kind: 'idle' });
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [drawing, onAddObject]);

  function eventWorldPos(event: { clientX: number; clientY: number }): [number, number] {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const raw = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    if (effectiveTool === 'move') return raw;
    return snapToGrid(raw, grid.step, view.scale).world;
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.canvas-hud')) return;

    // Middle button always pans, regardless of tool.
    if (event.button === 1) {
      event.preventDefault();
      startPan(event);
      return;
    }

    if (event.button !== 0) return;

    // Handle drag for resize: only in Drag/Select mode and only when an object
    // is selected — a click on one of its handles starts the edit.
    if (effectiveTool === 'move' && selectedObject && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const raw = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
      const handleHit = pickHandle(getHandles(selectedObject), raw, view.scale);
      if (handleHit) {
        containerRef.current.setPointerCapture(event.pointerId);
        setEditing({
          pointerId: event.pointerId,
          handle: handleHit.kind,
          original: selectedObject,
          preview: selectedObject,
          anchorWorld: raw,
          startScreenX: event.clientX,
          startScreenY: event.clientY,
        });
        return;
      }
    }

    // Translate drag: clicking on the body of any (translatable) object grabs it.
    if (effectiveTool === 'move' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const raw = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
      const objectHit = pickObject(objects, raw, view.scale, size);
      if (objectHit && objectHit.type !== 'function') {
        if (objectHit.id !== selectedId) onSelect(objectHit.id);
        setSelectedIntersection(null);
        containerRef.current.setPointerCapture(event.pointerId);
        setEditing({
          pointerId: event.pointerId,
          handle: { type: 'translate' },
          original: objectHit,
          preview: objectHit,
          anchorWorld: raw,
          startScreenX: event.clientX,
          startScreenY: event.clientY,
        });
        return;
      }
    }

    if (effectiveTool === 'move') {
      startPan(event);
      return;
    }

    const world = eventWorldPos(event);
    const el = containerRef.current!;

    switch (effectiveTool) {
      case 'point':
        onAddObject({
          id: createObjectId('point'),
          type: 'point',
          x: world[0],
          y: world[1],
        });
        return;
      case 'line':
        el.setPointerCapture(event.pointerId);
        setDrawing({ kind: 'line', start: world, current: world });
        return;
      case 'circle':
        el.setPointerCapture(event.pointerId);
        setDrawing({ kind: 'circle', center: world, current: world });
        return;
      case 'rectangle':
        el.setPointerCapture(event.pointerId);
        setDrawing({ kind: 'rectangle', start: world, current: world });
        return;
      case 'polygon': {
        if (drawing.kind === 'polygon' && event.detail >= 2 && drawing.points.length >= 3) {
          onAddObject({
            id: createObjectId('poly'),
            type: 'polygon',
            points: drawing.points,
          });
          setDrawing({ kind: 'idle' });
          return;
        }
        if (drawing.kind === 'polygon') {
          setDrawing({
            kind: 'polygon',
            points: [...drawing.points, world],
            current: world,
          });
        } else {
          setDrawing({ kind: 'polygon', points: [world], current: world });
        }
        return;
      }
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (editing && editing.pointerId === event.pointerId) {
      const el = containerRef.current;
      if (!el) return;
      const movedPx = Math.hypot(event.clientX - editing.startScreenX, event.clientY - editing.startScreenY);
      if (editing.handle.type === 'translate' && movedPx < 4) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const raw = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
      let next: GeomObject;
      if (editing.handle.type === 'translate') {
        const dx = raw[0] - editing.anchorWorld[0];
        const dy = raw[1] - editing.anchorWorld[1];
        const [snapDx, snapDy] = snapDelta(dx, dy, grid.step, view.scale);
        next = translateObject(editing.original, snapDx, snapDy);
        setSnapHint(null);
      } else {
        const snap = snapToGrid(raw, grid.step, view.scale);
        next = applyHandleDrag(editing.original, editing.handle, snap.world);
        setSnapHint(snap.snapped ? snap.world : null);
      }
      setEditing((current) => (current ? { ...current, preview: next } : current));
      return;
    }

    const drag = dragStateRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      setView((current) => ({
        ...current,
        centerX: current.centerX - dx / current.scale,
        centerY: current.centerY + dy / current.scale,
      }));
      return;
    }

    updateSnapHint(event);

    if (drawing.kind === 'idle') return;

    const world = eventWorldPos(event);
    setDrawing((current) => {
      switch (current.kind) {
        case 'line':
          return { ...current, current: world };
        case 'circle':
          return { ...current, current: world };
        case 'rectangle':
          return { ...current, current: world };
        case 'polygon':
          return { ...current, current: world };
        default:
          return current;
      }
    });
  }

  function updateSnapHint(event: { clientX: number; clientY: number }) {
    if (effectiveTool === 'move') {
      setSnapHint((current) => (current === null ? current : null));
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const snap = snapToGrid(raw, grid.step, view.scale);
    if (!snap.snapped) {
      setSnapHint((current) => (current === null ? current : null));
      return;
    }
    setSnapHint((current) => {
      if (current && current[0] === snap.world[0] && current[1] === snap.world[1]) return current;
      return snap.world;
    });
  }

  function handlePointerLeave() {
    setSnapHint(null);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (editing && editing.pointerId === event.pointerId) {
      el?.releasePointerCapture(event.pointerId);
      const { original, preview, anchorWorld, handle, startScreenX, startScreenY } = editing;
      const movedPx = Math.hypot(event.clientX - startScreenX, event.clientY - startScreenY);
      setEditing(null);
      setSnapHint(null);
      if (geometryChanged(original, preview)) {
        onUpdateObject(preview);
        return;
      }
      // No-movement click on an object body — let intersection points take priority
      // so clicking an intersection that sits on a shape still shows its coords.
      if (handle.type === 'translate' && movedPx < 4) {
        const intersectionHit = pickIntersection(intersections, anchorWorld, view.scale);
        if (intersectionHit) {
          setSelectedIntersection(intersectionHit);
          onSelect(null);
        }
      }
      return;
    }
    const drag = dragStateRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      el?.releasePointerCapture(event.pointerId);
      dragStateRef.current = null;
      const moved = Math.hypot(drag.lastX - drag.startX, drag.lastY - drag.startY);
      if (moved < 4 && effectiveTool === 'move' && el) {
        const rect = el.getBoundingClientRect();
        const sx = drag.startX - rect.left;
        const sy = drag.startY - rect.top;
        const world = screenToWorld(sx, sy);
        const intersectionHit = pickIntersection(intersections, world, view.scale);
        if (intersectionHit) {
          setSelectedIntersection(intersectionHit);
          onSelect(null);
        } else {
          setSelectedIntersection(null);
          const hit = pickObject(objects, world, view.scale, size);
          onSelect(hit ? hit.id : null);
        }
      }
      return;
    }

    if (drawing.kind === 'idle') return;

    el?.releasePointerCapture(event.pointerId);
    const world = eventWorldPos(event);

    if (drawing.kind === 'line') {
      const [sx, sy] = drawing.start;
      if (worldDragPixels([sx, sy], world, view.scale) >= MIN_DRAG_PX) {
        onAddObject({
          id: createObjectId('line'),
          type: 'line',
          x1: sx,
          y1: sy,
          x2: world[0],
          y2: world[1],
        });
      }
      setDrawing({ kind: 'idle' });
      return;
    }
    if (drawing.kind === 'circle') {
      const [cx, cy] = drawing.center;
      const r = Math.hypot(world[0] - cx, world[1] - cy);
      if (r * view.scale >= MIN_DRAG_PX) {
        onAddObject({
          id: createObjectId('circle'),
          type: 'circle',
          cx,
          cy,
          r,
        });
      }
      setDrawing({ kind: 'idle' });
      return;
    }
    if (drawing.kind === 'rectangle') {
      const [sx, sy] = drawing.start;
      const w = world[0] - sx;
      const h = world[1] - sy;
      if (Math.abs(w) * view.scale >= MIN_DRAG_PX && Math.abs(h) * view.scale >= MIN_DRAG_PX) {
        onAddObject({
          id: createObjectId('rect'),
          type: 'rectangle',
          x: sx,
          y: sy,
          w,
          h,
        });
      }
      setDrawing({ kind: 'idle' });
      return;
    }
    // Polygon: pointerup is a no-op; commit happens via double-click or Enter.
  }

  function resetView() {
    setView({ centerX: 0, centerY: 0, scale: INITIAL_SCALE });
  }

  function zoomBy(factor: number) {
    setView((current) => {
      const nextScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      if (nextScale === current.scale) return current;
      return { ...current, scale: nextScale };
    });
  }

  const grid = useMemo(() => buildGrid(view, size), [view, size]);
  const selectedObject = useMemo(
    () => (selectedId ? objects.find((object) => object.id === selectedId) ?? null : null),
    [objects, selectedId],
  );
  const previewObjects = useMemo(() => {
    if (!editing) return objects;
    return objects.map((object) => (object.id === editing.preview.id ? editing.preview : object));
  }, [objects, editing]);
  const intersections = useMemo(() => computeIntersections(previewObjects), [previewObjects]);
  const handles = useMemo(() => {
    if (!selectedObject) return [] as Handle[];
    if (editing) return getHandles(editing.preview);
    return getHandles(selectedObject);
  }, [selectedObject, editing]);

  useEffect(() => {
    if (!selectedIntersection) return;
    const [sx, sy] = selectedIntersection;
    const stillExists = intersections.some(([x, y]) => Math.abs(x - sx) < 1e-6 && Math.abs(y - sy) < 1e-6);
    if (!stillExists) setSelectedIntersection(null);
  }, [intersections, selectedIntersection]);
  const zoomLabel = formatScale(view.scale);
  const surfaceClass = [
    'canvas-surface',
    `tool-${effectiveTool}`,
    drawing.kind !== 'idle' ? 'is-drawing' : '',
    editing?.handle.type === 'translate' ? 'is-translating' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={containerRef}
      className={surfaceClass}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {size.width > 0 && size.height > 0 && (
        <svg
          className="canvas-svg"
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
        >
          <g className="grid-minor">
            {grid.minorVertical.map((line) => (
              <line key={`mv-${line.value}`} x1={line.screen} y1={0} x2={line.screen} y2={size.height} />
            ))}
            {grid.minorHorizontal.map((line) => (
              <line key={`mh-${line.value}`} x1={0} y1={line.screen} x2={size.width} y2={line.screen} />
            ))}
          </g>
          <g className="grid-major">
            {grid.majorVertical.map((line) => (
              <line key={`Mv-${line.value}`} x1={line.screen} y1={0} x2={line.screen} y2={size.height} />
            ))}
            {grid.majorHorizontal.map((line) => (
              <line key={`Mh-${line.value}`} x1={0} y1={line.screen} x2={size.width} y2={line.screen} />
            ))}
          </g>
          <g className="axes">
            {grid.axisX !== null && (
              <line x1={0} y1={grid.axisX} x2={size.width} y2={grid.axisX} />
            )}
            {grid.axisY !== null && (
              <line x1={grid.axisY} y1={0} x2={grid.axisY} y2={size.height} />
            )}
          </g>
          <g className="grid-labels">
            {grid.majorVertical.map((line) =>
              line.value === 0 ? null : (
                <text
                  key={`lvx-${line.value}`}
                  x={line.screen + 4}
                  y={(grid.axisX ?? 16) - 4}
                  className="grid-label"
                >
                  {formatGridValue(line.value, grid.step)}
                </text>
              ),
            )}
            {grid.majorHorizontal.map((line) =>
              line.value === 0 ? null : (
                <text
                  key={`lhy-${line.value}`}
                  x={(grid.axisY ?? 4) + 4}
                  y={line.screen - 4}
                  className="grid-label"
                >
                  {formatGridValue(line.value, grid.step)}
                </text>
              ),
            )}
            {grid.axisX !== null && grid.axisY !== null && (
              <text x={grid.axisY + 4} y={grid.axisX - 4} className="grid-label origin-label">
                0
              </text>
            )}
          </g>
          <g className="objects-layer">
            {previewObjects.map((object) => (
              <GeometryObject
                key={object.id}
                object={object}
                view={view}
                size={size}
                worldToScreen={worldToScreen}
                isSelected={object.id === selectedId}
              />
            ))}
          </g>
          {handles.length > 0 && (
            <g className="handles-layer">
              {handles.map((handle, index) => {
                const [hx, hy] = worldToScreen(handle.world[0], handle.world[1]);
                return (
                  <rect
                    key={`handle-${index}`}
                    x={hx - 4.5}
                    y={hy - 4.5}
                    width={9}
                    height={9}
                    className="edit-handle"
                  />
                );
              })}
            </g>
          )}
          <g className="intersections-layer">
            {intersections.map(([wx, wy], index) => {
              const [sx, sy] = worldToScreen(wx, wy);
              const isSelected =
                !!selectedIntersection &&
                Math.abs(selectedIntersection[0] - wx) < 1e-6 &&
                Math.abs(selectedIntersection[1] - wy) < 1e-6;
              return (
                <g key={`isect-${index}`}>
                  <circle cx={sx} cy={sy} r={isSelected ? 8 : 6} className="intersection-halo" />
                  <circle cx={sx} cy={sy} r={isSelected ? 4 : 3} className="intersection-dot" />
                  {isSelected && (
                    <text x={sx + 10} y={sy - 10} className="intersection-label">
                      ({formatNumber(wx)}, {formatNumber(wy)})
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <DrawingPreview drawing={drawing} worldToScreen={worldToScreen} view={view} />
          {snapHint && (
            <SnapIndicator world={snapHint} worldToScreen={worldToScreen} />
          )}
        </svg>
      )}
      <div
        className="canvas-hud"
        onMouseDown={(event) => {
          if (event.target instanceof HTMLButtonElement) {
            event.preventDefault();
          }
        }}
      >
        <button
          type="button"
          className="hud-button hud-icon"
          onClick={() => zoomBy(1 / 1.5)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="zoom-value" aria-live="polite">{zoomLabel}</span>
        <button
          type="button"
          className="hud-button hud-icon"
          onClick={() => zoomBy(1.5)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="hud-divider" aria-hidden="true" />
        <button type="button" className="hud-button" onClick={resetView} title="Reset view">
          Reset view
        </button>
      </div>
    </div>
  );
}

type DrawingPreviewProps = {
  drawing: Drawing;
  worldToScreen: (x: number, y: number) => [number, number];
  view: View;
};

function DrawingPreview({ drawing, worldToScreen, view }: DrawingPreviewProps) {
  if (drawing.kind === 'idle') return null;

  if (drawing.kind === 'line') {
    const [x1, y1] = worldToScreen(drawing.start[0], drawing.start[1]);
    const [x2, y2] = worldToScreen(drawing.current[0], drawing.current[1]);
    return (
      <g className="drawing-preview">
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="preview-stroke" />
        <circle cx={x1} cy={y1} r={3} className="preview-anchor" />
        <circle cx={x2} cy={y2} r={3} className="preview-anchor" />
      </g>
    );
  }

  if (drawing.kind === 'circle') {
    const [cx, cy] = worldToScreen(drawing.center[0], drawing.center[1]);
    const r = Math.hypot(drawing.current[0] - drawing.center[0], drawing.current[1] - drawing.center[1]) * view.scale;
    const [px, py] = worldToScreen(drawing.current[0], drawing.current[1]);
    return (
      <g className="drawing-preview">
        <circle cx={cx} cy={cy} r={r} className="preview-stroke" />
        <line x1={cx} y1={cy} x2={px} y2={py} className="preview-helper" />
        <circle cx={cx} cy={cy} r={3} className="preview-anchor" />
      </g>
    );
  }

  if (drawing.kind === 'rectangle') {
    const [sx, sy] = worldToScreen(drawing.start[0], drawing.start[1]);
    const [ex, ey] = worldToScreen(drawing.current[0], drawing.current[1]);
    const x = Math.min(sx, ex);
    const y = Math.min(sy, ey);
    const w = Math.abs(ex - sx);
    const h = Math.abs(ey - sy);
    return (
      <g className="drawing-preview">
        <rect x={x} y={y} width={w} height={h} className="preview-stroke" />
        <circle cx={sx} cy={sy} r={3} className="preview-anchor" />
        <circle cx={ex} cy={ey} r={3} className="preview-anchor" />
      </g>
    );
  }

  if (drawing.kind === 'polygon') {
    const placedScreen = drawing.points.map(([x, y]) => worldToScreen(x, y));
    const [cx, cy] = worldToScreen(drawing.current[0], drawing.current[1]);
    const linePoints = [...placedScreen.map(([x, y]) => `${x},${y}`), `${cx},${cy}`].join(' ');
    return (
      <g className="drawing-preview">
        {placedScreen.length >= 1 && (
          <polyline points={linePoints} className="preview-stroke" />
        )}
        {placedScreen.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r={3} className="preview-anchor" />
        ))}
        <circle cx={cx} cy={cy} r={2.5} className="preview-cursor" />
      </g>
    );
  }

  return null;
}

type GeometryObjectProps = {
  object: GeomObject;
  view: View;
  size: Size;
  worldToScreen: (x: number, y: number) => [number, number];
  isSelected: boolean;
};

function GeometryObject({ object, view, size, worldToScreen, isSelected }: GeometryObjectProps) {
  const fillClass = `shape-fill${isSelected ? ' is-selected' : ''}`;
  const strokeClass = `shape-stroke${isSelected ? ' is-selected' : ''}`;
  switch (object.type) {
    case 'point': {
      const [sx, sy] = worldToScreen(object.x, object.y);
      return (
        <g>
          <circle cx={sx} cy={sy} r={isSelected ? 7 : 6} className={fillClass} />
          <ObjectLabel screenX={sx} screenY={sy} label={object.label} />
        </g>
      );
    }
    case 'circle': {
      const [sx, sy] = worldToScreen(object.cx, object.cy);
      return (
        <g>
          <circle cx={sx} cy={sy} r={object.r * view.scale} className={strokeClass} />
          <ObjectLabel screenX={sx} screenY={sy} label={object.label} />
        </g>
      );
    }
    case 'line': {
      const [x1, y1] = worldToScreen(object.x1, object.y1);
      const [x2, y2] = worldToScreen(object.x2, object.y2);
      return (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} className={strokeClass} />
          <ObjectLabel screenX={(x1 + x2) / 2} screenY={(y1 + y2) / 2} label={object.label} />
        </g>
      );
    }
    case 'rectangle': {
      const left = Math.min(object.x, object.x + object.w);
      const top = Math.max(object.y, object.y + object.h);
      const [sx, sy] = worldToScreen(left, top);
      return (
        <g>
          <rect
            x={sx}
            y={sy}
            width={Math.abs(object.w) * view.scale}
            height={Math.abs(object.h) * view.scale}
            className={strokeClass}
          />
          <ObjectLabel
            screenX={sx + (Math.abs(object.w) * view.scale) / 2}
            screenY={sy + (Math.abs(object.h) * view.scale) / 2}
            label={object.label}
          />
        </g>
      );
    }
    case 'polygon': {
      const points = object.points.map(([x, y]) => worldToScreen(x, y));
      const [first] = points;
      return (
        <g>
          <polygon
            points={points.map(([x, y]) => `${x},${y}`).join(' ')}
            className={`${strokeClass} polygon-fill`}
          />
          {first && <ObjectLabel screenX={first[0]} screenY={first[1]} label={object.label} />}
        </g>
      );
    }
    case 'function':
      return (
        <path
          d={functionPath(object.expression, view, size, worldToScreen)}
          className={`function-path${isSelected ? ' is-selected' : ''}`}
        />
      );
    default:
      return null;
  }
}

function ObjectLabel({ screenX, screenY, label }: { screenX: number; screenY: number; label?: string }) {
  if (!label?.trim()) return null;
  return (
    <text x={screenX + 10} y={screenY - 10} className="object-label">
      {label}
    </text>
  );
}

function functionPath(
  expression: string,
  view: View,
  size: Size,
  worldToScreen: (x: number, y: number) => [number, number],
): string {
  const samples = Math.max(160, Math.min(1200, Math.floor(size.width)));
  const wxMin = view.centerX - size.width / 2 / view.scale;
  const wxMax = view.centerX + size.width / 2 / view.scale;
  const step = (wxMax - wxMin) / samples;
  let path = '';
  let penDown = false;
  let lastY: number | null = null;
  const yLimit = size.height * 8;

  for (let index = 0; index <= samples; index += 1) {
    const x = wxMin + step * index;
    const y = evaluateFunctionExpression(expression, x);

    if (y === null || !Number.isFinite(y)) {
      penDown = false;
      lastY = null;
      continue;
    }

    const [sx, sy] = worldToScreen(x, y);
    if (Math.abs(sy) > yLimit) {
      penDown = false;
      lastY = null;
      continue;
    }

    if (lastY !== null && Math.abs(sy - lastY) > size.height) {
      penDown = false;
    }
    path += `${penDown ? 'L' : 'M'} ${sx} ${sy} `;
    penDown = true;
    lastY = sy;
  }

  return path.trim();
}

type GridLine = { value: number; screen: number };

type Grid = {
  step: number;
  majorVertical: GridLine[];
  majorHorizontal: GridLine[];
  minorVertical: GridLine[];
  minorHorizontal: GridLine[];
  axisX: number | null;
  axisY: number | null;
};

function buildGrid(view: View, size: Size): Grid {
  if (size.width === 0 || size.height === 0) {
    return {
      step: 1,
      majorVertical: [],
      majorHorizontal: [],
      minorVertical: [],
      minorHorizontal: [],
      axisX: null,
      axisY: null,
    };
  }

  const targetPx = 90;
  const targetUnits = targetPx / view.scale;
  const exp = Math.floor(Math.log10(targetUnits));
  const base = Math.pow(10, exp);
  const remainder = targetUnits / base;
  let major: number;
  if (remainder < 1.5) major = base;
  else if (remainder < 3.5) major = 2 * base;
  else if (remainder < 7.5) major = 5 * base;
  else major = 10 * base;

  const minor = major / 5;

  const wxMin = view.centerX - size.width / 2 / view.scale;
  const wxMax = view.centerX + size.width / 2 / view.scale;
  const wyMin = view.centerY - size.height / 2 / view.scale;
  const wyMax = view.centerY + size.height / 2 / view.scale;

  const majorVertical = collectLines(wxMin, wxMax, major, (wx) => screenX(wx, view, size));
  const majorHorizontal = collectLines(wyMin, wyMax, major, (wy) => screenY(wy, view, size));
  const minorVertical = collectLines(wxMin, wxMax, minor, (wx) => screenX(wx, view, size)).filter(
    (line) => Math.abs(line.value / major - Math.round(line.value / major)) > 1e-6,
  );
  const minorHorizontal = collectLines(wyMin, wyMax, minor, (wy) => screenY(wy, view, size)).filter(
    (line) => Math.abs(line.value / major - Math.round(line.value / major)) > 1e-6,
  );

  const axisXScreen = screenY(0, view, size);
  const axisYScreen = screenX(0, view, size);

  return {
    step: major,
    majorVertical,
    majorHorizontal,
    minorVertical,
    minorHorizontal,
    axisX: axisXScreen >= 0 && axisXScreen <= size.height ? axisXScreen : null,
    axisY: axisYScreen >= 0 && axisYScreen <= size.width ? axisYScreen : null,
  };
}

function collectLines(min: number, max: number, step: number, project: (value: number) => number): GridLine[] {
  const lines: GridLine[] = [];
  const start = Math.ceil(min / step) * step;
  const maxLines = 400;
  let count = 0;
  for (let value = start; value <= max && count < maxLines; value += step, count += 1) {
    const snapped = Math.round(value / step) * step;
    lines.push({ value: snapped, screen: project(snapped) });
  }
  return lines;
}

function screenX(wx: number, view: View, size: Size): number {
  return size.width / 2 + (wx - view.centerX) * view.scale;
}

function screenY(wy: number, view: View, size: Size): number {
  return size.height / 2 - (wy - view.centerY) * view.scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatGridValue(value: number, step: number): string {
  if (step >= 1) return formatNumber(Math.round(value));
  const decimals = Math.min(6, Math.max(0, -Math.floor(Math.log10(step))));
  const rounded = Number(value.toFixed(decimals));
  return formatNumber(rounded);
}

function formatScale(scale: number): string {
  if (scale >= 1) return `${scale >= 100 ? scale.toFixed(0) : scale.toFixed(1)}×`;
  return `1/${(1 / scale).toFixed(scale > 0.01 ? 1 : 0)}×`;
}

function worldDragPixels(a: [number, number], b: [number, number], scale: number): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]) * scale;
}

const PICK_TOLERANCE_PX = 8;
const INTERSECTION_PICK_PX = 10;

function pickIntersection(
  intersections: [number, number][],
  world: [number, number],
  scale: number,
): [number, number] | null {
  let best: { point: [number, number]; distance: number } | null = null;
  for (const point of intersections) {
    const distance = Math.hypot(point[0] - world[0], point[1] - world[1]) * scale;
    if (distance <= INTERSECTION_PICK_PX && (!best || distance < best.distance)) {
      best = { point, distance };
    }
  }
  return best?.point ?? null;
}

function pickObject(
  objects: GeomObject[],
  world: [number, number],
  scale: number,
  size: Size,
): GeomObject | null {
  let best: { object: GeomObject; distance: number } | null = null;
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    const distance = hitDistancePx(object, world, scale, size);
    if (distance <= PICK_TOLERANCE_PX && (!best || distance < best.distance)) {
      best = { object, distance };
    }
  }
  return best?.object ?? null;
}

function hitDistancePx(object: GeomObject, world: [number, number], scale: number, size: Size): number {
  const [wx, wy] = world;
  switch (object.type) {
    case 'point':
      return Math.hypot(wx - object.x, wy - object.y) * scale;
    case 'circle':
      return Math.abs(Math.hypot(wx - object.cx, wy - object.cy) - object.r) * scale;
    case 'line':
      return distanceToSegment(world, [object.x1, object.y1], [object.x2, object.y2]) * scale;
    case 'rectangle': {
      const xLow = Math.min(object.x, object.x + object.w);
      const xHigh = Math.max(object.x, object.x + object.w);
      const yLow = Math.min(object.y, object.y + object.h);
      const yHigh = Math.max(object.y, object.y + object.h);
      const corners: [number, number][] = [
        [xLow, yLow],
        [xHigh, yLow],
        [xHigh, yHigh],
        [xLow, yHigh],
      ];
      let min = Infinity;
      for (let i = 0; i < 4; i += 1) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        const d = distanceToSegment(world, a, b);
        if (d < min) min = d;
      }
      return min * scale;
    }
    case 'polygon': {
      if (pointInPolygon(world, object.points)) return 0;
      let min = Infinity;
      for (let i = 0; i < object.points.length; i += 1) {
        const a = object.points[i];
        const b = object.points[(i + 1) % object.points.length];
        const d = distanceToSegment(world, a, b);
        if (d < min) min = d;
      }
      return min * scale;
    }
    case 'function': {
      const wxMin = wx - (size.width / 2) / scale;
      const wxMax = wx + (size.width / 2) / scale;
      const samples = 80;
      const range = wxMax - wxMin;
      const step = range / samples;
      let min = Infinity;
      let prev: [number, number] | null = null;
      for (let i = 0; i <= samples; i += 1) {
        const sx = wxMin + step * i;
        const sy = evaluateFunctionExpression(object.expression, sx);
        if (sy === null || !Number.isFinite(sy)) {
          prev = null;
          continue;
        }
        const point: [number, number] = [sx, sy];
        if (prev) {
          const d = distanceToSegment(world, prev, point);
          if (d < min) min = d;
        }
        prev = point;
      }
      return min * scale;
    }
    default:
      return Infinity;
  }
}

function distanceToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

function pointInPolygon(p: [number, number], polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

const HANDLE_PICK_PX = 11;

function getHandles(object: GeomObject): Handle[] {
  switch (object.type) {
    case 'point':
      return [{ kind: { type: 'point-move' }, world: [object.x, object.y] }];
    case 'line':
      return [
        { kind: { type: 'line-end', index: 0 }, world: [object.x1, object.y1] },
        { kind: { type: 'line-end', index: 1 }, world: [object.x2, object.y2] },
      ];
    case 'rectangle': {
      const x = object.x;
      const y = object.y;
      const xw = object.x + object.w;
      const yh = object.y + object.h;
      return [
        { kind: { type: 'rect-corner', cornerIndex: 0 }, world: [x, y] },
        { kind: { type: 'rect-corner', cornerIndex: 1 }, world: [xw, y] },
        { kind: { type: 'rect-corner', cornerIndex: 2 }, world: [xw, yh] },
        { kind: { type: 'rect-corner', cornerIndex: 3 }, world: [x, yh] },
      ];
    }
    case 'circle':
      return [{ kind: { type: 'circle-radius' }, world: [object.cx + object.r, object.cy] }];
    case 'polygon':
      return object.points.map((point, index) => ({
        kind: { type: 'polygon-vertex', index },
        world: point,
      }));
    default:
      return [];
  }
}

function pickHandle(handles: Handle[], world: [number, number], scale: number): Handle | null {
  let best: { handle: Handle; distance: number } | null = null;
  for (const handle of handles) {
    const distance = Math.hypot(handle.world[0] - world[0], handle.world[1] - world[1]) * scale;
    if (distance <= HANDLE_PICK_PX && (!best || distance < best.distance)) {
      best = { handle, distance };
    }
  }
  return best?.handle ?? null;
}

function applyHandleDrag(original: GeomObject, handle: HandleKind, cursor: [number, number]): GeomObject {
  switch (handle.type) {
    case 'point-move':
      if (original.type !== 'point') return original;
      return { ...original, x: cursor[0], y: cursor[1] };
    case 'line-end': {
      if (original.type !== 'line') return original;
      if (handle.index === 0) return { ...original, x1: cursor[0], y1: cursor[1] };
      return { ...original, x2: cursor[0], y2: cursor[1] };
    }
    case 'rect-corner': {
      if (original.type !== 'rectangle') return original;
      const corners: [number, number][] = [
        [original.x, original.y],
        [original.x + original.w, original.y],
        [original.x + original.w, original.y + original.h],
        [original.x, original.y + original.h],
      ];
      const opposite = corners[(handle.cornerIndex + 2) % 4];
      const x = Math.min(cursor[0], opposite[0]);
      const y = Math.min(cursor[1], opposite[1]);
      const w = Math.abs(cursor[0] - opposite[0]);
      const h = Math.abs(cursor[1] - opposite[1]);
      return { ...original, x, y, w, h };
    }
    case 'circle-radius': {
      if (original.type !== 'circle') return original;
      const r = Math.hypot(cursor[0] - original.cx, cursor[1] - original.cy);
      if (!(r > 0)) return original;
      return { ...original, r };
    }
    case 'polygon-vertex': {
      if (original.type !== 'polygon') return original;
      const points = original.points.map((point, index) => (index === handle.index ? cursor : point));
      return { ...original, points };
    }
    default:
      return original;
  }
}

function geometryChanged(a: GeomObject, b: GeomObject): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function translateObject(object: GeomObject, dx: number, dy: number): GeomObject {
  switch (object.type) {
    case 'point':
      return { ...object, x: object.x + dx, y: object.y + dy };
    case 'line':
      return {
        ...object,
        x1: object.x1 + dx,
        y1: object.y1 + dy,
        x2: object.x2 + dx,
        y2: object.y2 + dy,
      };
    case 'rectangle':
      return { ...object, x: object.x + dx, y: object.y + dy };
    case 'circle':
      return { ...object, cx: object.cx + dx, cy: object.cy + dy };
    case 'polygon':
      return {
        ...object,
        points: object.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
      };
    default:
      return object;
  }
}

function snapDelta(dx: number, dy: number, step: number, scale: number): [number, number] {
  if (!(step > 0)) return [dx, dy];
  const sx = Math.round(dx / step) * step;
  const sy = Math.round(dy / step) * step;
  const offsetPx = Math.hypot(dx - sx, dy - sy) * scale;
  if (offsetPx <= SNAP_PX) return [sx, sy];
  return [dx, dy];
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true;
  return target.isContentEditable;
}

function snapToGrid(
  world: [number, number],
  step: number,
  scale: number,
): { world: [number, number]; snapped: boolean } {
  if (!(step > 0)) return { world, snapped: false };
  const sx = Math.round(world[0] / step) * step;
  const sy = Math.round(world[1] / step) * step;
  const dxPx = (world[0] - sx) * scale;
  const dyPx = (world[1] - sy) * scale;
  if (Math.hypot(dxPx, dyPx) <= SNAP_PX) {
    return { world: [sx, sy], snapped: true };
  }
  return { world, snapped: false };
}

type SnapIndicatorProps = {
  world: [number, number];
  worldToScreen: (x: number, y: number) => [number, number];
};

function SnapIndicator({ world, worldToScreen }: SnapIndicatorProps) {
  const [sx, sy] = worldToScreen(world[0], world[1]);
  return (
    <g className="snap-indicator">
      <circle cx={sx} cy={sy} r={6} className="snap-ring" />
      <circle cx={sx} cy={sy} r={1.5} className="snap-dot" />
    </g>
  );
}
