import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useCmplx } from '../store';
import { isOk } from '../utils';
import api from '../api';

export const TerminalPanel: React.FC = () => {
  const { ws, setActiveTerminalId, settings } = useCmplx();
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const fontSize = settings?.terminalFontSize || 13;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontSize,
      fontFamily: "'Geist Mono', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: '#0a0a0c',
        foreground: '#d4d4d8',
        cursor: '#ffffff',
        selectionBackground: '#3f3f46'
      },
      scrollback: 5000
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    xtermRef.current = term;

    const unsubscribeData = api.onTerminalData(({ id, data }) => {
      if (sessionIdRef.current === id) {
        term.write(data);
      }
    });
    const unsubscribeExit = api.onTerminalExit(({ id, exitCode }) => {
      if (sessionIdRef.current === id) {
        term.write(`\r\n\x1b[90m[process exited with code ${exitCode}]\x1b[0m\r\n`);
      }
    });

    term.onData((data) => {
      if (sessionIdRef.current) {
        api.terminalWrite(sessionIdRef.current, data);
      }
    });

    const startSession = async () => {
      const cwd = ws?.workspaceRoot || undefined;
      const res = await api.terminalCreate({ cwd });
      if (isOk(res) && res.value) {
        sessionIdRef.current = res.value.id;
        setActiveTerminalId(res.value.id);
        term.write(`\x1b[90mCMPLX terminal (cwd: ${res.value.cwd})\x1b[0m\r\n`);
      } else if (!isOk(res)) {
        term.write(`\r\n\x1b[91m${res.error}\x1b[0m\r\n`);
      }
      requestAnimationFrame(() => fit.fit());
    };
    startSession();

    // Resize handling
    const onResize = () => {
      if (sessionIdRef.current) {
        try { fit.fit(); } catch { /* ignore */ }
        const cols = term.cols;
        const rows = term.rows;
        if (cols && rows) api.terminalResize(sessionIdRef.current, cols, rows);
      }
    };
    window.addEventListener('resize', onResize);

    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      unsubscribeData();
      unsubscribeExit();
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      if (sessionIdRef.current) {
        api.terminalKill(sessionIdRef.current);
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update font size when settings change.
  useEffect(() => {
    const term = xtermRef.current;
    if (term) {
      term.options.fontSize = fontSize;
    }
  }, [fontSize]);

  return (
    <div className="terminal-panel">
      <div className="terminal-titlebar">
        <span>TERMINAL</span>
        <span className="terminal-cwd">{ws?.workspaceRoot || 'no cwd'}</span>
      </div>
      <div className="terminal-host" ref={containerRef} />
    </div>
  );
};

export default TerminalPanel;