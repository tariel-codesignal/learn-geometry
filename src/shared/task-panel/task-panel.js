// Vanilla, dependency-free Q&A panel.
//
// Designed to be portable into the bespoke design system. Class names are all
// prefixed `task-panel-` to avoid collisions with consumer styles.
//
// API documented in README.md alongside this file.

const PREFIX = 'task-panel';
const FREEFORM_DEBOUNCE_MS = 300;

export const TaskPanel = {
  init(options) {
    if (!options || !options.container) {
      throw new Error('TaskPanel.init: "container" is required');
    }
    if (!options.config || typeof options.config !== 'object') {
      throw new Error('TaskPanel.init: "config" is required');
    }

    const { container, config } = options;
    const onChange = typeof options.onChange === 'function' ? options.onChange : null;

    const root = document.createElement('div');
    root.className = PREFIX;

    const state = {
      collapsed: false,
      answer: typeof options.initialAnswer === 'string' ? options.initialAnswer : '',
    };

    let debounceTimer = null;
    let textarea = null;
    let radioInputs = [];

    function clearDebounce() {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    }

    function emitChange(value) {
      if (!onChange) return;
      if (config.type === 'freeform') {
        clearDebounce();
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          onChange(value);
        }, FREEFORM_DEBOUNCE_MS);
      } else {
        onChange(value);
      }
    }

    function setAnswer(value) {
      const next = typeof value === 'string' ? value : '';
      state.answer = next;
      if (textarea && textarea.value !== next) {
        textarea.value = next;
      }
      for (const input of radioInputs) {
        input.checked = input.value === next;
      }
    }

    function setCollapsed(value) {
      state.collapsed = !!value;
      root.classList.toggle(`${PREFIX}--collapsed`, state.collapsed);
    }

    function buildPill() {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `${PREFIX}__pill`;
      pill.setAttribute('aria-label', 'Show question');

      const icon = document.createElement('span');
      icon.className = `${PREFIX}__icon`;
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '?';
      pill.appendChild(icon);

      const label = document.createElement('span');
      label.className = `${PREFIX}__pill-label`;
      label.textContent = 'Question';
      pill.appendChild(label);

      pill.addEventListener('click', () => setCollapsed(false));
      return pill;
    }

    function buildHeader() {
      const header = document.createElement('div');
      header.className = `${PREFIX}__header`;

      const title = document.createElement('span');
      title.className = `${PREFIX}__title`;
      title.textContent = 'Question';
      header.appendChild(title);

      const collapseBtn = document.createElement('button');
      collapseBtn.type = 'button';
      collapseBtn.className = `${PREFIX}__collapse`;
      collapseBtn.setAttribute('aria-label', 'Hide question');
      collapseBtn.innerHTML =
        '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
        '<path d="M3 6 L8 11 L13 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />' +
        '</svg>';
      collapseBtn.addEventListener('click', () => setCollapsed(true));
      header.appendChild(collapseBtn);

      return header;
    }

    function buildBody() {
      const body = document.createElement('div');
      body.className = `${PREFIX}__body`;

      const question = document.createElement('p');
      question.className = `${PREFIX}__question`;
      question.textContent = config.question || '';
      body.appendChild(question);

      if (config.type === 'multiple_choice') {
        const list = document.createElement('div');
        list.className = `${PREFIX}__options`;
        const groupName = `${PREFIX}-${Math.random().toString(36).slice(2, 9)}`;
        const options = Array.isArray(config.options) ? config.options : [];
        radioInputs = [];
        for (const option of options) {
          const wrapper = document.createElement('label');
          wrapper.className = `${PREFIX}__option`;

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = groupName;
          input.value = option;
          input.checked = option === state.answer;
          input.addEventListener('change', () => {
            if (input.checked) {
              state.answer = option;
              emitChange(option);
            }
          });
          radioInputs.push(input);

          const text = document.createElement('span');
          text.className = `${PREFIX}__option-label`;
          text.textContent = option;

          wrapper.appendChild(input);
          wrapper.appendChild(text);
          list.appendChild(wrapper);
        }
        body.appendChild(list);
      } else {
        textarea = document.createElement('textarea');
        textarea.className = `${PREFIX}__textarea`;
        textarea.rows = 3;
        textarea.placeholder = 'Type your answer…';
        textarea.value = state.answer;
        textarea.addEventListener('input', (event) => {
          const value = event.target.value;
          state.answer = value;
          emitChange(value);
        });
        body.appendChild(textarea);
      }

      return body;
    }

    function buildCard() {
      const card = document.createElement('div');
      card.className = `${PREFIX}__card`;
      card.appendChild(buildHeader());
      card.appendChild(buildBody());
      return card;
    }

    root.appendChild(buildPill());
    root.appendChild(buildCard());
    setCollapsed(state.collapsed);
    container.appendChild(root);

    return {
      destroy() {
        clearDebounce();
        if (root.parentNode) {
          root.parentNode.removeChild(root);
        }
        textarea = null;
        radioInputs = [];
      },
      setAnswer,
    };
  },
};

if (typeof window !== 'undefined') {
  window.TaskPanel = TaskPanel;
}

export default TaskPanel;
