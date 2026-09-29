import type { GenerationState, PlatformId } from '../../shared/constants';

export interface PlatformDetector {
  readonly id: PlatformId;
  start(): void;
  stop(): void;
  onStateChange(cb: (state: GenerationState) => void): void;
  checkNow(): GenerationState;
}
