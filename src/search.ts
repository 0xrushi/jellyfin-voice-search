import type { JellyfinItem, SearchResult } from './types';

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
// Text normalisation & fuzzy scoring
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

// Jaccard similarity over word tokens
function tokenSim(a: string, b: string): number {
  const tA = new Set(normalize(a).split(' ').filter(Boolean));
  const tB = new Set(normalize(b).split(' ').filter(Boolean));
  if (tA.size === 0 || tB.size === 0) return 0;
  const inter = [...tA].filter((x) => tB.has(x)).length;
  return inter / (tA.size + tB.size - inter);
}

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
  episode?: number
): Promise<SearchResult[]> {
  const items = await fetchItems({
    searchTerm: title,
    IncludeItemTypes: 'Movie,Series,Episode',
    Recursive: true,
    Fields: 'Overview,ParentIndexNumber',
    Limit: 30,
  });

  return items
    .map((item): SearchResult => {
      const nameToMatch = item.SeriesName ?? item.Name;
      let score = tokenSim(title, nameToMatch);

      if (item.Type === 'Episode') {
        if (season !== undefined) {
          score += item.ParentIndexNumber === season ? 0.15 : -0.3;
        }
        if (episode !== undefined) {
          score += item.IndexNumber === episode ? 0.15 : -0.3;
        }
      }

      return { item, score: Math.min(1, Math.max(0, score)), display: displayLabel(item) };
    })
    .filter((r) => r.score > 0.15)
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

export async function searchByPlot(description: string): Promise<SearchResult[]> {
  const items = await fetchItems({
    searchTerm: description,
    IncludeItemTypes: 'Movie,Series',
    Recursive: true,
    Fields: 'Overview',
    Limit: 25,
  });

  return items
    .map((item): SearchResult => {
      const score = item.Overview ? Math.min(1, tokenSim(description, item.Overview) * 3) : 0;
      return { item, score, display: displayLabel(item) };
    })
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function searchSimilar(reference: string): Promise<SearchResult[]> {
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

  return candidates
    .filter((item) => item.Id !== refId && item.Overview)
    .map((item): SearchResult => ({
      item,
      score: Math.min(1, tokenSim(refOverview, item.Overview!) * 2),
      display: displayLabel(item),
    }))
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
