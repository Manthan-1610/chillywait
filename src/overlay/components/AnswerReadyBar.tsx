interface AnswerReadyBarProps {
  score: number;
  onFinish: () => void;
  onBank: () => void;
  onClose: () => void;
}

export function AnswerReadyBar({
  score,
  onFinish,
  onBank,
  onClose,
}: AnswerReadyBarProps) {
  return (
    <div class="answer-ready-bar" role="dialog" aria-label="Answer ready">
      <div class="answer-ready-title">★ ANSWER READY ★</div>
      <div class="answer-ready-score">Current score: {score}</div>
      <div class="answer-ready-actions">
        <button type="button" class="ar-btn ar-finish" onClick={onFinish}>
          Finish run
        </button>
        <button type="button" class="ar-btn ar-bank" onClick={onBank}>
          Bank score
        </button>
        <button type="button" class="ar-btn ar-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
