import { useState, useEffect } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';

interface SetupProps {
  onSetupComplete: () => void;
}

export default function Setup({ onSetupComplete }: SetupProps) {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.clawwork.getDefaultWorkspacePath().then(setPath);
  }, []);

  const handleBrowse = async (): Promise<void> => {
    const selected = await window.clawwork.browseWorkspace();
    if (selected) {
      setPath(selected);
      setError('');
    }
  };

  const handleSetup = async (): Promise<void> => {
    if (!path.trim()) {
      setError('请选择工作空间目录');
      return;
    }
    setLoading(true);
    setError('');
    const result = await window.clawwork.setupWorkspace(path.trim());
    setLoading(false);
    if (result.ok) {
      onSetupComplete();
    } else {
      setError(result.error ?? '初始化失败');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <div className="titlebar-drag fixed top-0 left-0 right-0 h-8 z-50" />

      <div className="flex flex-col items-center justify-center w-full px-6">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center">
              <span className="text-[var(--accent)] text-2xl font-bold">C</span>
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              欢迎使用 ClawWork
            </h1>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              AI 产物将保存到工作空间目录，
              <br />
              并通过 Git 自动版本管理。
            </p>
          </div>

          {/* Path selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              工作空间目录
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => { setPath(e.target.value); setError(''); }}
                className="titlebar-no-drag flex-1 h-10 px-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-accent)] transition-colors"
                placeholder="选择目录…"
              />
              <button
                onClick={handleBrowse}
                className="titlebar-no-drag flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <FolderOpen size={15} />
                浏览…
              </button>
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={handleSetup}
            disabled={loading || !path.trim()}
            className="titlebar-no-drag w-full h-11 rounded-lg bg-[var(--accent)] text-black font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                初始化中…
              </>
            ) : (
              '开始使用'
            )}
          </button>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
