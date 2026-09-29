import type {
  ChillYWaitSettings,
  GenerationState,
  WaitPhase,
} from '../shared/constants';

export interface StateMachineCallbacks {
  onPhaseChange(phase: WaitPhase, elapsedMs: number): void;
  onDebug?(message: string): void;
}

export class WaitStateMachine {
  private phase: WaitPhase = 'idle';
  private settings: ChillYWaitSettings;
  private callbacks: StateMachineCallbacks;
  private domState: GenerationState = 'idle';
  private networkState: GenerationState = 'idle';
  private thresholdTimer: ReturnType<typeof setTimeout> | null = null;
  private autoMinimizeTimer: ReturnType<typeof setTimeout> | null = null;
  private generationStartedAt = 0;
  private elapsedInterval: ReturnType<typeof setInterval> | null = null;
  private userDismissed = false;
  private manualOpen = false;
  /** Player chose Finish run — keep playing, don't re-enter answer prompt. */
  private finishingRun = false;

  constructor(settings: ChillYWaitSettings, callbacks: StateMachineCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
  }

  updateSettings(settings: ChillYWaitSettings): void {
    this.settings = settings;
    if (this.phase === 'generating') {
      this.scheduleThreshold();
    }
  }

  setDomState(state: GenerationState): void {
    this.domState = state;
    this.reconcile();
  }

  setNetworkState(state: GenerationState): void {
    this.networkState = state;
    if (state === 'generating') {
      this.reconcile();
    } else if (this.domState === 'idle') {
      this.reconcile();
    }
  }

  openManually(): void {
    this.manualOpen = true;
    this.userDismissed = false;
    this.setPhase('overlay_visible');
    this.startElapsedTimer();
  }

  dismiss(): void {
    this.userDismissed = true;
    this.manualOpen = false;
    this.finishingRun = false;
    this.clearTimers();
    this.setPhase('idle');
  }

  minimize(): void {
    if (this.phase === 'overlay_visible' || this.phase === 'answer_ready') {
      this.finishingRun = false;
      this.setPhase('idle');
    }
  }

  /** Player finished / banked — leave answer_ready without waiting for fallback. */
  acknowledgeAnswer(): void {
    if (this.phase === 'answer_ready' || this.finishingRun) {
      this.manualOpen = false;
      this.finishingRun = false;
      this.setPhase('idle');
    }
  }

  /**
   * Finish run: dismiss the answer prompt and keep playing.
   * Stays on overlay_visible so ticks no longer re-pause / re-show the bar.
   */
  extendAnswerSession(): void {
    if (this.phase !== 'answer_ready' && !this.finishingRun) return;
    this.finishingRun = true;
    if (this.autoMinimizeTimer) {
      clearTimeout(this.autoMinimizeTimer);
      this.autoMinimizeTimer = null;
    }
    // Back to playing — do not bounce into answer_ready again this wait.
    this.setPhase('overlay_visible');
    this.autoMinimizeTimer = setTimeout(() => {
      if (this.phase === 'overlay_visible' && this.finishingRun) {
        this.manualOpen = false;
        this.finishingRun = false;
        this.setPhase('idle');
      }
    }, 120_000);
  }

  isFinishingRun(): boolean {
    return this.finishingRun;
  }

  getPhase(): WaitPhase {
    return this.phase;
  }

  private isGenerating(): boolean {
    return this.networkState === 'generating' || this.domState === 'generating';
  }

  private reconcile(): void {
    const generating = this.isGenerating();

    if (generating) {
      if (this.phase === 'idle' || this.phase === 'answer_ready') {
        this.userDismissed = false;
        this.finishingRun = false;
        this.generationStartedAt = Date.now();
        this.setPhase('generating');
        this.scheduleThreshold();
        this.startElapsedTimer();
        this.callbacks.onDebug?.('generation started');
      }
      return;
    }

    if (
      this.phase === 'generating' ||
      this.phase === 'overlay_visible' ||
      this.manualOpen
    ) {
      if (this.phase === 'generating' && !this.manualOpen) {
        this.clearThreshold();
        this.stopElapsedTimer();
        this.setPhase('idle');
        this.callbacks.onDebug?.('generation ended before threshold');
        return;
      }

      // Already chose Finish — keep playing, don't bounce back to answer prompt
      if (this.finishingRun) return;

      if (this.phase === 'overlay_visible' || this.manualOpen) {
        this.setPhase('answer_ready');
        this.callbacks.onDebug?.('answer ready');
        this.autoMinimizeTimer = setTimeout(() => {
          if (this.phase === 'answer_ready') {
            this.manualOpen = false;
            this.setPhase('idle');
          }
        }, 120_000);
      }
    }
  }

  private scheduleThreshold(): void {
    this.clearThreshold();
    if (this.settings.activationMode === 'immediate') {
      if (!this.userDismissed) this.setPhase('overlay_visible');
      return;
    }
    const delay = this.settings.delaySeconds * 1000;
    this.thresholdTimer = setTimeout(() => {
      if (this.isGenerating() && !this.userDismissed) {
        this.setPhase('overlay_visible');
      }
    }, delay);
  }

  private clearThreshold(): void {
    if (this.thresholdTimer) {
      clearTimeout(this.thresholdTimer);
      this.thresholdTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearThreshold();
    if (this.autoMinimizeTimer) {
      clearTimeout(this.autoMinimizeTimer);
      this.autoMinimizeTimer = null;
    }
    this.stopElapsedTimer();
  }

  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.elapsedInterval = setInterval(() => {
      this.emitElapsed();
    }, 250);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
    }
  }

  private emitElapsed(): void {
    const elapsed =
      this.generationStartedAt > 0
        ? Date.now() - this.generationStartedAt
        : 0;
    this.callbacks.onPhaseChange(this.phase, elapsed);
  }

  private setPhase(phase: WaitPhase): void {
    if (this.phase === phase) {
      this.emitElapsed();
      return;
    }
    this.phase = phase;
    if (phase === 'idle') {
      this.clearTimers();
      this.generationStartedAt = 0;
    }
    const elapsed =
      this.generationStartedAt > 0
        ? Date.now() - this.generationStartedAt
        : 0;
    this.callbacks.onPhaseChange(phase, elapsed);
  }
}
