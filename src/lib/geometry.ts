import { evaluate, parse } from 'mathjs/number';

export type GeomObject =
  | { id: string; type: 'point'; x: number; y: number; label?: string }
  | { id: string; type: 'circle'; cx: number; cy: number; r: number; label?: string }
  | { id: string; type: 'line'; x1: number; y1: number; x2: number; y2: number; label?: string }
  | { id: string; type: 'rectangle'; x: number; y: number; w: number; h: number; rotation?: number; label?: string }
  | { id: string; type: 'polygon'; points: [number, number][]; label?: string }
  | { id: string; type: 'function'; expression: string; label?: string };

export type Tool = 'move' | 'point' | 'line' | 'circle' | 'rectangle' | 'polygon';

export type GeometryState = {
  objects: GeomObject[];
};

export type ParseResult =
  | { ok: true; object: GeomObject }
  | { ok: false; error: string };

export const DEFAULT_RANGE = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
};

export function createObjectId(prefix = 'obj'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function objectIcon(object: GeomObject): string {
  switch (object.type) {
    case 'point':
      return '•';
    case 'circle':
      return '○';
    case 'line':
      return '／';
    case 'rectangle':
      return '▭';
    case 'polygon':
      return '⬠';
    case 'function':
      return 'ƒ';
    default:
      return '?';
  }
}

export function objectLabel(object: GeomObject): string {
  if (object.label?.trim()) {
    return object.label;
  }

  switch (object.type) {
    case 'point':
      return `Point (${formatNumber(object.x)}, ${formatNumber(object.y)})`;
    case 'circle':
      return `Circle (${formatNumber(object.cx)}, ${formatNumber(object.cy)}), r=${formatNumber(object.r)}`;
    case 'line':
      return `Line (${formatNumber(object.x1)}, ${formatNumber(object.y1)}) → (${formatNumber(object.x2)}, ${formatNumber(object.y2)})`;
    case 'rectangle':
      return `Rectangle (${formatNumber(object.x)}, ${formatNumber(object.y)}), ${formatNumber(object.w)}×${formatNumber(object.h)}`;
    case 'polygon':
      return `Polygon (${object.points.length} points)`;
    case 'function':
      return `y = ${object.expression}`;
    default:
      return 'Object';
  }
}

export function parseFormula(input: string): ParseResult {
  const expression = input.trim();

  if (!expression) {
    return { ok: false, error: 'Enter a formula first.' };
  }

  const functionMatch = expression.match(/^y\s*=\s*(.+)$/i);
  if (functionMatch) {
    const rhs = functionMatch[1].trim();
    if (!rhs) {
      return { ok: false, error: 'Function formula needs a right-hand expression.' };
    }

    try {
      parse(rhs);
      return {
        ok: true,
        object: {
          id: createObjectId('fn'),
          type: 'function',
          expression: rhs,
          label: `y = ${rhs}`,
        },
      };
    } catch {
      return { ok: false, error: 'Unable to parse the function expression.' };
    }
  }

  const circle = parseCircleFormula(expression);
  if (circle) {
    return {
      ok: true,
      object: {
        id: createObjectId('circle'),
        type: 'circle',
        cx: circle.cx,
        cy: circle.cy,
        r: circle.r,
        label: `(${formatNumber(circle.cx)}, ${formatNumber(circle.cy)}), r=${formatNumber(circle.r)}`,
      },
    };
  }

  return {
    ok: false,
    error: 'Supported formulas: y = <expression> or (x-a)^2 + (y-b)^2 = r^2.',
  };
}

export function evaluateFunctionExpression(expression: string, x: number): number | null {
  try {
    const value = evaluate(expression, { x });
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function parseCircleFormula(expression: string): { cx: number; cy: number; r: number } | null {
  const compact = expression.replace(/\s+/g, '');
  const patterns = [
    /^\(?x(?<xOffset>[+-][^)]+)?\)?\^2\+\(?y(?<yOffset>[+-][^)]+)?\)?\^2=(?<rhs>.+)$/i,
    /^\(?y(?<yOffset>[+-][^)]+)?\)?\^2\+\(?x(?<xOffset>[+-][^)]+)?\)?\^2=(?<rhs>.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match?.groups) {
      continue;
    }

    const cx = offsetToCenter(match.groups.xOffset);
    const cy = offsetToCenter(match.groups.yOffset);
    const radiusSquared = evaluateNumeric(match.groups.rhs);

    if (cx === null || cy === null || radiusSquared === null || radiusSquared <= 0) {
      return null;
    }

    return {
      cx,
      cy,
      r: Math.sqrt(radiusSquared),
    };
  }

  return null;
}

function offsetToCenter(offset?: string): number | null {
  if (!offset) {
    return 0;
  }

  const sign = offset[0];
  const magnitude = evaluateNumeric(offset.slice(1));
  if (magnitude === null) {
    return null;
  }

  return sign === '-' ? magnitude : -magnitude;
}

function evaluateNumeric(expression: string): number | null {
  try {
    const value = evaluate(expression);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
