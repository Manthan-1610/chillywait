import type { GameController, RunEndCallback, ScoreCallback } from './types';
import type { PauseReason, RunEndReason } from '../engine/types';
import { GameRuntime, InputManager, Juice, audio } from '../engine';
import {
  COLORS,
  drawGameOver,
  drawScanlines,
  GAME_HEIGHT,
  GAME_WIDTH,
  setupCanvas,
} from './canvas-size';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const CHARGE_MAX = 100;
const CHARGE_PER_MASH = 11;
const COMBO_BONUS = 2;
const COMBO_WINDOW_MS = 220;
const DECAY_PER_SEC = 8;
const REACH_MS = 280;
const DRINK_MS = 900;
const COFFEE_POINTS = 50;
const COMBO_POINTS = 15;

type AnimState = 'idle' | 'mash' | 'reach' | 'drink';

/** Desk surface — scene built around this line. */
const DESK_Y = 175;
/** Seated worker origin (chest / seat area). */
const PERSON_X = 220;
const PERSON_Y = DESK_Y - 8;
/** Mug rests on desk to the right of keyboard. */
const CUP_DESK = { x: 390, y: DESK_Y - 18 };
/** Mouth when drinking. */
const MOUTH = { x: PERSON_X + 8, y: PERSON_Y - 58 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Mash → fill → reach → drink. Clear “dev at desk with coffee” scene. */
export function createCoffeeFrenzy(
  container: HTMLElement,
  onScore: ScoreCallback,
  onRunEnd: RunEndCallback,
  startPaused = true,
): GameController {
  container.innerHTML = '';
  container.className = 'game-area game-area--fill';

  const canvas = document.createElement('canvas');
  const ctx = setupCanvas(canvas, W, H);
  container.appendChild(canvas);

  const input = new InputManager();
  input.attach(canvas);

  let pauseReason: PauseReason | null = startPaused ? 'start' : null;
  let runEnded = false;
  let gameOver = false;
  let charge = 0;
  let coffees = 0;
  let peakCombo = 0;
  let score = 0;
  let anim: AnimState = 'idle';
  let animTimer = 0;
  let drinkPhase = 0;
  let mashFlash = 0;
  let shake = 0;
  let lastMash = 0;
  let combo = 0;
  let spaceDown = false;
  let keyFlash = 0;
  let steam: { x: number; y: number; life: number; vx: number }[] = [];
  let cupOnDesk = true;
  let cupX = CUP_DESK.x;
  let cupY = CUP_DESK.y;
  let sipBubbles = 0;
  let runStartedAt = 0;
  const juice = new Juice();
  let startedOnce = false;

  const recomputeScore = () => {
    score = coffees * COFFEE_POINTS + peakCombo * COMBO_POINTS;
    onScore(score);
  };

  const emitRunEnd = (reason: RunEndReason) => {
    if (runEnded) return;
    runEnded = true;
    onRunEnd({
      game: 'coffee',
      score,
      durationMs: runStartedAt ? performance.now() - runStartedAt : 0,
      reason,
    });
  };

  const mash = () => {
    if (pauseReason === 'answer' || pauseReason === 'minimize' || gameOver) return;
    audio.unlock();
    if (pauseReason === 'start' || pauseReason === 'user') {
      pauseReason = null;
      if (!runStartedAt) runStartedAt = performance.now();
      if (!startedOnce) {
        startedOnce = true;
        audio.play('start');
      }
      input.setEnabled(true);
      input.focusPlayfield();
    }

    const now = performance.now();
    if (now - lastMash < COMBO_WINDOW_MS) combo = Math.min(combo + 1, 8);
    else combo = 0;
    peakCombo = Math.max(peakCombo, combo);
    lastMash = now;
    mashFlash = 1;
    shake += 1.4;
    keyFlash = 1;
    juice.bumpShake(Math.min(5, 1.2 + combo * 0.35));
    audio.play('mash');

    if (anim === 'reach' || anim === 'drink') {
      animTimer = Math.max(0, animTimer - 100);
      return;
    }

    charge = Math.min(CHARGE_MAX, charge + CHARGE_PER_MASH + combo * (COMBO_BONUS / 4));
    anim = 'mash';
    if (charge >= CHARGE_MAX) startPickup();
  };

  const startPickup = () => {
    anim = 'reach';
    animTimer = REACH_MS;
    drinkPhase = 0;
    charge = CHARGE_MAX;
    audio.play('ui');
  };

  const startDrink = () => {
    anim = 'drink';
    animTimer = DRINK_MS;
    drinkPhase = 0;
    cupOnDesk = false;
    coffees++;
    recomputeScore();
    sipBubbles = 5;
    juice.addFloater(`+${COFFEE_POINTS} CUP`, CUP_DESK.x, CUP_DESK.y - 30, 'score');
    if (combo > 2) {
      juice.addFloater(`COMBO x${combo}`, PERSON_X, PERSON_Y - 70, 'near');
    }
    juice.bumpShake(3);
    audio.play('drink');
  };

  const finishDrink = () => {
    anim = 'idle';
    charge = 0;
    combo = 0;
    cupOnDesk = true;
    cupX = CUP_DESK.x;
    cupY = CUP_DESK.y;
  };

  const drawRoom = () => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c0a18');
    g.addColorStop(0.55, '#15102a');
    g.addColorStop(1, '#0a0812');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Wall
    ctx.fillStyle = '#1a1435';
    ctx.fillRect(40, 32, W - 80, DESK_Y - 48);
    // Window night city
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(W / 2 - 80, 44, 160, 78);
    ctx.fillStyle = '#38bdf8';
    ctx.globalAlpha = 0.15;
    ctx.fillRect(W / 2 - 80, 44, 160, 78);
    ctx.globalAlpha = 1;
    // Window panes
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 80, 44, 160, 78);
    ctx.beginPath();
    ctx.moveTo(W / 2, 44);
    ctx.lineTo(W / 2, 122);
    ctx.moveTo(W / 2 - 80, 83);
    ctx.lineTo(W / 2 + 80, 83);
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('~ DEV CAVE ~', W / 2, 22);
  };

  const drawCup = (x: number, y: number, tilt: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // Mug body
    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(-14, -12, 28, 26);
    ctx.fillStyle = '#78716c';
    ctx.fillRect(-14, -12, 28, 3);
    // Coffee
    ctx.fillStyle = '#5c3317';
    ctx.fillRect(-11, -8, 22, 16);
    // Handle
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(16, 0, 10, -1.1, 1.1);
    ctx.stroke();
    if (sipBubbles > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-6, -18, 5, 5);
      ctx.fillRect(4, -22, 4, 4);
    }
    ctx.restore();
  };

  const drawDesk = () => {
    // Desk top
    ctx.fillStyle = '#7c4a28';
    ctx.fillRect(56, DESK_Y, W - 112, 18);
    ctx.fillStyle = '#5c3518';
    ctx.fillRect(56, DESK_Y + 18, W - 112, 14);
    ctx.fillStyle = '#a16207';
    ctx.fillRect(56, DESK_Y, W - 112, 3);

    // Keyboard in front of worker
    const kx = PERSON_X + 36;
    const ky = DESK_Y - 12;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(kx, ky, 88, 14);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = keyFlash > 0.25 && i % 3 === 0 ? '#fbbf24' : '#4b5563';
      ctx.fillRect(kx + 4 + i * 7, ky + 3, 5, 7);
    }

    // Laptop / monitor
    const mx = 460;
    ctx.fillStyle = '#111827';
    ctx.fillRect(mx, DESK_Y - 70, 100, 66);
    ctx.fillStyle = '#022c22';
    ctx.fillRect(mx + 6, DESK_Y - 64, 88, 50);
    ctx.fillStyle = '#4ade80';
    ctx.font = '9px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('> compiling…', mx + 12, DESK_Y - 42);
    ctx.fillText('> need coffee', mx + 12, DESK_Y - 28);
    // Stand
    ctx.fillStyle = '#374151';
    ctx.fillRect(mx + 40, DESK_Y - 4, 20, 8);
  };

  /**
   * Side-view seated coder — head, torso, arms on keyboard, legs under desk.
   * Anyone should read this as “person at a desk.”
   */
  const drawPerson = (state: AnimState, _reachT: number, drinkT: number) => {
    const bob = state === 'mash' ? Math.sin(shake * 14) * 2 : 0;
    const lean = state === 'reach' || state === 'drink' ? 8 : state === 'mash' ? 3 : 0;
    const px = PERSON_X + lean;
    const py = PERSON_Y + bob;

    // Chair
    ctx.fillStyle = '#27272a';
    ctx.fillRect(px - 28, DESK_Y - 6, 56, 12);
    ctx.fillRect(px - 32, DESK_Y + 6, 64, 10);
    ctx.fillRect(px - 34, DESK_Y - 50, 10, 56);
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(px + 22, DESK_Y - 40, 8, 40);

    // Legs under desk (drawn before desk in scene)
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(px - 18, DESK_Y - 4, 14, 20);
    ctx.fillRect(px + 2, DESK_Y - 4, 14, 20);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px - 20, DESK_Y + 14, 16, 8);
    ctx.fillRect(px, DESK_Y + 14, 16, 8);

    // Torso
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(px - 22, py - 50, 44, 48);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(px - 14, py - 42, 28, 30);

    // Neck + head
    ctx.fillStyle = '#f5c8a0';
    ctx.fillRect(px - 7, py - 58, 14, 12);
    ctx.beginPath();
    ctx.arc(px, py - 72, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c3a1e';
    ctx.beginPath();
    ctx.arc(px, py - 78, 18, Math.PI * 1.05, Math.PI * -0.05);
    ctx.fill();
    ctx.fillRect(px - 18, py - 78, 36, 12);
    // Face
    ctx.fillStyle = '#1a1a1a';
    if (state === 'drink' && drinkT > 0.25) {
      ctx.fillRect(px - 12, py - 74, 7, 2);
      ctx.fillRect(px + 5, py - 74, 7, 2);
    } else {
      ctx.fillRect(px - 12, py - 76, 6, 6);
      ctx.fillRect(px + 6, py - 76, 6, 6);
    }
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(px - 5, py - 64, 10, 3);
  };

  /** Arms drawn AFTER desk so hands sit on the keyboard. */
  const drawArms = (state: AnimState, reachT: number, _drinkT: number) => {
    const bob = state === 'mash' ? Math.sin(shake * 14) * 2 : 0;
    const lean = state === 'reach' || state === 'drink' ? 8 : state === 'mash' ? 3 : 0;
    const px = PERSON_X + lean;
    const py = PERSON_Y + bob;
    const armY = py - 30;

    if (state === 'reach' || state === 'drink') {
      const t = state === 'reach' ? easeOut(reachT) : 1;
      const handX = lerp(px + 28, cupX, t);
      const handY = lerp(DESK_Y - 18, cupY, t);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px + 18, armY);
      ctx.lineTo(handX, handY);
      ctx.stroke();
      ctx.fillStyle = '#f5c8a0';
      ctx.beginPath();
      ctx.arc(handX, handY, 9, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const pump = state === 'mash' ? Math.sin(shake * 18) * 3 : 0;
      const handY = DESK_Y - 14 + pump;
      const kx = PERSON_X + 40;
      // Upper arms from torso
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(px + 16, py - 38, 14, 18);
      ctx.fillRect(px - 30, py - 38, 14, 18);
      // Forearms reaching to keyboard
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px + 22, py - 24);
      ctx.lineTo(kx + 8, handY);
      ctx.moveTo(px - 16, py - 24);
      ctx.lineTo(kx + 48, handY - pump);
      ctx.stroke();
      // Hands on keys
      ctx.fillStyle = '#f5c8a0';
      ctx.fillRect(kx, handY - 4, 18, 14);
      ctx.fillRect(kx + 40, handY - 4 - pump, 18, 14);
    }
  };

  const drawChargeMeter = () => {
    const mx = 48;
    const my = H - 78;
    const mw = W - 96;
    const mh = 18;
    const segs = 10;

    ctx.fillStyle = '#111827';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, mw, mh);

    const filled = Math.floor((charge / CHARGE_MAX) * segs);
    const segW = (mw - 10) / segs;
    for (let i = 0; i < segs; i++) {
      const sx = mx + 5 + i * segW;
      ctx.fillStyle =
        i < filled ? (i >= 8 ? '#f97316' : i >= 5 ? '#fbbf24' : '#facc15') : '#1f2937';
      ctx.fillRect(sx, my + 4, segW - 3, mh - 8);
    }

    ctx.fillStyle = COLORS.ui;
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CAFFEINE', mx, my - 5);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.floor(charge)}%`, mx + mw, my - 5);
  };

  const drawSpacebar = () => {
    const kx = 72;
    const ky = H - 42;
    const kw = W - 144;
    const kh = 30;
    const pressed = keyFlash > 0.25 || spaceDown;

    ctx.fillStyle = pressed ? '#0f172a' : '#1e1e2e';
    ctx.fillRect(kx, ky + 4, kw, kh);
    ctx.fillStyle = pressed ? '#334155' : '#3f3f5a';
    ctx.fillRect(kx, ky, kw, kh - 3);
    ctx.strokeStyle = pressed ? '#facc15' : '#7c3aed';
    ctx.lineWidth = 2;
    ctx.strokeRect(kx, ky, kw, kh + 3);

    ctx.fillStyle = pressed ? '#facc15' : '#e2e8f0';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE', kx + kw / 2, ky + 18);

    if (combo > 1) {
      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 10px "Courier New", monospace';
      ctx.fillText(`COMBO x${combo}`, kx + kw / 2, ky - 6);
    }
  };

  const updateCupPosition = (reachT: number, drinkT: number) => {
    if (cupOnDesk && anim !== 'reach' && anim !== 'drink') {
      cupX = CUP_DESK.x;
      cupY = CUP_DESK.y;
      return;
    }
    if (anim === 'reach') {
      const t = easeOut(reachT);
      cupX = lerp(CUP_DESK.x, MOUTH.x + 24, t * 0.65);
      cupY = lerp(CUP_DESK.y, MOUTH.y + 10, t * 0.5);
    } else if (anim === 'drink') {
      const t = easeInOut(drinkT);
      cupX = lerp(CUP_DESK.x - 30, MOUTH.x + 16, t);
      cupY = lerp(CUP_DESK.y - 8, MOUTH.y + 4, t);
    }
  };

  const drawScene = () => {
    juice.beginShake(ctx);

    drawRoom();

    let reachT = 0;
    let drinkT = 0;
    if (anim === 'reach') reachT = 1 - animTimer / REACH_MS;
    if (anim === 'drink') drinkT = 1 - animTimer / DRINK_MS;

    updateCupPosition(reachT, drinkT);
    // Z-order: body behind desk, then desk, then arms+cup on top
    drawPerson(anim, reachT, drinkT);
    drawDesk();
    drawArms(anim, reachT, drinkT);

    if (cupOnDesk || anim === 'reach' || anim === 'drink') {
      const tilt =
        anim === 'drink' ? -0.55 - Math.sin(drinkT * Math.PI) * 0.45 : 0;
      drawCup(cupX, cupY, tilt);
    }

    if (cupOnDesk && anim !== 'drink' && tickSteam()) {
      steam.push({
        x: CUP_DESK.x + (Math.random() - 0.5) * 8,
        y: CUP_DESK.y - 18,
        life: 1,
        vx: (Math.random() - 0.5) * 12,
      });
    }

    for (const s of steam) {
      ctx.fillStyle = `rgba(255,255,255,${s.life * 0.7})`;
      ctx.fillRect(s.x, s.y, 5, 5);
    }

    juice.drawFloaters(ctx);
    juice.endShake(ctx);

    drawChargeMeter();
    drawSpacebar();

    let hint = 'MASH SPACE TO FILL — THEN CHUG';
    if (anim === 'reach') hint = 'GRABBING MUG…';
    else if (anim === 'drink') hint = 'GULP — KEEP MASHING';
    else if (charge >= CHARGE_MAX - 5) hint = 'FULL — DRINKING';

    ctx.fillStyle = COLORS.ui;
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(hint, W / 2, H - 92);

    ctx.fillStyle = COLORS.ui;
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${score}`, 12, 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`${coffees} cups · peak x${peakCombo}`, W - 12, 18);

    drawScanlines(ctx, W, H);

    if (gameOver) {
      drawGameOver(ctx, score, W, H, 'Space or click to retry');
    } else if (pauseReason === 'answer') {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ANSWER READY — CHOOSE ABOVE', W / 2, H / 2);
    } else if (pauseReason && pauseReason !== 'start') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
    } else if (pauseReason === 'start') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS SPACE TO START', W / 2, H / 2 - 4);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText('Mash to fill caffeine · auto-drink when full', W / 2, H / 2 + 16);
    }
  };

  let steamTick = 0;
  const tickSteam = () => {
    steamTick++;
    return steamTick % 18 === 0;
  };

  const hitSpacebar = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    return x >= 56 && x <= W - 56 && y >= H - 56;
  };

  const resetRun = () => {
    gameOver = false;
    runEnded = false;
    charge = 0;
    coffees = 0;
    peakCombo = 0;
    score = 0;
    combo = 0;
    anim = 'idle';
    cupOnDesk = true;
    cupX = CUP_DESK.x;
    cupY = CUP_DESK.y;
    runStartedAt = performance.now();
    juice.reset();
    pauseReason = null;
    recomputeScore();
  };

  const onPointerDown = (e: PointerEvent) => {
    input.focusPlayfield();
    if (gameOver) {
      resetRun();
      return;
    }
    if (hitSpacebar(e.clientX, e.clientY)) mash();
  };

  const main = new GameRuntime({
    update: (dt) => {
      if (input.consumePress('Space') || input.consumePress(' ')) {
        if (gameOver) {
          resetRun();
          spaceDown = true;
          return;
        }
        if (!spaceDown) mash();
        spaceDown = true;
      }
      if (!input.isDown('Space') && !input.isDown(' ')) {
        spaceDown = false;
      }

      juice.tick();
      if (pauseReason || gameOver) return;

      if (anim === 'reach') {
        animTimer -= dt * 1000;
        if (animTimer <= 0) startDrink();
      } else if (anim === 'drink') {
        animTimer -= dt * 1000;
        drinkPhase++;
        if (drinkPhase % 12 === 0 && sipBubbles > 0) sipBubbles--;
        if (drinkPhase % 18 === 0) {
          steam.push({
            x: MOUTH.x + Math.random() * 10,
            y: MOUTH.y,
            life: 1,
            vx: (Math.random() - 0.5) * 18,
          });
        }
        if (animTimer <= 0) finishDrink();
      } else {
        charge = Math.max(0, charge - DECAY_PER_SEC * dt);
        if (anim === 'mash' && mashFlash < 0.15) anim = 'idle';
      }

      mashFlash = Math.max(0, mashFlash - dt * 4);
      keyFlash = Math.max(0, keyFlash - dt * 5);

      steam = steam
        .map((s) => ({
          ...s,
          x: s.x + s.vx * dt,
          y: s.y - 45 * dt,
          life: s.life - dt * 0.9,
        }))
        .filter((s) => s.life > 0);
    },
    render: () => drawScene(),
    isSimulating: () => true,
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  drawScene();
  main.start();

  return {
    destroy() {
      main.stop();
      input.detach();
      canvas.removeEventListener('pointerdown', onPointerDown);
      container.innerHTML = '';
    },
    pause(reason: PauseReason = 'user') {
      pauseReason = reason;
      if (reason === 'minimize' || reason === 'answer') input.setEnabled(false);
    },
    resume() {
      if (gameOver) return;
      pauseReason = null;
      input.setEnabled(true);
      input.focusPlayfield();
    },
    endRun(reason: RunEndReason) {
      emitRunEnd(reason);
      if (reason !== 'death') pauseReason = 'user';
    },
    getScore: () => score,
  };
}
