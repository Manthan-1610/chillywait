type KeyHandler = (e: KeyboardEvent) => void;

/** Keys that refer to the same physical press. */
function pressAliases(id: string): string[] {
  if (id === 'Space' || id === ' ') return ['Space', ' '];
  if (id === 'Enter' || id === 'NumpadEnter') return ['Enter', 'NumpadEnter'];
  if (id === 'Shift' || id === 'ShiftLeft' || id === 'ShiftRight') {
    return ['Shift', 'ShiftLeft', 'ShiftRight'];
  }
  const lower = id.length === 1 ? id.toLowerCase() : '';
  if (lower && lower >= 'a' && lower <= 'z') {
    const upper = lower.toUpperCase();
    return [lower, upper, `Key${upper}`];
  }
  return [id];
}

/**
 * Overlay-level input: listens on window so GamePicker / chrome clicks
 * don't permanently steal keyboard focus from the playfield.
 */
export class InputManager {
  private keysDown = new Set<string>();
  private keysPressed = new Set<string>();
  private enabled = true;
  private playfield: HTMLElement | null = null;
  private onKeyDownBound: KeyHandler;
  private onKeyUpBound: KeyHandler;
  private onPointerBound: () => void;

  constructor() {
    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onPointerBound = () => this.handlePointer();
  }

  attach(playfield: HTMLElement): void {
    this.detach();
    this.playfield = playfield;
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    playfield.addEventListener('pointerdown', this.onPointerBound);
    playfield.tabIndex = 0;
    playfield.style.outline = 'none';
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    this.playfield?.removeEventListener('pointerdown', this.onPointerBound);
    this.playfield = null;
    this.keysDown.clear();
    this.keysPressed.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keysDown.clear();
      this.keysPressed.clear();
    }
  }

  focusPlayfield(): void {
    this.playfield?.focus({ preventScroll: true });
  }

  isDown(codeOrKey: string): boolean {
    return pressAliases(codeOrKey).some((id) => this.keysDown.has(id));
  }

  /** True once per physical press until consumed (aliases cleared together). */
  consumePress(codeOrKey: string): boolean {
    const aliases = pressAliases(codeOrKey);
    const hit = aliases.some((id) => this.keysPressed.has(id));
    if (!hit) return false;
    for (const id of aliases) this.keysPressed.delete(id);
    return true;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (this.isTypingTarget(e.target)) return;

    // One edge event per physical key. Prefer code; keep key for legacy checks.
    const primary = e.code || e.key;
    const alreadyDown =
      pressAliases(primary).some((id) => this.keysDown.has(id)) ||
      this.keysDown.has(e.key);

    if (!alreadyDown) {
      this.keysPressed.add(primary);
    }

    this.keysDown.add(e.code);
    this.keysDown.add(e.key);
    for (const id of pressAliases(primary)) this.keysDown.add(id);

    if (
      e.code === 'Space' ||
      e.key === ' ' ||
      e.key.startsWith('Arrow') ||
      e.key === 'a' ||
      e.key === 'd' ||
      e.key === 'w' ||
      e.key === 'r' ||
      e.key === 'R'
    ) {
      e.preventDefault();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const primary = e.code || e.key;
    for (const id of pressAliases(primary)) {
      this.keysDown.delete(id);
      this.keysPressed.delete(id);
    }
    this.keysDown.delete(e.code);
    this.keysDown.delete(e.key);
  }

  private handlePointer(): void {
    this.focusPlayfield();
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target.isContentEditable
    );
  }
}
