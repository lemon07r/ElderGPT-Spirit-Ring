import type { Message } from './client';
import { AIClient } from './client';
import { estimateTokens, estimateMessagesTokens } from './tokenEstimator';

const PRESERVE_RECENT_COUNT = 6;
const MIN_MESSAGES_FOR_COMPACTION = 10;
const CONTEXT_USAGE_THRESHOLD = 0.75;
const MESSAGE_COUNT_THRESHOLD = 40;

const SUMMARY_MARKER = '## Session Context';

const COMPACTION_PROMPT = `\
You are a conversation summarizer for a game AI advisor in a Xianxia cultivation RPG called "Ascend From Nine Mountains".

Summarize the conversation history below into a structured summary that preserves the most important context for continuing the conversation naturally.

OUTPUT FORMAT (use exactly these section headers):

## Session Context
What the player has been asking about or working on. Their current goals or concerns.

## Key Advice Given
The most important strategic recommendations made (cultivation, combat, crafting, etc.). Preserve specific technique names, item names, stat numbers, and game terms exactly.

## Player Decisions
What the player decided to do based on advice. Any stated preferences (fighting style, cultivation path, crafting approach).

## Unresolved
Any questions not fully answered or topics the player wanted to return to.

RULES:
- Be concise but preserve specific names, numbers, and game terms exactly
- Drop routine greetings, filler, and social exchanges
- Keep the summary under 400 words
- Write in third person ("The player asked...", "The advisor recommended...")`;

function isSummaryMessage(msg: Message): boolean {
  return msg.role === 'system' && msg.content.startsWith(SUMMARY_MARKER);
}

function formatMessagesForSummary(messages: Message[]): string {
  return messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n\n');
}

export function needsCompaction(
  systemPromptTokens: number,
  messages: Message[],
  contextWindow: number,
  outputReserve: number,
): boolean {
  if (messages.length < MIN_MESSAGES_FOR_COMPACTION) return false;
  if (messages.length >= MESSAGE_COUNT_THRESHOLD) return true;
  const messagesTokens = estimateMessagesTokens(messages);
  const total = systemPromptTokens + messagesTokens + outputReserve;
  return total >= contextWindow * CONTEXT_USAGE_THRESHOLD;
}

export interface CompactionResult {
  messages: Message[];
  compacted: boolean;
}

export async function compactConversation(
  messages: Message[],
  client: AIClient,
): Promise<CompactionResult> {
  if (messages.length < MIN_MESSAGES_FOR_COMPACTION) {
    return { messages, compacted: false };
  }

  const preserveCount = Math.min(PRESERVE_RECENT_COUNT, messages.length - 2);
  const toSummarize = messages.slice(0, messages.length - preserveCount);
  const preserved = messages.slice(messages.length - preserveCount);

  const existingSummary = toSummarize.length > 0 && isSummaryMessage(toSummarize[0])
    ? toSummarize[0].content
    : null;

  const messagesToFormat = existingSummary ? toSummarize.slice(1) : toSummarize;

  if (messagesToFormat.length === 0 && !existingSummary) {
    return { messages, compacted: false };
  }

  let userContent: string;
  if (existingSummary && messagesToFormat.length > 0) {
    userContent = `Here is the existing conversation summary:\n\n${existingSummary}\n\nHere are the new messages to incorporate:\n\n${formatMessagesForSummary(messagesToFormat)}`;
  } else if (existingSummary) {
    return { messages, compacted: false };
  } else {
    userContent = formatMessagesForSummary(messagesToFormat);
  }

  try {
    const summaryText = await client.chat([
      { role: 'system', content: COMPACTION_PROMPT },
      { role: 'user', content: userContent },
    ]);

    if (!summaryText || summaryText.startsWith('[System:')) {
      return { messages, compacted: false };
    }

    const summaryMessage: Message = { role: 'system', content: summaryText };
    return {
      messages: [summaryMessage, ...preserved],
      compacted: true,
    };
  } catch {
    return { messages, compacted: false };
  }
}

export function estimateContextUsage(
  systemPromptTokens: number,
  messages: Message[],
  outputReserve: number,
): number {
  return systemPromptTokens + estimateMessagesTokens(messages) + outputReserve;
}
