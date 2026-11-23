import React, { useState } from 'react';
import { useCmplx } from '../store';

interface TreeProps {
  node: any;
  depth: number;
  onContext: (e: React.MouseEvent, path: string, type: 'file' | 'directory') => void;
}

const TreeRow: React.FC<TreeProps> = ({ node, depth, onContext }) => {
  const { openTab, tabs, activeTabId } = useCmplx();
  const [expanded, setExpanded] = useState(false);

  const isDir = node.type === 'directory';
  const isActiveFile = !isDir && tabs.some((t) => t.filePath === node.path && t.id === activeTabId);

  const color = node.name.endsWith('.ts') || node.name.endsWith('.tsx') ? 'ts'
    : node.name.endsWith('.js') || node.name.endsWith('.jsx') ? 'js'
    : node.name.endsWith('.json') ? 'json' : 'normal';

  const onClick = async () => {
    if (isDir) {
      setExpanded((x) => !x);
    } else {
      await openTab(node.path);
    }
  };

  return (
    <>
      <div
        className={`tree-row ${isActiveFile ? 'active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={onClick}
        onContextMenu={(e) => onContext(e, node.path, isDir ? 'directory' : 'file')}
        title={node.path}
      >
        <span className="tree-caret">{isDir ? (expanded ? '▾' : '▸') : ''}</span>
        <span className={`tree-icon ${isDir ? 'dir' : color}`}>
          {isDir ? '▤' : '•'}
        </span>
        <span className="tree-name">{node.name}</span>
      </div>
      {isDir && expanded && (
        <div className="tree-children">
          {node.children?.map((child: any) => (
            <TreeRow key={child.path} node={child} depth={depth + 1} onContext={onContext} />
          ))}
        </div>
      )}
    </>
  );
};

export const FileExplorer: React.FC = () => {
  const { ws, openFolder, refreshTree, createFile, createDirectory, renamePath, deletePath } = useCmplx();
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; type: 'file' | 'directory' } | null>(null);
  const [dialog, setDialog] = useState<{ type: 'file' | 'directory' | 'rename'; parentDir: string; target?: string } | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

  const rootNode = ws.root;

  const handleContext = (e: React.MouseEvent, path: string, type: 'file' | 'directory') => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, path, type });
  };

  const askConfirmation = async (path: string, isDir: boolean): Promise<boolean> => {
    // Use a renderer confirm for destructive action.
    const ok = window.confirm(`Delete ${isDir ? 'folder ' : 'file '} "${path}"? This cannot be undone.`);
    return ok;
  };

  const closeMenus = () => {
    setMenu(null);
    setDialog(null);
    setCreatingNew(false);
  };

  const submitCreate = async () => {
    const name = nameInput.trim();
    if (!name) return;
    if (dialog?.type === 'file') {
      const ok = await createFile(dialog.parentDir, name);
      if (ok) { closeMenus(); }
    } else if (dialog?.type === 'directory') {
      const ok = await createDirectory(dialog.parentDir, name);
      if (ok) { closeMenus(); }
    } else if (dialog?.type === 'rename' && dialog.target) {
      const ok = await renamePath(dialog.target, name);
      if (ok) { closeMenus(); }
    }
  };

  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <span className="section-label">EXPLORER</span>
        <div className="header-actions">
          <button
            className="icon-btn"
            title="Open folder"
            onClick={() => openFolder()}
          >
            ＋
          </button>
          {ws.workspaceRoot && (
            <button
              className="icon-btn"
              title="Refresh"
              onClick={() => refreshTree()}
            >
              ⟳
            </button>
          )}
        </div>
      </div>

      {ws.workspaceRoot ? (
        <div className="workspace-top">
          <span className="workspace-name">{ws.rootName}</span>
        </div>
      ) : (
        <div className="explorer-empty">
          <p>No folder open</p>
          <button className="open-folder-btn" onClick={() => openFolder()}>
            Open Project Folder
          </button>
          <p className="muted">Browse, edit and manage your code.</p>
        </div>
      )}

      <div className="tree" onClick={() => setMenu(null)}>
        {rootNode && <TreeRow node={rootNode} depth={0} onContext={handleContext} />}
      </div>

      {/* context menu */}
      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.type === 'directory' && (
            <>
              <button onClick={() => { setDialog({ type: 'file', parentDir: menu.path }); setNameInput(''); setMenu(null); setCreatingNew(true); }}>
                New File
              </button>
              <button onClick={() => { setDialog({ type: 'directory', parentDir: menu.path }); setNameInput(''); setMenu(null); setCreatingNew(true); }}>
                New Folder
              </button>
              <div className="ctx-sep" />
              <button onClick={() => { setDialog({ type: 'rename', parentDir: '', target: menu.path }); setNameInput(menu.path.split('/').pop() || ''); setMenu(null); }}>
                Rename
              </button>
              <button
                className="danger"
                onClick={async () => {
                  const path = menu.path;
                  setMenu(null);
                  const confirmed = await askConfirmation(path, true);
                  if (confirmed) await deletePath(path);
                }}
              >
                Delete
              </button>
            </>
          )}
          {menu.type === 'file' && (
            <>
              <button onClick={() => { setDialog({ type: 'rename', parentDir: '', target: menu.path }); setNameInput(menu.path.split('/').pop() || ''); setMenu(null); }}>
                Rename
              </button>
              <button
                className="danger"
                onClick={async () => {
                  const path = menu.path;
                  setMenu(null);
                  const confirmed = await askConfirmation(path, false);
                  if (confirmed) await deletePath(path);
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* name dialog */}
      {(dialog || creatingNew) && (
        <div className="modal-overlay" onClick={closeMenus}>
          <div className="name-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>
              {dialog?.type === 'rename' ? 'Rename' : dialog?.type === 'directory' ? 'New Folder' : 'New File'}
            </h4>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') closeMenus(); }}
              placeholder="Name"
            />
            {dialog?.type === 'file' && dialog.parentDir && (
              <p className="muted">Will be created in: {dialog.parentDir}/</p>
            )}
            <div className="dialog-actions">
              <button className="ghost" onClick={closeMenus}>Cancel</button>
              <button className="primary" onClick={submitCreate}>OK</button>
            </div>
          </div>
        </div>
      )}

      <div className="explorer-footer">
        <span>{ws.root ? 'Project' : 'No project'} </span>
      </div>
    </div>
  );
};

export default FileExplorer;