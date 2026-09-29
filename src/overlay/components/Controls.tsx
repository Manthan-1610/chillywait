interface ControlsProps {
  onMinimize: () => void;
  onDismiss: () => void;
}

export function Controls({ onMinimize, onDismiss }: ControlsProps) {
  return (
    <div class="controls">
      <button type="button" onClick={onMinimize}>
        Minimize
      </button>
      <button type="button" onClick={onDismiss}>
        Close
      </button>
    </div>
  );
}
