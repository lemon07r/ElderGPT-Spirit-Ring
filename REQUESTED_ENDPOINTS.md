# Historical ModAPI Endpoint Requests for Contextual AI Assistants

This note predates the AFNM `0.6.49` modAPI expansion. Several requests below are now effectively covered by official APIs such as `getGameStateSnapshot()`, `subscribe()`, `injectUI()`, `onLocationEnter()`, `onAdvanceDay()`, `onAdvanceMonth()`, `onEventDropItem()`, and the existing completion hooks. Keep this file as historical context, not as the current implementation target.

To support advanced AI contextual assistants like ElderGPT, we require specific read-only access and event streams from the game engine. Our goal is to provide intelligent, contextual guidance to the player without resorting to brittle, unsafe workarounds like scraping React Fiber nodes or reading directly from the raw Redux store.

## 1. Contextual Read-Only Game State
*We need to know what the player is doing right now to inform the AI's system prompt.*

* **`modAPI.gameState.getPlayerState()`**: Returns a normalized, read-only object detailing the player's current stats (HP, max HP, Qi, max Qi), inventory, and active quest progress.
* **`modAPI.gameState.getCurrentLocation()`**: Returns the ID or name of the current region/node the player is in.
* **`modAPI.gameState.getCombatStatus()`**: Returns detailed combat context: `inCombat` boolean, current turn order, active buffs/debuffs on the player and enemies, and enemy stats.
* **`modAPI.gameState.getCraftingStatus()`**: Returns current crafting/forging progress, harmony states, and active techniques.

## 2. Real-Time Event Streams
*AI assistants must react dynamically to game events to provide proactive advice or celebratory remarks without constant, inefficient polling.*

* **`modAPI.hooks.onLogMessage(callback: (msg: string, type: 'combat'|'system'|'dialogue') => void)`**: Broadcasts a message whenever text is added to the combat or system log, allowing the AI to "read" the flow of battle.
* **`modAPI.hooks.onCombatTurnStart(callback: (turnData: CombatTurnData) => void)`**: Triggered at the beginning of each combat turn, providing a safe hook to offer tactical advice.
* **`modAPI.hooks.onLocationChanged(callback: (newLocationId: string) => void)`**: Fired when the player enters a new area, allowing the AI to change context.
* **`modAPI.hooks.onItemLooted(callback: (items: LootItem[]) => void)`**: Fired when items drop, allowing the AI to explain their lore or usage.

## 3. Safe Action Dispatchers (Optional Macro Execution)
*If the AI assistant suggests an action, allowing the player to execute it with a single click enhances the UX.*

* **`modAPI.actions.executeCombatTechnique(techniqueId: string, targetId: string)`**: Safely dispatch a combat move.
* **`modAPI.actions.consumeItem(itemId: string)`**: Safely use a consumable.

## 4. Native UI Injection (For deeper integration)
*While floating React components (like ElderGPT's current implementation) work, native injection is cleaner.*

* **`modAPI.ui.registerSidebarPanel(component: React.ReactNode, title: string, icon: string)`**: Allows mods to add a dedicated tab to the game's native sidebar menu.
* **`modAPI.actions.appendGameLog(message: string, style?: string)`**: Allows the AI to print lore or advice directly into the game's internal combat/system text log.
