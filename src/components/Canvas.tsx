import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createObjectId,
  evaluateFunctionExpression,
  formatNumber,
  type GeomObject,
  type Tool,
} from '../lib/geometry';

type CanvasProps = {
  objects: GeomObject[];
  activeTool: Tool;
  onAddObject: (object: GeomObject) => void;
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

export function Canvas({ objects, activeTool, onAddObject }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ centerX: 0, centerY: 0, scale: INITIAL_SCALE });
  const [drawing, setDrawing] = useState<Drawing>({ kind: 'idle' });
  const [snapHint, setSnapHint] = useState<[number, number] | null>(null);

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

  // Reset any in-progress drawing whenever the user picks a new tool.
  useEffect(() => {
    setDrawing({ kind: 'idle' });
    setSnapHint(null);
  }, [activeTool]);

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
    if (activeTool === 'move') return raw;
    return snapToGrid(raw, grid.step, view.scale).world;
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    dragStateRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
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

    if (activeTool === 'move') {
      startPan(event);
      return;
    }

    const world = eventWorldPos(event);
    const el = containerRef.current!;

    switch (activeTool) {
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
    if (activeTool === 'move') {
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
    const drag = dragStateRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      el?.releasePointerCapture(event.pointerId);
      dragStateRef.current = null;
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
  const zoomLabel = formatScale(view.scale);
  const surfaceClass = `canvas-surface tool-${activeTool}${drawing.kind !== 'idle' ? ' is-drawing' : ''}`;

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
            {objects.map((object) => (
              <GeometryObject key={object.id} object={object} view={view} size={size} worldToScreen={worldToScreen} />
            ))}
          </g>
          <DrawingPreview drawing={drawing} worldToScreen={worldToScreen} view={view} />
          {snapHint && (
            <SnapIndicator world={snapHint} worldToScreen={worldToScreen} />
          )}
        </svg>
      )}
      <div className="canvas-hud">
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
};

function GeometryObject({ object, view, size, worldToScreen }: GeometryObjectProps) {
  switch (object.type) {
    case 'point': {
      const [sx, sy] = worldToScreen(object.x, object.y);
      return (
        <g>
          <circle cx={sx} cy={sy} r={6} className="shape-fill" />
          <ObjectLabel screenX={sx} screenY={sy} label={object.label} />
        </g>
      );
    }
    case 'circle': {
      const [sx, sy] = worldToScreen(object.cx, object.cy);
      return (
        <g>
          <circle cx={sx} cy={sy} r={object.r * view.scale} className="shape-stroke" />
          <ObjectLabel screenX={sx} screenY={sy} label={object.label} />
        </g>
      );
    }
    case 'line': {
      const [x1, y1] = worldToScreen(object.x1, object.y1);
      const [x2, y2] = worldToScreen(object.x2, object.y2);
      return (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} className="shape-stroke" />
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
            className="shape-stroke"
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
            className="shape-stroke polygon-fill"
          />
          {first && <ObjectLabel screenX={first[0]} screenY={first[1]} label={object.label} />}
        </g>
      );
    }
    case 'function':
      return <path d={functionPath(object.expression, view, size, worldToScreen)} className="function-path" />;
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
