export type FloaterStyle = 'score' | 'near' | 'perfect' | 'danger' | 'best';

export interface JuiceFloater {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  vy: number;
  style: FloaterStyle;
}

const STYLE_COLORS: Record<FloaterStyle, string> = {
  score: '#ffec27',
  near: '#00e436',
  perfect: '#38bdf8',
  danger: '#ff004d',
  best: '#fbbf24',
};

/**
 * Shared juice: screen shake, hitstop freeze frames, score floaters.
 * Games call tick() once per sim step and skip gameplay while it returns false.
 */
export class Juice {
  shake = 0;
  /** Remaining freeze frames (skip gameplay update while > 0). */
  hitstop = 0;
  floaters: JuiceFloater[] = [];

  reset(): void {
    this.shake = 0;
    this.hitstop = 0;
    this.floaters = [];
  }

  bumpShake(amount: number): void {
    this.shake = Math.min(18, Math.max(this.shake, amount));
  }

  addHitstop(frames: number): void {
    this.hitstop = Math.max(this.hitstop, frames);
  }

  addFloater(
    text: string,
    x: number,
    y: number,
    style: FloaterStyle = 'score',
  ): void {
    this.floaters.push({
      text,
      x,
      y,
      life: 1,
      maxLife: 1,
      vy: style === 'danger' ? -0.4 : -0.85,
      style,
    });
  }

  /**
   * Advance juice one sim frame.
   * @returns true when gameplay should simulate; false during hitstop.
   */
  tick(): boolean {
    this.shake = Math.max(0, this.shake - 0.55);
    this.floaters = this.floaters
      .map((f) => ({
        ...f,
        y: f.y + f.vy,
        life: f.life - 0.028,
      }))
      .filter((f) => f.life > 0);

    if (this.hitstop > 0) {
      this.hitstop -= 1;
      return false;
    }
    return true;
  }

  /** Apply camera shake; caller must ctx.restore() after draw. */
  beginShake(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.shake > 0) {
      const ox = (Math.random() - 0.5) * this.shake;
      const oy = (Math.random() - 0.5) * this.shake;
      ctx.translate(ox, oy);
    }
  }

  endShake(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  drawFloaters(ctx: CanvasRenderingContext2D): void {
    for (const f of this.floaters) {
      const t = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.2);
      ctx.fillStyle = STYLE_COLORS[f.style];
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      const scale = f.style === 'perfect' || f.style === 'best' ? 1 + (1 - t) * 0.15 : 1;
      ctx.translate(f.x, f.y);
      ctx.scale(scale, scale);
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }
}
