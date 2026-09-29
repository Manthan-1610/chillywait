import type { ChillYWaitSettings, WaitPhase } from '../shared/constants';
import { postToOverlay } from '../shared/messaging';
import { getSettings, saveSettings } from '../shared/storage';
import { safeRuntimeUrl, isExtensionContextValid } from '../shared/extension-context';

const HOST_ID = 'chillywait-host';
const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 420;
const PILL_SIZE = 48;

export class OverlayHost {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private panel: HTMLDivElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private pill: HTMLButtonElement | null = null;
  private userMinimized = false;
  private dragState: {
    active: boolean;
    offsetX: number;
    offsetY: number;
  } | null = null;

  async mount(): Promise<void> {
    if (document.getElementById(HOST_ID)) return;
    if (!isExtensionContextValid()) return;

    const settings = await getSettings();

    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host, * { box-sizing: border-box; }
      .cw-panel {
        position: fixed;
        z-index: 2147483646;
        width: ${PANEL_WIDTH}px;
        height: ${PANEL_HEIGHT}px;
        left: 0;
        top: 0;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 2px #7c3aed;
        background: linear-gradient(180deg, #1a1030 0%, #0d0d18 100%);
        display: none;
        flex-direction: column;
        font-family: "Courier New", monospace;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }
      .cw-panel.visible { display: flex; }
      .cw-panel.minimized { display: none; }
      .cw-drag-bar {
        height: 26px;
        background: linear-gradient(90deg, #5b21b6, #7c3aed, #5b21b6);
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffec27;
        font-size: 10px;
        font-weight: 700;
        font-family: "Courier New", monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        user-select: none;
        flex-shrink: 0;
      }
      .cw-drag-bar:active { cursor: grabbing; }
      .cw-iframe {
        flex: 1;
        border: none;
        width: 100%;
        background: #050508;
      }
      .cw-pill {
        position: fixed;
        z-index: 2147483647;
        width: ${PILL_SIZE}px;
        height: ${PILL_SIZE}px;
        left: 0;
        top: 0;
        border-radius: 50%;
        border: none;
        background: linear-gradient(135deg, #7c3aed, #2563eb);
        color: white;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        display: none;
        align-items: center;
        justify-content: center;
      }
      .cw-pill.visible {
        display: flex;
        animation: cw-pill-pop 0.2s ease;
      }
      .cw-pill:hover { transform: scale(1.08); }
      @keyframes cw-pill-pop {
        from { transform: scale(0.6); opacity: 0.5; }
        to { transform: scale(1); opacity: 1; }
      }
    `;
    this.shadow.appendChild(style);

    this.panel = document.createElement('div');
    this.panel.className = 'cw-panel';

    const dragBar = document.createElement('div');
    dragBar.className = 'cw-drag-bar';
    dragBar.textContent = '◆ CHILLYWAIT ARCADE ◆';
    this.setupDrag(dragBar);

    this.iframe = document.createElement('iframe');
    this.iframe.className = 'cw-iframe';
    const overlayUrl = safeRuntimeUrl('overlay.html');
    if (!overlayUrl) {
      this.destroy();
      return;
    }
    this.iframe.src = overlayUrl;
    this.iframe.setAttribute('allow', 'autoplay');
    this.iframe.title = 'ChillYWait minigames';
    this.iframe.addEventListener('load', () => {
      this.notifyPaused(true);
    });

    this.panel.appendChild(dragBar);
    this.panel.appendChild(this.iframe);

    this.pill = document.createElement('button');
    this.pill.className = 'cw-pill';
    this.pill.title = 'Open ChillYWait';
    this.pill.textContent = '🎮';
    this.pill.addEventListener('click', () => this.expand());

    this.shadow.appendChild(this.panel);
    this.shadow.appendChild(this.pill);
    document.documentElement.appendChild(this.host);

    this.setPosition(settings.overlayPosition.x, settings.overlayPosition.y);
  }

  private setupDrag(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (e) => {
      if (!this.panel) return;
      this.dragState = {
        active: true,
        offsetX: e.clientX - this.panel.offsetLeft,
        offsetY: e.clientY - this.panel.offsetTop,
      };
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!this.dragState?.active || !this.panel) return;
      const x = e.clientX - this.dragState.offsetX;
      const y = e.clientY - this.dragState.offsetY;
      this.setPosition(x, y);
    });

    const endDrag = () => {
      if (!this.dragState?.active || !this.panel) return;
      this.dragState = null;
      void saveSettings({
        overlayPosition: {
          x: this.panel.offsetLeft,
          y: this.panel.offsetTop,
        },
      });
    };

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  private setPosition(x: number, y: number): void {
    if (!this.panel || !this.pill) return;

    const maxX = window.innerWidth - PANEL_WIDTH - 8;
    const maxY = window.innerHeight - PANEL_HEIGHT - 8;

    let px = x;
    let py = y;

    if (px < 0 || py < 0) {
      px = Math.max(8, window.innerWidth - PANEL_WIDTH - 16);
      py = Math.max(8, window.innerHeight - PANEL_HEIGHT - 16);
    } else {
      px = Math.min(Math.max(8, px), maxX);
      py = Math.min(Math.max(8, py), maxY);
    }

    this.panel.style.left = `${px}px`;
    this.panel.style.top = `${py}px`;

    this.syncPillPosition();
  }

  private syncPillPosition(): void {
    if (!this.panel || !this.pill) return;
    const px = this.panel.offsetLeft;
    const py = this.panel.offsetTop;
    const pillMaxX = window.innerWidth - PILL_SIZE - 8;
    const pillMaxY = window.innerHeight - PILL_SIZE - 8;
    const pillX = Math.min(px + PANEL_WIDTH - PILL_SIZE, pillMaxX);
    const pillY = Math.min(py + PANEL_HEIGHT - PILL_SIZE, pillMaxY);
    this.pill.style.left = `${Math.max(8, pillX)}px`;
    this.pill.style.top = `${Math.max(8, pillY)}px`;
  }

  show(): void {
    if (!this.panel || !this.pill) return;
    this.userMinimized = false;
    this.panel.classList.add('visible');
    this.panel.classList.remove('minimized');
    this.pill.classList.remove('visible');
    this.notifyPaused(false);
  }

  /** Keep panel visible but pause the game for answer-ready decisions. */
  showAnswerReady(): void {
    if (!this.panel || !this.pill) return;
    this.userMinimized = false;
    this.panel.classList.add('visible');
    this.panel.classList.remove('minimized');
    this.pill.classList.remove('visible');
    this.notifyPaused(true, 'answer');
  }

  /** Unpause the game while keeping the panel visible (Finish run). */
  resumePlay(): void {
    if (!this.panel || !this.pill) return;
    this.userMinimized = false;
    this.panel.classList.add('visible');
    this.panel.classList.remove('minimized');
    this.pill.classList.remove('visible');
    this.notifyPaused(false);
  }

  hide(): void {
    if (!this.panel || !this.pill) return;
    this.userMinimized = false;
    this.panel.classList.remove('visible', 'minimized');
    this.pill.classList.remove('visible');
    this.notifyPaused(true);
  }

  minimize(): void {
    if (!this.panel || !this.pill) return;
    this.userMinimized = true;
    this.panel.classList.remove('visible');
    this.panel.classList.add('minimized');
    this.syncPillPosition();
    this.pill.classList.add('visible');
    this.notifyPaused(true);
  }

  isMinimized(): boolean {
    return this.userMinimized;
  }

  expand(): void {
    this.show();
  }

  /** Show panel only if user hasn't manually minimized. */
  showIfAllowed(): void {
    if (!this.userMinimized) this.show();
  }

  updateState(phase: WaitPhase, elapsedMs: number): void {
    if (!this.iframe) return;
    postToOverlay(this.iframe, { type: 'state', phase, elapsedMs });
  }

  sendSettings(settings: Partial<ChillYWaitSettings>): void {
    if (!this.iframe) return;
    postToOverlay(this.iframe, {
      type: 'settings',
      settings,
    });
  }

  private notifyPaused(paused: boolean, reason?: 'minimize' | 'answer'): void {
    if (!this.iframe?.contentWindow) return;
    this.iframe.contentWindow.postMessage(
      { type: 'pause', paused, reason: paused ? reason ?? 'minimize' : undefined },
      '*',
    );
  }

  destroy(): void {
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.panel = null;
    this.iframe = null;
    this.pill = null;
  }
}
