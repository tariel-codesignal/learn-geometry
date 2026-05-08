// Type declarations for the dependency-free task-panel module.

export type TaskPanelType = 'freeform' | 'multiple_choice';

export type TaskPanelConfig = {
  question: string;
  type: TaskPanelType;
  options?: string[];
  correctAnswer?: string;
};

export type TaskPanelInitOptions = {
  container: HTMLElement;
  config: TaskPanelConfig;
  initialAnswer?: string;
  onChange?: (answer: string) => void;
};

export type TaskPanelInstance = {
  destroy: () => void;
  setAnswer: (value: string) => void;
};

export const TaskPanel: {
  init: (options: TaskPanelInitOptions) => TaskPanelInstance;
};

export default TaskPanel;

declare global {
  interface Window {
    TaskPanel?: typeof TaskPanel;
  }
}
