/** Bitmap sprite: each row is a string of palette keys ('.' = transparent). */
export type Sprite = string[];

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  palette: Record<string, string>,
  scale: number,
): void {
  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col++) {
      const key = line[col];
      if (key === '.' || key === ' ') continue;
      const color = palette[key];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

/**
 * Dense side-view runner (8×12) — solid silhouette, classic arcade proportions.
 * H=hair S=skin E=eye G=shirt B=pants K=shoes
 */
export const RUNNER_A: Sprite = [
  '.HHHHHH.',
  'HSSSSSSH',
  'HSSEESSH',
  'HSSSSSSH',
  '.SSSSSS.',
  'GGGGGGGG',
  'GGGGGGGG',
  'BBBBBBBB',
  'BBB..BBB',
  '.BB..BB.',
  'KKK..KKK',
  'KK....KK',
];

export const RUNNER_B: Sprite = [
  '.HHHHHH.',
  'HSSSSSSH',
  'HSSEESSH',
  'HSSSSSSH',
  '.SSSSSS.',
  'GGGGGGGG',
  'GGGGGGGG',
  'BBBBBBBB',
  'BBB..BBB',
  'BB....BB',
  'KK....KK',
  'KKK..KKK',
];

export const RUNNER_PALETTE: Record<string, string> = {
  H: '#5c3a1e',
  S: '#f5c8a0',
  E: '#1a1a1a',
  G: '#22c55e',
  B: '#2563eb',
  K: '#0f172a',
};
