import { Fragment, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { formatNumber, objectIcon, objectLabel, parseFormula, type GeomObject } from '../lib/geometry';

type SidebarProps = {
  objects: GeomObject[];
  onAddObject: (object: GeomObject) => void;
  onUpdateObject: (object: GeomObject) => void;
  onDeleteObject: (id: string) => void;
  initialOpen: boolean | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function Sidebar({
  objects,
  onAddObject,
  onUpdateObject,
  onDeleteObject,
  initialOpen,
  selectedId,
  onSelect,
}: SidebarProps) {
  // Start collapsed by default; the config-driven preference (if any) is
  // applied once when it lands.
  const [collapsed, setCollapsed] = useState(true);
  const initialAppliedRef = useRef(false);

  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (initialOpen === null) return;
    initialAppliedRef.current = true;
    setCollapsed(!initialOpen);
  }, [initialOpen]);
  const [editing, setEditing] = useState(false);
  const [formula, setFormula] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-object-id="${selectedId}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  function startEditing() {
    setEditing(true);
    setError(null);
  }

  function commit() {
    const trimmed = formula.trim();
    if (!trimmed) {
      setEditing(false);
      setError(null);
      return;
    }

    const result = parseFormula(trimmed);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    onAddObject(result.object);
    setFormula('');
    setEditing(false);
    setError(null);
  }

  function cancel() {
    setFormula('');
    setEditing(false);
    setError(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <button
        className="collapse-button"
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      {!collapsed && (
        <>
          <div className="sidebar-header">
            <h2>Objects</h2>
            <span className="sidebar-count">{objects.length}</span>
          </div>

          <div className="object-list" aria-live="polite" ref={listRef}>
            {objects.map((object) => (
              <Fragment key={object.id}>
                <div
                  className={`object-row ${object.id === selectedId ? 'is-selected' : ''}`}
                  data-object-id={object.id}
                  onClick={() => onSelect(object.id === selectedId ? null : object.id)}
                >
                  <span className="object-icon" aria-hidden="true">{objectIcon(object)}</span>
                  <div className="object-details">
                    <strong>{objectLabel(object)}</strong>
                    <span>{object.type}</span>
                  </div>
                  <button
                    type="button"
                    className="delete-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteObject(object.id);
                    }}
                    aria-label={`Delete ${objectLabel(object)}`}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
                {object.id === selectedId && (
                  <ObjectEditor object={object} onUpdate={onUpdateObject} />
                )}
              </Fragment>
            ))}

            <div
              className={`object-row add-row ${editing ? 'is-editing' : ''} ${error ? 'has-error' : ''}`}
              onClick={() => {
                if (!editing) startEditing();
              }}
              role={editing ? undefined : 'button'}
              tabIndex={editing ? -1 : 0}
              onKeyDown={(event) => {
                if (!editing && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  startEditing();
                }
              }}
            >
              <span className="object-icon add-icon" aria-hidden="true">+</span>
              {editing ? (
                <input
                  ref={inputRef}
                  className="add-input"
                  value={formula}
                  onChange={(event) => {
                    setFormula(event.target.value);
                    if (error) setError(null);
                  }}
                  onBlur={commit}
                  onKeyDown={handleKeyDown}
                  placeholder="y = x^2"
                  autoComplete="off"
                  spellCheck={false}
                />
              ) : (
                <span className="add-prompt">Add formula</span>
              )}
            </div>
            {error && <p className="form-error inline-error">{error}</p>}
          </div>
        </>
      )}
    </aside>
  );
}

type ObjectEditorProps = {
  object: GeomObject;
  onUpdate: (object: GeomObject) => void;
};

