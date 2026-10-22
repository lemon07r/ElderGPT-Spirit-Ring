import type { CraftingResult, EnemyEntity, Item } from 'afnm-types';
import { AIClient } from '../ai/client';
import { selectKnowledge } from '../ai/knowledge';
import { readSettingsSnapshot, subscribeToSettings } from '../config/settings';
import { appendAssistantMessage, readChatSessionSnapshot } from '../ui/chatSession';
import { extractContext, formatGameState, getSystemPrompt } from './contextEngine';
import { readGameStateSnapshot } from './gameState';

type ProactiveTrigger =
  | {
      kind: 'location-enter';
      locationId: string;
    }
  | {
      kind: 'advance-day';
      days: number;
    }
  | {
      kind: 'advance-month';
      month: number;
      year: number;
    }
  | {
      kind: 'complete-combat';
      enemyNames: string[];
      droppedItems: string[];
    }
  | {
      kind: 'complete-crafting';
      itemName: string;
    }
  | {
      kind: 'loot-drop';
      itemNames: string[];
    }
  | {
      kind: 'before-combat';
      enemyNames: string[];
    };

const MOD_TAG = '[ElderGPT]';
interface QueueEntry {
  trigger: ProactiveTrigger;
  sessionId: string;
}

const MIN_PROACTIVE_INTERVAL_MS = 45_000;
const queue: QueueEntry[] = [];

let hooksRegistered = false;
let lifecycleStarted = false;
let unsubscribeSettings: (() => void) | undefined;
let isProcessing = false;
let lastProactiveAt = 0;

function rememberUnsubscribe(unsubscribe: unknown) {
  if (typeof unsubscribe === 'function') {
    window.__elderGptHookUnsubscribers ??= [];
    window.__elderGptHookUnsubscribers.push(unsubscribe as () => void);
  }
}

export function unregisterProactiveHooks() {
  if (typeof window === 'undefined') {
    hooksRegistered = false;
    queue.length = 0;
    return;
  }

  const unsubscribers = window.__elderGptHookUnsubscribers ?? [];
  window.__elderGptHookUnsubscribers = [];
  hooksRegistered = false;
  queue.length = 0;

  for (const unsubscribe of unsubscribers) {
    try {
      unsubscribe();
    } catch (error) {
      console.warn(`${MOD_TAG} Failed to unregister proactive hook.`, error);
    }
  }
}

function hasProactiveConfig() {
  const settings = readSettingsSnapshot();
  return Boolean(settings.proactiveEnabled && settings.apiUrl.trim() && settings.modelId.trim());
}

function hasUsableHookApi() {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean(window.modAPI?.hooks);
}

function describeTrigger(trigger: ProactiveTrigger): string {
  switch (trigger.kind) {
    case 'location-enter':
      return `The player just entered ${trigger.locationId}. Offer one concise location-aware suggestion.`;
    case 'advance-day':
      return `The player advanced ${trigger.days} day(s). Offer one concise reminder only if time passage matters right now.`;
    case 'advance-month':
      return `The calendar advanced to month ${trigger.month}, year ${trigger.year}. Offer one concise seasonal or long-horizon reminder if useful.`;
    case 'complete-combat': {
      const enemies = trigger.enemyNames.length > 0 ? trigger.enemyNames.join(', ') : 'unknown enemies';
      const drops =
        trigger.droppedItems.length > 0
          ? ` Drops: ${trigger.droppedItems.join(', ')}.`
          : '';
      return `The player just won combat against ${enemies}.${drops} Offer one concise post-combat takeaway.`;
    }
    case 'complete-crafting':
      return `The player just finished crafting ${trigger.itemName}. Offer one concise follow-up suggestion about use, next steps, or progression.`;
    case 'loot-drop': {
      const items = trigger.itemNames.join(', ');
      return `The player just received loot: ${items}. Briefly explain what the most notable item does or how it could be useful.`;
    }
    case 'before-combat': {
      const foes = trigger.enemyNames.join(', ');
      return `The player is about to fight ${foes}. Offer one concise piece of tactical advice (weaknesses, recommended stances, or items to use).`;
    }
  }
}

async function waitForCooldown() {
  const delay = lastProactiveAt + MIN_PROACTIVE_INTERVAL_MS - Date.now();
  if (delay > 0) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
  }
}

async function processQueue() {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    while (queue.length > 0) {
      if (!hasProactiveConfig()) {
        queue.length = 0;
        break;
      }

      await waitForCooldown();

      const entry = queue.shift();
      if (!entry) {
        continue;
      }

      // Skip if the user switched sessions since the trigger was enqueued
      if (readChatSessionSnapshot().sessionId !== entry.sessionId) {
        continue;
      }

      const settings = readSettingsSnapshot();
      const context = extractContext(readGameStateSnapshot());
      const knowledgeBlock = selectKnowledge(context, 2000);
      const client = new AIClient({
        url: settings.apiUrl,
        apiKey: settings.apiKey,
        modelId: settings.modelId,
        provider: settings.provider,
        timeoutMs: settings.requestTimeoutSeconds * 1000,
        maxOutputTokens: settings.outputLimitTokens ?? undefined,
        temperature: settings.temperature,
      });
      const response = await client.chat([
        {
          role: 'system',
          content: getSystemPrompt(settings.persona, settings.customPrompt, knowledgeBlock, settings.memoryNotes),
        },
        {
          role: 'user',
          content: `${describeTrigger(entry.trigger)} Keep it to at most two short sentences. If there is no materially useful advice, reply with exactly "SKIP". Do not mention hooks, APIs, or system internals.`,
        },
      ], { gameState: formatGameState(context) });

      if (response.text === 'SKIP' || response.stopped) {
        continue;
      }

      // Final check: still on the same session before appending
      if (readChatSessionSnapshot().sessionId !== entry.sessionId || readChatSessionSnapshot().isLoading) {
        continue;
      }

      appendAssistantMessage(response.text, { error: response.error });
      lastProactiveAt = Date.now();
    }
  } catch (error) {
    console.warn(`${MOD_TAG} Proactive hook processing failed.`, error);
  } finally {
    isProcessing = false;
  }
}

