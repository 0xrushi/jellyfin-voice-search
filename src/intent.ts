import type { Intent, PlayerContext } from './types';

const INTENT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are a media player voice command parser for Jellyfin.
Parse the given natural-language command and return a JSON object (no markdown, no extra text).

Intent types and their fields:
- play          → target (title), season?, episode?
- play_actor    → actor
- play_plot     → description
- play_similar  → reference (title to match)
- pause         → (no fields)
- stop          → (no fields)
- seek          → seconds (absolute) OR delta (relative seconds, negative = rewind)
- speed         → speed (float, e.g. 0.5 / 1.0 / 2.0)
- volume_up     → delta (default 10)
- volume_down   → delta (default 10)
- volume_set    → level (0–100)
- mute          → (no fields)
- info          → (no fields)
- unknown       → raw

Examples:
"play Succession season 3 episode 5"  → {"intent":"play","target":"Succession","season":3,"episode":5}
"find something with Cate Blanchett"  → {"intent":"play_actor","actor":"Cate Blanchett"}
"something where a robot falls in love" → {"intent":"play_plot","description":"robot falls in love"}
"something like Parasite"             → {"intent":"play_similar","reference":"Parasite"}
"pause"                               → {"intent":"pause"}
"go back 30 seconds"                  → {"intent":"seek","delta":-30}
"skip ahead 2 minutes"                → {"intent":"seek","delta":120}
"set speed to 1.5"                    → {"intent":"speed","speed":1.5}
"volume up"                           → {"intent":"volume_up","delta":10}
"set volume to 40"                    → {"intent":"volume_set","level":40}
"mute"                                → {"intent":"mute"}`;

export async function parseIntent(
  transcript: string,
  apiKey: string,
  context?: PlayerContext
): Promise<Intent> {
  const contextNote = context?.currentItem
    ? `\n[Currently playing: ${context.currentItem.Name} (${context.currentItem.Type})]`
    : '';

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: transcript + contextNote }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 256 },
  };

  try {
    const resp = await fetch(`${INTENT_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error(`Gemini intent error ${resp.status}`);

    const data = await resp.json();
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned) as Intent;
    parsed.raw = transcript;
    return parsed;
  } catch {
    return { intent: 'unknown', raw: transcript };
  }
}
