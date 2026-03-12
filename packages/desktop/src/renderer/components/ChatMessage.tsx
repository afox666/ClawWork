import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { Message } from '@clawwork/shared';
import { Bot, User } from 'lucide-react';
import ToolCallCard from './ToolCallCard';

interface ChatMessageProps {
  message: Message;
  highlighted?: boolean;
  onHighlightDone?: () => void;
}

export default function ChatMessage({ message, highlighted, onHighlightDone }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlighted || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => onHighlightDone?.(), 2000);
    return () => clearTimeout(timer);
  }, [highlighted, onHighlightDone]);

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`flex gap-3 py-3 ${isUser ? 'flex-row-reverse' : ''} ${
        highlighted ? 'animate-highlight rounded-lg' : ''
      }`}
    >
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isUser ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--accent-dim)]'
        }`}
      >
        {isUser ? (
          <User size={14} className="text-[var(--text-secondary)]" />
        ) : (
          <Bot size={14} className="text-[var(--accent)]" />
        )}
      </div>

      <div className={`min-w-0 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block text-sm leading-relaxed rounded-xl px-3.5 py-2.5 ${
            isUser
              ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-chat">
              <Markdown rehypePlugins={[rehypeHighlight]}>
                {message.content}
              </Markdown>
            </div>
          )}
        </div>
        {message.toolCalls.length > 0 && (
          <div className="mt-1">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
