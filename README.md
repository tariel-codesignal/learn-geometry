# learn-geometry

An interactive, Desmos-style geometry sketchpad built for CodeSignal math
courses. Users see an infinite, zoomable coordinate plane and can draw and
manipulate shapes directly on it; optionally a configured Q&A panel asks
the learner a question about what they've drawn.

The app is two pieces:

- A React + SVG canvas frontend (`src/`)
- A small Express server (`server.js`) that seeds and reports state

A backing `config.json` file at the repo root seeds the initial objects and,
optionally, the task question.

---

## Quick start

```sh
npm install
npm run dev        # Vite on :5173 + Express on :3000
```

Open `http://localhost:5173`. Vite proxies `/api/*` to the Express server.
For a one-process production build:

```sh
npm run preview    # builds dist/, serves everything from Express on :3000
```

---

## What's on the canvas

The canvas fills the viewport. There's no fixed window — the plane extends
indefinitely in every direction, with axis tick labels (`1`, `2`, `5`, `10`,
…) that adapt as you zoom in or out.

### Navigation

- **Drag** on empty canvas → pan the view.
- **Scroll wheel** → zoom toward the cursor.
- **Hold `Space`** → temporarily switch to pan mode regardless of the active
  tool.
- **Middle-mouse drag** → pan, regardless of tool.
- **HUD** (top-right of canvas): `−` / `+` zoom buttons, current zoom factor,
  and a **Reset view** button that returns to origin + default zoom.

### Tools (top bar, left → right)

| Icon | Tool | Action |
|---|---|---|
| ↖ | **Drag / Select** | Click an object to select; drag a body to translate; drag a handle to resize; drag empty space to pan. |
| ● | **Point** | Click to place a single point at the cursor. |
| ╱ | **Line** | Either drag from one endpoint to the other, or click the first endpoint and then click the second. Snap-to-grid applies to both clicks. |
| ○ | **Circle** | Press at the center, drag outward to set radius, release. |
| ▭ | **Rectangle** | Press one corner, drag to the opposite corner, release. |
| ⬠ | **Polygon** | Click each vertex in turn. Close with one of: click near vertex #1 (a hollow ring appears when you're close), double-click anywhere, or press `Enter`. `Esc` cancels. |

To the left of the tools: **undo** / **redo** (also `⌘Z` / `Ctrl+Z` and
`⇧⌘Z` / `Ctrl+Y`). To the right: an **eraser** button that clears the
canvas (undoable).

### Snapping

While drawing or editing, the cursor snaps to the nearest **major grid
intersection** when within ~10 px of one. The grid step adapts with zoom
(`0.1`, `0.5`, `1`, `2`, `5`, `10`, …), so snap targets follow naturally.
A small ring is shown at the snap target so you can see it lock on. Move
mode does not snap.

### Selecting and editing

Clicking an object in **Drag / Select** mode selects it. The selected
object stays the same color but renders slightly thicker, and its sidebar
row is highlighted. Polygons and rectangles are hit-tested on their
**edges only** — clicking inside the filled area doesn't select them, so
points or other shapes sitting inside a polygon can be grabbed cleanly.

Once selected:

- **Drag the body** of any line/circle/rectangle/polygon/point to translate
  it. The delta snaps to whole grid steps when within 10 px of one.
- **Drag a handle** (small white square) at a corner / endpoint / vertex /
  circumference to resize or move that piece. The opposite anchor stays
  pinned for rectangles; the line's other endpoint stays put for lines; the
  circle's center stays put for radius drag.
- **Drag the rotation handle** (small white circle outside the bottom-right
  corner of a rectangle, or near the outermost vertex of a polygon) to
  rotate the shape around its center. Rotation snaps to **15°** when close.
- **Delete / Backspace** removes the selected object (undoable).
- **Arrow keys** nudge the selected object by 1 unit; **Shift + Arrow** nudges
  by 5 units. Each press is one undo step. Function curves are skipped.
