import React, { useState } from 'react';
import { useCmplx } from '../store';

interface Props {
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ onClose }) => {
  const { settings, setSettings, checkOllama, toast } = useCmplx();
  const [endpoint, setEndpoint] = useState(settings?.ollamaEndpoint || 'http://localhost:11434');
  const [fontSize, setFontSize] = useState(settings?.fontSize || 14);
  const [tabSize, setTabSize] = useState(settings?.tabSize || 2);
  const [terminalFontSize, setTerminalFontSize] = useState(settings?.terminalFontSize || 13);
  const [terminalShell, setTerminalShell] = useState(settings?.terminalShell || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setSettings({
        ollamaEndpoint: endpoint.trim() || 'http://localhost:11434',
        fontSize: Number(fontSize) || 14,
        tabSize: Number(tabSize) || 2,
        terminalFontSize: Number(terminalFontSize) || 13,
        terminalShell: terminalShell.trim()
      });
      await checkOllama();
      toast('Settings saved', 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="settings-body">
          <div className="setting-group">
            <h4>AI / Ollama</h4>
            <label>Endpoint</label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://localhost:11434"
            />
            <p className="muted">The Ollama API runs by default at localhost:11434.</p>
          </div>

          <div className="setting-group">
            <h4>Editor</h4>
            <div className="setting-row">
              <label>Font size</label>
              <input type="number" value={fontSize} min={8} max={32} onChange={(e) => setFontSize(Number(e.target.value))} />
            </div>
            <div className="setting-row">
              <label>Tab size</label>
              <input type="number" value={tabSize} min={1} max={8} onChange={(e) => setTabSize(Number(e.target.value))} />
            </div>
          </div>

          <div className="setting-group">
            <h4>Terminal</h4>
            <div className="setting-row">
              <label>Font size</label>
              <input type="number" value={terminalFontSize} min={8} max={32} onChange={(e) => setTerminalFontSize(Number(e.target.value))} />
            </div>
            <div className="setting-row">
              <label>Shell</label>
              <input
                type="text"
                value={terminalShell}
                onChange={(e) => setTerminalShell(e.target.value)}
                placeholder="Auto-detect (PowerShell on Windows)"
              />
            </div>
          </div>
        </div>
        <div className="settings-footer">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;