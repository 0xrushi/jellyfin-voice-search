export type IntentType =
  | 'play'
  | 'play_actor'
  | 'play_plot'
  | 'play_similar'
  | 'pause'
  | 'stop'
  | 'seek'
  | 'speed'
  | 'volume_up'
  | 'volume_down'
  | 'volume_set'
  | 'mute'
  | 'info'
  | 'unknown';

export interface Intent {
  intent: IntentType;
  target?: string;
  season?: number;
  episode?: number;
  actor?: string;
  description?: string;
  reference?: string;
  seconds?: number;
  speed?: number;
  delta?: number;
  level?: number;
  raw?: string;
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: 'Movie' | 'Series' | 'Episode';
  SeasonNumber?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  SeriesName?: string;
  SeriesId?: string;
  Overview?: string;
  People?: Array<{ Name: string; Type: string; Role?: string }>;
  ProductionYear?: number;
}

export interface SearchResult {
  item: JellyfinItem;
  score: number;
  display: string;
}

export interface PlayerContext {
  isPlaying: boolean;
  currentItem?: JellyfinItem;
  position?: number;
  volume?: number;
}

export interface VoiceConfig {
  geminiApiKey: string;
  autoPlayThreshold: number;
  suggestThreshold: number;
  silenceThreshold: number;
  maxRecordingSeconds: number;
  language: string;
}
