import { DEFAULT_SETTINGS, updateSettings } from "../config/settings";
import {
  __testing as proactiveTesting,
  registerProactiveHooks,
  unregisterProactiveHooks,
} from "./proactive";

type HookName =
  | "onLocationEnter"
  | "onAdvanceDay"
  | "onAdvanceMonth"
  | "onCompleteCombat"
  | "onCompleteCrafting"
  | "onLootDrop"
  | "onBeforeCombat";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
    }),
  };
}

function createHookApi() {
  const callbacks: Partial<Record<HookName, (...args: any[]) => any>> = {};
  const unsubscribers: jest.Mock[] = [];

  const makeHook = (name: HookName) =>
    jest.fn((callback: (...args: any[]) => any) => {
      callbacks[name] = callback;
      const unsubscribe = jest.fn();
      unsubscribers.push(unsubscribe);
      return unsubscribe;
    });

  const hooks = {
    onLocationEnter: makeHook("onLocationEnter"),
    onAdvanceDay: makeHook("onAdvanceDay"),
    onAdvanceMonth: makeHook("onAdvanceMonth"),
    onCompleteCombat: makeHook("onCompleteCombat"),
    onCompleteCrafting: makeHook("onCompleteCrafting"),
    onLootDrop: makeHook("onLootDrop"),
    onBeforeCombat: makeHook("onBeforeCombat"),
  };

  return { hooks, callbacks, unsubscribers };
}

function installWindowWithHooks() {
  const hookApi = createHookApi();
  (global as any).window = {
    localStorage: createLocalStorageMock(),
    modAPI: {
      hooks: hookApi.hooks,
    },
  };
  return hookApi;
}

describe("proactive hook lifecycle", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    proactiveTesting.reset();
    installWindowWithHooks();
    updateSettings(() => DEFAULT_SETTINGS);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "SKIP" } }],
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    unregisterProactiveHooks();
    proactiveTesting.reset();
    delete (global as any).window;
    jest.restoreAllMocks();
  });

  it("does not register ModAPI hooks while proactive hints are disabled by default", () => {
    const hookApi = installWindowWithHooks();
    updateSettings(() => DEFAULT_SETTINGS);

    registerProactiveHooks();

    expect(proactiveTesting.lifecycleStarted).toBe(true);
    expect(proactiveTesting.hooksRegistered).toBe(false);
    for (const hook of Object.values(hookApi.hooks)) {
      expect(hook).not.toHaveBeenCalled();
    }
  });

  it("registers and unregisters hooks when settings become valid or disabled", () => {
    const hookApi = installWindowWithHooks();
    registerProactiveHooks();

    updateSettings({
      proactiveEnabled: true,
      apiUrl: "http://localhost:1234/v1",
      modelId: "local-model",
    });

    expect(proactiveTesting.hooksRegistered).toBe(true);
    for (const hook of Object.values(hookApi.hooks)) {
      expect(hook).toHaveBeenCalledTimes(1);
    }

    updateSettings({ proactiveEnabled: false });

    expect(proactiveTesting.hooksRegistered).toBe(false);
    expect(hookApi.unsubscribers).toHaveLength(7);
    for (const unsubscribe of hookApi.unsubscribers) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });

  it("prevents duplicate registration on repeated lifecycle starts", () => {
    const hookApi = installWindowWithHooks();
    updateSettings({
      proactiveEnabled: true,
      apiUrl: "http://localhost:1234/v1",
      modelId: "local-model",
    });

    registerProactiveHooks();
    registerProactiveHooks();

    expect(proactiveTesting.lifecycleStarted).toBe(true);
    expect(proactiveTesting.hooksRegistered).toBe(true);
    for (const hook of Object.values(hookApi.hooks)) {
      expect(hook).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps combat hook callbacks read-only and contract-preserving", () => {
    const hookApi = installWindowWithHooks();
    updateSettings({
      proactiveEnabled: true,
      apiUrl: "http://localhost:1234/v1",
      modelId: "local-model",
    });
    registerProactiveHooks();

    const enemies = [{ name: "Bandit" }];
    const playerState = { hp: 42 };
    const beforeResult = hookApi.callbacks.onBeforeCombat!(
      enemies,
      playerState,
      { source: "test" },
    );
    const completeResult = hookApi.callbacks.onCompleteCombat!(
      { id: "step" },
      true,
      playerState,
      enemies,
      [{ name: "Spirit Stone" }],
    );

    expect(beforeResult).toEqual({ enemies, playerState });
    expect(beforeResult.enemies).toBe(enemies);
    expect(beforeResult.playerState).toBe(playerState);
    expect(completeResult).toEqual([]);
    expect(enemies).toEqual([{ name: "Bandit" }]);
  });

  it("never throws into the game even with malformed hook arguments", () => {
    // A throwing onComplete* hook aborts the game's event advance and makes
    // combat repeat endlessly, so callbacks must swallow all errors.
    const hookApi = installWindowWithHooks();
    updateSettings({
      proactiveEnabled: true,
      apiUrl: "http://localhost:1234/v1",
      modelId: "local-model",
    });
    registerProactiveHooks();
    jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      hookApi.callbacks.onCompleteCombat!({ id: "step" }, true, undefined, undefined, undefined),
    ).toEqual([]);
    expect(
      hookApi.callbacks.onCompleteCombat!({ id: "step" }, true, null, [null], [null]),
    ).toEqual([]);
    expect(
      hookApi.callbacks.onCompleteCrafting!({ id: "step" }, { state: "perfect" }),
    ).toEqual([]);
    expect(hookApi.callbacks.onBeforeCombat!(undefined, undefined, undefined)).toEqual({
      enemies: undefined,
      playerState: undefined,
    });
    expect(() => hookApi.callbacks.onLootDrop!(undefined)).not.toThrow();
    expect(() => hookApi.callbacks.onLootDrop!([null])).not.toThrow();
    expect(() => hookApi.callbacks.onLocationEnter!(undefined)).not.toThrow();
    expect(() => hookApi.callbacks.onAdvanceDay!(undefined)).not.toThrow();
    expect(() => hookApi.callbacks.onAdvanceMonth!(undefined, undefined)).not.toThrow();
  });

  it("keeps crafting completion callbacks read-only", () => {
    const hookApi = installWindowWithHooks();
    updateSettings({
      proactiveEnabled: true,
      apiUrl: "http://localhost:1234/v1",
      modelId: "local-model",
    });
    registerProactiveHooks();

    const item = {
      state: "perfect",
      item: { name: "Cloudsteel Ring" },
    };
    const result = hookApi.callbacks.onCompleteCrafting!({ id: "step" }, item);

    expect(result).toEqual([]);
    expect(item).toEqual({
      state: "perfect",
      item: { name: "Cloudsteel Ring" },
    });
  });
});
