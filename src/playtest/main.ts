import { createTrafficRider } from '../overlay/games/traffic-rider';
import { createLastToken } from '../overlay/games/last-token';
import { createCompileRun } from '../overlay/games/compile-run';
import type { GameController } from '../overlay/games/types';
import type { GameId } from '../shared/constants';
import type { RunResult } from '../overlay/engine/types';

const stage = document.getElementById('stage')!;
const hud = document.getElementById('hud')!;
const logEl = document.getElementById('log')!;
const buttons = document.querySelectorAll<HTMLButtonElement>('button[data-game]');

let controller: GameController | null = null;
let best = 0;

function log(msg: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.textContent = `${line}\n${logEl.textContent}`.slice(0, 2000);
  console.log(line);
}

function mount(game: GameId): void {
  controller?.destroy();
  stage.innerHTML = '';
  best = 0;
  hud.textContent = 'SCORE 0 · BEST 0';

  const onScore = (score: number) => {
    if (score > best) best = score;
    hud.textContent = `SCORE ${score} · BEST ${best}`;
  };

  const onRunEnd = (result: RunResult) => {
    log(
      `RUN END · ${result.game} · score=${result.score} · reason=${result.reason} · ${Math.round(result.durationMs)}ms`,
    );
  };

  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  controller =
    game === 'coffee'
      ? createLastToken(canvas, onScore, onRunEnd, false)
      : game === 'traffic'
        ? createTrafficRider(canvas, onScore, onRunEnd, false)
        : createCompileRun(canvas, onScore, onRunEnd, false);
  controller.resume();
  canvas.focus();

  log(`Mounted ${game}`);
  buttons.forEach((b) => b.classList.toggle('active', b.dataset.game === game));
}

buttons.forEach((btn) => {
  btn.addEventListener('click', () => mount(btn.dataset.game as GameId));
});

mount('traffic');
