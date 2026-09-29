export type SfxId =
  | 'near'
  | 'nitro'
  | 'crash'
  | 'jump'
  | 'perfect'
  | 'mash'
  | 'drink'
  | 'best'
  | 'ui'
  | 'start';

type Tone = {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slide?: number;
};

const SFX: Record<SfxId, Tone[]> = {
  near: [
    { freq: 880, dur: 0.05, type: 'square', gain: 0.07 },
    { freq: 1320, dur: 0.07, type: 'square', gain: 0.05, slide: 1600 },
  ],
  nitro: [{ freq: 120, dur: 0.08, type: 'sawtooth', gain: 0.04, slide: 90 }],
  crash: [
    { freq: 90, dur: 0.18, type: 'sawtooth', gain: 0.12, slide: 40 },
    { freq: 200, dur: 0.1, type: 'square', gain: 0.06, slide: 60 },
  ],
  jump: [{ freq: 320, dur: 0.06, type: 'square', gain: 0.06, slide: 520 }],
  perfect: [
    { freq: 660, dur: 0.05, type: 'triangle', gain: 0.07 },
    { freq: 990, dur: 0.08, type: 'triangle', gain: 0.06 },
  ],
  mash: [{ freq: 200, dur: 0.03, type: 'square', gain: 0.045 }],
  drink: [
    { freq: 220, dur: 0.12, type: 'sine', gain: 0.06, slide: 160 },
    { freq: 140, dur: 0.1, type: 'sine', gain: 0.04 },
  ],
  best: [
    { freq: 523, dur: 0.08, type: 'triangle', gain: 0.08 },
    { freq: 659, dur: 0.08, type: 'triangle', gain: 0.08 },
    { freq: 784, dur: 0.14, type: 'triangle', gain: 0.09 },
  ],
  ui: [{ freq: 440, dur: 0.04, type: 'square', gain: 0.04 }],
  start: [{ freq: 300, dur: 0.05, type: 'triangle', gain: 0.05, slide: 480 }],
};

/**
 * Tiny procedural SFX bus (Web Audio). No asset files.
 * Call unlock() from a user gesture (key/click) before first play.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  muted = false;
  private lastPlay = new Map<SfxId, number>();

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  /** Resume AudioContext after a user gesture (required by browsers). */
  unlock(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    this.unlocked = true;
  }

  play(id: SfxId): void {
    if (this.muted) return;
    const now = performance.now();
    const last = this.lastPlay.get(id) ?? 0;
    // Light debounce so mash/nitro don't clip
    const minGap = id === 'mash' || id === 'nitro' ? 40 : 30;
    if (now - last < minGap) return;
    this.lastPlay.set(id, now);

    const ctx = this.ensureCtx();
    if (!ctx || !this.unlocked) return;
    if (ctx.state === 'suspended') void ctx.resume();

    let tones = SFX[id];
    // Fresh random mash pitch each call
    if (id === 'mash') {
      tones = [{ freq: 160 + Math.random() * 80, dur: 0.028, type: 'square', gain: 0.04 }];
    }

    let t = ctx.currentTime;
    for (const tone of tones) {
      this.beep(ctx, t, tone);
      t += tone.dur * 0.55;
    }
  }

  private beep(ctx: AudioContext, when: number, tone: Tone): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? 'square';
    osc.frequency.setValueAtTime(tone.freq, when);
    if (tone.slide != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, tone.slide),
        when + tone.dur,
      );
    }
    const g = tone.gain ?? 0.06;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(g, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + tone.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + tone.dur + 0.02);
  }
}

/** Shared overlay audio instance. */
export const audio = new AudioBus();
