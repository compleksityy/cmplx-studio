export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function isOk<T>(r: Result<T>): r is { ok: true; value: T } {
  return r.ok === true;
}

export function langFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'ts': return 'typescript';
    case 'tsx': return 'typescript';
    case 'js': return 'javascript';
    case 'jsx': return 'javascript';
    case 'jsx?': return 'javascript';
    case 'mjs': return 'javascript';
    case 'cjs': return 'javascript';
    case 'json': return 'json';
    case 'jsonc': return 'json';
    case 'md': return 'markdown';
    case 'mdx': return 'markdown';
    case 'html': return 'html';
    case 'htm': return 'html';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'less': return 'less';
    case 'py': return 'python';
    case 'rs': return 'rust';
    case 'go': return 'go';
    case 'java': return 'java';
    case 'c': return 'c';
    case 'h': return 'c';
    case 'cpp': return 'cpp';
    case 'cc': return 'cpp';
    case 'hpp': return 'cpp';
    case 'cs': return 'csharp';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    case 'sh': return 'shell';
    case 'bash': return 'shell';
    case 'zsh': return 'shell';
    case 'yml': return 'yaml';
    case 'yaml': return 'yaml';
    case 'toml': return 'toml';
    case 'xml': return 'xml';
    case 'svg': return 'xml';
    case 'sql': return 'sql';
    case 'graphql': return 'graphql';
    case 'gql': return 'graphql';
    case 'vue': return 'vue';
    case 'svelte': return 'svelte';
    case 'astro': return 'astro';
    case 'swift': return 'swift';
    case 'kt': return 'kotlin';
    case 'kts': return 'kotlin';
    case 'lua': return 'lua';
    case 'r': return 'r';
    case 'txt': return 'plaintext';
    case 'log': return 'plaintext';
    case 'csv': return 'csv';
    case 'ini': return 'ini';
    case 'conf': return 'ini';
    case 'el': return 'elixir';
    case 'ex': return 'elixir';
    case 'exs': return 'elixir';
    case 'hs': return 'haskell';
    case 'dart': return 'dart';
    case 'clj': return 'clojure';
    case 'cljs': return 'clojure';
    default: return 'plaintext';
  }
}

export function baseName(p: string): string {
  const parts = p.split(/[\/\\]/);
  const last = parts[parts.length - 1];
  return last === '' && parts.length > 1 ? parts[parts.length - 2] : last;
}

export function isDirectoryPath(p: string): boolean {
  return p.endsWith('/');
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export function cleanNamePath(pathStr: string): string {
  return pathStr.replace(/^\/+/, '').replace(/\\/g, '/');
}

export function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const languageDisplayNames: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  php: 'PHP',
  ruby: 'Ruby',
  shell: 'Shell',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  sql: 'SQL',
  graphql: 'GraphQL',
  vue: 'Vue',
  svelte: 'Svelte',
  plaintext: 'Plain Text',
  ini: 'INI',
  csv: 'CSV'
};

export function getFileExtensionLabel(lang: string): string {
  return languageDisplayNames[lang] || lang;
}