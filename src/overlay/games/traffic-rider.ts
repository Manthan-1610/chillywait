import type { GameController, RunEndCallback, ScoreCallback } from './types';
import type { PauseReason, RunEndReason } from '../engine/types';
import { GameRuntime, InputManager, Juice, audio } from '../engine';
import { createSeededRng, freshRunSeed, type Rng } from '../../shared/seeded-rng';
import {
  COLORS,
  drawGameOver,
  drawPaused,
  drawScanlines,
  GAME_HEIGHT,
  GAME_WIDTH,
  setupCanvas,
} from './canvas-size';
import { scaledWaveAt } from './traffic-waves';

const VP_X = GAME_WIDTH / 2;
const VP_Y = 52;
const ROAD_BOTTOM = GAME_HEIGHT - 24;
/** Bike/rider draw scale (1 = previous size). */
const BIKE_SCALE = 0.72;
const HIT_Z_MIN = 0.8;
const HIT_Z_MAX = 0.96;
const NEAR_Z_MIN = 0.68;
const NEAR_Z_MAX = 0.8;
const LANE_HIT = 0.42;
const NEAR_MISS_POINTS = 50;
const NITRO_MULT = 1.55;

interface Car {
  lane: number;
  z: number;
  color: string;
  kind: 'sedan' | 'truck';
  nearMissed: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function laneCenter(lane: number, z: number): number {
  const t = Math.max(0, Math.min(1, z));
  const spread = lerp(18, 168, t);
  // lane is continuous (0..2); map to -1..+1 — never index an array with a float
  const offset = Math.max(-1, Math.min(1, lane - 1));
  return VP_X + offset * spread;
}

function roadY(z: number): number {
  return lerp(VP_Y, ROAD_BOTTOM, Math.max(0, Math.min(1, z)));
}

/** Pseudo-3D hero racer — near-misses, nitro, authored waves. */
export function createTrafficRider(
  canvas: HTMLCanvasElement,
  onScore: ScoreCallback,
  onRunEnd: RunEndCallback,
  startPaused = true,
): GameController {
  const ctx = setupCanvas(canvas);
  const input = new InputManager();
  input.attach(canvas);

  let pauseReason: PauseReason | null = startPaused ? 'start' : null;
  let gameOver = false;
  let started = false;
  let runEnded = false;
  let lane = 1;
  let laneT = 1;
  let distance = 0;
  let nearMissScore = 0;
  let nitroScore = 0;
  let score = 0;
  let tick = 0;
  let cars: Car[] = [];
  let spawnTimer = 0;
  let roadScroll = 0;
  let runStartedAt = 0;
  let nitro = false;
  let wasNitro = false;
  let crashHold = 0;
  let kickX = 0;
  let kickY = 0;
  let lastAnnouncedStage = 1;
  let runSeed = freshRunSeed();
  let rng: Rng = createSeededRng(runSeed);
  const juice = new Juice();

  const carColors = [COLORS.danger, COLORS.warn, '#c41e3a', '#7b2cbf', '#2563eb'];

  const recomputeScore = () => {
    score = Math.floor(distance) + nearMissScore + Math.floor(nitroScore);
    onScore(score);
  };

  const emitRunEnd = (reason: RunEndReason) => {
    if (runEnded) return;
    runEnded = true;
    onRunEnd({
      game: 'traffic',
      score,
      durationMs: runStartedAt ? performance.now() - runStartedAt : 0,
      reason,
      seed: runSeed,
    });
  };

  const reset = () => {
    gameOver = false;
    started = false;
    runEnded = false;
    lane = 1;
    laneT = 1;
    distance = 0;
    nearMissScore = 0;
    nitroScore = 0;
    score = 0;
    tick = 0;
    cars = [];
    spawnTimer = 0;
    roadScroll = 0;
    runStartedAt = 0;
    nitro = false;
    wasNitro = false;
    crashHold = 0;
    kickX = 0;
    kickY = 0;
    lastAnnouncedStage = 1;
    runSeed = freshRunSeed();
    rng = createSeededRng(runSeed);
    juice.reset();
    onScore(0);
  };

  const spawnCar = (waveMaxParallel: number, truckChance: number) => {
    const occupied = new Set(
      cars.filter((c) => c.z < 0.25).map((c) => c.lane),
    );
    const free = [0, 1, 2].filter((l) => !occupied.has(l));
    if (free.length === 0) return;
    if (3 - free.length >= waveMaxParallel) return;

    const l = free[Math.floor(rng() * free.length)];
    cars.push({
      lane: l,
      z: 0,
      color: carColors[Math.floor(rng() * carColors.length)],
      kind: rng() < truckChance ? 'truck' : 'sedan',
      nearMissed: false,
    });
  };

  const drawSky = () => {
    const g = ctx.createLinearGradient(0, 0, 0, ROAD_BOTTOM);
    g.addColorStop(0, COLORS.sky);
    g.addColorStop(0.55, COLORS.skyHi);
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = 'rgba(255,236,39,0.15)';
    ctx.beginPath();
    ctx.arc(VP_X, VP_Y - 18, 22, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawRoad = (speed: number) => {
    const leftTop = VP_X - 18;
    const rightTop = VP_X + 18;
    const leftBot = 8;
    const rightBot = GAME_WIDTH - 8;

    ctx.fillStyle = COLORS.roadDark;
    ctx.beginPath();
    ctx.moveTo(leftTop, VP_Y);
    ctx.lineTo(rightTop, VP_Y);
    ctx.lineTo(rightBot, ROAD_BOTTOM);
    ctx.lineTo(leftBot, ROAD_BOTTOM);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = nitro ? '#3a2a4e' : COLORS.road;
    ctx.beginPath();
    ctx.moveTo(leftTop + 6, VP_Y);
    ctx.lineTo(rightTop - 6, VP_Y);
    ctx.lineTo(rightBot - 14, ROAD_BOTTOM);
    ctx.lineTo(leftBot + 14, ROAD_BOTTOM);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftTop + 2, VP_Y);
    ctx.lineTo(leftBot + 10, ROAD_BOTTOM);
    ctx.moveTo(rightTop - 2, VP_Y);
    ctx.lineTo(rightBot - 10, ROAD_BOTTOM);
    ctx.stroke();

    for (let i = 0; i < 14; i++) {
      const z0 = (i / 14 + roadScroll) % 1;
      const z1 = z0 + 0.04;
      if (z1 > 1) continue;
      const y0 = roadY(z0);
      const y1 = roadY(z1);
      const xL = laneCenter(0, z0) + (laneCenter(1, z0) - laneCenter(0, z0)) * 0.5;
      const xR = laneCenter(1, z0) + (laneCenter(2, z0) - laneCenter(1, z0)) * 0.5;
      const w = Math.max(2, 4 * z0 + 2);
      ctx.fillStyle = nitro ? COLORS.ui : COLORS.lane;
      ctx.fillRect(xL - w / 2, y0, w, Math.max(2, y1 - y0));
      ctx.fillRect(xR - w / 2, y0, w, Math.max(2, y1 - y0));
    }
    void speed;
  };

  const drawCar = (c: Car) => {
    // Contact point = roadY (wheels on asphalt), body rises upward
    const contactY = roadY(c.z);
    const cx = laneCenter(c.lane, c.z);
    const scale = lerp(0.4, 1.2, c.z);
    const w = (c.kind === 'truck' ? 36 : 30) * scale;
    const h = (c.kind === 'truck' ? 40 : 32) * scale;
    const top = contactY - h;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, contactY - 2, w * 0.45, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.color;
    ctx.fillRect(cx - w / 2, top, w, h * 0.72);
    // cabin
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - w * 0.36, top + h * 0.12, w * 0.72, h * 0.28);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(cx - w * 0.32, top + h * 0.16, w * 0.64, h * 0.2);
    // bumper + lights facing player
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(cx - w / 2, top + h * 0.68, w, h * 0.22);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - w * 0.42, top + h * 0.74, w * 0.2, h * 0.1);
    ctx.fillRect(cx + w * 0.22, top + h * 0.74, w * 0.2, h * 0.1);
    if (c.kind === 'truck') {
      ctx.fillStyle = '#374151';
      ctx.fillRect(cx - w * 0.12, top + h * 0.35, w * 0.24, h * 0.3);
    }
  };

