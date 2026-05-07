import type { VoiceConfig } from './types';

const STORAGE_KEY = 'jvs-config';

const DEFAULTS: VoiceConfig = {
  geminiApiKey: '',
  autoPlayThreshold: 85,
  suggestThreshold: 60,
  silenceThreshold: 0.01,
  maxRecordingSeconds: 20,
  language: 'en-US',
};

// Server config fetched once from /VoiceSearch/Config (set via admin dashboard).
// localStorage values take precedence so per-browser overrides still work.
let _serverConfig: Partial<VoiceConfig> = {};

export async function fetchServerConfig(): Promise<void> {
  try {
    const resp = await fetch('/VoiceSearch/Config');
    if (!resp.ok) return;
    const data = await resp.json();
    _serverConfig = {
      geminiApiKey:      data.geminiApiKey      ?? '',
      autoPlayThreshold: data.autoPlayThreshold ?? 85,
      suggestThreshold:  data.suggestThreshold  ?? 60,
    };
  } catch {
    // Server config is optional — the plugin works without it when using Web Speech API
  }
}

export function loadConfig(): VoiceConfig {
  let local: Partial<VoiceConfig> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) local = JSON.parse(raw) as Partial<VoiceConfig>;
  } catch {
    // ignore corrupt storage
  }
  return { ...DEFAULTS, ..._serverConfig, ...local };
}

export function saveConfig(patch: Partial<VoiceConfig>): void {
  const current = loadConfig();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
}
