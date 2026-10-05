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
import {
  escalate,
  escalateDown,
  runPressure,
  runStage,
} from './run-difficulty';

type ObstacleKind = 'short' | 'tall' | 'wide';

interface Obstacle {
  worldX: number;
  w: number;
  h: number;
  kind: ObstacleKind;
  label: string;
  telegraph: number;
  flash: number;
}

interface Dust {
  x: number;
  y: number;
  life: number;
}

const CHAR_SCALE = 0.72;
const RUNNER_W = Math.round(40 * CHAR_SCALE);
const RUNNER_H = Math.round(82 * CHAR_SCALE);
const GROUND_Y = GAME_HEIGHT - 36;
const PLAYER_X = 72;
/**
 * Peak ≈ 112px. Tall obstacle 24px — jump is obviously higher than any block.
 */
const JUMP_VY = -9.0;
const GRAVITY_UP = 0.36;
const GRAVITY_DOWN = 0.58;
const COYOTE_FRAMES = 8;
const JUMP_BUFFER_FRAMES = 8;
const PERFECT_POINTS = 25;
/** Jump arc is fixed — speed must rise slowly or timing becomes unfair. */
const SPEED_BASE = 3.2;
const SPEED_SOFT = 7.0;
const GAP_BASE = 130;
const GAP_SOFT = 68;

const KIND_LABELS: Record<ObstacleKind, string[]> = {
  short: [';;', 'bug'],
  tall: ['OOM', '404'],
  wide: ['ERR', 'NaN'],
};

function dimsFor(kind: ObstacleKind): { w: number; h: number } {
  if (kind === 'short') return { w: 26, h: 14 };
  if (kind === 'tall') return { w: 28, h: 24 };
  return { w: 46, h: 16 };
}

