import type { JellyfinItem, SearchResult } from './types';
import { rankByEmbedding } from './embed';

// ---------------------------------------------------------------------------
// Jellyfin API helpers
// ---------------------------------------------------------------------------

interface ApiClient {
  serverAddress(): string;
  getCurrentUserId(): string;
  accessToken(): string;
}

function apiClient(): ApiClient | null {
  return (window as unknown as { ApiClient?: ApiClient }).ApiClient ?? null;
}

function authHeaders(): HeadersInit {
  const client = apiClient();
  if (!client) return {};
  return {
    'X-Emby-Token': client.accessToken(),
    'Content-Type': 'application/json',
  };
}

function baseUrl(): string {
  return apiClient()?.serverAddress() ?? window.location.origin;
}

function userId(): string {
  return apiClient()?.getCurrentUserId() ?? '';
}

async function fetchItems(params: Record<string, string | number | boolean>): Promise<JellyfinItem[]> {
  const uid = userId();
  if (!uid) throw new Error('Not authenticated — no active Jellyfin session');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));

  const resp = await fetch(`${baseUrl()}/Users/${uid}/Items?${qs}`, {
    headers: authHeaders(),
  });

  if (!resp.ok) throw new Error(`Jellyfin API ${resp.status}`);

  const data = await resp.json();
  return (data.Items ?? []) as JellyfinItem[];
}

// ---------------------------------------------------------------------------
// Legacy token-based scoring (fallback when no API key)
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSim(a: string, b: string): number {
  const tA = new Set(normalize(a).split(' ').filter(Boolean));
  const tB = new Set(normalize(b).split(' ').filter(Boolean));
  if (tA.size === 0 || tB.size === 0) return 0;
  const inter = [...tA].filter((x) => tB.has(x)).length;
  return inter / (tA.size + tB.size - inter);
}

function prefixScore(query: string, name: string): number {
  const qTokens = normalize(query).split(' ').filter(Boolean);
  const nTokens = normalize(name).split(' ').filter(Boolean);
  if (qTokens.length === 0 || nTokens.length < qTokens.length) return 0;
  return qTokens.every((t, i) => nTokens[i] === t) ? 1.0 : 0;
}

function legacyScore(query: string, name: string): number {
  return Math.max(tokenSim(query, name), prefixScore(query, name));
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function displayLabel(item: JellyfinItem): string {
  if (item.Type === 'Episode') {
    const s = item.ParentIndexNumber ?? item.SeasonNumber;
    const e = item.IndexNumber;
    const series = item.SeriesName ?? '';
    return s != null && e != null
      ? `${series} S${s}E${e} – ${item.Name}`
      : item.Name;
  }
  return item.ProductionYear ? `${item.Name} (${item.ProductionYear})` : item.Name;
}

// ---------------------------------------------------------------------------
// Public search functions
// ---------------------------------------------------------------------------

export async function searchByTitle(
  title: string,
  season?: number,
  episode?: number,
  apiKey?: string
): Promise<SearchResult[]> {
  const items = await fetchItems({
    searchTerm: title,
    IncludeItemTypes: 'Movie,Series,Episode',
    Recursive: true,
    Fields: 'Overview,ParentIndexNumber',
    Limit: 30,
  });

  if (items.length === 0) return [];

  const candidates = items.map(item => item.SeriesName ?? item.Name);

  const rawScores = apiKey
    ? await rankByEmbedding(title, candidates, apiKey)
    : candidates.map(name => legacyScore(title, name));

  return items
    .map((item, i): SearchResult => {
      let score = rawScores[i];
      if (item.Type === 'Episode') {
        if (season   !== undefined) score += item.ParentIndexNumber === season  ? 0.05 : -0.1;
        if (episode  !== undefined) score += item.IndexNumber       === episode ? 0.05 : -0.1;
      }
      return { item, score: Math.min(1, Math.max(0, score)), display: displayLabel(item) };
    })
    .filter(r => r.score > (apiKey ? 0.3 : 0.15))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function searchByActor(actorName: string): Promise<SearchResult[]> {
  const items = await fetchItems({
    searchTerm: actorName,
    IncludeItemTypes: 'Movie,Series',
    Recursive: true,
    Fields: 'Overview,People',
    PersonTypes: 'Actor',
    Limit: 20,
  });

  return items.map((item): SearchResult => ({
    item,
    score: 0.9,
    display: displayLabel(item),
  }));
}

export async function searchByPlot(description: string, apiKey?: string): Promise<SearchResult[]> {
  const items = await fetchItems({
    searchTerm: description,
    IncludeItemTypes: 'Movie,Series',
    Recursive: true,
    Fields: 'Overview',
    Limit: 30,
  });

  const withOverview = items.filter(i => i.Overview);
  if (withOverview.length === 0) return [];

  const overviews = withOverview.map(i => i.Overview!);

  const rawScores = apiKey
    ? await rankByEmbedding(description, overviews, apiKey)
    : overviews.map(ov => Math.min(1, tokenSim(description, ov) * 3));

  return withOverview
    .map((item, i): SearchResult => ({
      item,
      score: rawScores[i],
      display: displayLabel(item),
    }))
    .filter(r => r.score > (apiKey ? 0.4 : 0.05))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function searchSimilar(reference: string, apiKey?: string): Promise<SearchResult[]> {
  const refItems = await fetchItems({
    searchTerm: reference,
    IncludeItemTypes: 'Movie,Series',
    Recursive: true,
    Fields: 'Overview',
    Limit: 5,
  });

  if (refItems.length === 0) return [];

  const refOverview = refItems[0].Overview ?? '';
  const refId = refItems[0].Id;

  const candidates = await fetchItems({
    IncludeItemTypes: 'Movie,Series',
    Recursive: true,
    Fields: 'Overview',
    Limit: 60,
    SortBy: 'Random',
  });

  const withOverview = candidates.filter(item => item.Id !== refId && item.Overview);
  if (withOverview.length === 0) return [];

  const overviews = withOverview.map(i => i.Overview!);

  const rawScores = apiKey
    ? await rankByEmbedding(refOverview, overviews, apiKey)
    : overviews.map(ov => Math.min(1, tokenSim(refOverview, ov) * 2));

  return withOverview
    .map((item, i): SearchResult => ({
      item,
      score: rawScores[i],
      display: displayLabel(item),
    }))
    .filter(r => r.score > (apiKey ? 0.4 : 0.1))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
