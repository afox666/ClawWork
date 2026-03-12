import { describe, it, expect } from 'vitest';
import type { WsTextMessage, WsStreamChunk } from '@clawwork/shared';
import {
  getAgentMessageActions,
  type AgentMessageAction,
} from '../src/renderer/lib/agent-message.js';

describe('getAgentMessageActions', () => {
  it('converts text replies into assistant messages for the active task', () => {
    const msg: WsTextMessage = {
      type: 'text',
      sessionKey: 'agent:main:task-task-1',
      content: 'reply from agent',
    };

    expect(getAgentMessageActions(msg, 'task-1')).toEqual<AgentMessageAction[]>([
      {
        type: 'addMessage',
        taskId: 'task-1',
        role: 'assistant',
        content: 'reply from agent',
      },
    ]);
  });

  it('marks background tasks unread before appending text replies', () => {
    const msg: WsTextMessage = {
      type: 'text',
      sessionKey: 'agent:main:task-task-2',
      content: 'background reply',
    };

    expect(getAgentMessageActions(msg, 'task-1')).toEqual<AgentMessageAction[]>([
      { type: 'markUnread', taskId: 'task-2' },
      {
        type: 'addMessage',
        taskId: 'task-2',
        role: 'assistant',
        content: 'background reply',
      },
    ]);
  });

  it('streams chunks into the matching task', () => {
    const msg: WsStreamChunk = {
      type: 'stream_chunk',
      sessionKey: 'agent:main:task-task-3',
      content: 'partial',
      done: false,
    };

    expect(getAgentMessageActions(msg, 'task-3')).toEqual<AgentMessageAction[]>([
      {
        type: 'appendStreamDelta',
        taskId: 'task-3',
        delta: 'partial',
      },
    ]);
  });

  it('finalizes streams when the plugin marks the chunk as done', () => {
    const msg: WsStreamChunk = {
      type: 'stream_chunk',
      sessionKey: 'agent:main:task-task-4',
      content: 'final chunk',
      done: true,
    };

    expect(getAgentMessageActions(msg, 'task-4')).toEqual<AgentMessageAction[]>([
      {
        type: 'appendStreamDelta',
        taskId: 'task-4',
        delta: 'final chunk',
      },
      {
        type: 'finalizeStream',
        taskId: 'task-4',
      },
    ]);
  });

  it('ignores messages with session keys that cannot map back to a task', () => {
    const msg: WsTextMessage = {
      type: 'text',
      sessionKey: 'broken-session-key',
      content: 'reply',
    };

    expect(getAgentMessageActions(msg, 'task-1')).toEqual([]);
  });
});
