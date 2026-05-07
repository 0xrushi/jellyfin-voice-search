const OVERLAY_ID = 'jvs-overlay';
const BUTTON_ID = 'jvs-mic-btn';
const TOAST_ID = 'jvs-toast';
const DIALOG_ID = 'jvs-dialog-wrapper';

const CSS = `
#jvs-overlay {
  position: fixed;
  top: 76px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(10,10,20,0.88);
  border-radius: 40px;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 9999;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.12);
  animation: jvs-in 0.15s ease;
  pointer-events: none;
}
#jvs-overlay svg {
  width: 26px; height: 26px;
  color: #00a4dc;
  flex-shrink: 0;
}
#jvs-overlay.listening svg { animation: jvs-pulse 1.1s infinite; }
#jvs-overlay.processing svg { color: #f9a825; }
#jvs-status-label { color: #fff; font: 14px/1 sans-serif; white-space: nowrap; }

#jvs-toast {
  position: fixed;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(10,10,20,0.88);
  color: #eee;
  padding: 9px 18px;
  border-radius: 8px;
  font: 13px/1.4 sans-serif;
  z-index: 9998;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.1);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
  max-width: 380px;
  text-align: center;
}
#jvs-toast.on { opacity: 1; }

#jvs-mic-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  opacity: 0.72;
  transition: opacity .15s, background .15s;
  vertical-align: middle;
}
#jvs-mic-btn:hover { opacity: 1; background: rgba(255,255,255,0.09); }
#jvs-mic-btn.active { color: #00a4dc; opacity: 1; }
#jvs-mic-btn svg { width: 22px; height: 22px; }

#jvs-dialog-wrapper {
  position: fixed; inset: 0; z-index: 10000;
  display: flex; align-items: center; justify-content: center;
}
.jvs-backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.55);
}
.jvs-dialog {
  position: relative;
  background: #16213e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  padding: 22px 20px;
  width: min(460px, 92vw);
  z-index: 1;
  font-family: sans-serif;
  color: #fff;
  max-height: 80vh;
  overflow-y: auto;
}
.jvs-dialog h3 {
  margin: 0 0 14px;
  font-size: 15px;
  color: #00a4dc;
  font-weight: 500;
}
.jvs-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 7px;
  cursor: pointer;
  transition: background .12s;
  margin-bottom: 3px;
  gap: 10px;
}
.jvs-result:hover { background: rgba(255,255,255,0.08); }
.jvs-result-name { font-size: 14px; flex: 1; }
.jvs-result-score {
  font-size: 11px;
  color: #999;
  background: rgba(255,255,255,0.06);
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}
.jvs-dialog-close {
  position: absolute;
  top: 12px; right: 14px;
  background: none; border: none;
  color: #888; font-size: 18px;
  cursor: pointer; line-height: 1;
}
.jvs-dialog-close:hover { color: #fff; }

@keyframes jvs-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes jvs-pulse {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
`;

const MIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93C7.06 15.43 4 12.07 4 8H2c0 4.42 3.16 8.09 7.4 8.73V19h2v-2.64c.19.03.39.04.6.04s.41-.01.6-.04V19h2v-2.27C18.84 16.09 22 12.42 22 8h-2c0 4.08-3.06 7.44-7 7.93z"/>
</svg>`;

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function injectStyles(): void {
  if (document.getElementById('jvs-css')) return;
  const style = document.createElement('style');
  style.id = 'jvs-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

export function injectToolbarButton(onClick: () => void): void {
  injectStyles();
  if (document.getElementById(BUTTON_ID)) return;

  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.title = 'Voice Search  (` or Ctrl+Shift+V)';
  btn.innerHTML = MIC_SVG;
  btn.addEventListener('click', onClick);

  // Candidate insertion points, most specific first
  const targets = [
    '.headerRight',
    '[class*="headerRight"]',
    '[class*="AppBar"] [class*="Toolbar"] > div:last-child',
    '.MuiToolbar-root > div:last-child',
    '.MuiToolbar-root',
    '.skinHeader .headerRight',
    'header nav',
    'header',
  ];

  for (const sel of targets) {
    const el = document.querySelector(sel);
    if (el) {
      el.appendChild(btn);
      return;
    }
  }

  // Absolute fallback: floating button bottom-right
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '9997',
    background: 'rgba(10,10,20,0.85)',
    borderRadius: '50%',
    padding: '10px',
    width: '46px',
    height: '46px',
  });
  document.body.appendChild(btn);
}

export function setMicActive(active: boolean): void {
  document.getElementById(BUTTON_ID)?.classList.toggle('active', active);
}

// ---------------------------------------------------------------------------
// Overlay (shown during listening / processing)
// ---------------------------------------------------------------------------

export function showOverlay(state: 'listening' | 'processing'): void {
  let el = document.getElementById(OVERLAY_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.innerHTML = `${MIC_SVG}<span id="jvs-status-label"></span>`;
    document.body.appendChild(el);
  }
  el.className = state;
  const label = document.getElementById('jvs-status-label');
  if (label) label.textContent = state === 'listening' ? 'Listening…' : 'Processing…';
}

export function hideOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

export function toast(message: string, durationMs = 3000): void {
  injectStyles();
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = TOAST_ID;
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el?.classList.remove('on'), durationMs);
}

// ---------------------------------------------------------------------------
// Results dialog
// ---------------------------------------------------------------------------

export interface ResultItem {
  label: string;
  score: number;
  onSelect(): void;
}

export function showResultsDialog(title: string, items: ResultItem[]): void {
  document.getElementById(DIALOG_ID)?.remove();

  const wrapper = document.createElement('div');
  wrapper.id = DIALOG_ID;

  const backdrop = document.createElement('div');
  backdrop.className = 'jvs-backdrop';
  backdrop.addEventListener('click', () => wrapper.remove());

  const dialog = document.createElement('div');
  dialog.className = 'jvs-dialog';
  dialog.innerHTML = `
    <button class="jvs-dialog-close" title="Close">✕</button>
    <h3>${title}</h3>
  `;
  dialog.querySelector('.jvs-dialog-close')!.addEventListener('click', () => wrapper.remove());

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'jvs-result';
    row.innerHTML = `
      <span class="jvs-result-name">${item.label}</span>
      <span class="jvs-result-score">${Math.round(item.score * 100)}%</span>
    `;
    row.addEventListener('click', () => { wrapper.remove(); item.onSelect(); });
    dialog.appendChild(row);
  }

  wrapper.appendChild(backdrop);
  wrapper.appendChild(dialog);
  document.body.appendChild(wrapper);
}

// ---------------------------------------------------------------------------
// Text input fallback
// ---------------------------------------------------------------------------

export function promptText(message: string): Promise<string | null> {
  return Promise.resolve(window.prompt(message));
}
