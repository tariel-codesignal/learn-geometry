import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { createObjectId, type GeomObject } from '../lib/geometry';

type Tool = 'point' | 'line' | 'circle' | 'rectangle' | 'polygon';

type ToolbarProps = {
  onAddObject: (object: GeomObject) => void;
};

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'point', label: 'Point', icon: <PointIcon /> },
  { id: 'line', label: 'Line', icon: <LineIcon /> },
  { id: 'circle', label: 'Circle', icon: <CircleIcon /> },
  { id: 'rectangle', label: 'Rectangle', icon: <RectIcon /> },
  { id: 'polygon', label: 'Polygon', icon: <PolyIcon /> },
];

function PointIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="16" x2="16" y2="4" />
      <circle cx="4" cy="16" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="4" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="6.5" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5.5" width="13" height="9" />
    </svg>
  );
}

function PolyIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 3.5L16.5 8L14 16H6L3.5 8Z" />
    </svg>
  );
}

export function Toolbar({ onAddObject }: ToolbarProps) {
  const [activeTool, setActiveTool] = useState<Tool>('point');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => getFields(activeTool), [activeTool]);

  function updateValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function selectTool(tool: Tool) {
    setActiveTool(tool);
    setValues({});
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildObject(activeTool, values);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onAddObject(result.object);
    setValues({});
    setError(null);
  }

  const activeLabel = TOOLS.find((tool) => tool.id === activeTool)?.label ?? '';

  return (
    <header className="toolbar">
      <div className="tool-buttons" role="tablist" aria-label="Geometry tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`tool-button ${tool.id === activeTool ? 'is-active' : ''}`}
            onClick={() => selectTool(tool.id)}
            role="tab"
            aria-selected={tool.id === activeTool}
            aria-label={tool.label}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <form className="tool-form" onSubmit={handleSubmit}>
        {fields.map((field) => (
          <label key={field.name} className="tool-input">
            <span>{field.label}</span>
            {field.type === 'textarea' ? (
              <textarea
                value={values[field.name] ?? ''}
                onChange={(event) => updateValue(field.name, event.target.value)}
                placeholder={field.placeholder}
                rows={1}
              />
            ) : (
              <input
                type={field.type}
                value={values[field.name] ?? ''}
                onChange={(event) => updateValue(field.name, event.target.value)}
                placeholder={field.placeholder}
                step="any"
              />
            )}
          </label>
        ))}

        <button type="submit" className="tool-submit">
          Add {activeLabel}
        </button>
        {error && <p className="form-error compact">{error}</p>}
      </form>
    </header>
  );
}

function getFields(tool: Tool): { name: string; label: string; type: 'number' | 'text' | 'textarea'; placeholder?: string }[] {
  const labelField = { name: 'label', label: 'Label', type: 'text' as const, placeholder: 'optional' };

  switch (tool) {
    case 'point':
      return [
        { name: 'x', label: 'x', type: 'number' },
        { name: 'y', label: 'y', type: 'number' },
        labelField,
      ];
    case 'line':
      return [
        { name: 'x1', label: 'x₁', type: 'number' },
        { name: 'y1', label: 'y₁', type: 'number' },
        { name: 'x2', label: 'x₂', type: 'number' },
        { name: 'y2', label: 'y₂', type: 'number' },
        labelField,
      ];
    case 'circle':
      return [
        { name: 'cx', label: 'cx', type: 'number' },
        { name: 'cy', label: 'cy', type: 'number' },
        { name: 'r', label: 'r', type: 'number' },
        labelField,
      ];
    case 'rectangle':
      return [
        { name: 'x', label: 'x', type: 'number' },
        { name: 'y', label: 'y', type: 'number' },
        { name: 'w', label: 'w', type: 'number' },
        { name: 'h', label: 'h', type: 'number' },
        labelField,
      ];
    case 'polygon':
      return [
        { name: 'points', label: 'Points', type: 'textarea', placeholder: '0,0; 4,0; 2,3' },
        labelField,
      ];
    default:
      return [];
  }
}

function buildObject(tool: Tool, values: Record<string, string>): { ok: true; object: GeomObject } | { ok: false; error: string } {
  const label = values.label?.trim() || undefined;

  switch (tool) {
    case 'point':
      return requireNumbers(values, ['x', 'y'], (numbers) => ({
        id: createObjectId('point'),
        type: 'point',
        x: numbers.x,
        y: numbers.y,
        label,
      }));
    case 'line':
      return requireNumbers(values, ['x1', 'y1', 'x2', 'y2'], (numbers) => ({
        id: createObjectId('line'),
        type: 'line',
        x1: numbers.x1,
        y1: numbers.y1,
        x2: numbers.x2,
        y2: numbers.y2,
        label,
      }));
    case 'circle':
      return requireNumbers(values, ['cx', 'cy', 'r'], (numbers) => {
        if (numbers.r <= 0) {
          throw new Error('Radius must be greater than zero.');
        }

        return {
          id: createObjectId('circle'),
          type: 'circle',
          cx: numbers.cx,
          cy: numbers.cy,
          r: numbers.r,
          label,
        };
      });
    case 'rectangle':
      return requireNumbers(values, ['x', 'y', 'w', 'h'], (numbers) => ({
        id: createObjectId('rect'),
        type: 'rectangle',
        x: numbers.x,
        y: numbers.y,
        w: numbers.w,
        h: numbers.h,
        label,
      }));
    case 'polygon': {
      const points = parsePoints(values.points);
      if (!points) {
        return { ok: false, error: 'Enter at least three points as x,y; x,y; x,y.' };
      }

      return {
        ok: true,
        object: {
          id: createObjectId('poly'),
          type: 'polygon',
          points,
          label,
        },
      };
    }
    default:
      return { ok: false, error: 'Unknown tool.' };
  }
}

function requireNumbers(
  values: Record<string, string>,
  keys: string[],
  build: (numbers: Record<string, number>) => GeomObject,
): { ok: true; object: GeomObject } | { ok: false; error: string } {
  const numbers: Record<string, number> = {};

  for (const key of keys) {
    const value = Number(values[key]);
    if (!Number.isFinite(value)) {
      return { ok: false, error: `Enter a valid number for ${key}.` };
    }
    numbers[key] = value;
  }

  try {
    return { ok: true, object: build(numbers) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid object values.' };
  }
}

function parsePoints(value = ''): [number, number][] | null {
  const points = value
    .split(';')
    .map((point) => point.trim())
    .filter(Boolean)
    .map((point) => {
      const [x, y] = point.split(',').map((part) => Number(part.trim()));
      return Number.isFinite(x) && Number.isFinite(y) ? ([x, y] as [number, number]) : null;
    });

  if (points.length < 3 || points.some((point) => point === null)) {
    return null;
  }

  return points as [number, number][];
}
