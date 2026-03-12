import { FileText, FileCode, Image, File } from 'lucide-react';
import type { Artifact, ArtifactType } from '@clawwork/shared';

interface FileCardProps {
  artifact: Artifact;
  taskTitle: string;
  selected: boolean;
  onClick: () => void;
}

function getIcon(type: ArtifactType, name: string) {
  if (type === 'image') return Image;
  if (type === 'code') return FileCode;
  if (name.endsWith('.md') || name.endsWith('.txt')) return FileText;
  return File;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

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

export default function FileCard({ artifact, taskTitle, selected, onClick }: FileCardProps) {
  const Icon = getIcon(artifact.type, artifact.name);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        selected
          ? 'border-[var(--border-accent)] bg-[var(--accent-dim)]'
          : 'border-[var(--border)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-md bg-[var(--bg-tertiary)] flex items-center justify-center">
          <Icon size={18} className="text-[var(--text-muted)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
            {artifact.name}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {formatSize(artifact.size)}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[120px]">
              {taskTitle}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">·</span>
            <span className="text-[10px] text-[var(--text-muted)]">
              {formatRelativeTime(artifact.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