  /**
   * OutRun-style rear motorcycle — narrow bike, rider astride, readable silhouette.
   */
  const drawBike = () => {
    const lean = (lane - laneT) * 14;
    const cx = laneCenter(laneT, 1) + lean;
    const by = ROAD_BOTTOM;

    ctx.save();
    // Shrink around tire contact so wheels stay on the road
    ctx.translate(cx, by);
    ctx.scale(BIKE_SCALE, BIKE_SCALE);
    ctx.translate(-cx, -by);

    if (Math.abs(lean) > 0.2) {
      ctx.translate(cx, by - 40);
      ctx.rotate(lean * 0.04);
      ctx.translate(-cx, -(by - 40));
    }

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, by - 2, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // === REAR WHEEL (dominant — motorcycle cue) ===
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(cx, by - 20, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f3f46';
    ctx.beginPath();
    ctx.arc(cx, by - 20, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a1a1aa';
    ctx.beginPath();
    ctx.arc(cx, by - 20, 4, 0, Math.PI * 2);
    ctx.fill();

    // Swingarm
    ctx.fillStyle = '#52525b';
    ctx.fillRect(cx - 4, by - 28, 8, 14);

    // Exhaust (left of wheel)
    ctx.fillStyle = '#27272a';
    ctx.fillRect(cx - 22, by - 18, 8, 16);
    ctx.fillStyle = nitro ? '#fb923c' : '#57534e';
    ctx.fillRect(cx - 20, by - 4, 4, 6);

    // === BIKE BODY (narrow red fairing) ===
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(cx - 14, by - 22);
    ctx.lineTo(cx - 12, by - 58);
    ctx.lineTo(cx + 12, by - 58);
    ctx.lineTo(cx + 14, by - 22);
    ctx.closePath();
    ctx.fill();
    // Tank darker center
    ctx.fillStyle = '#9f1239';
    ctx.fillRect(cx - 9, by - 52, 18, 22);
    // Tail light
    ctx.fillStyle = '#f87171';
    ctx.fillRect(cx - 5, by - 28, 10, 5);

    // Seat (rider sits here)
    ctx.fillStyle = '#18181b';
    ctx.fillRect(cx - 10, by - 56, 20, 10);

    // === RIDER sitting on seat ===
    // Thighs wrapping bike
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(cx - 18, by - 48, 10, 20);
    ctx.fillRect(cx + 8, by - 48, 10, 20);
    // Boots on pegs
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 20, by - 30, 12, 7);
    ctx.fillRect(cx + 8, by - 30, 12, 7);

    // Torso leaning forward
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(cx - 13, by - 52);
    ctx.lineTo(cx - 11, by - 78);
    ctx.lineTo(cx + 11, by - 78);
    ctx.lineTo(cx + 13, by - 52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#15803d';
    ctx.fillRect(cx - 8, by - 72, 16, 14);

    // Arms reaching to bars (angled down-out)
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 8, by - 70);
    ctx.lineTo(cx - 26, by - 62);
    ctx.moveTo(cx + 8, by - 70);
    ctx.lineTo(cx + 26, by - 62);
    ctx.stroke();
    // Hands
    ctx.fillStyle = '#f5c8a0';
    ctx.beginPath();
    ctx.arc(cx - 26, by - 62, 5, 0, Math.PI * 2);
    ctx.arc(cx + 26, by - 62, 5, 0, Math.PI * 2);
    ctx.fill();

    // Handlebars (short — not wings)
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 28, by - 64);
    ctx.lineTo(cx + 28, by - 64);
    ctx.stroke();
    // Grips up
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(cx - 30, by - 72, 5, 12);
    ctx.fillRect(cx + 25, by - 72, 5, 12);

    // Helmet on shoulders
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(cx, by - 88, 14, 0, Math.PI * 2);
    ctx.fill();
    // Visor
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 11, by - 90, 22, 9);
    ctx.fillStyle = '#38bdf8';
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cx - 9, by - 88, 9, 5);
    ctx.globalAlpha = 1;

    if (nitro) {
      ctx.fillStyle = 'rgba(251,146,60,0.95)';
      ctx.beginPath();
      ctx.moveTo(cx - 10, by);
      ctx.lineTo(cx, by + 22);
      ctx.lineTo(cx + 10, by);
      ctx.fill();
      ctx.fillStyle = 'rgba(250,204,21,0.85)';
      ctx.beginPath();
      ctx.moveTo(cx - 5, by + 4);
      ctx.lineTo(cx, by + 28);
      ctx.lineTo(cx + 5, by + 4);
      ctx.fill();
    }

    ctx.restore();
  };

  const draw = () => {
    const wave = scaledWaveAt(tick);
    const baseSpeed = wave.speed;
    juice.beginShake(ctx);
    ctx.translate(kickX, kickY);

    drawSky();
    drawRoad(baseSpeed);
    for (const c of [...cars].sort((a, b) => a.z - b.z)) drawCar(c);
    drawBike();
    juice.drawFloaters(ctx);

    ctx.fillStyle = COLORS.ui;
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${score}`, 8, 16);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`STAGE ${wave.stage} · ${wave.id.toUpperCase()}`, 8, 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = nitro ? COLORS.warn : COLORS.ui;
    ctx.fillText(nitro ? 'NITRO' : `SPD ${(baseSpeed * (nitro ? NITRO_MULT : 1) * 220).toFixed(0)}`, GAME_WIDTH - 8, 16);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('HOLD SPACE = NITRO', GAME_WIDTH - 8, 30);

    drawScanlines(ctx, GAME_WIDTH, GAME_HEIGHT);
    juice.endShake(ctx);

    if (gameOver) {
      drawGameOver(ctx, score);
    } else if (pauseReason === 'answer') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ANSWER READY — CHOOSE ABOVE', GAME_WIDTH / 2, GAME_HEIGHT / 2);
    } else if (pauseReason && pauseReason !== 'start') {
      drawPaused(ctx);
    } else if (!started || pauseReason === 'start') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('USE  ◀  ▶  TO RIDE', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText('HOLD SPACE for nitro · near-miss for bonus', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12);
    }
  };

  const moveLane = (d: number) => {
    if (gameOver || crashHold > 0 || pauseReason === 'answer' || pauseReason === 'minimize') return;
    audio.unlock();
    lane = Math.max(0, Math.min(2, lane + d));
    if (!started) {
      started = true;
      runStartedAt = performance.now();
      audio.play('start');
    }
    if (pauseReason === 'start' || pauseReason === 'user') {
      pauseReason = null;
      input.setEnabled(true);
      input.focusPlayfield();
    }
  };

  const handleInput = () => {
    if (pauseReason === 'answer' || pauseReason === 'minimize') return;
    if (input.consumePress('ArrowLeft') || input.consumePress('a') || input.consumePress('A')) {
      moveLane(-1);
    }
    if (input.consumePress('ArrowRight') || input.consumePress('d') || input.consumePress('D')) {
      moveLane(1);
    }
    nitro =
      started &&
      !gameOver &&
      !pauseReason &&
      (input.isDown('Space') || input.isDown(' '));
    if (nitro && !wasNitro) {
      audio.unlock();
      audio.play('nitro');
    }
    wasNitro = nitro;
    if ((input.consumePress('r') || input.consumePress('R')) && gameOver) {
      audio.unlock();
      reset();
      pauseReason = null;
    }
  };

  const main = new GameRuntime({
    update: () => {
      handleInput();
      const canSim = juice.tick();
      kickX *= 0.84;
      kickY *= 0.8;
      if (crashHold > 0) {
        if (canSim) crashHold -= 1;
        if (crashHold <= 0) gameOver = true;
        return;
      }

      if (!canSim || pauseReason || gameOver) return;

      // Snappy lane settle with slight ease — reads as weight, not molasses
      laneT += (lane - laneT) * 0.38;
      const wave = scaledWaveAt(tick);
      const baseSpeed = wave.speed;
      const speed = baseSpeed * (nitro ? NITRO_MULT : 1);
      roadScroll = (roadScroll + speed * 60) % 1;
      if (!started) return;

      tick++;
      distance += speed * 220 * (1 / 60);
      if (nitro) nitroScore += 12 * (1 / 60);

      // Re-sample after tick++ so pressure matches elapsed sim time
      const live = scaledWaveAt(tick);
      if (live.stage > lastAnnouncedStage) {
        lastAnnouncedStage = live.stage;
        juice.addFloater(`STAGE ${live.stage}`, VP_X, VP_Y + 40, 'best');
        juice.bumpShake(2);
        audio.play('ui');
      }
      const interval = nitro
        ? Math.max(14, Math.round(live.spawnInterval * 0.62))
        : live.spawnInterval;
      spawnTimer++;
      if (spawnTimer >= interval) {
        spawnTimer = 0;
        const chance = nitro
          ? Math.min(1, live.spawnChance + 0.12)
          : live.spawnChance;
        if (rng() < chance) {
          spawnCar(live.maxParallel, live.truckChance);
        }
      }

      const zStep = speed * 0.5;
      for (const c of cars) c.z += zStep;

      for (const c of cars) {
        const laneDist = Math.abs(laneT - c.lane);
        if (
          !c.nearMissed &&
          laneDist < LANE_HIT &&
          c.z >= NEAR_Z_MIN &&
          c.z < NEAR_Z_MAX
        ) {
          c.nearMissed = true;
          nearMissScore += NEAR_MISS_POINTS;
          juice.addFloater(
            `+${NEAR_MISS_POINTS}`,
            laneCenter(c.lane, c.z),
            roadY(c.z) - 8,
            'near',
          );
          kickX = Math.max(-14, Math.min(14, (laneT - c.lane) * 18));
          juice.bumpShake(3.5);
          audio.play('near');
        }
        if (crashHold <= 0 && laneDist < LANE_HIT && c.z > HIT_Z_MIN && c.z < HIT_Z_MAX) {
          crashHold = 34;
          kickX = Math.max(-16, Math.min(16, (laneT - c.lane) * 16));
          kickY = 4;
          juice.bumpShake(14);
          juice.addFloater('CRASH', laneCenter(laneT, 0.9), roadY(0.9) - 20, 'danger');
          audio.play('crash');
          emitRunEnd('death');
          break;
        }
      }

      cars = cars.filter((c) => c.z < 1.05);
      recomputeScore();
    },
    render: () => draw(),
    isSimulating: () => true,
  });

  const onClick = (e: MouseEvent) => {
    audio.unlock();
    input.focusPlayfield();
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * GAME_WIDTH;
    if (gameOver) {
      reset();
      pauseReason = null;
      return;
    }
    if (x < GAME_WIDTH / 2) moveLane(-1);
    else moveLane(1);
  };

  canvas.addEventListener('click', onClick);
  draw();
  main.start();

  return {
    destroy() {
      main.stop();
      input.detach();
      canvas.removeEventListener('click', onClick);
    },
    pause(reason: PauseReason = 'user') {
      pauseReason = reason;
      nitro = false;
      if (reason === 'minimize' || reason === 'answer') input.setEnabled(false);
    },
    resume() {
      if (gameOver) return;
      runEnded = false;
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
