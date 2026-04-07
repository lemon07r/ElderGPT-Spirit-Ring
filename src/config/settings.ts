export type Persona = 'Elder' | 'Calculator' | 'Custom';

export interface ChatSettings {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  persona: Persona;
  customPrompt: string;
  proactiveEnabled: boolean;
}

export const SETTINGS_STORAGE_KEY = 'eldergpt_settings';

export const DEFAULT_SETTINGS: ChatSettings = {
  apiUrl: 'http://localhost:1234/v1/chat/completions',
  apiKey: '',
  modelId: 'kimi-k2.5',
  persona: 'Elder',
  customPrompt: '',
  proactiveEnabled: false,
};

const MOD_TAG = '[ElderGPT]';
const listeners = new Set<() => void>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizePersona(value: unknown): Persona {
  return value === 'Calculator' || value === 'Custom' ? value : 'Elder';
}

function normalizeSettings(value: unknown): ChatSettings {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS;
  }

  return {
    apiUrl: typeof value.apiUrl === 'string' ? value.apiUrl : DEFAULT_SETTINGS.apiUrl,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : DEFAULT_SETTINGS.apiKey,
    modelId: typeof value.modelId === 'string' ? value.modelId : DEFAULT_SETTINGS.modelId,
    persona: normalizePersona(value.persona),
    customPrompt: typeof value.customPrompt === 'string' ? value.customPrompt : DEFAULT_SETTINGS.customPrompt,
    proactiveEnabled:
      typeof value.proactiveEnabled === 'boolean'
        ? value.proactiveEnabled
        : DEFAULT_SETTINGS.proactiveEnabled,
  };
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadSettings(): ChatSettings {
  if (!canUseLocalStorage()) {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }

    return normalizeSettings(JSON.parse(stored));
  } catch (error) {
    console.warn(`${MOD_TAG} Failed to load settings from localStorage.`, error);
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: ChatSettings) {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn(`${MOD_TAG} Failed to persist settings to localStorage.`, error);
  }
}

function emit() {
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

let currentSettings = loadSettings();

export function readSettingsSnapshot(): ChatSettings {
  return currentSettings;
}

export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSettings(
  update:
    | Partial<ChatSettings>
    | ((previous: ChatSettings) => Partial<ChatSettings> | ChatSettings),
): ChatSettings {
  const patch = typeof update === 'function' ? update(currentSettings) : update;
  currentSettings = normalizeSettings({ ...currentSettings, ...patch });
  saveSettings(currentSettings);
  emit();
  return currentSettings;
}
