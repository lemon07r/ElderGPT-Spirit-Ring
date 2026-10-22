import React from 'react';
import ReactDOM from 'react-dom/client';
import { updateSettings } from '../../src/config/settings';
import { appendAssistantMessage, resetChatSession } from '../../src/ui/chatSession';
import { sendChatTurn } from '../../src/ui/chatTurn';
import { ElderGPTApp } from '../../src/ui/ElderGPTApp';

let failNextReply = false;
let lookupNextReply = false;
window.modAPI = {
  gameData: { buffs: { Rot: { name: 'Rot', canStack: true, tooltip: 'Used to empower certain Blossom techniques.' } } },
  utils: { t: (value: unknown) => typeof value === 'string' ? value : '', expandTooltipTags: (text: string) => text },
} as unknown as typeof window.modAPI;
window.fetch = async (_input, init) => {
  const request =
    typeof init?.body === 'string'
      ? (JSON.parse(init.body) as {
          messages?: Array<{
            role?: string;
            content?: string;
            tool_call_id?: string;
          }>;
          stream?: boolean;
        })
      : null;
  const latestUserMessage =
    request?.messages?.slice().reverse().find((message) => message.role === 'user')?.content ??
    'the silence between breaths';

  if (failNextReply && request?.messages) {
    failNextReply = false;
    return Response.json({ error: { message: 'Simulated connection failure. Try Retry.' } }, { status: 401 });
  }
  let content = `The Spirit Ring senses your intent regarding "${latestUserMessage}". Breathe, observe, then act with precision.`;
  let toolCalls;
  if (lookupNextReply) {
    const results = request?.messages?.filter((message) => message.role === 'tool') ?? [];
    if (results.length === 0) {
      content = 'Let me consult the records.';
      toolCalls = [{ id: 'harness-search', type: 'function', function: { name: 'search_game_data', arguments: '{"query":"rot","category":"buffs"}' } }];
    } else if (results.length === 1) {
      content = '';
      toolCalls = [{ id: 'harness-entry', type: 'function', function: { name: 'get_game_entry', arguments: '{"category":"buffs","key":"Rot"}' } }];
    } else {
      lookupNextReply = false;
      content = 'Rot stacks empower certain Blossom techniques. The records do not give a fixed damage value; examine the technique that consumes it before planning your next strike.';
    }
  }
  if (request?.stream) {
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content, ...(toolCalls ? { tool_calls: toolCalls.map((call, index) => ({ index, ...call })) } : {}) } }] })}\n\ndata: [DONE]\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
            ...(toolCalls ? { tool_calls: toolCalls } : {}),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
};

updateSettings({
  apiUrl: 'http://localhost:1234',
  apiKey: '',
  modelId: 'harness-model',
  proactiveEnabled: true,
  gameLookups: true,
  autoTitle: false,
  provider: 'openai',
});
resetChatSession();

function Harness() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#333', position: 'relative' }}>
      <button
        id="bg-button"
        onClick={() => alert('Background clicked')}
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '20px', fontSize: '20px', zIndex: 1 }}
      >
        Click Me (Game Background)
      </button>

      <button
        id="fail-next-button"
        onClick={() => { failNextReply = true; }}
        style={{ position: 'absolute', top: '80px', left: '24px', padding: '12px 16px', zIndex: 1 }}
      >
        Fail Next Reply (test Retry)
      </button>

      <button
        id="lookup-button"
        onClick={() => {
          lookupNextReply = true;
          void sendChatTurn('What does Rot do?');
        }}
        style={{ position: 'absolute', top: '140px', left: '24px', padding: '12px 16px', zIndex: 1 }}
      >
        Simulate Lookup Turn
      </button>

      <button
        id="proactive-button"
        onClick={() => appendAssistantMessage('A proactive whisper reaches you from the ring.')}
        style={{ position: 'absolute', top: '24px', left: '24px', padding: '12px 16px', zIndex: 1 }}
      >
        Simulate Proactive Hint
      </button>

      <button
        id="reset-button"
        onClick={() => resetChatSession()}
        style={{ position: 'absolute', top: '24px', left: '220px', padding: '12px 16px', zIndex: 1 }}
      >
        Reset Chat
      </button>

      {/* Simulate the mod's injected root */}
      <div id="eldergpt-spirit-ring-root" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999 }}>
        <ElderGPTApp />
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Harness />);
