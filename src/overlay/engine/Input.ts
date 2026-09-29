type KeyHandler = (e: KeyboardEvent) => void;

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
    return this.keysDown.has(codeOrKey);
  }

  /** True once per press until consumed. */
  consumePress(codeOrKey: string): boolean {
    if (!this.keysPressed.has(codeOrKey)) return false;
    this.keysPressed.delete(codeOrKey);
    return true;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (this.isTypingTarget(e.target)) return;

    const ids = [e.code, e.key];
    for (const id of ids) {
      if (!this.keysDown.has(id)) this.keysPressed.add(id);
      this.keysDown.add(id);
    }

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
