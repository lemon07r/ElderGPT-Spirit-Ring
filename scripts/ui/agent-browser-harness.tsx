import React from 'react';
import ReactDOM from 'react-dom/client';
import { updateSettings } from '../../src/config/settings';
import { appendAssistantMessage, resetChatSession } from '../../src/ui/chatSession';
import { ElderGPTApp } from '../../src/ui/ElderGPTApp';

window.fetch = async (_input, init) => {
  const request =
    typeof init?.body === 'string'
      ? (JSON.parse(init.body) as {
          messages?: Array<{
            role?: string;
            content?: string;
          }>;
        })
      : null;
  const latestUserMessage =
    request?.messages?.slice().reverse().find((message) => message.role === 'user')?.content ??
    'the silence between breaths';

  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: `The Spirit Ring senses your intent regarding "${latestUserMessage}". Breathe, observe, then act with precision.`,
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