function ObjectEditor({ object, onUpdate }: ObjectEditorProps) {
  const labelField = (
    <TextField
      label="label"
      value={object.label ?? ''}
      onCommit={(value) => {
        const trimmed = value.trim();
        onUpdate({ ...object, label: trimmed === '' ? undefined : trimmed });
      }}
      full
    />
  );

  return (
    <div className="object-editor" onClick={(event) => event.stopPropagation()}>
      {object.type === 'point' && (
        <>
          <NumberField label="x" value={object.x} onCommit={(x) => onUpdate({ ...object, x })} />
          <NumberField label="y" value={object.y} onCommit={(y) => onUpdate({ ...object, y })} />
          {labelField}
        </>
      )}
      {object.type === 'line' && (
        <>
          <NumberField label="x₁" value={object.x1} onCommit={(x1) => onUpdate({ ...object, x1 })} />
          <NumberField label="y₁" value={object.y1} onCommit={(y1) => onUpdate({ ...object, y1 })} />
          <NumberField label="x₂" value={object.x2} onCommit={(x2) => onUpdate({ ...object, x2 })} />
          <NumberField label="y₂" value={object.y2} onCommit={(y2) => onUpdate({ ...object, y2 })} />
          {labelField}
        </>
      )}
      {object.type === 'circle' && (
        <>
          <NumberField label="cx" value={object.cx} onCommit={(cx) => onUpdate({ ...object, cx })} />
          <NumberField label="cy" value={object.cy} onCommit={(cy) => onUpdate({ ...object, cy })} />
          <NumberField
            label="r"
            value={object.r}
            onCommit={(r) => {
              if (r > 0) onUpdate({ ...object, r });
            }}
          />
          {labelField}
        </>
      )}
      {object.type === 'rectangle' && (
        <>
          <NumberField label="x" value={object.x} onCommit={(x) => onUpdate({ ...object, x })} />
          <NumberField label="y" value={object.y} onCommit={(y) => onUpdate({ ...object, y })} />
          <NumberField label="w" value={object.w} onCommit={(w) => onUpdate({ ...object, w })} />
          <NumberField label="h" value={object.h} onCommit={(h) => onUpdate({ ...object, h })} />
          <NumberField
            label="rot°"
            value={radToDeg(object.rotation ?? 0)}
            onCommit={(deg) => {
              const rotation = degToRad(normalizeAngleDeg(deg));
              const next = { ...object, rotation };
              if (rotation === 0) delete (next as { rotation?: number }).rotation;
              onUpdate(next);
            }}
          />
          {labelField}
        </>
      )}
      {object.type === 'polygon' && (
        <>
          <TextField
            label="points"
            value={formatPoints(object.points)}
            onCommit={(value) => {
              const points = parsePointsList(value);
              if (points) onUpdate({ ...object, points });
            }}
            mono
            full
          />
          {labelField}
        </>
      )}
      {object.type === 'function' && (
        <>
          <TextField
            label="y ="
            value={object.expression}
            onCommit={(expression) => {
              const next = expression.trim();
              if (!next) return;
              const updated: GeomObject = { ...object, expression: next };
              if (object.label && object.label.trim().startsWith('y =')) {
                updated.label = `y = ${next}`;
              }
              onUpdate(updated);
            }}
            mono
            full
          />
          {labelField}
        </>
      )}
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  onCommit: (value: number) => void;
};

function NumberField({ label, value, onCommit }: NumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => formatDraft(value));

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(formatDraft(value));
    }
  }, [value]);

  function commit() {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(formatDraft(value));
      return;
    }
    if (next !== value) onCommit(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(formatDraft(value));
      event.currentTarget.blur();
    }
  }

  return (
    <label className="editor-field">
      <span>{label}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        spellCheck={false}
      />
    </label>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  mono?: boolean;
  full?: boolean;
};

function TextField({ label, value, onCommit, mono, full }: TextFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(value);
    }
  }, [value]);

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(value);
      event.currentTarget.blur();
    }
  }

  return (
    <label className={`editor-field${full ? ' full' : ''}`}>
      <span>{label}</span>
      <input
        ref={inputRef}
        type="text"
        className={mono ? 'mono' : ''}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
      />
    </label>
  );
}

function formatDraft(value: number): string {
  return formatNumber(value);
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function normalizeAngleDeg(deg: number): number {
  // Keep the editor value in (-180, 180] so users see clean numbers across full turns.
  let value = deg % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return value;
}

function formatPoints(points: [number, number][]): string {
  return points.map(([x, y]) => `${formatNumber(x)},${formatNumber(y)}`).join('; ');
}

function parsePointsList(value: string): [number, number][] | null {
  const parsed = value
    .split(';')
    .map((point) => point.trim())
    .filter(Boolean)
    .map((point) => {
      const [x, y] = point.split(',').map((part) => Number(part.trim()));
      return Number.isFinite(x) && Number.isFinite(y) ? ([x, y] as [number, number]) : null;
    });

  if (parsed.length < 3 || parsed.some((point) => point === null)) {
    return null;
  }

  return parsed as [number, number][];
}
