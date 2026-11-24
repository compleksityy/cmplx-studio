import React, { useEffect, useRef, useState } from 'react';
import { useCmplx } from '../store';
import { isOk } from '../utils';
import { stripChangeBlock } from '../changeParse';
import { Markdown } from './Markdown';
import api from '../api';

interface SessionInfo {
  id: string;
  title: string;
  updatedAt: number;
}

function portOf(endpoint: string): number {
  try {
    const u = new URL(endpoint);
    return Number(u.port) || 11434;
  } catch {
    return 11434;
  }
}

export const AIAssistant: React.FC = () => {
  const {
    messages, isAiBusy, activeStreamId, sendMessage, cancelStream, clearConversation,
    models, ollamaConnected, settings, setSettings, checkOllama,
    pendingChange,
    loadSession, startNewSession, deleteSession, toast,
    ollamaStatus, ollamaBusy, startOllama, stopOllama, refreshOllamaStatus
  } = useCmplx();
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleRefreshModels = async () => {
    if (refreshingModels) return;
    setRefreshingModels(true);
    try {
      const ok = await checkOllama();
      if (ok) {
        toast('Ollama models refreshed', 'success');
      }
    } finally {
      setRefreshingModels(false);
    }
  };

  const connectedLabel = () => {
    if (ollamaConnected === null) return 'Checking…';
    if (!ollamaConnected) return 'Ollama offline';
    if (ollamaStatus?.startedByApp) return `Running (${portOf(ollamaStatus.endpoint)})`;
    return 'Ollama running';
  };

  const launchLabel = () => {
    if (ollamaBusy) return 'Working…';
    if (ollamaConnected) {
      return ollamaStatus?.startedByApp ? 'Stop Ollama' : 'Running';
    }
    return 'Start Ollama';
  };

  const launchTitle = () => {
    if (ollamaConnected && !ollamaStatus?.startedByApp) {
      return 'An Ollama instance was already running before CMPLX Studio — it is left untouched.';
    }
    return ollamaConnected ? 'Stop the Ollama instance started by CMPLX Studio' : 'Start the local Ollama service';
  };

  const handleOllamaToggle = async () => {
    if (ollamaBusy) return;
    if (ollamaConnected && ollamaStatus?.startedByApp) {
      await stopOllama();
    } else if (!ollamaConnected) {
      await startOllama();
    } else {
      // Already running via an external instance — just re-check + refresh.
      await refreshOllamaStatus();
      await checkOllama();
    }
  };

  const activeEndpointNote = () => {
    if (!ollamaConnected || !ollamaStatus?.endpoint) return null;
    const isFallback = portOf(ollamaStatus.endpoint) !== 11434;
    if (!isFallback) return null;
    return (
      <div className="endpoint-note">
        Using endpoint <code>{ollamaStatus.endpoint}</code> — port 11434 was already occupied.
      </div>
    );
  };

  const notInstalledWarning = () => {
    if (ollamaConnected || ollamaBusy) return null;
    // Only warn when we can confirm Ollama is not installed.
    if (ollamaStatus && ollamaStatus.running === false && ollamaStatus.exePath === null) {
      return (
        <div className="endpoint-note warn">
          Ollama does not appear to be installed. Download it from{' '}
          <a href="https://ollama.com/download" onClick={(e) => { e.preventDefault(); toast('Open ollama.com/download to install Ollama'); }}>ollama.com/download</a>
          , then start it here.
        </div>
      );
    }
    return null;
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pendingChange]);

  const refreshSessions = async () => {
    try {
      const res = await api.sessionsList();
      if (isOk(res)) setSessions(res.value);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refreshSessions();
  }, [messages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAiBusy) return;
    await sendMessage(input);
    setInput('');
  };

  const saveConversation = async () => {
    if (messages.length === 0) return;
    try {
      const res = await api.sessionsSave(undefined, messages);
      if (isOk(res)) {
        toast('Conversation saved', 'success');
        refreshSessions();
      } else toast(res.error, 'error');
    } catch (e: any) { toast(e.message, 'error'); }
  };

  const handleDeleteSession = async (id: string) => {
    if (!window.confirm('Delete this saved conversation?')) return;
    await deleteSession(id);
    refreshSessions();
  };

  const modelValue = settings?.ollamaModel || '';

  return (
    <div className="ai-assistant">
      <div className="assistant-header">
        <span className="section-label">ASSISTANT</span>
        <div className="assistant-actions">
          <button className="icon-btn" title="New conversation" onClick={startNewSession}>＋</button>
          <button className="icon-btn" title="Save conversation" onClick={saveConversation}>💾</button>
          <button className="icon-btn" title="History" onClick={() => { setShowHistory(!showHistory); refreshSessions(); }}>▤</button>
          {messages.length > 0 && (
            <button className="icon-btn" title="Clear" onClick={clearConversation}>✕</button>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="history-panel">
          <div className="history-title">Saved conversations</div>
          {sessions.length === 0 && <p className="muted">No saved conversations yet.</p>}
          {sessions.map((s) => (
            <div className="session-item" key={s.id}>
              <button className="session-load" onClick={() => { loadSession(s.id); setShowHistory(false); }}>
                {s.title}
              </button>
              <button className="session-del" onClick={() => handleDeleteSession(s.id)} title="Delete">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="model-row">
        <span className={`status-dot ${ollamaConnected === null ? 'unknown' : ollamaConnected ? 'online' : 'offline'}`} />
        <span className="status-text">
          {connectedLabel()}
        </span>
        <select
          className="model-select"
          value={modelValue}
          aria-label="Ollama model"
          onChange={(e) => {
            setSettings({ ollamaModel: e.target.value });
          }}
          disabled={refreshingModels}
        >
          {models.length === 0 ? (
            <option value={modelValue}>{modelValue || 'No models found'}</option>
          ) : (
            models.map((m) => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))
          )}
        </select>
        <button
          className="icon-btn"
          title={refreshingModels ? 'Refreshing…' : 'Refresh models'}
          onClick={handleRefreshModels}
          disabled={refreshingModels}
        >
          {refreshingModels ? '…' : '⟳'}
        </button>
        <button
          className={`ollama-launch-btn ${ollamaConnected ? (ollamaStatus?.startedByApp ? 'running-ours' : 'running') : ''} ${ollamaBusy ? 'busy' : ''}`}
          onClick={handleOllamaToggle}
          disabled={ollamaBusy}
          title={launchTitle()}
        >
          {launchLabel()}
        </button>
      </div>

      {activeEndpointNote()}
      {notInstalledWarning()}
      {models.length === 0 && ollamaConnected && (
        <div className="model-hint">No models detected — pull a model with <code>ollama pull &lt;name&gt;</code> then refresh.</div>
      )}

      <div className="messages-container" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <h2 className="empty-title">AI Assistant</h2>
            <p>Ask me to explain, write, refactor or debug code in the open project. I can create and edit files as reviewable changes.</p>
            <p className="muted">Pick a model above (default: qwen3-coder:30b) and start typing.</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-avatar">{m.role === 'user' ? 'U' : 'AI'}</div>
            <div className="msg-bubble">
              <div className="msg-bubble-inner">
                {m.role === 'assistant' ? (
                  <Markdown content={stripChangeBlock(m.content)} />
                ) : (
                  <Markdown content={m.content} />
                )}
              </div>
              {m.error && <div className="msg-error">⚠ {m.error}</div>}
              {m.id === activeStreamId && <span className="streaming-caret" />}
              {m.role === 'assistant' && !m.content && isAiBusy && <span className="typing">thinking…</span>}
            </div>
          </div>
        ))}

        {pendingChange && <ChangeReview key={pendingChange.id} />}
      </div>

      <form className="input-container" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isAiBusy ? 'Generating… (or press Stop)' : 'Ask about the code, request changes…'}
          disabled={isAiBusy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <div className="input-buttons">
          {isAiBusy ? (
            <button type="button" className="stop-btn" onClick={cancelStream}>Stop</button>
          ) : (
            <button type="submit" className="send-btn" disabled={!input.trim()}>Send</button>
          )}
        </div>
      </form>
    </div>
  );
};

const ChangeReview: React.FC = () => {
  const { pendingChange, acceptChange, rejectChange, settings } = useCmplx();
  if (!pendingChange) return null;
  const fs = settings?.fontSize || 13;
  return (
    <div className="change-review">
      <div className="cr-header">
        <span className="cr-title">Proposed changes ({pendingChange.edits.length})</span>
        <div className="cr-actions">
          <button className="ghost" onClick={rejectChange}>Reject</button>
          <button className="primary" onClick={() => acceptChange(pendingChange)}>Apply all</button>
        </div>
      </div>
      <div className="cr-message">{pendingChange.message}</div>
      <div className="cr-edits">
        {pendingChange.edits.map((edit) => (
          <div className="cr-edit" key={edit.path}>
            <div className="cr-edit-head">
              <span className="cr-file">{edit.path}</span>
              <span className="cr-summary">{edit.summary}</span>
            </div>
            <pre className="cr-snippet" style={{ fontSize: `${fs - 1}px` }}>{edit.content.slice(0, 1200)}{edit.content.length > 1200 ? '\n…' : ''}</pre>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AIAssistant;