/** Side-scroller with coyote time, jump buffer, typed obstacles, perfect jumps. */
export function createCompileRun(
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
  let runEnded = false;
  let distanceScore = 0;
  let perfectScore = 0;
  let score = 0;
  let scroll = 0;
  let jumpY = 0;
  let vy = 0;
  let grounded = true;
  let coyote = 0;
  let jumpBuffer = 0;
  let obstacles: Obstacle[] = [];
  let spawnIn = GAP_BASE;
  let tick = 0;
  let dust: Dust[] = [];
  const juice = new Juice();
  let runStartedAt = 0;
  let playing = false;
  let perfectStreak = 0;
  let wasAirborne = false;
  let crouch = 0;
  let crashHold = 0;
  let landHang = 0;
  let lastAnnouncedStage = 1;
  let runSeed = freshRunSeed();
  let rng: Rng = createSeededRng(runSeed);

  const liveSpeed = () =>
    escalate(SPEED_BASE, SPEED_SOFT, runPressure(tick), {
      // Slow approach: ~2 min to near soft max, then a gentle drip
      rise: 0.28,
      drip: 0.022,
    });

  const nextGap = () => {
    const pressure = runPressure(tick);
    const speed = liveSpeed();
    // Density climbs slower than before — speed is the main late-game axe
    const base = escalateDown(GAP_BASE, GAP_SOFT, pressure, {
      rise: 0.35,
      drip: 0.018,
      hardMin: 48,
    });
    const speedTrim = Math.min(14, (speed - SPEED_BASE) * 2.2);
    const jitter = Math.floor(rng() * 16);
    return Math.max(48, Math.round(base - speedTrim + jitter));
  };

  /** Bias toward taller/wider hazards as the run ages (gentle). */
  const pickKind = (): ObstacleKind => {
    const p = runPressure(tick);
    const roll = rng();
    const shortW = Math.max(0.18, 0.42 - p * 0.03);
    const tallW = Math.min(0.45, 0.35 + p * 0.022);
    if (roll < shortW) return 'short';
    if (roll < shortW + tallW) return 'tall';
    return 'wide';
  };

  const recomputeScore = () => {
    score = distanceScore + perfectScore;
    onScore(score);
  };

  const playerHitbox = () => {
    const feet = GROUND_Y + jumpY;
    return {
      left: PLAYER_X + 4,
      right: PLAYER_X + RUNNER_W - 4,
      top: feet - RUNNER_H + 6,
      bottom: feet - 2,
    };
  };

  const emitRunEnd = (reason: RunEndReason) => {
    if (runEnded) return;
    runEnded = true;
    onRunEnd({
      game: 'compile-run',
      score,
      durationMs: runStartedAt ? performance.now() - runStartedAt : 0,
      reason,
      seed: runSeed,
    });
  };

  const reset = () => {
    gameOver = false;
    runEnded = false;
    distanceScore = 0;
    perfectScore = 0;
    score = 0;
    scroll = 0;
    jumpY = 0;
    vy = 0;
    grounded = true;
    coyote = 0;
    jumpBuffer = 0;
    obstacles = [];
    spawnIn = GAP_BASE;
    tick = 0;
    dust = [];
    juice.reset();
    runStartedAt = 0;
    playing = false;
    perfectStreak = 0;
    wasAirborne = false;
    crouch = 0;
    crashHold = 0;
    landHang = 0;
    lastAnnouncedStage = 1;
    runSeed = freshRunSeed();
    rng = createSeededRng(runSeed);
    onScore(0);
  };

  const beginPlay = () => {
    if (!playing) {
      playing = true;
      runStartedAt = performance.now();
      audio.play('start');
    }
    if (pauseReason === 'start' || pauseReason === 'user') {
      pauseReason = null;
      input.setEnabled(true);
      input.focusPlayfield();
    }
  };

  const doJump = () => {
    audio.unlock();
    if (pauseReason === 'answer' || pauseReason === 'minimize' || crashHold > 0) return;
    if (gameOver) {
      reset();
      pauseReason = null;
      return;
    }
    beginPlay();
    if ((grounded || coyote > 0) && crouch <= 0) {
      crouch = 4;
      coyote = 0;
      jumpBuffer = 0;
    } else {
      jumpBuffer = JUMP_BUFFER_FRAMES;
    }
  };

  const spawn = () => {
    const kind = pickKind();
    const dims = dimsFor(kind);
    const labels = KIND_LABELS[kind];
    // Late-game: spawn slightly closer in world space (less lead-in)
    const lead = escalateDown(55, 36, runPressure(tick), {
      rise: 0.4,
      drip: 0.02,
      hardMin: 30,
    });
    obstacles.push({
      worldX: scroll + GAME_WIDTH + lead + rng() * 28,
      w: dims.w,
      h: dims.h,
      kind,
      label: labels[Math.floor(rng() * labels.length)],
      telegraph: 1,
      flash: 0,
    });
  };

  const drawParallax = () => {
    // Distant code-rain / city glow — NOT solid platforms (those looked jumpable)
    for (let i = 0; i < 18; i++) {
      const x = ((scroll * 0.15 + i * 70) % (GAME_WIDTH + 40)) - 20;
      const y = 28 + (i % 5) * 18;
      ctx.fillStyle = `rgba(34,197,94,${0.08 + (i % 3) * 0.04})`;
      ctx.font = '8px "Courier New", monospace';
      ctx.textAlign = 'left';
      const bits = ['01', '10', '{}', '=>', ';;', 'ok'];
      ctx.fillText(bits[i % bits.length], x, y);
    }
    // Soft horizon band
    ctx.fillStyle = 'rgba(30,41,59,0.5)';
    ctx.fillRect(0, GROUND_Y - 48, GAME_WIDTH, 48);
  };

  const drawGround = () => {
    const streak = Math.max(1, liveSpeed() / SPEED_BASE);
    ctx.fillStyle = COLORS.roadDark;
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(0, GROUND_Y, GAME_WIDTH, 6);
    ctx.fillStyle = '#3a3a52';
    ctx.fillRect(0, GROUND_Y + 6, GAME_WIDTH, GAME_HEIGHT - GROUND_Y - 6);
    const marks = 8 + Math.round(streak * 3);
    for (let i = 0; i < marks; i++) {
      const gx = ((scroll * (1.1 + streak) + i * (70 / streak)) % (GAME_WIDTH + 60)) - 30;
      ctx.fillStyle = COLORS.muted;
      ctx.fillRect(gx, GROUND_Y + 12, 12 + streak * 14, 2);
    }
  };

  const drawRunner = () => {
    const feet = GROUND_Y + jumpY;
    const cx = PLAYER_X + RUNNER_W / 2;
    const runPhase = grounded ? Math.floor(tick / 4) % 2 : 0;
    const airborne = !grounded;

    if (grounded && playing && tick % 4 === 0) {
      dust.push({ x: PLAYER_X + 4, y: feet - 2, life: 1 });
    }
    for (const d of dust) {
      ctx.fillStyle = `rgba(150,150,150,${d.life * 0.45})`;
      ctx.fillRect(d.x, d.y, 5, 3);
    }

    if (jumpY > -8) {
      const shadowScale = 1 - Math.min(1, Math.abs(jumpY) / 90);
      ctx.fillStyle = `rgba(0,0,0,${0.32 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(cx, GROUND_Y + 2, 14 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    // Shrink around feet so character stays planted on the road
    ctx.translate(cx, feet);
    const squashY = crouch > 0 ? 0.72 : landHang > 0 ? 0.84 : airborne && vy < 0 ? 1.14 : 1;
    const squashX = crouch > 0 ? 1.12 : landHang > 0 ? 1.14 : airborne && vy < 0 ? 0.9 : 1;
    ctx.scale(CHAR_SCALE * squashX, CHAR_SCALE * squashY);
    ctx.translate(-cx, -feet);

    if (airborne) {
      ctx.translate(cx, feet - 30);
      ctx.rotate(-0.1);
      ctx.translate(-cx, -(feet - 30));
    }

    // Legs
    ctx.fillStyle = '#1d4ed8';
    const legL = airborne ? { x: cx - 14, y: feet - 26, h: 20 } :
      runPhase === 0 ? { x: cx - 16, y: feet - 28, h: 26 } : { x: cx - 14, y: feet - 22, h: 18 };
    const legR = airborne ? { x: cx + 4, y: feet - 22, h: 16 } :
      runPhase === 0 ? { x: cx + 4, y: feet - 22, h: 18 } : { x: cx + 4, y: feet - 28, h: 26 };
    ctx.fillRect(legL.x, legL.y, 12, legL.h);
    ctx.fillRect(legR.x, legR.y, 12, legR.h);
    // Shoes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(legL.x - 2, feet - 7, 14, 7);
    ctx.fillRect(legR.x - 2, feet - 7, 14, 7);

    // Hips
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(cx - 14, feet - 32, 28, 10);

    // Torso
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(cx - 15, feet - 52, 30, 24);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(cx - 10, feet - 46, 20, 12);

    // Arms
    ctx.fillStyle = '#22c55e';
    const armSwing = airborne ? 0 : runPhase === 0 ? -6 : 6;
    ctx.fillRect(cx - 22, feet - 48 + armSwing, 9, 18);
    ctx.fillRect(cx + 13, feet - 48 - armSwing, 9, 18);
    ctx.fillStyle = '#f5c8a0';
    ctx.fillRect(cx - 22, feet - 32 + armSwing, 9, 8);
    ctx.fillRect(cx + 13, feet - 32 - armSwing, 9, 8);

    // Neck
    ctx.fillStyle = '#f5c8a0';
    ctx.fillRect(cx - 5, feet - 58, 10, 8);

    // Head (round — unmistakable)
    ctx.fillStyle = '#f5c8a0';
    ctx.beginPath();
    ctx.arc(cx, feet - 68, 14, 0, Math.PI * 2);
    ctx.fill();
    // Hair
    ctx.fillStyle = '#5c3a1e';
    ctx.beginPath();
    ctx.arc(cx, feet - 72, 13, Math.PI * 1.05, -0.05);
    ctx.fill();
    ctx.fillRect(cx - 13, feet - 72, 26, 8);
    // Eye looking right
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx + 1, feet - 72, 7, 6);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx + 4, feet - 71, 3, 4);
    // Mouth
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(cx + 1, feet - 62, 6, 2);

    ctx.restore();
  };

  const drawObstacle = (o: Obstacle) => {
    const sx = o.worldX - scroll;
    if (sx < -60 || sx > GAME_WIDTH + 40) return;
    const top = GROUND_Y - o.h;

    // Warning stripe on asphalt
    if (o.telegraph > 0 && sx > GAME_WIDTH * 0.5) {
      ctx.fillStyle = `rgba(255,236,39,${0.2 + o.telegraph * 0.35})`;
      ctx.fillRect(sx - 2, GROUND_Y - 3, o.w + 4, 3);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 2, GROUND_Y - 1, o.w - 2, 4);

    // Solid error block on the road — THIS is what you jump
    ctx.fillStyle = o.flash > 0 ? '#fde68a' : '#ef4444';
    ctx.fillRect(sx, top, o.w, o.h);
    if (o.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${o.flash * 0.65})`;
      ctx.fillRect(sx, top, o.w, o.h);
    }
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(sx, top, o.w, 4);
    ctx.fillStyle = '#fecaca';
    ctx.fillRect(sx + 2, top + 2, o.w - 4, 2);
    // Spike / top edge so it reads as a hazard
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(sx + 2, top - 3, 4, 3);
    ctx.fillRect(sx + o.w / 2 - 2, top - 3, 4, 3);
    ctx.fillRect(sx + o.w - 6, top - 3, 4, 3);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(o.label, sx + o.w / 2, top + o.h / 2 + 4);
  };

  const draw = () => {
    juice.beginShake(ctx);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawParallax();
    drawGround();
    for (const o of [...obstacles].sort((a, b) => a.worldX - b.worldX)) {
      drawObstacle(o);
    }
    drawRunner();
    juice.drawFloaters(ctx);

    ctx.fillStyle = COLORS.ui;
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${score}`, 8, 16);
    const stage = runStage(tick);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`STAGE ${stage}`, 8, perfectStreak > 1 ? 44 : 30);
    if (perfectStreak > 1) {
      ctx.fillStyle = COLORS.warn;
      ctx.fillText(`PERFECT x${perfectStreak}`, 8, 30);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`SPD ${liveSpeed().toFixed(1)}`, GAME_WIDTH - 8, 16);
    drawScanlines(ctx, GAME_WIDTH, GAME_HEIGHT);
    juice.endShake(ctx);

    if (gameOver) {
      drawGameOver(ctx, score, GAME_WIDTH, GAME_HEIGHT, 'Space or click to retry');
    } else if (pauseReason === 'answer') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ANSWER READY — CHOOSE ABOVE', GAME_WIDTH / 2, GAME_HEIGHT / 2);
    } else if (pauseReason && pauseReason !== 'start') {
      drawPaused(ctx);
    } else if (!playing || pauseReason === 'start') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = COLORS.ui;
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPACE / CLICK TO JUMP THE RED ERRORS', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 6);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '9px "Courier New", monospace';
      ctx.fillText('Jump over red blocks on the road — not the background code', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 14);
    }
  };

  const checkCollision = () => {
    const p = playerHitbox();
    for (const o of obstacles) {
      const ox = o.worldX - scroll;
      const oLeft = ox + 4;
      const oRight = ox + o.w - 4;
      const oTop = GROUND_Y - o.h + 4;
      if (p.right > oLeft && p.left < oRight && p.bottom > oTop) {
        if (crashHold > 0 || gameOver) return;
        crashHold = 36;
        perfectStreak = 0;
        juice.bumpShake(12);
        juice.addFloater('SYNTAX ERROR', PLAYER_X + 20, GROUND_Y - 50, 'danger');
        audio.play('crash');
        emitRunEnd('death');
        return;
      }
    }
  };

  const onLand = () => {
    if (!wasAirborne) return;
    wasAirborne = false;
    // Perfect: just cleared an obstacle with small foot clearance
    let cleared: Obstacle | null = null;
    for (const o of obstacles) {
      const ox = o.worldX - scroll;
      if (ox + o.w < PLAYER_X && ox + o.w > PLAYER_X - 50) {
        cleared = o;
      }
    }
    if (cleared) {
      const clearance = GROUND_Y - (GROUND_Y - cleared.h) - 2;
      // "perfect" if we jumped over something recently and weren't scraping
      if (clearance >= 14) {
        perfectStreak++;
        const pts = PERFECT_POINTS * Math.min(perfectStreak, 4);
        perfectScore += pts;
        cleared.flash = 1;
        landHang = 12;
        juice.addFloater(
          perfectStreak > 1 ? `PERFECT x${perfectStreak} +${pts}` : `+${pts} PERFECT`,
          PLAYER_X + 20,
          GROUND_Y - 40,
          'perfect',
        );
        juice.bumpShake(1.5);
        audio.play('perfect');
        recomputeScore();
      } else {
        perfectStreak = 0;
      }
    }
  };

  const main = new GameRuntime({
    update: () => {
      if (
        input.consumePress('Space') ||
        input.consumePress(' ') ||
        input.consumePress('ArrowUp') ||
        input.consumePress('w') ||
        input.consumePress('W')
      ) {
        doJump();
      }
      if ((input.consumePress('r') || input.consumePress('R')) && gameOver) {
        audio.unlock();
        reset();
        pauseReason = null;
      }

      const canSim = juice.tick();
      if (crashHold > 0) {
        if (canSim) crashHold -= 1;
        if (crashHold <= 0) gameOver = true;
        return;
      }
      if (!canSim || pauseReason || gameOver) return;
      landHang = Math.max(0, landHang - 1);

      tick++;
      const speed = liveSpeed();
      const stage = runStage(tick);
      if (stage > lastAnnouncedStage) {
        lastAnnouncedStage = stage;
        juice.addFloater(`STAGE ${stage}`, PLAYER_X + 40, GROUND_Y - 70, 'best');
        juice.bumpShake(2);
        audio.play('ui');
      }

      const frameSpeed = speed * 0.5;
      scroll += frameSpeed;
      distanceScore = Math.floor(scroll / 12);
      recomputeScore();

      if (grounded) coyote = COYOTE_FRAMES;
      else coyote = Math.max(0, coyote - 1);

      if (jumpBuffer > 0) {
        jumpBuffer--;
        if (grounded || coyote > 0) {
          vy = JUMP_VY;
          grounded = false;
          coyote = 0;
          jumpBuffer = 0;
          wasAirborne = true;
          audio.play('jump');
        }
      }

      if (crouch > 0) {
        crouch -= 1;
        if (crouch === 0) {
          vy = JUMP_VY;
          grounded = false;
          wasAirborne = true;
          audio.play('jump');
        }
      }

      if (crouch > 0) {
        // Stay planted through the wind-up so the squash reads before liftoff.
      } else if (!grounded || jumpY < 0) {
        vy += vy < 0 ? GRAVITY_UP : GRAVITY_DOWN;
        jumpY += vy;
        if (jumpY >= 0) {
          const landed = !grounded;
          jumpY = 0;
          vy = 0;
          grounded = true;
          if (landed) onLand();
        }
      } else {
        jumpY = 0;
        vy = 0;
      }

      spawnIn--;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = nextGap();
      }

      for (const o of obstacles) {
        o.telegraph = Math.max(0, o.telegraph - 0.01);
        o.flash = Math.max(0, o.flash - 0.08);
      }

      obstacles = obstacles.filter((o) => o.worldX - scroll > -80);
      dust = dust
        .map((d) => ({ ...d, x: d.x - frameSpeed * 0.5, life: d.life - 0.07 }))
        .filter((d) => d.life > 0);

      checkCollision();
    },
    render: () => draw(),
    isSimulating: () => true,
  });

  canvas.addEventListener('click', doJump);
  draw();
  main.start();

  return {
    destroy() {
      main.stop();
      input.detach();
      canvas.removeEventListener('click', doJump);
    },
    pause(reason: PauseReason = 'user') {
      pauseReason = reason;
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
