import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameId, WaitPhase } from '../shared/constants';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { StatusBar } from './components/StatusBar';
import { Controls } from './components/Controls';
import { GamePicker } from './components/GamePicker';
import { LeaderboardPanel } from './components/LeaderboardPanel';
import { AnswerReadyBar } from './components/AnswerReadyBar';
import { createTrafficRider } from './games/traffic-rider';
import { createLastToken } from './games/last-token';
import { createCompileRun } from './games/compile-run';
import { GAMES } from './games/registry';
import { getBest, initHighscores, recordRunEnd } from './games/highscore';
import type { GameController } from './games/types';
import type { OverlayMessage } from '../shared/constants';
import type { PauseReason, RunResult } from './engine/types';
import { audio } from './engine';
import { submitScore } from '../shared/leaderboard-client';
import { getSettings, onSettingsChanged, saveSettings } from '../shared/storage';

type HostPauseMessage = { type: 'pause'; paused: boolean; reason?: PauseReason };

export function App() {
  const [phase, setPhase] = useState<WaitPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [game, setGame] = useState<GameId>(DEFAULT_SETTINGS.lastGame);
  const [score, setScore] = useState(0);
  const [best, setBestScore] = useState(0);
  const [muted, setMuted] = useState(DEFAULT_SETTINGS.soundMuted);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [answerPrompt, setAnswerPrompt] = useState(false);
  const [bestToast, setBestToast] = useState(false);
  const [controlsHint, setControlsHint] = useState<string | null>(null);
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const gameRef = useRef<GameId>(game);
  const phaseRef = useRef<WaitPhase>(phase);
  /** After Finish run, ignore further answer_ready pauses until phase leaves. */
  const finishChosenRef = useRef(false);
  /** Player hid the pill on purpose — keep the run for when they expand. */
  const userMinimizedRef = useRef(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerArmRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getSettings().then((s) => {
      setMuted(s.soundMuted);
      audio.muted = s.soundMuted;
      if (s.lastGame) setGame(s.lastGame);
    });
    return onSettingsChanged((s) => {
      setMuted(s.soundMuted);
      audio.muted = s.soundMuted;
    });
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audio.muted = next;
    void saveSettings({ soundMuted: next });
  };

  const armAnswer = () => {
    if (finishChosenRef.current) return;
    if (gameRef.current === 'coffee') {
      controllerRef.current?.pause('answer');
      if (answerArmRef.current) clearTimeout(answerArmRef.current);
      answerArmRef.current = setTimeout(() => {
        if (phaseRef.current === 'answer_ready' && !finishChosenRef.current) {
          setAnswerPrompt(true);
        }
      }, 2800);
      return;
    }
    setAnswerPrompt(true);
    controllerRef.current?.pause('answer');
  };

  useEffect(() => {
    void initHighscores().then(() => {
      setBestScore(getBest(gameRef.current));
    });
  }, []);

  const handleScore = (value: number) => {
    setScore(value);
  };

  /** Save an open run once. Later closes can save again if the score went up. */
  const settleOpenRun = () => {
    const controller = controllerRef.current;
    if (!controller || controller.getScore() <= 0) return;
    controller.endRun('bank');
  };

  const handleRunEnd = (result: RunResult) => {
    const recorded = recordRunEnd(result.game, result.score);
    setBestScore(recorded.best);
    setScore(result.score);
    if (recorded.isNewBest) {
      audio.unlock();
      audio.play('best');
      setBestToast(true);
      window.setTimeout(() => setBestToast(false), 2400);
      void submitScore(result.game, recorded.best, result.durationMs, result.seed);
    }
    setAnswerPrompt(false);
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as OverlayMessage | HostPauseMessage;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'state') {
        setPhase(data.phase);
        phaseRef.current = data.phase;
        setElapsedMs(data.elapsedMs);
        if (data.phase === 'answer_ready') {
          if (!finishChosenRef.current) armAnswer();
        } else if (data.phase === 'overlay_visible') {
          setAnswerPrompt(false);
          if (finishChosenRef.current) {
            controllerRef.current?.resume();
          }
        } else if (data.phase === 'idle') {
          finishChosenRef.current = false;
          setAnswerPrompt(false);
          if (userMinimizedRef.current) {
            userMinimizedRef.current = false;
          } else {
            settleOpenRun();
          }
        } else if (data.phase === 'generating') {
          finishChosenRef.current = false;
          setAnswerPrompt(false);
        }
      }
      if (data.type === 'settings' && data.settings.lastGame) {
        setGame(data.settings.lastGame);
      }
      if (data.type === 'pause') {
        const msg = data as HostPauseMessage;
        if (msg.paused) {
          const reason = msg.reason ?? 'minimize';
          // Don't re-lock if player already chose Finish run
          if (reason === 'answer' && finishChosenRef.current) return;
          if (reason === 'answer') {
            armAnswer();
            return;
          }
          controllerRef.current?.pause(reason);
        } else if (phaseRef.current !== 'answer_ready' || finishChosenRef.current) {
          setAnswerPrompt(false);
          controllerRef.current?.resume();
        }
      }
    };
    const onPageHide = () => settleOpenRun();
    window.addEventListener('message', handler);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('message', handler);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  useEffect(() => {
    const area = gameAreaRef.current;
    if (!area) return;

    if ((controllerRef.current?.getScore() ?? 0) > 0) {
      controllerRef.current?.endRun('bank');
    }
    controllerRef.current?.destroy();
    area.innerHTML = '';
    area.className = 'game-area game-area--fill';
    gameRef.current = game;
    setScore(0);
    setBestScore(getBest(game));
    setAnswerPrompt(false);

    const meta = GAMES.find((g) => g.id === game);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setControlsHint(meta?.hint ?? null);
    hintTimerRef.current = setTimeout(() => setControlsHint(null), 3200);

    const startPaused = true;
    const canvas = document.createElement('canvas');
    area.appendChild(canvas);
    if (game === 'coffee') {
      controllerRef.current = createLastToken(
        canvas,
        handleScore,
        handleRunEnd,
        startPaused,
      );
    } else if (game === 'traffic') {
      controllerRef.current = createTrafficRider(
        canvas,
        handleScore,
        handleRunEnd,
        startPaused,
      );
    } else {
      controllerRef.current = createCompileRun(
        canvas,
        handleScore,
        handleRunEnd,
        startPaused,
      );
    }

    return () => {
      if ((controllerRef.current?.getScore() ?? 0) > 0) {
        controllerRef.current?.endRun('bank');
      }
      controllerRef.current?.destroy();
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const postToParent = (message: OverlayMessage) => {
    window.parent.postMessage(message, '*');
  };

  const onFinishRun = () => {
    finishChosenRef.current = true;
    setAnswerPrompt(false);
    audio.unlock();
    audio.play('ui');
    controllerRef.current?.resume();
    postToParent({ type: 'run_finish' });
  };

  const onBankScore = () => {
    finishChosenRef.current = false;
    audio.unlock();
    audio.play('ui');
    controllerRef.current?.endRun('bank');
    setAnswerPrompt(false);
    postToParent({ type: 'run_bank' });
  };

  const onCloseAnswer = () => {
    finishChosenRef.current = false;
    controllerRef.current?.endRun('quit');
    setAnswerPrompt(false);
    postToParent({ type: 'dismiss' });
  };

  return (
    <div class="overlay">
      <div class="top-row">
        <StatusBar phase={phase} elapsedMs={elapsedMs} />
        <div class="score-chip">
          <span class="score-label">SCORE</span>
          <span class="score-value">{score}</span>
        </div>
        <div class="score-chip best">
          <span class="score-label">BEST</span>
          <span class="score-value">{best}</span>
        </div>
        <button
          type="button"
          class="world-btn"
          title="World leaderboard"
          onClick={() => {
            audio.unlock();
            audio.play('ui');
            setShowLeaderboard(true);
          }}
        >
          🌍
        </button>
        <Controls
          muted={muted}
          onToggleMute={() => {
            audio.unlock();
            toggleMute();
            audio.play('ui');
          }}
          onMinimize={() => {
            userMinimizedRef.current = true;
            postToParent({ type: 'minimize' });
          }}
          onDismiss={() => {
            controllerRef.current?.endRun('quit');
            postToParent({ type: 'dismiss' });
          }}
        />
      </div>
      <GamePicker
        active={game}
        onChange={(g) => {
          audio.unlock();
          audio.play('ui');
          setGame(g as GameId);
          postToParent({ type: 'game_change', game: g as GameId });
        }}
      />
      {answerPrompt && (
        <AnswerReadyBar
          score={controllerRef.current?.getScore() ?? score}
          onFinish={onFinishRun}
          onBank={onBankScore}
          onClose={onCloseAnswer}
        />
      )}
      <div class="game-shell">
        <div class="game-area game-area--fill" ref={gameAreaRef} />
        {controlsHint && (
          <div class="controls-hint" role="status">
            {controlsHint}
          </div>
        )}
        {bestToast && <div class="toast toast-best">★ NEW BEST ★</div>}
      </div>
      {showLeaderboard && (
        <LeaderboardPanel game={game} onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
}
