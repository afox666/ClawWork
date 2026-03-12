import { useEffect, useRef } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useMessageStore, EMPTY_MESSAGES } from '../../stores/messageStore';
import { useUiStore } from '../../stores/uiStore';
import ChatMessage from '../../components/ChatMessage';
import StreamingMessage from '../../components/StreamingMessage';
import ChatInput from '../../components/ChatInput';
import FileBrowser from '../FileBrowser';

interface MainAreaProps {
  onTogglePanel: () => void;
}

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-20">
      <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center mb-4">
        <span className="text-[var(--accent)] text-xl font-bold">C</span>
      </div>
      <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">ClawWork</h3>
      <p className="text-sm text-[var(--text-muted)] max-w-md">
        描述你的任务，AI 将帮你规划并执行。过程中产生的文件会自动归档管理。
      </p>
    </div>
  );
}

function ChatHeader({ onTogglePanel }: { onTogglePanel: () => void }) {
  const activeTask = useTaskStore((s) =>
    s.tasks.find((t) => t.id === s.activeTaskId),
  );

  return (
    <header className="titlebar-drag flex items-center justify-between h-12 px-4 border-b border-[var(--border)] flex-shrink-0">
      <div className="flex items-center gap-2">
        {activeTask ? (
          <>
            <h2 className="text-sm font-medium text-[var(--text-primary)] truncate">
              {activeTask.title || '新任务'}
            </h2>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              activeTask.status === 'active'
                ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
            }`}>
              {activeTask.status === 'active' ? '进行中' : '已完成'}
            </span>
          </>
        ) : (
          <h2 className="text-sm font-medium text-[var(--text-muted)]">ClawWork</h2>
        )}
      </div>
      <button
        onClick={onTogglePanel}
        className="titlebar-no-drag p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        title="切换上下文面板"
      >
        <PanelRightOpen size={18} />
      </button>
    </header>
  );
}

function ChatContent() {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const activeTask = useTaskStore((s) =>
    s.tasks.find((t) => t.id === s.activeTaskId),
  );
  const messages = useMessageStore((s) =>
    activeTaskId ? (s.messagesByTask[activeTaskId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  );
  const streamingContent = useMessageStore((s) =>
    activeTaskId ? (s.streamingByTask[activeTaskId] ?? '') : '',
  );
  const highlightedId = useMessageStore((s) => s.highlightedMessageId);
  const setHighlightedMessage = useMessageStore((s) => s.setHighlightedMessage);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingContent]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-1">
          {!activeTask && <WelcomeScreen />}
          {activeTask && messages.length === 0 && !streamingContent && <WelcomeScreen />}
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              highlighted={msg.id === highlightedId}
              onHighlightDone={() => setHighlightedMessage(null)}
            />
          ))}
          {streamingContent && <StreamingMessage content={streamingContent} />}
        </div>
      </div>
      <ChatInput />
    </>
  );
}

export default function MainArea({ onTogglePanel }: MainAreaProps) {
  const mainView = useUiStore((s) => s.mainView);

  if (mainView === 'files') {
    return (
      <div className="flex flex-col h-full">
        <FileBrowser />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ChatHeader onTogglePanel={onTogglePanel} />
      <ChatContent />
    </div>
  );
}
