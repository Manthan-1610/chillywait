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
const CX = W / 2;
const BASE_Y = 198;
const CHIP_H = 16;
const CHIP_W = 92;
const FLOOR_Y = BASE_Y + 36;
/** Ring shrink time. The sweet spot sits in the middle of this, not at the end. */
const GRAB_FRAMES = 110;
const RING_START = 168;
const RING_END = 12;
const HIT_SLACK = 34;
const PERFECT_SLACK = 16;
const FALL_HOLD = 52;
const LOCK_RATES = [0.8, 0.6, 0.4];

type Mode = 'play' | 'grab' | 'caught' | 'falling' | 'dead';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface FallChip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
}

interface Flyer {
  x: number;
  y: number;
  color: string;
  value: number;
}

export interface LockQuote {
  gain: number;
  rate: number;
  beat: boolean;
  nextLocks: number;
  nextBest: number;
}

/** Greed curve — each extra chip is worth more than the last. */
export function stackValue(chips: number): number {
  if (chips <= 0) return 0;
  return Math.round(20 * chips * (1 + (chips - 1) * 0.55));
}

/**
 * First lock pays full. Repeats pay 80, then 60, then 40.
 * Beating the previous height restores full pay and adds 25%.
 */
export function lockQuote(chips: number, locks: number, bestHeight: number): LockQuote {
  const raw = stackValue(chips);
  const beat = bestHeight > 0 && chips > bestHeight;
  const rate = locks === 0 || beat ? 1 : LOCK_RATES[Math.min(locks - 1, LOCK_RATES.length - 1)];
  const bonus = beat ? Math.round(raw * 0.25) : 0;
  return {
    gain: Math.round(raw * rate) + bonus,
    rate,
    beat,
    nextLocks: beat ? 1 : locks + 1,
    nextBest: Math.max(bestHeight, chips),
  };
}

