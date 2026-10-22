<p align="center">
  <img src="docs/assets/workshop-preview.png" alt="ElderGPT Spirit Ring" width="480" />
</p>

<h1 align="center">ElderGPT Spirit Ring</h1>

<p align="center">
  <em>An AI-powered contextual advisor mod for <a href="https://store.steampowered.com/app/3992260">Ascend From Nine Mountains</a></em>
</p>

<p align="center">
  <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3701616500">
    <img src="https://img.shields.io/badge/Steam_Workshop-Subscribe-1b2838?logo=steam&logoColor=white" alt="Steam Workshop" />
  </a>
  <img src="https://img.shields.io/badge/AFNM-0.7.17-blue" alt="Game Version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

Want advice without tabbing out to a browser? ElderGPT Spirit Ring reads your live game state through the official modAPI, builds a compact context snapshot, and lets you chat with the AI model of your choice — right inside the game.

It is **read-only by design**: it does not automate combat, spend resources, or make choices for you.

**Release 0.11.0 targets AFNM 0.7.17.** See the
[release notes](docs/project/RELEASE_NOTES_0.11.0.md) for provider smoke results and known limits.

## Features

- 💬 **Persistent chat with sessions** — conversations are saved automatically. Switch between chats, start new ones, or pick up where you left off.
- 📚 **Consult the records** — tool-capable models can look up item, technique,
  buff, monster, recipe, and breakthrough details, and expand your full inventory.
  A compact expandable row shows what was consulted. Quest/location lookup paths
  are implemented but not verified in a running game.
- 📝 **Player notes** — keep global preferences across chats; edit/delete them in
  Settings, or explicitly ask the Elder to remember something (up to 30 notes,
  500 characters each).
- 🧠 **Focused game knowledge** — compact, verified crafting, combat, and cultivation guidance follows your current activity, including nine harmonies, unified health, and the new crafting cost stats.
- 🎯 **Live 0.7.17 context** — advice includes resolved harmony-augmented
  equipment, selected crafting harmony/state, crafting auto-use, research,
  Core Formation altar rewards, soul-shard delve progression, focused quests,
  translated event history, and a compact sect rank/slips/missions/services summary.
- 📊 **Smarter context and caching** — compacts long chats using reported usage
  when available. Stable prompts and Anthropic cache hints can make repeated
  replies cheaper/faster where your provider supports caching; savings vary.
- ⚡ **Reliable long replies** — live text, markdown, Stop, Retry, and timeouts
  that allow long answers while data keeps arriving. Transient failures and
  unsupported model parameters get bounded automatic retries/fallbacks.
- 🔔 **Proactive hints** — optional post-event suggestions after combat victories, travel, crafting completions, and time skips.
- 🏆 **Combat result shortcut** — a "Consult Spirit Ring" button opens the same chat from the result dialog via `modAPI.injectUI()`.
- 🎭 **Personas** — choose between the lore-flavored *Elder* voice, the analytical *Calculator*, or write your own *Custom* persona prompt.
- 🔌 **Bring your own model** — OpenAI-compatible or Anthropic endpoints,
  including compatible local servers. Tool support varies; ordinary chat can
  continue when a provider rejects lookups.
- 🎨 **Customizable UI** — adjust text size, window size, and drag the panel anywhere. Position persists across sessions.

## What You Can Ask

> *"What should I focus on next?"*
>
> *"How should I approach this fight?"*
>
> *"Is this a good time to travel?"*
>
> *"What am I missing in this crafting setup?"*
>
> *"Which stats or resources are holding me back?"*
>
> *"Explain how Inscribed Patterns harmony works."*
>
> *"What does Rot do, and do I have any pills that help?"*

## Installation (Players)

