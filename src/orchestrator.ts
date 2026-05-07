import type { Intent, VoiceConfig } from './types';
import { VoiceCapture } from './voice';
import { transcribeAudio } from './stt';
import { parseIntent } from './intent';
import {
  searchByTitle,
  searchByActor,
  searchByPlot,
  searchSimilar,
} from './search';
import {
  playItem,
  navigateToItem,
  pausePlayback,
  stopPlayback,
  seekPlayback,
  setPlaybackSpeed,
  adjustVolume,
  setVolume,
  toggleMute,
} from './playback';
import {
  showOverlay,
  hideOverlay,
  toast,
  showResultsDialog,
  setMicActive,
  promptText,
} from './ui';
import { loadConfig } from './config';

const AUTO_PLAY = 0.85;
const SUGGEST   = 0.60;

export class VoiceOrchestrator {
  private capture = new VoiceCapture();
  private busy = false;

  get isActive(): boolean { return this.busy; }

  // -------------------------------------------------------------------------
  // Public entry points
  // -------------------------------------------------------------------------

  async handleVoiceInput(): Promise<void> {
    // Second press while active = cancel
    if (this.busy) {
      this.capture.stop();
      this.busy = false;
      hideOverlay();
      setMicActive(false);
      return;
    }

    this.busy = true;
    setMicActive(true);
    showOverlay('listening');

    const cfg = loadConfig();

    try {
      let transcript: string;

      if (VoiceCapture.hasWebSpeech()) {
        try {
          transcript = await this.capture.captureWebSpeech(cfg.language);
        } catch (webSpeechErr) {
          const msg = webSpeechErr instanceof Error ? webSpeechErr.message : String(webSpeechErr);
          // "network" error = Google STT unreachable (common on HTTP/localhost). Fall through to Gemini.
          if (!msg.includes('network') || !cfg.geminiApiKey) throw webSpeechErr;
          toast('Web Speech API unavailable — using Gemini STT');
          const blob = await this.capture.captureMediaRecorder(
            cfg.maxRecordingSeconds,
            cfg.silenceThreshold,
            (state) => showOverlay(state === 'listening' ? 'listening' : 'processing')
          );
          showOverlay('processing');
          transcript = await transcribeAudio(blob, cfg.geminiApiKey);
        }
      } else if (VoiceCapture.hasMicrophone()) {
        if (!cfg.geminiApiKey) {
          this._noKeyFallback(cfg);
          return;
        }
        const blob = await this.capture.captureMediaRecorder(
          cfg.maxRecordingSeconds,
          cfg.silenceThreshold,
          (state) => showOverlay(state === 'listening' ? 'listening' : 'processing')
        );
        showOverlay('processing');
        transcript = await transcribeAudio(blob, cfg.geminiApiKey);
      } else {
        toast('Microphone not available — using text input');
        hideOverlay();
        setMicActive(false);
        this.busy = false;
        return this.handleTextInput();
      }

      if (!transcript.trim()) { toast('No speech detected'); return; }

      toast(`Heard: "${transcript}"`);
      showOverlay('processing');
      await this._processTranscript(transcript, cfg);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(msg.includes('not-allowed') ? 'Microphone access denied' : msg);
    } finally {
      this.busy = false;
      setMicActive(false);
      hideOverlay();
    }
  }

  async handleTextInput(): Promise<void> {
    const text = await promptText('What would you like to watch or do?');
    if (!text?.trim()) return;

    showOverlay('processing');
    const cfg = loadConfig();
    try {
      await this._processTranscript(text.trim(), cfg);
    } finally {
      hideOverlay();
    }
  }

  // -------------------------------------------------------------------------
  // Internal pipeline
  // -------------------------------------------------------------------------

  private _noKeyFallback(cfg: VoiceConfig): void {
    toast('No Gemini API key — falling back to text input. Set one via window.jellyfinVoiceSearch.configure({ geminiApiKey: "…" })');
    hideOverlay();
    setMicActive(false);
    this.busy = false;
    this.handleTextInput();
  }

  private async _processTranscript(transcript: string, cfg: VoiceConfig): Promise<void> {
    let intent: Intent;

    if (cfg.geminiApiKey) {
      intent = await parseIntent(transcript, cfg.geminiApiKey);
    } else {
      // Without Gemini, treat everything as a play-by-title query
      intent = { intent: 'play', target: transcript, raw: transcript };
    }

    await this._dispatch(intent, cfg);
  }

