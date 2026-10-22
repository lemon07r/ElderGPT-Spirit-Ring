import { AIClient } from '../ai/client';
import { runAgentTurn } from '../ai/agent';
import { compactConversation, needsCompaction } from '../ai/compaction';
import { selectKnowledge } from '../ai/knowledge';
import { buildApiMessages } from '../ai/messages';
import { getStaticModelLimits } from '../ai/modelLimits';
import { estimateTokens } from '../ai/tokenEstimator';
import { readSettingsSnapshot } from '../config/settings';
import { extractContext, formatGameState, getSystemPrompt } from '../integration/contextEngine';
import { readGameStateSnapshot } from '../integration/gameState';
import {
  appendAssistantMessage,
  appendStreamChunk,
  appendUserMessage,
  beginChatTurn,
  finalizeStreamingMessage,
  prepareRetryLastUserTurn,
  readChatSessionSnapshot,
  recordChatUsage,
  renameSession,
  replaceMessages,
  setChatLoading,
  setLookupLabel,
  startStreamingMessage,
} from './chatSession';

async function generateSessionTitle(client: AIClient, isCurrent: () => boolean, signal: AbortSignal) {
  if (!isCurrent() || signal.aborted) return;
  const conversation = buildApiMessages(readChatSessionSnapshot().messages)
    .filter((message) => message.role !== 'system')
    .slice(0, 4)
    .map((message) => `${message.role}: ${message.content.slice(0, 200)}`)
    .join('\n');
  const result = await client.chat([
    { role: 'system', content: 'Generate a concise chat title (max 6 words). Reply with only the title.' },
    { role: 'user', content: conversation },
  ], signal);
  if (result.error || result.stopped || signal.aborted || !isCurrent()) return;
  const cleaned = result.text.trim().replace(/^["']|["']$/g, '').replace(/\.+$/, '').slice(0, 60);
  if (cleaned) renameSession(cleaned);
}

/** Both Send and Retry use this pipeline. An omitted prompt retries the last failed turn. */
export async function sendChatTurn(prompt?: string, externalSignal?: AbortSignal): Promise<void> {
  if (readChatSessionSnapshot().isLoading || externalSignal?.aborted) return;
  if (prompt !== undefined && !prompt.trim()) return;
  const turn = beginChatTurn(externalSignal);
  const isCurrent = turn.isCurrent;
  const signal = turn.signal;
  if (!isCurrent()) return;
  if (prompt === undefined) {
    if (!prepareRetryLastUserTurn()) return;
  } else {
    appendUserMessage(prompt);
  }
  if (!isCurrent()) return;
  setChatLoading(true);
  const sessionId = readChatSessionSnapshot().sessionId;
  const settings = readSettingsSnapshot();
  const context = extractContext(readGameStateSnapshot());
  const contextWindow = settings.contextLimitTokens ?? getStaticModelLimits(settings.modelId).contextWindow;
  const outputReserve = settings.outputLimitTokens ?? 2048;
  const knowledge = selectKnowledge(context, Math.floor(contextWindow * 0.3));
  const systemContent = getSystemPrompt(settings.persona, settings.customPrompt, knowledge, settings.memoryNotes);
  const gameState = formatGameState(context);
  const client = new AIClient({
    url: settings.apiUrl,
    apiKey: settings.apiKey,
    modelId: settings.modelId,
    provider: settings.provider,
    timeoutMs: settings.requestTimeoutSeconds * 1000,
    maxOutputTokens: settings.outputLimitTokens ?? undefined,
    temperature: settings.temperature,
  });
  let messages = readChatSessionSnapshot().messages;
  const needsTitle = settings.autoTitle && messages.filter((message) => message.role === 'user').length === 1;
  try {
    if (needsCompaction(estimateTokens(systemContent) + estimateTokens(gameState), messages, contextWindow, outputReserve,
      readChatSessionSnapshot().reportedInputTokens, readChatSessionSnapshot().reportedHistoryTokens)) {
      const result = await compactConversation(messages, client, signal);
      if (!isCurrent() || signal.aborted) return;
      if (result.compacted) {
        messages = result.messages;
        replaceMessages(messages);
      }
    }
    if (signal.aborted || !isCurrent()) return;
    const history = [{ role: 'system' as const, content: systemContent }, ...messages];
    if (settings.showStreaming) startStreamingMessage();
    const result = await runAgentTurn(client, history, {
      signal, gameState, gameLookups: settings.gameLookups,
      ...(settings.showStreaming ? { onChunk: (chunk: string) => {
        if (isCurrent() && !signal.aborted) appendStreamChunk(chunk);
      } } : {}),
      onLookup: (label) => { if (isCurrent() && !signal.aborted) setLookupLabel(label); },
    });
    if (!isCurrent()) return;
    recordChatUsage(sessionId, result.usage, messages);
    if (!isCurrent()) return;
    const metadata = { error: result.error, stopped: result.stopped, lookups: result.lookups, notice: result.notice };
    if (settings.showStreaming) finalizeStreamingMessage(result.text, metadata);
    else appendAssistantMessage(result.text, metadata);
    if (needsTitle && !result.error && !result.stopped) {
      void generateSessionTitle(client, isCurrent, signal);
    }
  } finally {
    if (isCurrent()) setChatLoading(false);
  }
}
