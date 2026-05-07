# jellyfin-voice-search

A Jellyfin server plugin that adds voice search and playback control to Jellyfin Web —
the browser-native equivalent of [kodi-voice-search](../kodi-voice-search).

## Requirements

| Requirement | Notes |
|---|---|
| Jellyfin Server ≥ 10.10 | .NET 8 build |
| **File Transformation plugin** | Required — installs from the Jellyfin plugin catalogue |
| Gemini API key (optional) | Only needed in Firefox/Safari. Chrome/Edge use the built-in Web Speech API for free. |

## How it works

```
Jellyfin Server startup
  └─ StartupService (IScheduledTask, TriggerStartup)
       └─ Registers index.html transformation via File Transformation plugin (reflection)
            └─ TransformationPatches.IndexHtml() injects:
                 <script defer src="/VoiceSearch/Script"></script>

Browser loads Jellyfin Web
  └─ Fetches /VoiceSearch/Script  → voiceSearch.js (embedded in DLL)
       └─ Fetches /VoiceSearch/Config → Gemini key + thresholds (from admin config)
            └─ Injects mic button into toolbar
                 └─ Keyboard: ` (backtick) or Ctrl+Shift+V
```

### Voice pipeline (mirrors kodi-voice-search)

```
Key press / mic button click
         ↓
VoiceCapture
  Chrome/Edge → Web Speech API (no API key needed)
  Firefox/Safari → MediaRecorder + AudioContext VAD → Gemini STT
         ↓
parseIntent()  → Gemini REST → structured JSON
  { intent: "play", target: "Breaking Bad", season: 2, episode: 5 }
         ↓
VoiceOrchestrator._dispatch()
  ├─ search: Jellyfin /Users/{id}/Items API + token-similarity scoring
  └─ control: window.playbackManager / Jellyfin Sessions API
```

### Confidence tiers

| Score | Behaviour |
|---|---|
| ≥ 85 % | Auto-play the top result |
| 60–85 % | Show "Did you mean?" dialog |
| < 60 % | Toast "no confident match" |

## Supported voice commands

| Example | Intent |
|---|---|
| *"play Succession season 3 episode 5"* | `play` |
| *"find something with Cate Blanchett"* | `play_actor` |
| *"something where a robot falls in love"* | `play_plot` |
| *"something like Parasite"* | `play_similar` |
| *"pause"* | `pause` |
| *"go back 30 seconds"* | `seek` |
| *"skip ahead 2 minutes"* | `seek` |
| *"set speed to 1.5"* | `speed` |
| *"volume up"* / *"set volume to 40"* | `volume_up` / `volume_set` |
| *"mute"* | `mute` |

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

1. Build (see above) or download a release `.dll`
2. Copy `Jellyfin.Plugin.VoiceSearch.dll` into your Jellyfin plugins directory:
   - **Linux/Docker:** `/var/lib/jellyfin/plugins/VoiceSearch_1.0.0.0/`
   - **Windows:** `%PROGRAMDATA%\Jellyfin\Server\plugins\VoiceSearch_1.0.0.0\`
3. Also install the **File Transformation** plugin from the Jellyfin plugin catalogue
4. Restart Jellyfin
5. (Optional) Go to **Dashboard → Plugins → Voice Search** and paste your Gemini API key

## Configuration

| Setting | Default | Description |
|---|---|---|
| Gemini API key | _(empty)_ | Used for intent parsing + STT in non-Chrome browsers |
| Auto-play threshold | 85 % | Confidence above which the top result plays automatically |
| Suggest threshold | 60 % | Confidence above which a "Did you mean?" dialog appears |

Per-browser overrides (for testing) via the browser console:
```js
window.jellyfinVoiceSearch.configure({ geminiApiKey: 'AIza...', autoPlayThreshold: 75 });
window.jellyfinVoiceSearch.getConfig();   // inspect current config
window.jellyfinVoiceSearch.activate();    // trigger voice input programmatically
```

## Project structure

```
jellyfin-voice-search/
├── src/                                    TypeScript source
│   ├── types.ts                            Intent, JellyfinItem, VoiceConfig types
│   ├── config.ts                           Loads config (server API → localStorage)
│   ├── voice.ts                            Web Speech API + MediaRecorder + VAD
│   ├── stt.ts                              Gemini REST speech-to-text
│   ├── intent.ts                           Gemini REST intent parser
│   ├── search.ts                           Jellyfin Items API + token-similarity
│   ├── playback.ts                         playbackManager / Sessions API
│   ├── ui.ts                               Mic button, overlay, toasts, results dialog
│   ├── orchestrator.ts                     Main pipeline
│   └── index.ts                            Entry point + keyboard shortcuts
│
├── Jellyfin.Plugin.VoiceSearch/            C# .NET 8 plugin
│   ├── VoiceSearchPlugin.cs                BasePlugin, IHasWebPages
│   ├── Services/StartupService.cs          IScheduledTask → registers FileTransformation
│   ├── Helpers/TransformationPatches.cs    index.html callback (injects <script>)
│   ├── Controller/VoiceSearchController.cs GET /VoiceSearch/Script + /VoiceSearch/Config
│   ├── Configuration/PluginConfiguration.cs Server-side config model
│   ├── Configuration/config.html           Admin dashboard UI
│   ├── Model/PatchRequestPayload.cs        FileTransformation callback contract
│   └── Inject/voiceSearch.js               ← webpack output, embedded as resource
│
├── webpack.config.js                       Outputs to Inject/ for embedding
├── tsconfig.json
├── package.json
└── nuget.config                            Adds Jellyfin NuGet feed
```
