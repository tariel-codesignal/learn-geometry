import { useEffect, useState } from 'react';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { fetchConfig, postState } from './lib/api';
import type { GeomObject, Tool } from './lib/geometry';

export default function App() {
  const [objects, setObjects] = useState<GeomObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('move');

  useEffect(() => {
    let active = true;

    fetchConfig()
      .then((state) => {
        if (active) {
          setObjects(state.objects);
          setStatus(null);
        }
      })
      .catch((error) => {
        if (active) {
          setStatus(error instanceof Error ? error.message : 'Unable to load config.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function syncObjects(nextObjects: GeomObject[]) {
    setObjects(nextObjects);
    postState(nextObjects)
      .then(() => setStatus(null))
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Unable to sync state.');
      });
  }

  function addObject(object: GeomObject) {
    syncObjects([...objects, object]);
  }

  function deleteObject(id: string) {
    syncObjects(objects.filter((object) => object.id !== id));
  }

  return (
    <div className="app-shell">
      <Sidebar objects={objects} onAddObject={addObject} onDeleteObject={deleteObject} />
      <div className="main-area">
        <Toolbar activeTool={activeTool} onSelectTool={setActiveTool} />
        <Canvas objects={objects} activeTool={activeTool} onAddObject={addObject} />
      </div>
      {(loading || status) && (
        <div className={`status-pill ${status ? 'is-error' : ''}`}>
          {loading ? 'Loading…' : status}
        </div>
      )}
    </div>
  );
}