  private async _dispatch(intent: Intent, cfg: VoiceConfig): Promise<void> {
    switch (intent.intent) {
      case 'play':        return this._handlePlay(intent, cfg);
      case 'play_actor':  return this._handlePlayActor(intent);
      case 'play_plot':   return this._handlePlayPlot(intent);
      case 'play_similar':return this._handlePlaySimilar(intent);

      case 'pause':
        await pausePlayback(); toast('Toggled pause'); break;

      case 'stop':
        await stopPlayback(); toast('Stopped playback'); break;

      case 'seek': {
        const delta = intent.delta ?? (intent.seconds !== undefined ? intent.seconds - ((window as any).playbackManager?.currentTime?.() ?? 0) / 10_000_000 : 0);
        await seekPlayback(delta);
        toast(delta > 0 ? `Skipped ahead ${Math.abs(delta)}s` : `Went back ${Math.abs(delta)}s`);
        break;
      }

      case 'speed':
        if (intent.speed !== undefined) {
          await setPlaybackSpeed(intent.speed);
          toast(`Playback speed: ${intent.speed}×`);
        }
        break;

      case 'volume_up':
        await adjustVolume(intent.delta ?? 10);
        toast('Volume up');
        break;

      case 'volume_down':
        await adjustVolume(-(intent.delta ?? 10));
        toast('Volume down');
        break;

      case 'volume_set':
        if (intent.level !== undefined) {
          await setVolume(intent.level);
          toast(`Volume: ${intent.level}%`);
        }
        break;

      case 'mute':
        await toggleMute(); toast('Toggled mute'); break;

      default:
        toast(`Didn't understand: "${intent.raw ?? ''}"`);
    }
  }

  // -------------------------------------------------------------------------
  // Search handlers
  // -------------------------------------------------------------------------

  private async _handlePlay(intent: Intent, cfg: VoiceConfig): Promise<void> {
    if (!intent.target) { toast('No title specified'); return; }

    const results = await searchByTitle(intent.target, intent.season, intent.episode);
    if (results.length === 0) { toast(`Nothing found for "${intent.target}"`); return; }

    const best = results[0];
    const threshold = cfg.autoPlayThreshold / 100;
    const suggestThreshold = cfg.suggestThreshold / 100;

    if (best.score >= threshold) {
      await playItem(best.item);
      toast(`Playing: ${best.display}`);
    } else if (best.score >= suggestThreshold) {
      showResultsDialog(
        'Did you mean…?',
        results.slice(0, 6).map((r) => ({
          label: r.display,
          score: r.score,
          onSelect: () => playItem(r.item),
        }))
      );
    } else {
      toast(`No confident match for "${intent.target}"`);
    }
  }

  private async _handlePlayActor(intent: Intent): Promise<void> {
    if (!intent.actor) { toast('No actor specified'); return; }

    const results = await searchByActor(intent.actor);
    if (results.length === 0) { toast(`Nothing found with ${intent.actor}`); return; }

    showResultsDialog(
      `${intent.actor}'s movies & shows`,
      results.slice(0, 8).map((r) => ({
        label: r.display,
        score: r.score,
        onSelect: () => navigateToItem(r.item),
      }))
    );
  }

  private async _handlePlayPlot(intent: Intent): Promise<void> {
    if (!intent.description) { toast('No description provided'); return; }

    const results = await searchByPlot(intent.description);
    if (results.length === 0) { toast('No matching content found'); return; }

    showResultsDialog(
      'Matching content',
      results.slice(0, 7).map((r) => ({
        label: r.display,
        score: r.score,
        onSelect: () => navigateToItem(r.item),
      }))
    );
  }

  private async _handlePlaySimilar(intent: Intent): Promise<void> {
    if (!intent.reference) { toast('No reference title specified'); return; }

    const results = await searchSimilar(intent.reference);
    if (results.length === 0) { toast(`Nothing similar to "${intent.reference}"`); return; }

    showResultsDialog(
      `Similar to ${intent.reference}`,
      results.slice(0, 7).map((r) => ({
        label: r.display,
        score: r.score,
        onSelect: () => navigateToItem(r.item),
      }))
    );
  }
}
