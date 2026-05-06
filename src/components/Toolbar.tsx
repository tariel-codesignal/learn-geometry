import type { ReactNode } from 'react';
import type { Tool } from '../lib/geometry';

type ToolbarProps = {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
};

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'move', label: 'Move / Pan', icon: <MoveIcon /> },
  { id: 'point', label: 'Point', icon: <PointIcon /> },
  { id: 'line', label: 'Line', icon: <LineIcon /> },
  { id: 'circle', label: 'Circle', icon: <CircleIcon /> },
  { id: 'rectangle', label: 'Rectangle', icon: <RectIcon /> },
  { id: 'polygon', label: 'Polygon', icon: <PolyIcon /> },
];

export function Toolbar({ activeTool, onSelectTool }: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="tool-buttons" role="tablist" aria-label="Geometry tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`tool-button ${tool.id === activeTool ? 'is-active' : ''}`}
            onClick={() => onSelectTool(tool.id)}
            role="tab"
            aria-selected={tool.id === activeTool}
            aria-label={tool.label}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>
      <div className="toolbar-hint" aria-live="polite">
        {hintFor(activeTool)}
      </div>
    </header>
  );
}

function hintFor(tool: Tool): string {
  switch (tool) {
    case 'move':
      return 'Drag to pan, scroll to zoom.';
    case 'point':
      return 'Click on the canvas to place a point.';
    case 'line':
      return 'Drag from one endpoint to the other.';
    case 'circle':
      return 'Drag from the center outward.';
    case 'rectangle':
      return 'Drag from one corner to the opposite corner.';
    case 'polygon':
      return 'Click to add vertices. Double-click or Enter to close. Esc to cancel.';
    default:
      return '';
  }
}

function MoveIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 2.5v15M2.5 10h15M10 2.5l-2 2M10 2.5l2 2M10 17.5l-2-2M10 17.5l2-2M2.5 10l2-2M2.5 10l2 2M17.5 10l-2-2M17.5 10l-2 2" />
    </svg>
  );
}

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
