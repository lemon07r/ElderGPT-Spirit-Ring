import React from 'react';
import type { ApiProvider, ChatSettings, Persona } from '../../config/settings';
import { MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS } from '../../config/settings';
import { isTextEntryElement, pasteClipboardIntoElement } from '../inputShortcuts';

interface SettingsPanelProps {
  onClose: () => void;
  settings: ChatSettings;
  setSettings: (update: Partial<ChatSettings> | ((previous: ChatSettings) => Partial<ChatSettings> | ChatSettings)) => void;
}

export function SettingsPanel({ onClose, settings, setSettings }: SettingsPanelProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (name === 'requestTimeoutSeconds') {
      const num = parseInt(value, 10);
      if (!Number.isNaN(num)) {
        setSettings({ requestTimeoutSeconds: Math.max(MIN_TIMEOUT_SECONDS, Math.min(MAX_TIMEOUT_SECONDS, num)) });
      }
      return;
    }
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setSettings({ [name]: val } as Partial<ChatSettings>);
  };
  const handleTextShortcut = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.stopPropagation();

    if (event.altKey || event.key.toLowerCase() !== 'v' || !isTextEntryElement(event.currentTarget)) {
      return;
    }

    event.preventDefault();
    void pasteClipboardIntoElement(event.currentTarget);
  };
  const stopShortcutPropagation = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.stopPropagation();
    }
  };

  const setPersona = (persona: Persona) => {
    setSettings({ persona });
  };

  return (
    <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#C5A059' }}>Settings</h3>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>API Provider</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {PROVIDER_OPTIONS.map((option) => {
            const isSelected = settings.provider === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSettings({ provider: option.value })}
                style={{
                  ...providerButtonStyle,
                  borderColor: isSelected ? '#C5A059' : 'rgba(197, 160, 89, 0.25)',
                  backgroundColor: isSelected ? 'rgba(197, 160, 89, 0.18)' : 'rgba(0,0,0,0.3)',
                  color: isSelected ? '#f3ddab' : '#ddd',
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>API URL ({settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} compatible)</span>
        <input
          name="apiUrl"
          type="text"
          value={settings.apiUrl}
          onChange={handleChange}
          onKeyDownCapture={handleTextShortcut}
          onKeyUpCapture={stopShortcutPropagation}
          onPasteCapture={(event) => event.stopPropagation()}
          onCopyCapture={(event) => event.stopPropagation()}
          onCutCapture={(event) => event.stopPropagation()}
          style={inputStyle}
          placeholder={settings.provider === 'anthropic'
            ? 'Base URL or full /v1/messages endpoint'
            : 'Base URL or full /v1/chat/completions endpoint'}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>API Key</span>
        <input
          name="apiKey"
          type="password"
          value={settings.apiKey}
          onChange={handleChange}
          onKeyDownCapture={handleTextShortcut}
          onKeyUpCapture={stopShortcutPropagation}
          onPasteCapture={(event) => event.stopPropagation()}
          onCopyCapture={(event) => event.stopPropagation()}
          onCutCapture={(event) => event.stopPropagation()}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>Model ID</span>
        <input
          name="modelId"
          type="text"
          value={settings.modelId}
          onChange={handleChange}
          onKeyDownCapture={handleTextShortcut}
          onKeyUpCapture={stopShortcutPropagation}
          onPasteCapture={(event) => event.stopPropagation()}
          onCopyCapture={(event) => event.stopPropagation()}
          onCutCapture={(event) => event.stopPropagation()}
          style={inputStyle}
          placeholder="e.g., kimi-k2.5"
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>Request Timeout ({MIN_TIMEOUT_SECONDS}–{MAX_TIMEOUT_SECONDS}s)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            name="requestTimeoutSeconds"
            type="range"
            min={MIN_TIMEOUT_SECONDS}
            max={MAX_TIMEOUT_SECONDS}
            value={settings.requestTimeoutSeconds}
            onChange={handleChange}
            style={{ flex: 1, accentColor: '#C5A059' }}
          />
          <input
            name="requestTimeoutSeconds"
            type="number"
            min={MIN_TIMEOUT_SECONDS}
            max={MAX_TIMEOUT_SECONDS}
            value={settings.requestTimeoutSeconds}
            onChange={handleChange}
            onKeyDownCapture={handleTextShortcut}
            onKeyUpCapture={stopShortcutPropagation}
            style={{ ...inputStyle, width: '60px', textAlign: 'center' }}
          />
          <span style={{ color: '#a69d8c', fontSize: '12px' }}>sec</span>
        </div>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>Persona</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
          {PERSONA_OPTIONS.map((option) => {
            const isSelected = settings.persona === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setPersona(option.value)}
                style={{
                  ...personaButtonStyle,
                  borderColor: isSelected ? '#C5A059' : 'rgba(197, 160, 89, 0.25)',
                  backgroundColor: isSelected ? 'rgba(197, 160, 89, 0.18)' : 'rgba(0,0,0,0.3)',
                  color: isSelected ? '#f3ddab' : '#ddd',
                }}
              >
                <span style={{ fontWeight: 700 }}>{option.label}</span>
                <span style={{ fontSize: '12px', color: isSelected ? '#d8c69d' : '#a69d8c' }}>
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </label>

      {settings.persona === 'Custom' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>Custom Prompt</span>
          <textarea
            name="customPrompt"
            value={settings.customPrompt}
            onChange={handleChange}
            onKeyDownCapture={handleTextShortcut}
            onKeyUpCapture={stopShortcutPropagation}
            onPasteCapture={(event) => event.stopPropagation()}
            onCopyCapture={(event) => event.stopPropagation()}
            onCutCapture={(event) => event.stopPropagation()}
            style={{ ...inputStyle, height: '80px' }}
          />
        </label>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
        <input name="proactiveEnabled" type="checkbox" checked={settings.proactiveEnabled} onChange={handleChange} />
        <span>Enable proactive suggestions</span>
      </label>
      <p style={{ margin: 0, color: '#a69d8c', fontSize: '12px', lineHeight: 1.4 }}>
        Uses official modAPI hooks for location, combat, crafting, and major time changes.
      </p>

      <button type="button" onClick={onClose} style={{ marginTop: 'auto', padding: '8px', backgroundColor: '#C5A059', border: 'none', color: '#0F0F14', fontWeight: 'bold', cursor: 'pointer' }}>
        Save & Back
      </button>
    </div>
  );
}

const PERSONA_OPTIONS: Array<{
  value: Persona;
  label: string;
  description: string;
}> = [
  {
    value: 'Elder',
    label: 'Elder',
    description: 'Lore-focused guidance',
  },
  {
    value: 'Calculator',
    label: 'Calculator',
    description: 'Blunt optimization',
  },
  {
    value: 'Custom',
    label: 'Custom',
    description: 'Use your own prompt',
  },
];

const PROVIDER_OPTIONS: Array<{
  value: ApiProvider;
  label: string;
}> = [
  { value: 'openai', label: 'OpenAI Compatible' },
  { value: 'anthropic', label: 'Anthropic' },
];

const providerButtonStyle = {
  padding: '8px',
  borderRadius: '6px',
  borderStyle: 'solid',
  borderWidth: '1px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px',
} as const;

const inputStyle = {
  backgroundColor: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(197, 160, 89, 0.5)',
  color: 'white',
  padding: '8px',
  borderRadius: '4px',
  outline: 'none',
};

const personaButtonStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
  padding: '10px',
  borderRadius: '6px',
  borderStyle: 'solid',
  borderWidth: '1px',
  cursor: 'pointer',
  textAlign: 'left',
} as const;
