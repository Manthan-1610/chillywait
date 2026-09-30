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
    label: 'Last Token',
    icon: '◆',
    hint: 'Stack higher to pay full · time the ring',
  },
  {
    id: 'compile-run',
    label: 'Compile Run',
    icon: '⌨',
    hint: 'Jump errors — Space or click',
  },
];