function chipColor(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  if (t < 0.45) return '#67e8f9';
  if (t < 0.75) return '#fbbf24';
  return '#fb7185';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function ringRadius(frame: number): number {
  const p = Math.min(1, Math.max(0, frame) / GRAB_FRAMES);
  return RING_START + (RING_END - RING_START) * p;
}

function targetRadius(chips: number): number {
  return 40 + chips * 3.2;
}

/**
 * Last Token — the lock remembers you.
 * Repeat cash-outs pay less and leave the table hot.
 * The answer is a closing ring: tap when it meets the stack.
 */
export function createLastToken(
  canvas: HTMLCanvasElement,
  onScore: ScoreCallback,
  onRunEnd: RunEndCallback,
  startPaused = true,
): GameController {
  const ctx = setupCanvas(canvas);
  const input = new InputManager();
  input.attach(canvas);

  let pauseReason: PauseReason | null = startPaused ? 'start' : null;
  let mode: Mode = 'play';
  let runEnded = false;
  let banked = 0;
  let chips = 0;
  let risk = 0;
  let locks = 0;
  let bestHeight = 0;
  let tick = 0;
  let grabT = 0;
  let impact = 0;
  let landPulse = 0;
  let fallHold = 0;
  let sparks: Spark[] = [];
  let falling: FallChip[] = [];
  let flyers: Flyer[] = [];
  let runStartedAt = 0;
  const juice = new Juice();

  const syncScore = () => onScore(banked);

  const emitRunEnd = (reason: RunEndReason) => {
    if (runEnded) return;
    runEnded = true;
    onRunEnd({
      game: 'coffee',
      score: banked,
      durationMs: runStartedAt ? performance.now() - runStartedAt : 0,
      reason,
    });
  };

  const reset = () => {
    pauseReason = null;
    mode = 'play';
    runEnded = false;
    banked = 0;
    chips = 0;
    risk = 0;
    locks = 0;
    bestHeight = 0;
    tick = 0;
    grabT = 0;
    impact = 0;
    landPulse = 0;
    fallHold = 0;
    sparks = [];
    falling = [];
    flyers = [];
    runStartedAt = 0;
    juice.reset();
    syncScore();
  };

  const burst = (x: number, y: number, color: string, n = 10) => {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const sp = 1.2 + Math.random() * 2.4;
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.6,
        life: 1,
        color,
      });
    }
  };

  const beginRun = () => {
    if (!runStartedAt) runStartedAt = performance.now();
    if (pauseReason === 'start' || pauseReason === 'user') {
      pauseReason = null;
      input.setEnabled(true);
      input.focusPlayfield();
    }
  };

  const launchFall = (label: string) => {
    if (mode === 'falling' || mode === 'dead') return;
    falling = [];
    const count = Math.max(chips, 1);
    for (let i = 0; i < chips; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      falling.push({
        x: CX + (i - chips / 2) * 2,
        y: BASE_Y - (i + 1) * CHIP_H + CHIP_H / 2,
        vx: dir * (1.4 + Math.random() * 2.4),
        vy: -2.2 - Math.random() * 1.8,
        rot: 0,
        vr: dir * (0.12 + Math.random() * 0.16),
        color: chipColor(i, count),
      });
    }
    chips = 0;
    mode = 'falling';
    fallHold = FALL_HOLD;
    burst(CX, BASE_Y - 20, '#fb7185', 16);
    juice.bumpShake(14);
    juice.addHitstop(3);
    juice.addFloater(label, CX, 108, 'danger');
    audio.play('crash');
    emitRunEnd('death');
  };

  const commitGain = (gain: number, label: string, celebrated: boolean) => {
    const count = Math.max(1, chips);
    const slice = gain / count;
    let sent = 0;
    for (let i = 0; i < chips; i++) {
      const value = i === chips - 1 ? gain - sent : slice;
      sent += value;
      flyers.push({
        x: CX,
        y: BASE_Y - (i + 1) * CHIP_H + CHIP_H / 2,
        color: chipColor(i, chips),
        value,
      });
    }
    if (chips === 0 && gain > 0) {
      flyers.push({ x: CX, y: BASE_Y - 24, color: '#fde68a', value: gain });
    }
    burst(CX, BASE_Y - 36, celebrated ? '#fde68a' : '#67e8f9', 8);
    juice.addFloater(label, CX, 96, celebrated ? 'best' : 'score');
    juice.bumpShake(celebrated ? 4 : 2);
    audio.play(celebrated ? 'best' : 'perfect');
    if (chips > bestHeight) bestHeight = chips;
    chips = 0;
    landPulse = 1;
  };

  const lockStack = () => {
    if (chips <= 0 || mode !== 'play') return;
    const quote = lockQuote(chips, locks, bestHeight);
    locks = quote.nextLocks;
    bestHeight = quote.nextBest;
    risk *= 0.5;
    const pct = Math.round(quote.rate * 100);
    commitGain(
      quote.gain,
      quote.beat ? `HEIGHT +${quote.gain}` : `LOCKED ${pct}%  +${quote.gain}`,
      quote.beat,
    );
  };

  const judgeCatch = () => {
    if (mode !== 'grab') return;
    if (chips <= 0) {
      mode = 'caught';
      juice.addFloater('CLEAR', CX, 120, 'near');
      audio.play('ui');
      return;
    }
    const delta = ringRadius(grabT) - targetRadius(chips);
    const abs = Math.abs(delta);
    if (abs <= PERFECT_SLACK) {
      const gain = stackValue(chips) + Math.round(stackValue(chips) * 0.25);
      if (chips > bestHeight) bestHeight = chips;
      commitGain(gain, `PERFECT +${gain}`, true);
      mode = 'caught';
      impact = 1;
      return;
    }
    if (abs <= HIT_SLACK) {
      const gain = stackValue(chips);
      if (chips > bestHeight) bestHeight = chips;
      commitGain(gain, `CAUGHT +${gain}`, true);
      mode = 'caught';
      impact = 1;
      return;
    }
    launchFall(delta > 0 ? 'EARLY' : 'LATE');
  };

  const addChip = () => {
    if (mode !== 'play' || pauseReason === 'answer' || pauseReason === 'minimize') return;
    audio.unlock();
    beginRun();
    chips += 1;
    landPulse = 1;
    risk = Math.min(1, risk + 0.05 + chips * 0.01);
    burst(CX, BASE_Y - chips * CHIP_H, chipColor(chips - 1, chips), 6);
    audio.blip(Math.max(86, 470 - chips * 34));
    if (chips >= 4) juice.bumpShake(1.1 + chips * 0.12);
    if (risk >= 1) launchFall('TOO HOT');
  };

  const hitLock = (x: number, y: number) =>
    x >= CX - 86 && x <= CX + 86 && y >= H - 52 && y <= H - 14;

  const pointer = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  };

  const nextRateLabel = () => {
    if (chips > bestHeight && bestHeight > 0) return 'FULL + BONUS';
    if (locks === 0) return 'FULL PAY';
    const rate = LOCK_RATES[Math.min(locks - 1, LOCK_RATES.length - 1)];
    return `${Math.round(rate * 100)}% PAY`;
  };

  const previewGain = () => {
    if (chips <= 0) return 0;
    return lockQuote(chips, locks, bestHeight).gain;
  };

  const drawBackground = () => {
    const heat = Math.min(1, risk);
    const g = ctx.createRadialGradient(CX, 80, 20, CX, H * 0.45, W * 0.72);
    g.addColorStop(0, heat > 0.65 ? '#4c1d2a' : '#2a1860');
    g.addColorStop(0.45, '#12081f');
    g.addColorStop(1, '#05040a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  const drawPedestal = () => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(CX, BASE_Y + 28, 78, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    const stone = ctx.createLinearGradient(CX - 70, 0, CX + 70, 0);
    stone.addColorStop(0, '#1e1b2e');
    stone.addColorStop(0.5, '#3b3558');
    stone.addColorStop(1, '#14121f');
    ctx.fillStyle = stone;
    roundRect(ctx, CX - 74, BASE_Y + 4, 148, 22, 6);
    ctx.fill();
    ctx.fillStyle = risk > 0.65 ? '#fb7185' : '#fbbf24';
    ctx.fillRect(CX - 74, BASE_Y + 4, 148, 3);
  };

  const drawOneChip = (x: number, y: number, color: string, label: string, rot = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -CHIP_W / 2 + 3, 3, CHIP_W, CHIP_H - 2, 5);
    ctx.fill();
    const face = ctx.createLinearGradient(-CHIP_W / 2, 0, CHIP_W / 2, CHIP_H);
    face.addColorStop(0, '#fff7ed');
    face.addColorStop(0.18, color);
    face.addColorStop(1, '#1c1917');
    ctx.fillStyle = face;
    roundRect(ctx, -CHIP_W / 2, 0, CHIP_W, CHIP_H - 2, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-CHIP_W / 2 + 8, 2, CHIP_W - 16, 2);
    ctx.fillStyle = '#0c0a09';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 11);
    ctx.restore();
  };

  const drawChips = (sway: number) => {
    for (let i = 0; i < chips; i++) {
      const wobble = sway * (i + 1) * 0.55;
      const y =
        BASE_Y -
        (i + 1) * CHIP_H +
        (landPulse > 0 && i === chips - 1 ? (1 - landPulse) * 6 : 0);
      drawOneChip(CX + wobble, y + CHIP_H / 2, chipColor(i, chips), i === chips - 1 ? `×${chips}` : '◆');
    }
  };

  const drawFalling = () => {
    for (const chip of falling) {
      drawOneChip(chip.x, chip.y, chip.color, '◆', chip.rot);
    }
  };

  const drawFlyers = () => {
    for (const chip of flyers) {
      drawOneChip(chip.x, chip.y, chip.color, '◆');
    }
  };

  const drawLock = () => {
    const hot = chips > 0 && mode === 'play';
    const beat = hot && chips > bestHeight && bestHeight > 0;
    ctx.fillStyle = beat ? '#fde68a' : hot ? '#fbbf24' : '#3f3f46';
    roundRect(ctx, CX - 92, H - 50, 184, 34, 6);
    ctx.fill();
    ctx.fillStyle = hot ? '#1c1917' : '#a1a1aa';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(hot ? `LOCK  ${nextRateLabel()}` : 'LOCK', CX, H - 28);
  };

  const drawHud = () => {
    ctx.textAlign = 'center';
    if (chips > 0 && (mode === 'play' || mode === 'grab')) {
      ctx.fillStyle = '#fff7ed';
      ctx.font = 'bold 26px "Courier New", monospace';
      ctx.fillText(String(mode === 'grab' ? stackValue(chips) : previewGain()), CX, 58);
      ctx.font = '11px "Courier New", monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(mode === 'grab' ? 'FULL IF YOU TIME IT' : nextRateLabel(), CX, 76);
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(`BANK ${banked}`, 14, 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = risk > 0.45 ? '#fb7185' : COLORS.muted;
    ctx.fillText(bestHeight > 0 ? `BEST HEIGHT ${bestHeight}` : 'HEAT', W - 14, 22);

    const meterW = 160;
    ctx.fillStyle = '#1c1917';
    roundRect(ctx, 14, 30, meterW, 8, 3);
    ctx.fill();
    const tone = risk > 0.72 ? '#fb7185' : risk > 0.4 ? '#fbbf24' : '#67e8f9';
    ctx.fillStyle = tone;
    roundRect(ctx, 14, 30, Math.max(0, meterW * risk), 8, 3);
    ctx.fill();
  };

  const drawGrab = () => {
    const radius = ringRadius(grabT);
    const target = targetRadius(chips);
    const delta = Math.abs(radius - target);
    const tone =
      delta <= PERFECT_SLACK ? '#fde68a' : delta <= HIT_SLACK ? '#fbbf24' : '#fb7185';
    ctx.strokeStyle = tone;
    ctx.lineWidth = delta <= HIT_SLACK ? 5 : 3;
    ctx.beginPath();
    ctx.arc(CX, stackFocusY(), radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff7ed';
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText('ANSWERED', CX, 28);
    ctx.fillStyle = tone;
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillText('TAP AS THE RING MEETS THE STACK', CX, 112);
  };

  const stackFocusY = () => {
    if (chips <= 0) return BASE_Y - 20;
    const top = BASE_Y - chips * CHIP_H;
    return (top + BASE_Y) / 2;
  };

  const draw = () => {
    const sway =
      mode === 'falling' || mode === 'dead'
        ? 0
        : Math.sin(tick / 7) * (2 + chips * 1.15) * (0.35 + risk);

    juice.beginShake(ctx);
    drawBackground();
    drawPedestal();
    if (mode === 'falling' || mode === 'dead') drawFalling();
    else drawChips(sway);
    drawFlyers();

    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, 3, 3);
      ctx.globalAlpha = 1;
    }
    juice.drawFloaters(ctx);
    if (mode === 'grab') drawGrab();
    if (mode === 'caught') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillText('STACK SECURED', CX, 100);
    }

    drawHud();
    if (mode === 'play') drawLock();
    drawScanlines(ctx, W, H);
    juice.endShake(ctx);

    if (mode === 'dead') {
      drawGameOver(ctx, banked, W, H, 'Space or click to retry');
    } else if (mode === 'play' && pauseReason === 'start') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff7ed';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillText('LAST TOKEN', CX, H / 2 - 34);
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillText('STACK HIGHER FOR FULL PAY', CX, H / 2 - 8);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px "Courier New", monospace';
      ctx.fillText('Repeat locks pay less. Heat stays.', CX, H / 2 + 14);
      ctx.fillText('When the answer lands, time the ring.', CX, H / 2 + 32);
    } else if (pauseReason === 'minimize' && mode === 'play') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillText('PAUSED', CX, H / 2);
    }
  };

  const stepFalling = () => {
    for (const chip of falling) {
      chip.vy += 0.28;
      chip.x += chip.vx;
      chip.y += chip.vy;
      chip.rot += chip.vr;
      if (chip.y > FLOOR_Y) {
        chip.y = FLOOR_Y;
        chip.vy *= -0.35;
        chip.vx *= 0.72;
        chip.vr *= 0.6;
      }
    }
    fallHold -= 1;
    if (fallHold <= 0) mode = 'dead';
  };

  const onPointer = (e: PointerEvent) => {
    audio.unlock();
    input.focusPlayfield();
    if (mode === 'dead') {
      reset();
      return;
    }
    const { x, y } = pointer(e.clientX, e.clientY);
    if (mode === 'grab') {
      judgeCatch();
      return;
    }
    if (mode !== 'play' || pauseReason === 'minimize') return;
    if (hitLock(x, y)) {
      beginRun();
      lockStack();
      return;
    }
    addChip();
  };

  const main = new GameRuntime({
    update: () => {
      if ((input.consumePress('r') || input.consumePress('R')) && mode === 'dead') reset();

      if (
        mode === 'grab' &&
        (input.consumePress('Space') || input.consumePress(' ') || input.consumePress('Enter'))
      ) {
        judgeCatch();
      }
      if (mode === 'play' && pauseReason !== 'minimize') {
        if (input.consumePress('b') || input.consumePress('B') || input.consumePress('Shift')) {
          beginRun();
          lockStack();
        } else if (input.consumePress('Space') || input.consumePress(' ')) {
          addChip();
        }
      }

      const canSim = juice.tick();
      if (!canSim && mode !== 'falling') return;

      tick++;
      landPulse = Math.max(0, landPulse - 0.12);
      impact = Math.max(0, impact - 0.04);
      sparks = sparks
        .map((s) => ({
          ...s,
          x: s.x + s.vx,
          y: s.y + s.vy,
          vy: s.vy + 0.08,
          life: s.life - 0.03,
        }))
        .filter((s) => s.life > 0);

      const stillFlying: Flyer[] = [];
      for (const chip of flyers) {
        chip.x += (46 - chip.x) * 0.22;
        chip.y += (18 - chip.y) * 0.22;
        if (Math.hypot(46 - chip.x, 18 - chip.y) < 12) {
          banked += chip.value;
          syncScore();
          audio.blip(720);
        } else {
          stillFlying.push(chip);
        }
      }
      flyers = stillFlying;

      if (mode === 'falling') {
        stepFalling();
        return;
      }

      if (mode === 'grab') {
        grabT++;
        const late = ringRadius(grabT) < targetRadius(Math.max(chips, 1)) - HIT_SLACK;
        if (chips > 0 && late) launchFall('LATE');
        return;
      }

      if (mode !== 'play' || pauseReason) return;

      if (chips >= 3) risk = Math.min(1, risk + 0.0035 + Math.max(0, chips - 3) * 0.0018);
      else risk = Math.max(0, risk - 0.004);
      if (risk >= 1) launchFall('TOO HOT');
    },
    render: () => draw(),
    isSimulating: () => true,
  });

  canvas.addEventListener('pointerdown', onPointer);
  draw();
  main.start();

  return {
    destroy() {
      main.stop();
      input.detach();
      canvas.removeEventListener('pointerdown', onPointer);
    },
    pause(reason: PauseReason = 'user') {
      if (reason === 'answer') {
        if (mode === 'grab' || mode === 'caught' || mode === 'falling' || mode === 'dead') return;
        beginRun();
        mode = 'grab';
        grabT = 0;
        impact = 1;
        juice.bumpShake(5);
        audio.play('start');
        if (chips <= 0) {
          mode = 'caught';
          juice.addFloater('CLEAR', CX, 120, 'near');
        }
        return;
      }
      pauseReason = reason;
      if (reason === 'minimize') input.setEnabled(false);
    },
    resume() {
      if (mode === 'dead' || mode === 'falling') return;
      runEnded = false;
      if (mode === 'caught' || mode === 'grab') mode = 'play';
      pauseReason = null;
      input.setEnabled(true);
      input.focusPlayfield();
    },
    endRun(reason: RunEndReason) {
      emitRunEnd(reason);
      if (reason !== 'death' && mode !== 'dead' && mode !== 'falling') pauseReason = 'user';
    },
    getScore: () => banked + flyers.reduce((sum, chip) => sum + chip.value, 0),
  };
}
