# jellyfin-voice-search

A Jellyfin server plugin that adds voice search and playback control to Jellyfin Web —
the browser-native equivalent of [kodi-voice-search](../kodi-voice-search).

## Requirements

| Requirement | Notes |
|---|---|
| Jellyfin Server ≥ 10.10 | .NET 8 build |
| **HTTPS or local override** | Browsers block microphone access on plain HTTP. Either serve Jellyfin over HTTPS (recommended — use nginx/Caddy with a TLS cert) or, for local testing only, whitelist the HTTP origin in Chrome: open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add your Jellyfin URL (e.g. `http://192.168.1.x:8096`), and restart Chrome. |
| Gemini API key (optional) | Strongly recommended. Without it, only basic title-exact search works via Chrome/Edge Web Speech API. With it: full intent parsing, Gemini-powered semantic search, and STT in all browsers. Get a free key at [aistudio.google.com](https://aistudio.google.com). |

## How it works

```
Jellyfin Server startup
  └─ StartupService (IScheduledTask, TriggerStartup)
       └─ Patches IApplicationPaths.WebPath/index.html directly (idempotent)
            └─ Injects: <script defer src="/VoiceSearch/Script"></script>

Browser loads Jellyfin Web
  └─ Fetches /VoiceSearch/Script  → voiceSearch.js (embedded in DLL)
       └─ Fetches /VoiceSearch/Config → Gemini key + thresholds (from admin config)
            └─ Injects mic button into toolbar
                 └─ Keyboard: ` (backtick) or Ctrl+Shift+V
```

### Voice pipeline

```
Key press / mic button click
         ↓
VoiceCapture
  Chrome/Edge → Web Speech API (no API key needed; falls back to Gemini STT on network error)
  Firefox/Safari → MediaRecorder + AudioContext VAD → Gemini STT
         ↓
parseIntent()  → Gemini Flash REST → structured JSON
  { intent: "play", target: "Chainsaw Man", season: null, episode: null }
         ↓
VoiceOrchestrator._dispatch()
  ├─ search: Jellyfin /Users/{id}/Items API
  │          → Gemini Flash re-ranks candidates (results cached in localStorage)
  │          → navigate to item detail page + click .btnPlay
  └─ control: Jellyfin Sessions API (pause/stop/seek/volume/mute)
```

### Confidence tiers

| Score | Behaviour |
|---|---|
| ≥ 85 % | Auto-play the top result |
| 60–85 % | Show "Did you mean?" dialog |
| < 60 % | Toast "no confident match" |

Scores come from Gemini Flash's semantic ranking (0.0–1.0). Without a key, a token-overlap
fallback is used (prefix matches score 1.0, Jaccard elsewhere).

## Supported voice commands

| Example | Intent |
|---|---|
| *"play Chainsaw Man"* | `play` |
| *"can you please play Succession season 3 episode 5"* | `play` |
| *"find something with Cate Blanchett"* | `play_actor` |
| *"something where a robot falls in love"* | `play_plot` |
| *"something like Parasite"* | `play_similar` |
| *"pause"* | `pause` |
| *"stop"* | `stop` |
| *"go back 30 seconds"* | `seek` |
| *"skip ahead 2 minutes"* | `seek` |
| *"set speed to 1.5"* | `speed` |
| *"volume up"* / *"set volume to 40"* | `volume_up` / `volume_set` |
| *"mute"* | `mute` |

Conversational phrasing works ("can you please play…", "hey put on…") — Gemini handles
natural language intent extraction.

## Building

**Prerequisites:** Node.js 18+, .NET 8 SDK

```bash
# 1. Install JS dependencies
npm install

# 2. Compile TypeScript → Jellyfin.Plugin.VoiceSearch/Inject/voiceSearch.js
npm run build

# 3. Build the C# plugin (embeds voiceSearch.js into the DLL)
dotnet build Jellyfin.Plugin.VoiceSearch/Jellyfin.Plugin.VoiceSearch.csproj

# One-shot production build (minified JS + Release DLL):
npm run dist
```

The NuGet packages come from the Jellyfin feed (`nuget.config` is included).

## Installation

### Via Jellyfin plugin repository (recommended)

1. In Jellyfin, go to **Dashboard → Plugins → Repositories** and add:
   ```
   https://raw.githubusercontent.com/0xrushi/jellyfin-voice-search/main/manifest.json
   ```
2. Go to **Catalog**, find **Voice Search**, and click Install
3. Restart Jellyfin — the plugin patches `index.html` automatically on startup
4. Go to **Dashboard → Plugins → Voice Search** and paste your Gemini API key

### Manual installation

1. Build (see above) or download a release `.zip` from the [Releases](https://github.com/0xrushi/jellyfin-voice-search/releases) page
2. Extract and copy `Jellyfin.Plugin.VoiceSearch.dll` and `meta.json` into your Jellyfin plugins directory:
   - **Linux/Docker:** `/config/plugins/VoiceSearch_1.0.0.0/`
   - **Windows:** `%PROGRAMDATA%\Jellyfin\Server\plugins\VoiceSearch_1.0.0.0\`
3. Restart Jellyfin — the plugin patches `index.html` automatically on startup
4. Go to **Dashboard → Plugins → Voice Search** and paste your Gemini API key

## Troubleshooting

### Script not injected / mic button missing

**1. Check injection status**

Open in your browser:
```
http://<jellyfin-host>/VoiceSearch/Status
```
This returns:
```json
{
  "webPath": "/jellyfin/jellyfin-web",
  "indexPath": "/jellyfin/jellyfin-web/index.html",
  "indexHtmlExists": true,
  "scriptInjected": false
}
```
If `indexHtmlExists` is `false`, Jellyfin is serving its web client from an unexpected path — open a GitHub issue with the `webPath` value.

**2. Run the startup task manually**

If `scriptInjected` is `false`: go to **Dashboard → Scheduled Tasks → Voice Search Startup** and click the play button. Refresh the Status endpoint to confirm it flips to `true`, then hard-refresh Jellyfin (Ctrl+Shift+R).

### Microphone access denied

Browsers block microphone access on plain HTTP. Two options:

- **HTTPS (recommended):** Put Jellyfin behind a reverse proxy (nginx/Caddy) with a TLS certificate.
- **Local testing only:** Open `chrome://flags/#unsafely-treat-insecure-origin-as-secure` in Chrome, add your Jellyfin URL (e.g. `http://192.168.1.x:8096`), enable, restart Chrome.

## Configuration

| Setting | Default | Description |
|---|---|---|
| Gemini API key | _(empty)_ | Used for intent parsing, semantic search ranking, and STT in non-Chrome browsers |
| Auto-play threshold | 85 % | Confidence above which the top result plays automatically |
| Suggest threshold | 60 % | Confidence above which a "Did you mean?" dialog appears |

Per-browser overrides via the browser console:
```js
window.jellyfinVoiceSearch.configure({ geminiApiKey: 'AIza...', autoPlayThreshold: 75 });
window.jellyfinVoiceSearch.getConfig();   // inspect current config
window.jellyfinVoiceSearch.activate();    // trigger voice input programmatically
window.jellyfinVoiceSearch.textSearch();  // trigger text input fallback
```

## Project structure

```
jellyfin-voice-search/
├── src/                                    TypeScript source
│   ├── types.ts                            Intent, JellyfinItem, VoiceConfig types
│   ├── config.ts                           Loads config (server API → localStorage)
│   ├── voice.ts                            Web Speech API + MediaRecorder + VAD
│   ├── stt.ts                              Gemini REST speech-to-text
│   ├── intent.ts                           Gemini Flash REST intent parser
│   ├── embed.ts                            Gemini Flash candidate re-ranker + localStorage cache
│   ├── search.ts                           Jellyfin Items API + Gemini semantic ranking
│   ├── playback.ts                         Navigate to item page + click play button
│   ├── ui.ts                               Mic button, overlay, toasts, results dialog
│   ├── orchestrator.ts                     Main pipeline
│   └── index.ts                            Entry point, keyboard shortcuts, jQuery stub
│
├── Jellyfin.Plugin.VoiceSearch/            C# .NET 8 plugin
│   ├── VoiceSearchPlugin.cs                BasePlugin, IHasWebPages
│   ├── Services/StartupService.cs          IScheduledTask → registers FileTransformation
│   ├── Helpers/TransformationPatches.cs    index.html callback (injects <script>)
│   ├── Controller/VoiceSearchController.cs GET /VoiceSearch/Script + GET|POST /VoiceSearch/Config
│   ├── Configuration/PluginConfiguration.cs Server-side config model
│   ├── Configuration/config.html           Admin dashboard UI
│   ├── Model/PatchRequestPayload.cs        FileTransformation callback contract
│   └── Inject/voiceSearch.js               ← webpack output, embedded as resource
│
├── meta.json                               Plugin manifest (required alongside DLL)
├── webpack.config.js                       Outputs to Inject/ for embedding
├── tsconfig.json
├── package.json
└── nuget.config                            Adds Jellyfin NuGet feed
```

## Architecture notes

### Search ranking
Jellyfin's built-in search (`/Users/{id}/Items?searchTerm=…`) does the initial candidate
retrieval (up to 30 results). A single Gemini Flash call then scores each candidate 0–1
against the spoken query. Scores are cached in `localStorage` keyed by
`query|candidate1|candidate2|…`, so the same query is instant on the second invocation.

Without a Gemini key, a local fallback scores by token overlap (Jaccard) with a prefix-match
boost (exact prefix → 1.0), which handles simple cases like "chainsaw man" → "Chainsaw Man - The Movie: Reze Arc".

### Config page script execution
Jellyfin 10.10 dropped jQuery as a global, which broke inline `<script>` execution in plugin
config pages (`viewContainer.js` only runs scripts when `window.$` is truthy). `index.ts`
installs a minimal `window.$` stub with an `appendTo` implementation that re-executes script
tags, restoring the standard Jellyfin plugin config page behaviour.

### Playback
`window.playbackManager` is an ES module export — it is never attached to `window`. Playback
is triggered by navigating to the item's detail page and programmatically clicking
`.btnPlay:not(.hide)` (old UI) or `.btnPlayOrResume:not(.hide)` (experimental React UI) once
it appears in the DOM.
