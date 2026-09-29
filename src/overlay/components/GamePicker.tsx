import { GAMES } from '../games/registry';

interface GamePickerProps {
  active: string;
  onChange: (game: string) => void;
}

export function GamePicker({ active, onChange }: GamePickerProps) {
  return (
    <div class="game-picker">
      {GAMES.map((g) => (
        <button
          key={g.id}
          type="button"
          class={active === g.id ? 'active' : ''}
          onClick={() => onChange(g.id)}
          title={g.hint}
        >
          <span class="game-icon">{g.icon}</span>
          <span class="game-name">{g.label}</span>
        </button>
      ))}
    </div>
  );
}