- All edits commit a single undo step per drag.

### Intersection points

Any time two objects geometrically intersect, the intersection points are
highlighted with a small amber dot. Click a dot to display its coordinates
as a label. Pairs supported:

- line × line, line × rectangle/polygon edges, line × circle
- rectangle/polygon × circle (edges)
- rectangle × rectangle, polygon × polygon (edges)
- circle × circle
- function curve × line/rectangle/polygon/circle (numerical, via
  sample-and-bisect)
- function curve × function curve (in the currently visible x range)

Self-intersection is not tracked.

### Sidebar (Objects panel)

The sidebar on the left lists every object. Each row shows an icon, the
auto-generated description, and the type. Clicking a row selects the
object on the canvas (and vice versa).

Objects without an explicit `label` get a default name based on type:
points/circles/lines show their coordinates; **rectangles** show
`"Rectangle"`; **polygons** are named by vertex count
(`"Triangle"` for 3, `"Quadrilateral"` for 4, up to `"Octagon"` for 8;
beyond that it falls back to `"Polygon (N points)"`). Setting `label`
in `config.json` or via the editor always wins.

Selecting a row expands an inline editor underneath with the object's
parameters as input fields. Edit any field and press **Enter** (or click
away) to commit; **Esc** reverts. The editor stays in sync with on-canvas
edits.

At the bottom of the list is a single **+ Add formula** row. Click it,
type a formula, and press Enter to add it. Supported formulas:

- `y = <expression>` — adds a function curve. Example: `y = x^2 - 4`.
- `(x - a)^2 + (y - b)^2 = r^2` — adds a circle.

### Persistence

- Every change is saved both to the browser's `localStorage` and POSTed to
  `/api/state` (in-memory on the server).
- On reload, the React app calls `GET /api/config` and shows the seed
  objects from `config.json`.
- The browser falls back to `localStorage` if the API is unreachable, so
  the app degrades gracefully when only Vite is running.

---

## Q&A panel (optional)

If `config.json` includes a `task`, a floating panel appears in the
bottom-right of the viewport with the question. It supports two modes:

- **Freeform** — a textarea. `onChange` is debounced 300 ms.
- **Multiple choice** — 2–4 radio buttons. `onChange` fires immediately.

There's no submit button. Every change is POSTed to `/api/task/answer` and
held in server memory as `submittedAnswer` until the next change. The
panel collapses to a small `?` pill via its header chevron.

If `task` is absent or fails validation, the panel does not render.

The vanilla module powering the panel lives at `src/shared/task-panel/`
and is dependency-free, so it can move into the design system later.

---

## API endpoints

