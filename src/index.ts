import { VoiceOrchestrator } from './orchestrator';
import { injectToolbarButton } from './ui';
import { fetchServerConfig, loadConfig, saveConfig } from './config';
import { toast } from './ui';

// Minimal jQuery stub so Jellyfin's viewContainer.js executes plugin config page scripts.
// viewContainer checks `window.$` before using `$(view).appendTo(parent)` — without jQuery
// globally available (Jellyfin 10.10 dropped it), it falls back to replaceChild which never
// executes inline <script> tags. Our stub implements just enough to make scripts run.
(function installJQueryStub() {
  const win = window as any;
  if (win.$) return;
  function jq(elem: Element) {
    return {
      appendTo(parent: Element) {
        parent.appendChild(elem);
        elem.querySelectorAll('script').forEach((old) => {
          const s = document.createElement('script');
          s.textContent = (old as HTMLScriptElement).text || old.textContent || '';
          document.head.appendChild(s);
        });
        return [elem];
      },
    };
  }
  (jq as any).mobile = {};
  win.$ = jq;
})();

const orchestrator = new VoiceOrchestrator();

function injectButton(): void {
  injectToolbarButton(() => orchestrator.handleVoiceInput());
}

function onKeyDown(e: KeyboardEvent): void {
  const active = document.activeElement;
  const inInput =
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active as HTMLElement)?.isContentEditable;

  // Backtick — mirrors the Kodi plugin binding
  if (e.key === '`' && !e.ctrlKey && !e.altKey && !e.metaKey && !inInput) {
    e.preventDefault();
    orchestrator.handleVoiceInput();
    return;
  }

  // Ctrl+Shift+V — web-safe fallback
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    orchestrator.handleVoiceInput();
  }
}

async function init(): Promise<void> {
  // Pull Gemini API key (and thresholds) from the server config set in the admin dashboard.
  await fetchServerConfig();

  injectButton();
  document.addEventListener('keydown', onKeyDown);

  // Jellyfin is an SPA with hash-routing; re-inject the button on route changes
  // in case the toolbar is re-mounted.
  window.addEventListener('hashchange', () => setTimeout(injectButton, 400));

  const cfg = loadConfig();
  if (!cfg.geminiApiKey) {
    console.info(
      '[jellyfin-voice-search] No Gemini API key configured.\n' +
      '  • Set one in the Jellyfin admin dashboard under Plugins → Voice Search.\n' +
      '  • Chrome/Edge work without a key via the built-in Web Speech API.'
    );
  }

  console.info('[jellyfin-voice-search] Ready. Press ` or Ctrl+Shift+V to activate.');
}

// Toolbar injection is retried a few times to survive SPA hydration delays.
function retryInject(attempt = 0): void {
  injectButton();
  if (attempt < 6) setTimeout(() => retryInject(attempt + 1), 600 + attempt * 300);
}

// This script is injected by the File Transformation plugin before </body>,
// so the DOM is available. We still defer heavy work until after DOMContentLoaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); retryInject(); });
} else {
  init();
  retryInject();
}

// ---------------------------------------------------------------------------
// Window API — accessible from the browser console
// ---------------------------------------------------------------------------
(window as unknown as Record<string, unknown>).jellyfinVoiceSearch = {
  activate:   (): void => { orchestrator.handleVoiceInput(); },
  textSearch: (): void => { orchestrator.handleTextInput(); },
  configure:  (opts: Parameters<typeof saveConfig>[0]): void => {
    saveConfig(opts);
    toast('Voice Search config saved');
  },
  getConfig: () => loadConfig(),
};
