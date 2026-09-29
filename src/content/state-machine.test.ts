import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WaitStateMachine } from './state-machine';
import { DEFAULT_SETTINGS, type WaitPhase } from '../shared/constants';

function trackPhases() {
  const phases: WaitPhase[] = [];
  const onPhaseChange = (phase: WaitPhase) => {
    if (phases.at(-1) !== phase) phases.push(phase);
  };
  return { phases, onPhaseChange };
}

describe('WaitStateMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays idle on fast generation below threshold', () => {
    const { phases, onPhaseChange } = trackPhases();
    const machine = new WaitStateMachine(
      { ...DEFAULT_SETTINGS, delaySeconds: 8 },
      { onPhaseChange },
    );

    machine.setDomState('generating');
    vi.advanceTimersByTime(5000);
    machine.setDomState('idle');

    expect(phases).toEqual(['generating', 'idle']);
  });

  it('shows overlay after threshold in threshold mode', () => {
    const { phases, onPhaseChange } = trackPhases();
    const machine = new WaitStateMachine(
      { ...DEFAULT_SETTINGS, delaySeconds: 8 },
      { onPhaseChange },
    );

    machine.setDomState('generating');
    vi.advanceTimersByTime(8000);

    expect(phases).toContain('overlay_visible');
  });

  it('shows overlay immediately in immediate mode', () => {
    const { phases, onPhaseChange } = trackPhases();
    const machine = new WaitStateMachine(
      { ...DEFAULT_SETTINGS, activationMode: 'immediate' },
      { onPhaseChange },
    );

    machine.setDomState('generating');

    expect(phases).toContain('overlay_visible');
  });

  it('transitions to answer_ready when generation ends after overlay shown', () => {
    const { phases, onPhaseChange } = trackPhases();
    const machine = new WaitStateMachine(
      { ...DEFAULT_SETTINGS, activationMode: 'immediate' },
      { onPhaseChange },
    );

    machine.setDomState('generating');
    machine.setDomState('idle');

    expect(phases).toContain('answer_ready');
  });

  it('Finish run returns to overlay_visible and does not bounce back to answer_ready', () => {
    const { phases, onPhaseChange } = trackPhases();
    const machine = new WaitStateMachine(
      { ...DEFAULT_SETTINGS, activationMode: 'immediate' },
      { onPhaseChange },
    );

    machine.setDomState('generating');
    machine.setDomState('idle');
    expect(machine.getPhase()).toBe('answer_ready');

    machine.extendAnswerSession();
    expect(machine.getPhase()).toBe('overlay_visible');
    expect(machine.isFinishingRun()).toBe(true);

    // DOM still idle — must not re-enter answer_ready
    machine.setDomState('idle');
    expect(machine.getPhase()).toBe('overlay_visible');
    expect(phases.at(-1)).toBe('overlay_visible');
  });

  it('openManually shows overlay without generation', () => {
    const { phases, onPhaseChange } = trackPhases();
    const machine = new WaitStateMachine(DEFAULT_SETTINGS, { onPhaseChange });

    machine.openManually();

    expect(phases).toContain('overlay_visible');
  });
});
