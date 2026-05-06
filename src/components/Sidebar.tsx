import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { objectIcon, objectLabel, parseFormula, type GeomObject } from '../lib/geometry';

type SidebarProps = {
  objects: GeomObject[];
  onAddObject: (object: GeomObject) => void;
  onDeleteObject: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function Sidebar({ objects, onAddObject, onDeleteObject, selectedId, onSelect }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
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
              <div
                className={`object-row ${object.id === selectedId ? 'is-selected' : ''}`}
                key={object.id}
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
