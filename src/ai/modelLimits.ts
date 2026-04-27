import type { ApiProvider } from '../config/settings';

export interface ModelLimits {
  contextWindow: number;
  maxOutput: number;
}

export const DEFAULT_CONTEXT_WINDOW = 32768;
export const DEFAULT_MAX_OUTPUT = 4096;
const PROBE_TIMEOUT_MS = 5000;

const MODEL_TABLE: Record<string, ModelLimits> = {
  'gpt-5.4':       { contextWindow: 272000,  maxOutput: 128000 },
  'gpt-5.4-mini':  { contextWindow: 400000,  maxOutput: 128000 },
  'gpt-5.4-nano':  { contextWindow: 400000,  maxOutput: 128000 },
  'gpt-4.1':       { contextWindow: 1000000, maxOutput: 32768 },
  'gpt-4.1-mini':  { contextWindow: 1000000, maxOutput: 32768 },
  'gpt-4.1-nano':  { contextWindow: 1000000, maxOutput: 32768 },
  'gpt-4o':        { contextWindow: 128000,  maxOutput: 16384 },
  'gpt-4o-mini':   { contextWindow: 128000,  maxOutput: 16384 },
  'o3':            { contextWindow: 200000,  maxOutput: 100000 },
  'o3-mini':       { contextWindow: 200000,  maxOutput: 100000 },
  'o4-mini':       { contextWindow: 200000,  maxOutput: 100000 },
  'claude-opus-4':          { contextWindow: 1000000, maxOutput: 128000 },
  'claude-sonnet-4':        { contextWindow: 1000000, maxOutput: 64000 },
  'claude-haiku-4':         { contextWindow: 200000,  maxOutput: 64000 },
  'claude-3-5-sonnet':      { contextWindow: 200000,  maxOutput: 8192 },
  'claude-3-5-haiku':       { contextWindow: 200000,  maxOutput: 8192 },
  'claude-3-opus':          { contextWindow: 200000,  maxOutput: 4096 },
  'claude-3-sonnet':        { contextWindow: 200000,  maxOutput: 4096 },
  'claude-3-haiku':         { contextWindow: 200000,  maxOutput: 4096 },
  'llama3':         { contextWindow: 8192,    maxOutput: 4096 },
  'llama3.1':       { contextWindow: 131072,  maxOutput: 4096 },
  'llama3.2':       { contextWindow: 131072,  maxOutput: 4096 },
  'llama3.3':       { contextWindow: 131072,  maxOutput: 4096 },
  'qwen2.5':        { contextWindow: 131072,  maxOutput: 8192 },
  'qwen3':          { contextWindow: 131072,  maxOutput: 8192 },
  'qwen3.5':        { contextWindow: 256000,  maxOutput: 8192 },
  'gemma2':         { contextWindow: 8192,    maxOutput: 4096 },
  'gemma3':         { contextWindow: 131072,  maxOutput: 8192 },
  'deepseek-r1':    { contextWindow: 128000,  maxOutput: 8192 },
  'deepseek-v3':    { contextWindow: 128000,  maxOutput: 8192 },
  'mistral':        { contextWindow: 32768,   maxOutput: 4096 },
  'mistral-large':  { contextWindow: 131072,  maxOutput: 8192 },
  'kimi-k2':        { contextWindow: 256000,  maxOutput: 8192 },
  'kimi-k2.5':      { contextWindow: 256000,  maxOutput: 8192 },
  'glm-4':          { contextWindow: 131072,  maxOutput: 4096 },
  'glm-4-plus':     { contextWindow: 131072,  maxOutput: 4096 },
  'glm-5':          { contextWindow: 131072,  maxOutput: 8192 },
  'glm-5.1':        { contextWindow: 131072,  maxOutput: 8192 },
  'glm-z1':         { contextWindow: 131072,  maxOutput: 8192 },
};

function lookupStatic(modelId: string): ModelLimits {
  const id = modelId.toLowerCase();
  if (MODEL_TABLE[id]) return MODEL_TABLE[id];
  for (const [key, limits] of Object.entries(MODEL_TABLE)) {
    if (id.startsWith(key)) return limits;
  }
  return { contextWindow: DEFAULT_CONTEXT_WINDOW, maxOutput: DEFAULT_MAX_OUTPUT };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = globalThis.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(id);
  }
}

async function probeAnthropic(baseUrl: string, apiKey: string, modelId: string): Promise<ModelLimits | null> {
  try {
    const url = baseUrl.replace(/\/v1\/messages\/?$/, '').replace(/\/+$/, '');
    const res = await fetchWithTimeout(`${url}/v1/models`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: Array<{ id: string; max_input_tokens?: number; max_tokens?: number }> };
    const model = data.data?.find((m) => m.id === modelId || m.id.startsWith(modelId) || modelId.startsWith(m.id));
    if (model?.max_input_tokens && model?.max_tokens) {
      return { contextWindow: model.max_input_tokens, maxOutput: model.max_tokens };
    }
  } catch { /* probe failed */ }
  return null;
}

async function probeLMStudio(baseUrl: string, modelId: string): Promise<ModelLimits | null> {
  try {
    const url = baseUrl.replace(/\/v1\/chat\/completions\/?$/, '').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const res = await fetchWithTimeout(`${url}/api/v0/models`, { method: 'GET', headers: {} });
    if (!res.ok) return null;
    const data = await res.json() as { data?: Array<{ id: string; max_context_length?: number }> };
    const model = data.data?.find((m) => m.id === modelId || modelId.includes(m.id) || m.id.includes(modelId));
    if (model?.max_context_length) {
      return { contextWindow: model.max_context_length, maxOutput: Math.min(model.max_context_length, DEFAULT_MAX_OUTPUT) };
    }
  } catch { /* probe failed */ }
  return null;
}

async function probeOllama(baseUrl: string, modelId: string): Promise<ModelLimits | null> {
  try {
    const url = baseUrl.replace(/\/v1\/chat\/completions\/?$/, '').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const res = await fetchWithTimeout(`${url}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { model_info?: Record<string, unknown> };
    if (!data.model_info) return null;
    const arch = (data.model_info['general.architecture'] as string) || '';
    const ctxLen = data.model_info[`${arch}.context_length`] as number | undefined;
    if (ctxLen && ctxLen > 0) {
      return { contextWindow: ctxLen, maxOutput: Math.min(ctxLen, DEFAULT_MAX_OUTPUT) };
    }
  } catch { /* probe failed */ }
  return null;
}

let cachedLimits: ModelLimits | null = null;
let cacheKey = '';

export async function detectModelLimits(
  url: string,
  modelId: string,
  apiKey: string,
  provider: ApiProvider,
): Promise<ModelLimits> {
  const key = `${provider}|${url}|${modelId}`;
  if (cacheKey === key && cachedLimits) return cachedLimits;

  let result: ModelLimits | null = null;

  if (provider === 'anthropic') {
    result = await probeAnthropic(url, apiKey, modelId);
  } else {
    result = await probeLMStudio(url, modelId);
    if (!result) result = await probeOllama(url, modelId);
  }

  const limits = result || lookupStatic(modelId);
  cachedLimits = limits;
  cacheKey = key;
  return limits;
}

export function getStaticModelLimits(modelId: string): ModelLimits {
  return lookupStatic(modelId);
}

export function clearModelLimitsCache() {
  cachedLimits = null;
  cacheKey = '';
}
