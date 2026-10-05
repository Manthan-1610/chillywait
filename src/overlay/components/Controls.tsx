interface ControlsProps {
  muted: boolean;
  onToggleMute: () => void;
  onMinimize: () => void;
  onDismiss: () => void;
}

export function Controls({
  muted,
  onToggleMute,
  onMinimize,
  onDismiss,
}: ControlsProps) {
  return (
    <div class="controls">
      <button
        type="button"
        title={muted ? 'Unmute sound' : 'Mute sound'}
        aria-pressed={muted}
        onClick={onToggleMute}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <button type="button" onClick={onMinimize}>
        Minimize
      </button>
      <button type="button" onClick={onDismiss}>
        Close
      </button>
    </div>
  );
}
