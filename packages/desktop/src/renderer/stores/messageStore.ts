import { create } from 'zustand';
import type { Message, MessageRole } from '@clawwork/shared';

/** Stable empty array — avoids creating new references on every selector call */
const EMPTY_MESSAGES: Message[] = [];

interface MessageState {
  /** taskId → messages */
  messagesByTask: Record<string, Message[]>;
  /** taskId → currently streaming assistant content (delta accumulator) */
  streamingByTask: Record<string, string>;
  /** message ID to highlight (e.g. from file navigation) */
  highlightedMessageId: string | null;

  addMessage: (taskId: string, role: MessageRole, content: string) => Message;
  appendStreamDelta: (taskId: string, delta: string) => void;
  finalizeStream: (taskId: string) => void;
  clearMessages: (taskId: string) => void;
  setHighlightedMessage: (id: string | null) => void;
}

export { EMPTY_MESSAGES };

function generateId(): string {
  return crypto.randomUUID();
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesByTask: {},
  streamingByTask: {},
  highlightedMessageId: null,

  addMessage: (taskId, role, content) => {
    const msg: Message = {
      id: generateId(),
      taskId,
      role,
      content,
      artifacts: [],
      toolCalls: [],
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      messagesByTask: {
        ...s.messagesByTask,
        [taskId]: [...(s.messagesByTask[taskId] ?? []), msg],
      },
    }));
    return msg;
  },

  appendStreamDelta: (taskId, delta) =>
    set((s) => ({
      streamingByTask: {
        ...s.streamingByTask,
        [taskId]: (s.streamingByTask[taskId] ?? '') + delta,
      },
    })),

  finalizeStream: (taskId) => {
    const content = get().streamingByTask[taskId];
    if (!content) return;
    get().addMessage(taskId, 'assistant', content);
    set((s) => {
      const next = { ...s.streamingByTask };
      delete next[taskId];
      return { streamingByTask: next };
    });
  },

  clearMessages: (taskId) =>
    set((s) => {
      const next = { ...s.messagesByTask };
      delete next[taskId];
      return { messagesByTask: next };
    }),

  setHighlightedMessage: (id) => set({ highlightedMessageId: id }),
}));