Served by `server.js` on the same port as the app in production (`:3000`)
and proxied through Vite in development.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/config` | Returns `{ objects, sidebarOpen, viewCenter }` from `config.json`. Always re-reads from disk. |
| `GET` | `/api/state` | Returns the current in-memory objects array. `?format=text` returns a human-readable summary plus a list of all intersection points. |
| `POST` | `/api/state` | Body `{ objects: GeomObject[] }`. Replaces the in-memory state. Called automatically by the frontend after every change. |
| `GET` | `/api/task` | Returns `{ task, submittedAnswer }`. `?format=text` returns a human-readable block including the learner's current answer (or `"(no task configured)"`). |
| `POST` | `/api/task/answer` | Body `{ answer: string }`. For multiple_choice, validates that `answer` is `""` or one of `options` (else `400`). |

State is **not** persisted across server restarts. `config.json` is read
only — it's the seed, never the destination.

---

## `config.json` schema

The single source of truth for what loads when the app starts.

### Top-level shape

```jsonc
{
  "objects":     [ /* GeomObject[] */ ],
  "task":        { /* Task — optional */ },
  "sidebarOpen": false,    /* optional, defaults to false */
  "viewCenter":  [0, 0]    /* optional, defaults to [0, 0] (origin) */
}
```

- `objects` is required (use `[]` if empty).
- `task` is optional. When absent or invalid, the Q&A panel does not
  render and the app runs in "building mode". On invalid task the server
  logs a `Task validation: …` warning.
- `sidebarOpen` is optional. `true` starts the app with the Objects
  sidebar expanded; `false` (or omitted) starts it collapsed. Users can
  still toggle it during the session; this only controls the initial
  state on page load.
- `viewCenter` is optional. A `[x, y]` tuple of world coordinates that
  the canvas is centered on at startup. Defaults to `[0, 0]` (the
  origin). Both values must be finite numbers; malformed entries are
  ignored. The "Reset view" button also returns the canvas to this
  center.
- Unknown top-level keys are ignored.

### Object types

Every object needs a unique string `id` and a discriminating `type`.
`label` is optional on every type — when set it's the row title in the
sidebar and the text drawn next to the shape; when omitted the app
auto-generates a description (e.g. `"Circle (0, 0), r=3"`).

Coordinates use standard math convention: **`+y` is up**, `(0, 0)` is the
origin. The visible window roughly covers `x, y ∈ [-10, 10]` at the
default zoom — anything farther will be off-screen until the user pans.

#### Point

```json
{ "id": "p1", "type": "point", "x": 0, "y": 0, "label": "Origin" }
```

#### Line (a segment, not infinite)

```json
{ "id": "l1", "type": "line", "x1": 0, "y1": 0, "x2": 6, "y2": 0 }
```

#### Circle

```json
{ "id": "c1", "type": "circle", "cx": 0, "cy": 0, "r": 3 }
```

`r` must be > 0.

#### Rectangle

```json
{
  "id": "r1",
  "type": "rectangle",
  "x": -2, "y": -2,
  "w": 4, "h": 4,
  "rotation": 0.7853981633974483
}
```

- `(x, y)` is the starting corner; `w` and `h` are signed offsets so the
  opposite corner is `(x + w, y + h)`. Negative values are accepted.
- `rotation` is **optional**, in **radians**, applied counterclockwise
  around the rectangle's center `(x + w/2, y + h/2)`. Default is `0`.
  - 30° → `0.5235987755982988`
  - 45° → `0.7853981633974483`
  - 60° → `1.0471975511965976`
  - 90° → `1.5707963267948966`
  - Convert: `radians = degrees * Math.PI / 180`.

#### Polygon

```json
{
  "id": "poly1",
  "type": "polygon",
  "points": [[0,0],[6,0],[0,4]],
  "rotation": 0.7853981633974483
}
```

- `points` is an array of `[x, y]` pairs, **minimum 3**, in order. The
  polygon closes automatically (no need to repeat the first vertex).
- `rotation` is **optional**, in **radians**, applied counterclockwise
  around the polygon's centroid (the average of `points`). Default is `0`.
  Same convention as rectangle rotation. Editing `points` in the sidebar
  is WYSIWYG: typed coordinates are treated as world positions and any
  existing rotation resets to 0.

#### Function curve `y = f(x)`

```json
{ "id": "fn1", "type": "function", "expression": "x^2 - 4", "label": "y = x²−4" }
```

- `expression` is the **right-hand side only**.
- Parsed by `mathjs`. Supported: `+ - * / ^`, `sqrt(x)`, `abs(x)`,
  `sin(x)`, `cos(x)`, `tan(x)`, `exp(x)`, `log(x)` (natural log),
  `log10(x)`, `pi`, `e`, and parentheses.

### Task

Two types. Anything else makes the panel hide.

#### Freeform

```json
{
  "task": {
    "question": "What is the area of this right triangle?",
    "type": "freeform",
    "correctAnswer": "12"
  }
}
```

- `question`: non-empty string.
- `type`: literal `"freeform"`.
- `correctAnswer`: string (numbers must be wrapped: `"12"`, not `12`).
  Not shown to the learner — used only for grading.

#### Multiple choice

```json
{
  "task": {
    "question": "Which figure has four equal sides?",
    "type": "multiple_choice",
    "options": ["Triangle", "Square", "Pentagon", "Hexagon"],
    "correctAnswer": "Square"
  }
}
```

- `question`: non-empty string.
- `type`: literal `"multiple_choice"`.
- `options`: array of **2–4 strings**. Each renders as one radio row.
- `correctAnswer`: must match one of the `options` strings **exactly**.

### Validation rules

- Top-level: malformed JSON → seed becomes `{ objects: [], task: null }`,
  warning logged. Same for `task` failing validation.
- Per-object: the frontend doesn't deeply validate object schemas. A
  malformed object may render as empty / `NaN` rather than throw, so the
  config should follow the schemas above.
- Per-task (server-side):
  - `task.type` not in `{"freeform", "multiple_choice"}` → ignored.
  - `question` missing or empty → ignored.
  - `correctAnswer` not a string → ignored.
  - For multiple_choice: `options` must be an array of 2–4 strings;
    `correctAnswer` must be in `options`.

### Complete examples

Two ready-made configs live in `examples/`:

- `examples/config-freeform.json` — a right triangle plus a freeform
  area question.
- `examples/config-mc.json` — a right triangle as 3 lines plus a
  multiple-choice area question.

Drop either into `config.json` and reload.

**Parabola–line intersection (freeform):**

```json
{
  "objects": [
    { "id": "para", "type": "function", "expression": "x^2", "label": "y = x²" },
    { "id": "line", "type": "line", "x1": -3, "y1": 4, "x2": 3, "y2": 4 }
  ],
  "task": {
    "question": "At what x-values does y = x² intersect y = 4? Enter both, comma-separated.",
    "type": "freeform",
    "correctAnswer": "-2, 2"
  }
}
```

**Rotated square:**

```json
{
  "objects": [
    {
      "id": "diamond",
      "type": "rectangle",
      "x": -2, "y": -2, "w": 4, "h": 4,
      "rotation": 0.7853981633974483,
      "label": "diamond"
    }
  ]
}
```

---

## Project layout

```
.
├── config.json               # Seed config — edit to control startup state
├── examples/                 # Drop-in example configs
├── server.js                 # Express API + production static server
├── intersections.js          # Server-side intersection math (mirrors src/lib/intersections.ts)
├── src/
│   ├── App.tsx               # Root: owns objects, selection, history, mounts everything
│   ├── components/
│   │   ├── Canvas.tsx        # The infinite plane: rendering, tools, handles, intersections
│   │   ├── Toolbar.tsx       # Top bar: undo/redo, tools, eraser
│   │   ├── Sidebar.tsx       # Object list + inline editor + "Add formula" row
│   │   └── TaskPanelMount.tsx# Thin React wrapper around the vanilla task-panel
│   ├── shared/task-panel/    # Vanilla JS+CSS Q&A panel (portable, dep-free)
│   ├── lib/
│   │   ├── geometry.ts       # GeomObject types, formula parsing, label helpers
│   │   ├── intersections.ts  # Frontend intersection math
│   │   └── api.ts            # fetch/postState with localStorage fallback
│   ├── styles.css            # Global app styles
│   └── main.tsx              # Vite entry
└── index.html
```

---

## Keyboard shortcuts (reference)

| Keys | Action |
|---|---|
| `Space` (hold) | Temporary pan mode |
| `⌘Z` / `Ctrl+Z` | Undo |
| `⇧⌘Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` / `Backspace` | Delete selected object |
| `↑` `↓` `←` `→` | Nudge the selected object by 1 unit |
| `Shift` + arrow | Nudge the selected object by 5 units |
| `Enter` | Close polygon while drawing |
| `Esc` | Cancel in-progress drawing |

Shortcuts are suppressed while focus is in a text input.
