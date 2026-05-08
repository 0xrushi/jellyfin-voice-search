const RANK_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const CACHE_KEY = 'jvs-rank-v1';

type RankCache = Record<string, number[]>;

function loadCache(): RankCache {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as RankCache; }
  catch { return {}; }
}

function saveCache(c: RankCache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

function cacheKey(query: string, candidates: string[]): string {
  return `${query}|${candidates.join('|')}`;
}

/**
 * Uses Gemini Flash to score each candidate against the query.
 * Returns a score 0–1 per candidate, cached in localStorage.
 */
export async function rankByEmbedding(
  query: string,
  candidates: string[],
  apiKey: string
): Promise<number[]> {
  if (candidates.length === 0) return [];

  const key = cacheKey(query, candidates);
  const cache = loadCache();
  if (cache[key]) return cache[key];

  const list = candidates.map((c, i) => `${i}. ${c}`).join('\n');

  const prompt =
    `You are a media search ranker. Given the user's search query and a list of titles from their library, ` +
    `return a JSON array of scores (0.0–1.0) indicating how well each title matches the query. ` +
    `Score 1.0 = perfect match or same franchise/sequel, 0.0 = completely unrelated. ` +
    `Return ONLY a JSON array of numbers, one per candidate, no markdown, no explanation.\n\n` +
    `Query: "${query}"\n\nCandidates:\n${list}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 256 },
  };

  const resp = await fetch(`${RANK_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) throw new Error(`Gemini rank ${resp.status}`);

  const data = await resp.json();
  const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const scores = JSON.parse(cleaned) as number[];

  cache[key] = scores;
  saveCache(cache);
  return scores;
}
