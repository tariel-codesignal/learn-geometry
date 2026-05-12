import type { GeometryState, GeomObject } from './geometry';

const EMPTY_STATE: GeometryState = { objects: [] };
const LOCAL_STORAGE_KEY = 'learn-geometry:state';

let apiAvailable: boolean | null = null;

export async function fetchConfig(): Promise<GeometryState> {
  try {
    const response = await fetch('/api/config');
    if (response.status === 404) {
      apiAvailable = false;
      return readLocalState();
    }
    if (!response.ok) {
      throw new Error(`Failed to load config (${response.status})`);
    }

    const data = await response.json();
    apiAvailable = true;
    return normalizeState(data);
  } catch (error) {
    if (error instanceof TypeError) {
      apiAvailable = false;
      return readLocalState();
    }
    throw error;
  }
}

export async function postState(objects: GeomObject[]): Promise<void> {
  writeLocalState(objects);

  if (apiAvailable === false) {
    return;
  }

  try {
    const response = await fetch('/api/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ objects }),
    });

    if (response.status === 404) {
      apiAvailable = false;
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to sync state (${response.status})`);
    }

    apiAvailable = true;
  } catch (error) {
    if (error instanceof TypeError) {
      apiAvailable = false;
      return;
    }
    throw error;
  }
}

function readLocalState(): GeometryState {
  if (typeof localStorage === 'undefined') return EMPTY_STATE;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return normalizeState(JSON.parse(raw));
  } catch {
    return EMPTY_STATE;
  }
}

function writeLocalState(objects: GeomObject[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ objects }));
  } catch {
    // Ignore quota / serialization failures.
  }
}

function normalizeState(data: unknown): GeometryState {
  if (!data || typeof data !== 'object' || !Array.isArray((data as GeometryState).objects)) {
    return EMPTY_STATE;
  }

  const candidate = data as GeometryState;
  return {
    objects: candidate.objects,
    sidebarOpen: typeof candidate.sidebarOpen === 'boolean' ? candidate.sidebarOpen : undefined,
  };
}
