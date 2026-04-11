const CHARS_PER_TOKEN = 3.5;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content) + 4;
  }
  return total;
}
