import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { objectIcon, objectLabel, parseFormula, type GeomObject } from '../lib/geometry';

type SidebarProps = {
  objects: GeomObject[];
  onAddObject: (object: GeomObject) => void;
  onDeleteObject: (id: string) => void;
};

export function Sidebar({ objects, onAddObject, onDeleteObject }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formula, setFormula] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

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

          <div className="object-list" aria-live="polite">
            {objects.map((object) => (
              <div className="object-row" key={object.id}>
                <span className="object-icon" aria-hidden="true">{objectIcon(object)}</span>
                <div className="object-details">
                  <strong>{objectLabel(object)}</strong>
                  <span>{object.type}</span>
                </div>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => onDeleteObject(object.id)}
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
