import React, { useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import '../monacoSetup';
import { useCmplx } from '../store';
import { langFromPath, baseName, getFileExtensionLabel } from '../utils';

interface Props {
  filePath: string;
}

export const CodeEditor: React.FC<Props> = ({ filePath }) => {
  const { files, updateFileContent, reloadFile, revertFile, saveFile, settings } = useCmplx();
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const file = files[filePath];
  const language = file?.language || langFromPath(filePath);
  const content = file?.content ?? '';
  const isDirty = file?.isDirty ?? false;
  const fontSize = settings?.fontSize || 14;
  const tabSize = settings?.tabSize || 2;
  const theme = settings?.editorTheme === 'light' ? 'light' : 'cmplx-dark';

  const handleMount: OnMount = (editor, monaco) => {
    monaco.editor.defineTheme('cmplx-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0a0c',
        'editor.foreground': '#e2e2e6',
        'editor.lineHighlightBackground': '#141418',
        'editorLineNumber.foreground': '#3f3f46',
        'editorLineNumber.activeForeground': '#b9b9c2',
        'editorCursor.foreground': '#ffffff',
        'editor.selectionBackground': '#3f3f46',
        'editor.inactiveSelectionBackground': '#2a2a30',
        'editorWhitespace.foreground': '#2a2a30',
        'editorIndentGuide.background1': '#1c1c21',
        'editorIndentGuide.activeBackground1': '#313138',
        'editorWidget.background': '#17171b',
        'editorWidget.border': '#2d2d34',
        'editorSuggestWidget.background': '#17171b',
        'editorSuggestWidget.border': '#2d2d34',
        'editorSuggestWidget.selectedBackground': '#2a2a30',
        'input.background': '#101013',
        'dropdown.background': '#17171b',
        'list.activeSelectionBackground': '#2a2a30',
        'list.hoverBackground': '#1c1c21',
        'editorGutter.background': '#0a0a0c',
        'editor.lineHighlightBorder': '#00000000',
        'scrollbarSlider.background': '#2a2a30',
        'scrollbarSlider.hoverBackground': '#3a3a42',
        'scrollbarSlider.activeBackground': '#4a4a52'
      }
    });
    editor.onDidChangeCursorPosition((e) => {
      setCursor({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  return (
    <div className="code-editor">
      <div className="editor-toolbar">
        <span className="file-path" title={filePath}>{baseName(filePath)}</span>
        <span className="file-lang">{getFileExtensionLabel(language)}</span>
        {isDirty && <span className="dirty-chip">Unsaved</span>}
        <div className="toolbar-spacer" />
        {isDirty && (
          <button className="toolbar-btn accent" onClick={() => saveFile(filePath)} title="Save (Ctrl+S)">Save</button>
        )}
        <button className="toolbar-btn" onClick={() => reloadFile(filePath)} title="Reload from disk">Reload</button>
        {isDirty && (
          <button className="toolbar-btn" onClick={() => revertFile(filePath)} title="Discard changes">Revert</button>
        )}
      </div>

      <div className="editor-body">
        <Editor
          height="100%"
          path={filePath}
          language={language}
          value={content}
          theme={theme}
          onMount={handleMount}
          onChange={(value) => updateFileContent(filePath, value ?? '')}
          options={{
            fontSize,
            tabSize,
            insertSpaces: true,
            detectIndentation: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
            folding: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderLineHighlight: 'all',
            padding: { top: 10, bottom: 10 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            wordWrap: 'off',
            renderWhitespace: 'selection'
          }}
        />
      </div>

      <div className="editor-statusbar">
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span className="spacer" />
        <span className="lang-label">{getFileExtensionLabel(language)}</span>
        <span className="spacer" />
        <span>{content.length.toLocaleString()} chars</span>
        {isDirty && <span className="dirty-text">● unsaved</span>}
      </div>
    </div>
  );
};

export default CodeEditor;