1. **Subscribe** on the [Steam Workshop page](https://steamcommunity.com/sharedfiles/filedetails/?id=3701616500).
2. Launch *Ascend From Nine Mountains* — the mod loads automatically.
3. Click the floating **Spirit Ring** button in-game.
4. Open **Settings** and enter your API URL, API key, and model ID.
5. Start chatting.

## AI Setup

ElderGPT Spirit Ring does **not** bundle an API key or a model. Bring an
endpoint you trust and the exact model ID exposed by that endpoint.

### Hosted providers

| Provider | API URL | Notes |
|----------|---------|-------|
| [OpenRouter](https://openrouter.ai/docs/quickstart) | `https://openrouter.ai/api/v1` | Many models through one OpenAI-compatible endpoint. |
| Anthropic | `https://api.anthropic.com` | Select Anthropic mode in the mod settings. |

### Local inference

Run your own OpenAI-compatible server with
[llama.cpp](https://github.com/ggml-org/llama.cpp) or
[KoboldCpp](https://github.com/LostRuins/koboldcpp).

If your local server exposes an OpenAI-compatible `/v1` endpoint, ElderGPT Spirit Ring can use it.

> **Tip:** Faster models usually feel better for moment-to-moment gameplay. The mod auto-detects your model's context window and output limits when possible, but you can override them in Settings.

### New settings and controls in 0.11.0

- **Let the Elder look things up in the game's records** defaults on. Use a
  tool-capable model, or disable it for local models that do not support tools.
- **Player notes** apply to every chat. Save only preferences you want sent to
  your configured endpoint; they are not a private notebook hidden from the AI.
- **Stop** keeps partial text; **Retry** re-sends a failed player turn without
  duplicating it. Stopped/failed replies are excluded from future AI history.
- **Response / Idle Timeout** is silence between incoming data for live replies,
  but total request time when live response is off. Thinking/keepalives count as
  data; increase the timeout for models that think silently.
- **Temperature** is optional; blank keeps the provider default (recommended
  for reasoning models). **Max Output** remains an optional override.

Provider plans, model availability, and limits change frequently. Check your
provider's current documentation instead of relying on a fixed recommendation.

### Privacy and data

- API settings, the API key, UI preferences, and chat sessions are stored in
  the game's local browser storage.
- Each chat request sends the conversation and a focused snapshot of relevant
  game state to your endpoint. Optional proactive hints also send automatic
  requests with current game context when enabled.
- Lookup-enabled replies can send additional game-record/inventory details in
  follow-up requests. Player notes are included in advisor prompts. Raw tool
  transcripts are not saved in chat sessions; lookup labels are.
- The mod author does not operate an intermediary service. Use only an endpoint
  you trust and a key you can revoke.

## Development

### Prerequisites

- [Bun](https://bun.sh) (package manager and script runner)
- [Node.js](https://nodejs.org/) ≥ 18 (webpack runtime)
- *Ascend From Nine Mountains* installed via Steam (for runtime inspection scripts)

### Setup

```bash
git clone https://github.com/lemon07r/ElderGPT-Spirit-Ring.git
cd ElderGPT-Spirit-Ring
bun install
```

### Common commands

| Command | Description |
|---------|-------------|
| `bun run build` | Production build → `builds/afnm-eldergpt-spirit-ring.zip` |
| `bun run test` | Run Jest tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:coverage` | Run tests with coverage report |
| `bun run release:validate` | Full pre-release check (test → build → oracle → docs) |
| `bun run docs:check` | Validate doc links, freshness, and authority |
| `bun run runtime:oracle` | Inspect installed game `app.asar` for API surface |
| `bun run runtime:grep -- "<pattern>"` | Grep the installed game runtime |
| `bun run workshop:preview` | Regenerate Steam Workshop preview image |
| `bun run workshop:upload -- --change-note "..."` | Upload to Steam Workshop |

### Project structure

```
src/
├── mod.ts                  # Mod entry point and metadata
├── ai/
│   ├── client.ts           # Multi-provider chat completions transport
│   ├── agent.ts            # Bounded Send/Retry lookup loop
│   ├── messages.ts         # Single API-message builder and metadata filter
│   ├── tools.ts            # Stable tool schemas and guarded dispatcher
│   ├── usage.ts            # Provider token/cache usage parsing
│   ├── compaction.ts       # Conversation compaction via anchored iterative summarization
│   ├── modelLimits.ts      # Model context/output limit detection and static fallback table
│   ├── tokenEstimator.ts   # Token count estimation heuristic
│   └── knowledge/          # Dynamic game knowledge injection
│       ├── index.ts        # State-aware knowledge selector with token budgeting
│       ├── gameOverview.ts # Always-included AFNM game overview
│       ├── combatKnowledge.ts    # Combat-state knowledge block
│       ├── craftingKnowledge.ts  # Crafting-state knowledge block
│       └── cultivationKnowledge.ts # General cultivation/progression knowledge
├── config/
│   └── settings.ts         # Persisted settings store (localStorage)
├── integration/
│   ├── gameState.ts        # Live game state bridge (modAPI → fallback)
│   ├── contextEngine.ts    # System prompt builder with formatted context and knowledge injection
│   ├── gameLookup.ts       # Read-only game-record and player-detail lookup adapter
│   ├── proactive.ts        # Proactive suggestion hooks (post-combat, travel, etc.)
│   ├── uiBridge.tsx        # modAPI.injectUI() entry points
│   └── index.ts            # Integration bootstrap
├── ui/
│   ├── index.tsx            # Overlay mount and React root
│   ├── ElderGPTApp.tsx      # Top-level app component
│   ├── chatSession.ts       # Conversation state store with session persistence
│   ├── chatTurn.ts          # Shared Send/Retry, compaction and title pipeline
│   ├── sessionManager.ts    # Session CRUD, auto-naming, and localStorage persistence
│   └── components/
│       ├── ChatPanel.tsx    # Main chat interface with session management
│       ├── SettingsPanel.tsx # Settings UI with model limit detection
│       ├── MarkdownText.tsx # Markdown renderer for assistant messages
│       ├── LoadingAnimation.tsx # Animated loading indicator
│       └── SpiritRingToggle.tsx # Floating toggle button
└── utils/                   # Generic helpers
```

### Architecture at a glance

```text
modAPI -> gameState -> contextEngine + knowledge + notes
                                   |
ChatPanel -> chatTurn -> messages builder -> agent -> client -> endpoint
                |                            |
                |                      tools -> gameLookup (read-only)
                |                            `-> requested memory notes
                `-> chatSession <-> sessionManager (local persistence)

proactive -> client (no tools); title/compaction -> client (no state or tools)
uiBridge -> modAPI.injectUI() -> persistent overlay
```

The mod follows a strict **modAPI-first** policy for AFNM `0.7.x`:

1. `window.modAPI.getGameStateSnapshot()` for read-only state
2. `window.modAPI.subscribe()` for reactive updates
3. `window.modAPI.injectUI()` for in-game UI injection
4. `window.gameStore` as a read-only fallback only
5. Fiber / DOM scraping only for verified API gaps

### Tech stack

- **TypeScript** (strict mode) + **React 19** (TSX)
- **MUI 7** (Material UI) for component library
- **Emotion** for CSS-in-JS styling
- **Redux Toolkit** for state management patterns
- **Webpack 5** for bundling (UMD output targeting the AFNM mod loader)
- **Jest** for testing
- **Bun** for package management and script execution

## Release

1. Bump version in `package.json` (single source of truth).
2. Run `bun run release:validate` to confirm tests, build, runtime oracle, and docs all pass.
3. Upload to Steam Workshop: `bun run workshop:upload -- --change-note "vX.Y.Z - ..."`.
   For 0.11.0, also pass `--sync-workshop-page` to publish the refreshed description after review.
4. Commit and push to `main`.
5. Tag with `vX.Y.Z` and push the tag — GitHub Actions builds and creates the release automatically.

See [docs/project/RELEASE_PROCESS.md](docs/project/RELEASE_PROCESS.md) for the full checklist.

## Documentation

Authoritative project docs live in `docs/project/`:

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](docs/project/ARCHITECTURE.md) | Runtime shape and modAPI adoption |
| [CONCEPT_PLAN.md](docs/project/CONCEPT_PLAN.md) | Product direction and anti-goals |
| [CONTEXT_ENGINE.md](docs/project/CONTEXT_ENGINE.md) | How game state is normalized and prompted |
| [AI_CLIENT.md](docs/project/AI_CLIENT.md) | Transport layer and model limit detection |
| [UI_ARCHITECTURE.md](docs/project/UI_ARCHITECTURE.md) | Overlay, session management, and component design |
| [LIVE_GAME_TESTING.md](docs/project/LIVE_GAME_TESTING.md) | How to test against the real game |
| [RELEASE_PROCESS.md](docs/project/RELEASE_PROCESS.md) | Version bumps, builds, and publishing |

## Good to Know

- This mod does **not** include an API key or a bundled model.
- Advice quality depends heavily on the model you choose.
- Long conversations are automatically summarized to stay within context limits.
- The mod auto-detects model context/output limits from Anthropic, LM Studio, and Ollama APIs, with a static fallback table for other providers.
- Proactive hints are optional and can be disabled in Settings.
- The mod is read-only — it never mutates game state, Redux store, or gameplay.
- Lookups improve access to records, not the model's judgment. It can still
  misunderstand data. Quest/location lookups and in-game translations were
  checked only with mocks; no live in-game test was run for 0.11.0.

## Feedback

If the advice feels wrong, confusing, or out of date, [leave a comment on the Workshop page](https://steamcommunity.com/sharedfiles/filedetails/?id=3701616500) with what was happening in-game and what the mod told you. That's the fastest way to improve it.

## My Other Mods

- [CraftBuddy](https://github.com/lemon07r/AFNM-CraftBuddy) — Live crafting optimizer overlay with AutoBuddy auto mode. ([Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3661729323))
- [Lucky All Around](https://github.com/lemon07r/LuckyAllAround) — Configurable pity-event luck weighting for Explore events. ([Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3694065051))

[View all my mods in my AFNM mod collection](https://steamcommunity.com/sharedfiles/filedetails/?id=3704747572)

## Make Your Own Mod

Want to build your own AFNM mod? Use the [AFNM Agent Mod Template](https://github.com/lemon07r/AfnmAgentModTemplate) — a ready-to-go scaffold with ModAPI reference docs, runtime validation scripts, Workshop packaging, and built-in support for AI coding agents.

## License

MIT
