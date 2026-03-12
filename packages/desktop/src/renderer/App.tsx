import { useState, useEffect } from 'react';
import LeftNav from './layouts/LeftNav';
import MainArea from './layouts/MainArea';
import RightPanel from './layouts/RightPanel';
import Setup from './layouts/Setup';
import Settings from './layouts/Settings';
import { useUiStore } from './stores/uiStore';
import { useGatewayEventDispatcher } from './hooks/useGatewayDispatcher';

export default function App() {
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  useGatewayEventDispatcher();

  useEffect(() => {
    window.clawwork.isWorkspaceConfigured().then((configured) => {
      if (configured) {
        setReady(true);
      } else {
        setNeedsSetup(true);
      }
    });
  }, []);

  if (needsSetup) {
    return (
      <Setup onSetupComplete={() => { setNeedsSetup(false); setReady(true); }} />
    );
  }

  if (!ready) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <div className="titlebar-drag fixed top-0 left-0 right-0 h-8 z-50" />

      <aside
        className="flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)]"
        style={{ width: 260 }}
      >
        <LeftNav />
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {settingsOpen ? (
          <Settings onClose={() => setSettingsOpen(false)} />
        ) : (
          <MainArea onTogglePanel={toggleRightPanel} />
        )}
      </main>

      {rightPanelOpen && !settingsOpen && (
        <aside
          className="flex-shrink-0 border-l border-[var(--border)] bg-[var(--bg-secondary)]"
          style={{ width: 320 }}
        >
          <RightPanel onClose={() => setRightPanelOpen(false)} />
        </aside>
      )}
    </div>
  );
}
