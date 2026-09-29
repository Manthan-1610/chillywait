import type { GameId } from '../../shared/constants';

export const GAMES: {
  id: GameId;
  label: string;
  icon: string;
  hint: string;
}[] = [
  {
    id: 'traffic',
    label: 'Traffic Rider',
    icon: '🏍',
    hint: 'Near-miss & nitro — ← → · hold Space',
  },
  {
    id: 'coffee',
    label: 'Coffee Frenzy',
    icon: '☕',
    hint: 'Mash ~10× to fill — stop when full',
  },
  {
    id: 'compile-run',
    label: 'Compile Run',
    icon: '⌨',
    hint: 'Jump errors — Space or click',
  },
];