function enqueue(trigger: ProactiveTrigger) {
  if (!hasProactiveConfig()) {
    return;
  }

  queue.push({ trigger, sessionId: readChatSessionSnapshot().sessionId });
  void processQueue();
}

function getEnemyNames(enemies: EnemyEntity[] | undefined): string[] {
  return (enemies ?? []).map((enemy) => enemy?.name).filter(Boolean) as string[];
}

function getDroppedItemNames(droppedItems: Item[] | undefined): string[] {
  return (droppedItems ?? []).map((item) => item?.name).filter(Boolean).slice(0, 4) as string[];
}

// The game runs onComplete* hooks without a per-hook try/catch: a hook that
// throws aborts the event advance before state commits, which makes combat
// repeat endlessly. Every hook body must therefore be guarded so it can
// never throw into the game.
function guarded<Args extends unknown[], R>(fallback: R, fn: (...args: Args) => R): (...args: Args) => R {
  return (...args: Args) => {
    try {
      return fn(...args);
    } catch (error) {
      console.warn(`${MOD_TAG} Hook callback failed; continuing without proactive trigger.`, error);
      return fallback;
    }
  };
}

function getCraftedItemName(item: CraftingResult | undefined): string | null {
  if (!item || item.state === 'failed') {
    return null;
  }

  return item.item.name;
}

function registerActiveProactiveHooks() {
  const hooks = window.modAPI?.hooks;
  if (hooksRegistered || !hooks) {
    return;
  }

  unregisterProactiveHooks();
  hooksRegistered = true;

  rememberUnsubscribe(hooks.onLocationEnter(guarded(undefined, (locationId) => {
    enqueue({
      kind: 'location-enter',
      locationId,
    });
  })));

  rememberUnsubscribe(hooks.onAdvanceDay(guarded(undefined, (days) => {
    if (days >= 7) {
      enqueue({
        kind: 'advance-day',
        days,
      });
    }
  })));

  rememberUnsubscribe(hooks.onAdvanceMonth(guarded(undefined, (month, year) => {
    enqueue({
      kind: 'advance-month',
      month,
      year,
    });
  })));

  rememberUnsubscribe(hooks.onCompleteCombat(guarded([], (_step, victory, _playerState, enemies, droppedItems) => {
    if (victory) {
      enqueue({
        kind: 'complete-combat',
        enemyNames: getEnemyNames(enemies),
        droppedItems: getDroppedItemNames(droppedItems),
      });
    }

    return [];
  })));

  rememberUnsubscribe(hooks.onCompleteCrafting(guarded([], (_step, item) => {
    const itemName = getCraftedItemName(item);
    if (itemName) {
      enqueue({
        kind: 'complete-crafting',
        itemName,
      });
    }

    return [];
  })));

  // AFNM 0.7 lifecycle hooks -----------------------------------------

  rememberUnsubscribe(hooks.onLootDrop(guarded(undefined, (items) => {
    const names = (items ?? []).map((i) => i?.name).filter(Boolean).slice(0, 5);
    if (names.length > 0) {
      enqueue({
        kind: 'loot-drop',
        itemNames: names as string[],
      });
    }
  })));

  rememberUnsubscribe(hooks.onBeforeCombat((enemies, playerState, _flags) => {
    try {
      enqueue({
        kind: 'before-combat',
        enemyNames: getEnemyNames(enemies),
      });
    } catch (error) {
      console.warn(`${MOD_TAG} Hook callback failed; continuing without proactive trigger.`, error);
    }

    // Read-only advisor: return inputs unchanged.
    return { enemies, playerState };
  }));
}

export function syncProactiveHooks() {
  if (hasProactiveConfig() && hasUsableHookApi()) {
    registerActiveProactiveHooks();
  } else {
    unregisterProactiveHooks();
  }
}

export function registerProactiveHooks() {
  if (!lifecycleStarted) {
    unsubscribeSettings = subscribeToSettings(syncProactiveHooks);
    lifecycleStarted = true;
  }

  syncProactiveHooks();
}

export const __testing = {
  get hooksRegistered() {
    return hooksRegistered;
  },
  get lifecycleStarted() {
    return lifecycleStarted;
  },
  reset() {
    unsubscribeSettings?.();
    unsubscribeSettings = undefined;
    lifecycleStarted = false;
    unregisterProactiveHooks();
    isProcessing = false;
    lastProactiveAt = 0;
  },
  syncProactiveHooks,
};
