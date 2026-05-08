import type { JellyfinItem } from './types';

interface ApiClient {
  serverAddress(): string;
  getCurrentUserId(): string;
  accessToken(): string;
}

interface PlaybackManager {
  play(opts: { items: JellyfinItem[]; startIndex: number }): Promise<void>;
  playPause(): void;
  stop(): void;
  seek(ticks: number): void;
  currentTime?(): number;
  setPlaybackRate?(rate: number): void;
  volume?(level?: number): number | void;
  toggleMute?(): void;
}

interface AppRouter {
  showItem?(id: string): void;
}

function pm(): PlaybackManager | null {
  return (window as unknown as { playbackManager?: PlaybackManager }).playbackManager ?? null;
}

function router(): AppRouter | null {
  return (window as unknown as { appRouter?: AppRouter }).appRouter ?? null;
}

function client(): ApiClient | null {
  return (window as unknown as { ApiClient?: ApiClient }).ApiClient ?? null;
}

function headers(): HeadersInit {
  const c = client();
  return c ? { 'X-Emby-Token': c.accessToken(), 'Content-Type': 'application/json' } : {};
}

function baseUrl(): string {
  return client()?.serverAddress() ?? window.location.origin;
}

// ---------------------------------------------------------------------------

export function navigateToItem(item: JellyfinItem): void {
  const r = router();
  if (r?.showItem) {
    r.showItem(item.Id);
    return;
  }
  window.location.hash = `#/details?id=${item.Id}`;
}

export async function playItem(item: JellyfinItem): Promise<void> {
  navigateToItem(item);
  // Click the play/resume button once the detail page renders.
  // Old UI uses .btnPlay; experimental React UI uses .btnPlayOrResume.
  await clickWhenReady('.btnPlay:not(.hide), .btnPlayOrResume:not(.hide)', 6000);
}

function clickWhenReady(selector: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = setInterval(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        clearInterval(poll);
        el.click();
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        resolve();
      }
    }, 150);
  });
}

async function sessionCommand(path: string, body?: unknown): Promise<void> {
  const uid = client()?.getCurrentUserId();
  if (!uid) return;

  try {
    const resp = await fetch(`${baseUrl()}/Sessions`, { headers: headers() });
    if (!resp.ok) return;
    const sessions = await resp.json();
    const session = sessions.find((s: { UserId?: string }) => s.UserId === uid);
    if (!session) return;

    await fetch(`${baseUrl()}/Sessions/${session.Id}/Playing/${path}`, {
      method: 'POST',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // best-effort
  }
}

export async function pausePlayback(): Promise<void> {
  const manager = pm();
  if (manager?.playPause) { manager.playPause(); return; }
  await sessionCommand('Pause');
}

export async function stopPlayback(): Promise<void> {
  const manager = pm();
  if (manager?.stop) { manager.stop(); return; }
  await sessionCommand('Stop');
}

export async function seekPlayback(deltaSec: number): Promise<void> {
  const manager = pm();
  if (manager?.seek) {
    const current = manager.currentTime?.() ?? 0;
    manager.seek((current + deltaSec) * 10_000_000);
    return;
  }
  await sessionCommand('Seek', { SeekPositionTicks: deltaSec * 10_000_000 });
}

export async function setPlaybackSpeed(speed: number): Promise<void> {
  pm()?.setPlaybackRate?.(speed);
  const v = document.querySelector<HTMLVideoElement>('video');
  if (v) v.playbackRate = speed;
}

export async function setVolume(level: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, level));
  const manager = pm();
  if (manager?.volume) { manager.volume(clamped); return; }
  const v = document.querySelector<HTMLVideoElement>('video');
  if (v) v.volume = clamped / 100;
}

export async function adjustVolume(delta: number): Promise<void> {
  const manager = pm();
  if (manager?.volume) {
    const current = (manager.volume() as number | void) ?? 50;
    await setVolume((current as number) + delta);
    return;
  }
  const v = document.querySelector<HTMLVideoElement>('video');
  if (v) v.volume = Math.max(0, Math.min(1, v.volume + delta / 100));
}

export async function toggleMute(): Promise<void> {
  const manager = pm();
  if (manager?.toggleMute) { manager.toggleMute(); return; }
  const v = document.querySelector<HTMLVideoElement>('video');
  if (v) v.muted = !v.muted;
}
