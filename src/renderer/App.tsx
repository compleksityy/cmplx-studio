import React, { useEffect, useState } from 'react';
import { CmplxProvider, useCmplx } from './store';
import FileExplorer from './components/FileExplorer';
import CodeEditor from './components/CodeEditor';
import AIAssistant from './components/AIAssistant';
import TerminalPanel from './components/TerminalPanel';
import SettingsModal from './components/SettingsModal';
import './index.css';
import './App.css';

const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, saveActiveTab } = useCmplx();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActiveTab();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveActiveTab]);

  return (
    <div className="tabbar">
      {tabs.length === 0 && <div className="tabbar-empty" />}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          title={tab.filePath || tab.title}
        >
          <span className={`tab-icon ${tab.type}`}>{tab.type === 'assistant' ? '◈' : '£'}</span>
          <span className="tab-title">{tab.title}</span>
          {tab.isDirty && <span className="tab-dirty">●</span>}
          <button
            className="tab-close"
            onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

const EditorArea: React.FC = () => {
  const { tabs, activeTabId } = useCmplx();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  let body: React.ReactNode;
  if (!activeTab) {
    body = <WelcomePanel />;
  } else if (activeTab.type === 'assistant') {
    body = <AIAssistant />;
  } else if (activeTab.filePath) {
    body = <CodeEditor filePath={activeTab.filePath} />;
  } else {
    body = <WelcomePanel />;
  }

  return (
    <div className="editor-area">
      <TabBar />
      <div className="editor-path-rail">
        {activeTab?.type === 'file' && activeTab.filePath && <span className="full-path">{activeTab.filePath}</span>}
      </div>
      <div className="editor-content">{body}</div>
    </div>
  );
};

const WelcomePanel: React.FC = () => {
  const { ws, openFolder } = useCmplx();
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="logo-glitch">CMPLX</div>
        <h1>CMPLX STUDIO</h1>
        <p className="tagline">A focused desktop environment for writing code with AI.</p>
        <div className="welcome-actions">
          {ws.workspaceRoot ? (
            <span className="muted">Project: {ws.rootName}</span>
          ) : (
            <button className="primary big" onClick={() => openFolder()}>Open a Project Folder</button>
          )}
        </div>
        <div className="welcome-hints">
          <div><b>Monaco editor</b> — full-featured code editing with tabs, folding, and search.</div>
          <div><b>Ollama AI</b> — connect any local model and get repo-aware answers.</div>
          <div><b>Diff review</b> — approve AI-proposed file changes before they touch disk.</div>
          <div><b>Real terminal</b> — run commands inside your project.</div>
        </div>
      </div>
    </div>
  );
};

const StatusBar: React.FC = () => {
  const { ws, settings, ollamaConnected, models } = useCmplx();
  const modelName = settings?.ollamaModel;
  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className="status-item">
          <span className={`dot ${ollamaConnected === null ? 'unknown' : ollamaConnected ? 'ok' : 'off'}`} />
          {ollamaConnected === null ? 'Ollama …' : ollamaConnected ? `Ollama · ${modelName ?? 'connected'}` : 'Ollama offline'}
        </span>
        {models.length > 0 && <span className="status-item muted">{models.length} models</span>}
      </div>
      <div className="status-right">
        <span className="status-item">{ws.workspaceRoot ? ws.rootName : 'No folder'}</span>
        <span className="status-item">UTF-8</span>
      </div>
    </footer>
  );
};

interface BodyLayoutProps {
  showAi: boolean;
  showTerminal: boolean;
  setShowAi: (v: boolean) => void;
  setShowTerminal: (v: boolean) => void;
  onOpenSettings: () => void;
}

const BodyLayout: React.FC<BodyLayoutProps> = ({ showAi, showTerminal, setShowAi, setShowTerminal, onOpenSettings }) => {
  return (
    <main className="body">
      <nav className="sidebar-pane"><FileExplorer /></nav>
      <section className="main-pane">
        <EditorArea />
        {showTerminal && <TerminalPanel />}
      </section>
      {showAi && (
        <aside className="ai-pane"><AIAssistant /></aside>
      )}
      <div className="activity-bar">
        <button title="Explorer" className="activity-btn emoji">🗂</button>
        <button
          title="AI Assistant"
          className={`activity-btn ${showAi ? 'active' : ''}`}
          onClick={() => setShowAi(!showAi)}
        >
        <span className="activity-ai">AI</span>
        </button>
        <button
          title="Terminal"
          className={`activity-btn ${showTerminal ? 'active' : ''}`}
          onClick={() => setShowTerminal(!showTerminal)}
        >
          <span className="activity-term">&gt;_</span>
        </button>
        <div className="activity-spacer" />
        <button title="Settings" className="activity-btn" onClick={onOpenSettings}>
          <span className="activity-settings">⚙</span>
        </button>
      </div>
    </main>
  );
};

const AppInner: React.FC = () => {
  const [showAi, setShowAi] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { notices, dismissNotice } = useCmplx();

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="titlebar-left">
          <span className="brandmark">CMPLX</span>
          <span className="app-title">CMPLX Studio</span>
        </div>
        <div className="titlebar-actions">
          <button className="tb-btn" onClick={() => setSettingsOpen(true)}>⚙ Settings</button>
        </div>
      </header>

      <BodyLayout
        showAi={showAi}
        showTerminal={showTerminal}
        setShowAi={setShowAi}
        setShowTerminal={setShowTerminal}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <StatusBar />

      <div className="notices">
        {notices.map((n) => (
          <div key={n.id} className={`notice ${n.type}`} onClick={() => dismissNotice(n.id)}>
            {n.message}
          </div>
        ))}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <CmplxProvider>
      <AppInner />
    </CmplxProvider>
  );
};

export default App;