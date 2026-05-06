import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { evaluateFunctionExpression, formatNumber, type GeomObject } from '../lib/geometry';

type CanvasProps = {
  objects: GeomObject[];
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

const MIN_SCALE = 1e-6;
const MAX_SCALE = 1e8;
const INITIAL_SCALE = 60;
const ZOOM_PER_PIXEL = 1.0015;

export function Canvas({ objects }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ centerX: 0, centerY: 0, scale: INITIAL_SCALE });

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

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.canvas-hud')) return;
    const el = containerRef.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    dragStateRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setView((current) => ({
      ...current,
      centerX: current.centerX - dx / current.scale,
      centerY: current.centerY + dy / current.scale,
    }));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    containerRef.current?.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
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

  return (
    <div
      ref={containerRef}
      className="canvas-surface"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
