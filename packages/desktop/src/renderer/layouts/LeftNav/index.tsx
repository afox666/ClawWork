import { type MouseEvent } from 'react';
import {
  Plus, Search, FolderOpen, Settings, MessageSquare, Circle,
} from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useUiStore } from '../../stores/uiStore';
import { ContextMenu, useTaskContextMenu } from '../../components/ContextMenu';
import type { Task } from '@clawwork/shared';

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function TaskItem({ task, active, onContextMenu }: {
  task: Task;
  active: boolean;
  onContextMenu: (e: MouseEvent) => void;
}) {
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const clearUnread = useUiStore((s) => s.clearUnread);
  const hasUnread = useUiStore((s) => s.unreadTaskIds.has(task.id));

  const setMainView = useUiStore((s) => s.setMainView);

  const handleClick = (): void => {
    setActiveTask(task.id);
    clearUnread(task.id);
    setMainView('chat');
  };

  return (
    <button
      onClick={handleClick}
      onContextMenu={onContextMenu}
      className={`titlebar-no-drag w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        active
          ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <MessageSquare size={16} className="mt-0.5 flex-shrink-0 opacity-50" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate flex-1">
            {task.title || '新任务'}
          </p>
          {hasUnread && (
            <Circle size={6} className="flex-shrink-0 fill-[var(--accent)] text-[var(--accent)]" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {task.status === 'completed' && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              已完成
            </span>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            {formatRelativeTime(task.updatedAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function LeftNav() {
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const mainView = useUiStore((s) => s.mainView);
  const setMainView = useUiStore((s) => s.setMainView);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const { menuState, items, openMenu, closeMenu } = useTaskContextMenu(updateTaskStatus);

  const visibleTasks = tasks.filter((t) => t.status !== 'archived');
  const activeTasks = visibleTasks.filter((t) => t.status === 'active');
  const completedTasks = visibleTasks.filter((t) => t.status === 'completed');

  return (
    <div className="flex flex-col h-full pt-14">
      {/* New Task + Search */}
      <div className="px-4 pb-3 space-y-2 flex-shrink-0">
        <button
          onClick={createTask}
          className="titlebar-no-drag w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-[var(--accent)] text-black font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> 新任务
        </button>
        <div className="titlebar-no-drag relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="搜索任务…"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-accent)] transition-colors"
          />
        </div>
      </div>

      {/* Files shortcut */}
      <div className="px-4 pb-2 flex-shrink-0">
        <button
          onClick={() => setMainView('files')}
          className={`titlebar-no-drag w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            mainView === 'files'
              ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <FolderOpen size={16} className="opacity-60" /> 文件管理
        </button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto px-4 space-y-0.5">
        {visibleTasks.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] text-center py-8">
            点击「新任务」开始
          </p>
        )}
        {activeTasks.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] px-3 py-2">
              进行中 ({activeTasks.length})
            </p>
            {activeTasks.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                active={t.id === activeTaskId}
                onContextMenu={(e) => openMenu(e, t.id, t.status)}
              />
            ))}
          </>
        )}
        {completedTasks.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] px-3 py-2 mt-3">
              已完成 ({completedTasks.length})
            </p>
            {completedTasks.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                active={t.id === activeTaskId}
                onContextMenu={(e) => openMenu(e, t.id, t.status)}
              />
            ))}
          </>
        )}
      </div>

      {/* Settings */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border)]">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={`titlebar-no-drag w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            settingsOpen
              ? 'bg-[var(--accent-dim)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Settings size={16} className="opacity-60" /> 设置
        </button>
      </div>

      <ContextMenu items={items} position={menuState.position} onClose={closeMenu} />
    </div>
  );
}
