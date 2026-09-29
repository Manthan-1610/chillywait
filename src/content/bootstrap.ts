import { detectPlatform } from './detectors/utils';
import { createDetector } from './detectors';
import { OverlayHost } from './overlay-host';
import { WaitStateMachine } from './state-machine';
import { getSettings, onSettingsChanged, saveSettings } from '../shared/storage';
import {
  type ChillYWaitSettings,
  type PlatformId,
  type WaitPhase,
} from '../shared/constants';
import { onOverlayMessage } from '../shared/messaging';
import { onSpaNavigation } from './detectors/utils';
import {
  isExtensionContextValid,
  safeAddMessageListener,
  safeRemoveMessageListener,
} from '../shared/extension-context';

let overlay: OverlayHost | null = null;
let machine: WaitStateMachine | null = null;
let detector: ReturnType<typeof createDetector> | null = null;
let cleanupNav: (() => void) | null = null;
let cleanupMessages: (() => void) | null = null;
let cleanupSettings: (() => void) | null = null;
let messageListener: ((message: unknown) => void) | null = null;

async function init(): Promise<void> {
  if (!isExtensionContextValid()) return;

  const platform = detectPlatform(window.location.hostname);
  if (!platform) return;

  try {
    const settings = await getSettings();
    if (!settings.enabledSites[platform]) return;
    await boot(settings, platform);
  } catch {
    teardown();
  }
}

async function boot(
  settings: ChillYWaitSettings,
  platform: PlatformId,
): Promise<void> {
  teardown();

  overlay = new OverlayHost();
  await overlay.mount();
  if (!overlay || !isExtensionContextValid()) {
    teardown();
    return;
  }

  let lastReportedPhase: WaitPhase = 'idle';

  machine = new WaitStateMachine(settings, {
    onPhaseChange: (phase: WaitPhase, elapsedMs: number) => {
      const prev = lastReportedPhase;
      lastReportedPhase = phase;
      overlay?.updateState(phase, elapsedMs);

      // Only act on real phase transitions — elapsed ticks must not re-pause.
      if (phase === prev) return;

      if (phase === 'overlay_visible') {
        if (machine?.isFinishingRun()) {
          overlay?.resumePlay();
        } else {
          overlay?.showIfAllowed();
        }
      } else if (phase === 'answer_ready') {
        if (!overlay?.isMinimized()) overlay?.showAnswerReady();
      } else if (phase === 'idle' && !overlay?.isMinimized()) {
        overlay?.hide();
      }
    },
    onDebug: settings.debug
      ? (msg) => console.debug('[ChillYWait]', msg)
      : undefined,
  });

  detector = createDetector(platform);
  detector.onStateChange((state) => machine?.setDomState(state));
  detector.start();

  cleanupNav = onSpaNavigation(() => {
    if (!isExtensionContextValid()) {
      teardown();
      return;
    }
    detector?.stop();
    detector?.start();
  });

  cleanupMessages = onOverlayMessage((msg) => {
    if (!isExtensionContextValid()) {
      teardown();
      return;
    }
    if (msg.type === 'minimize') overlay?.minimize();
    if (msg.type === 'dismiss') {
      machine?.dismiss();
      overlay?.hide();
    }
    if (msg.type === 'run_finish') {
      machine?.extendAnswerSession();
      overlay?.resumePlay();
    }
    if (msg.type === 'run_bank') {
      machine?.acknowledgeAnswer();
      overlay?.minimize();
    }
    if (msg.type === 'game_change') {
      void saveSettings({ lastGame: msg.game });
    }
  });

  cleanupSettings = onSettingsChanged((newSettings) => {
    if (!isExtensionContextValid()) {
      teardown();
      return;
    }
    machine?.updateSettings(newSettings);
    overlay?.sendSettings(newSettings);
    if (!newSettings.enabledSites[platform]) {
      teardown();
    }
  });

  messageListener = (message: unknown) => {
    if (!isExtensionContextValid()) {
      teardown();
      return;
    }
    if ((message as { type?: string })?.type === 'manual_open') {
      machine?.openManually();
      overlay?.show();
    }
  };
  safeAddMessageListener(messageListener);
}

function teardown(): void {
  cleanupNav?.();
  cleanupMessages?.();
  cleanupSettings?.();
  if (messageListener) {
    safeRemoveMessageListener(messageListener);
    messageListener = null;
  }
  cleanupNav = null;
  cleanupMessages = null;
  cleanupSettings = null;
  detector?.stop();
  detector = null;
  overlay?.destroy();
  overlay = null;
  machine = null;
}

void init();

export {};
