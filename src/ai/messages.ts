import type { Message } from './client';

// Recognize errors from old sessions too; new errors carry explicit metadata.
export function isErrorMessage(message: Message): boolean {
  return message.error === true ||
    (message.role === 'assistant' && (
      message.content.trimStart().startsWith('[System:') ||
      message.content.includes('\n\n[System: The heavenly connection is severed - ')
    ));
}

/** The single boundary between display/persisted history and model-visible messages. */
export function buildApiMessages(messages: readonly Message[], gameState?: string): Message[] {
  const result: Message[] = [];
  let hasUser = false;
  for (const message of messages) {
    if (isErrorMessage(message) || message.stopped || (!message.content.trim() && !message.toolCalls?.length)) continue;
    if (message.role === 'assistant' && !hasUser) continue;
    if (message.role === 'user') hasUser = true;
    const last = result.at(-1);
    if (last?.role === message.role && message.role !== 'tool' && !last.toolCalls?.length && !message.toolCalls?.length) {
      last.content += `\n\n${message.content}`;
    } else {
      // Deliberately copy only transport fields, never UI metadata.
      result.push({ role: message.role, content: message.content,
        ...(message.role === 'assistant' && message.toolCalls?.length ? { toolCalls: message.toolCalls.map((call) => ({ ...call })) } : {}),
        ...(message.role === 'tool' ? { toolCallId: message.toolCallId, ...(message.toolError ? { toolError: true } : {}) } : {}),
      });
    }
  }
  const newestUser = result.findLastIndex((message) => message.role === 'user');
  if (gameState && newestUser >= 0) {
    result[newestUser].content = `<game_state captured_at_send>\n${gameState}\n</game_state>\n\n${result[newestUser].content}`;
  }
  return result;
}
