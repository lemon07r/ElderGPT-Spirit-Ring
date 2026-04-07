import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribeToSpiritRingOpen } from '../integration/uiBridge';
import { readChatSessionSnapshot, setChatOpen, subscribeToChatSession } from './chatSession';
import { ChatPanel } from './components/ChatPanel';
import { SpiritRingToggle } from './components/SpiritRingToggle';

export function ElderGPTApp() {
  const [isMinimized, setIsMinimized] = useState(true);
  const [corner, setCorner] = useState<'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'>('top-right');
  const chatState = useSyncExternalStore(
    subscribeToChatSession,
    readChatSessionSnapshot,
    readChatSessionSnapshot,
  );

  const toggleOpen = () => setIsMinimized(!isMinimized);

  useEffect(() => subscribeToSpiritRingOpen(() => setIsMinimized(false)), []);
  useEffect(() => {
    setChatOpen(!isMinimized);
  }, [isMinimized]);

  return (
    <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
      {isMinimized ? (
        <SpiritRingToggle
          corner={corner}
          setCorner={setCorner}
          onOpen={toggleOpen}
          unreadCount={chatState.unreadCount}
        />
      ) : (
        <ChatPanel corner={corner} setCorner={setCorner} onClose={toggleOpen} />
      )}
    </div>
  );
}
