/** Playfield — matches ~640×420 panel game area (minimal letterboxing). */
export const GAME_WIDTH = 608;
export const GAME_HEIGHT = 300;

export const COLORS = {
  bg: '#0f1020',
  road: '#2a2a3e',
  roadDark: '#1a1a2e',
  lane: '#4a4a62',
  player: '#00e436',
  danger: '#ff004d',
  warn: '#ffa300',
  ui: '#ffec27',
  text: '#e8eaed',
  muted: '#6b7280',
  sky: '#0c1445',
  skyHi: '#1a237e',
  coffee: '#6f4e37',
  cup: '#f5f5dc',
  skin: '#ffcc99',
  shirt: '#00e436',
  pants: '#294cad',
  hair: '#3d2314',
  desk: '#5c4033',
  keycap: '#2d2d44',
  keycapTop: '#4a4a5e',
  keycapPress: '#1a1a2e',
  meterBg: '#1a1a2e',
  meterFill: '#ffec27',
  meterHot: '#ff004d',
} as const;

export function setupCanvas(
  canvas: HTMLCanvasElement,
  w = GAME_WIDTH,
  h = GAME_HEIGHT,
): CanvasRenderingContext2D {
  canvas.width = w;
  canvas.height = h;
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function drawScanlines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 2);
  }
}

export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  score: number,
  w = GAME_WIDTH,
  h = GAME_HEIGHT,
  hint = 'Click or press R',
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = COLORS.danger;
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', w / 2, h / 2 - 14);
  ctx.fillStyle = COLORS.ui;
  ctx.font = '12px "Courier New", monospace';
  ctx.fillText(`SCORE ${score}`, w / 2, h / 2 + 8);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '10px "Courier New", monospace';
  ctx.fillText(hint, w / 2, h / 2 + 28);
}

export function drawPaused(
  ctx: CanvasRenderingContext2D,
  w = GAME_WIDTH,
  h = GAME_HEIGHT,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = COLORS.ui;
  ctx.font = 'bold 12px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', w / 2, h / 2);
}
