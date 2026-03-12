import type { WsMessage } from '@clawwork/shared';
import { parseTaskIdFromSessionKey } from '@clawwork/shared';

export type AgentMessageAction =
  | { type: 'markUnread'; taskId: string }
  | { type: 'addMessage'; taskId: string; role: 'assistant'; content: string }
  | { type: 'appendStreamDelta'; taskId: string; delta: string }
  | { type: 'finalizeStream'; taskId: string };

export function getAgentMessageActions(
  msg: WsMessage,
  activeTaskId: string | null,
): AgentMessageAction[] {
  if (!('sessionKey' in msg) || !msg.sessionKey) {
    return [];
  }

  const taskId = parseTaskIdFromSessionKey(msg.sessionKey);
  if (!taskId) {
    return [];
  }

  const actions: AgentMessageAction[] = [];
  switch (msg.type) {
    case 'text':
      if (!msg.content) {
        return [];
      }
      actions.push({
        type: 'addMessage',
        taskId,
        role: 'assistant',
        content: msg.content,
      });
      break;
    case 'stream_chunk':
      if (msg.content) {
        actions.push({
          type: 'appendStreamDelta',
          taskId,
          delta: msg.content,
        });
      }
      if (msg.done) {
        actions.push({ type: 'finalizeStream', taskId });
      }
      break;
    default:
      return [];
  }

  if (taskId !== activeTaskId) {
    actions.unshift({ type: 'markUnread', taskId });
  }

  return actions;
}
