import type { WaitPhase } from '../../shared/constants';

interface StatusBarProps {
  phase: WaitPhase;
  elapsedMs: number;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}:${rem.toString().padStart(2, '0')}` : `${s}s`;
}

export function StatusBar({ phase, elapsedMs }: StatusBarProps) {
  let text = 'STANDBY';
  let className = 'status-bar';

  if (phase === 'generating') {
    text = `LLM THINKING · ${formatElapsed(elapsedMs)}`;
    className += ' thinking';
  } else if (phase === 'overlay_visible') {
    text = `PLAY TIME · ${formatElapsed(elapsedMs)}`;
    className += ' thinking';
  } else if (phase === 'answer_ready') {
    text = 'READY!';
    className += ' ready';
  }

  return (
    <div class={className}>
      <span>{text}</span>
    </div>
  );
}
