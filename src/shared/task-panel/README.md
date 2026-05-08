# task-panel

Vanilla JS + CSS module providing a floating Q&A panel for task-driven
simulations. Has no runtime dependencies and is intended to be drop-in
portable into the bespoke design system later.

## Files

- `task-panel.js` — UMD-ish module: ES `export`s **and** sets `window.TaskPanel`
- `task-panel.css` — styles, all class names prefixed `task-panel-`
- `task-panel.d.ts` — TypeScript declarations for consumers

## Usage

```js
import { TaskPanel } from './task-panel.js';
import './task-panel.css';

const panel = TaskPanel.init({
  container: document.body,
  config: {
    question: 'What is the area of this right triangle?',
    type: 'freeform',           // or 'multiple_choice'
    options: ['12', '24', '36'], // required when type === 'multiple_choice' (2–4 strings)
    correctAnswer: '24',         // accepted for shape compatibility; not shown to learner
  },
  initialAnswer: '',
  onChange: (answer) => {
    console.log('learner answered:', answer);
  },
});

panel.setAnswer('24'); // programmatic update (e.g. on rehydrate)
panel.destroy();        // remove from DOM and clear timers
```

The same module also exposes `window.TaskPanel` for plain-script usage.

## Behavior

- **Floating**: fixed bottom-right, with a 16 px viewport margin.
- **Collapsible**: a chevron in the card header collapses it to a small pill
  with a `?` icon. Clicking the pill expands it again. The panel mounts
  expanded by default.
- **Two task types**:
  - `freeform`: a textarea. `onChange` is debounced 300 ms after the last
    keystroke.
  - `multiple_choice`: 2–4 radio buttons. `onChange` fires immediately on
    selection.
- **No submit button** — every change is sent through `onChange`. The host
  app is responsible for persisting (e.g. POSTing) the answer.
- **No framework**: pure DOM. Safe to mount inside any host (React, Vue,
  vanilla, etc.).

## Class names

All elements use the `task-panel-` prefix. The root has the modifier class
`task-panel--collapsed` when in pill mode, so consumer overrides can scope
to either state.

```
.task-panel
  .task-panel__pill          (visible only when collapsed)
    .task-panel__icon
    .task-panel__pill-label
  .task-panel__card          (visible only when expanded)
    .task-panel__header
      .task-panel__title
      .task-panel__collapse
    .task-panel__body
      .task-panel__question
      .task-panel__textarea          (freeform)
      .task-panel__options           (multiple_choice)
        .task-panel__option
          .task-panel__option-label
```

## Migration to the design system

When this moves into `learn_bespoke-design-system`:

1. Drop these three files in unchanged.
2. Re-export `TaskPanel` from the design-system entry point.
3. Optionally swap colors/spacing to design-system tokens — but keep the API
   and class structure the same so existing call sites continue to work.
