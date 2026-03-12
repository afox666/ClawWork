import { useEffect, useRef, useState } from 'react';
import type { WsMessage } from '@clawwork/shared';

export function useAgentMessages(sessionKey: string): WsMessage[] {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;

  useEffect(() => {
    const handler = (msg: WsMessage): void => {
      if ('sessionKey' in msg && msg.sessionKey === sessionKeyRef.current) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    window.clawwork.onAgentMessage(handler);
    return () => {
      window.clawwork.removeAllListeners('agent-message');
    };
  }, [sessionKey]);

  return messages;
}
