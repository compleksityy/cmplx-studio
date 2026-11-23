import { describe, it, expect } from 'vitest';
import { langFromPath, baseName, cleanNamePath, joinPath } from '../utils';

describe('langFromPath', () => {
  it('detects common languages', () => {
    expect(langFromPath('a.ts')).toBe('typescript');
    expect(langFromPath('a.tsx')).toBe('typescript');
    expect(langFromPath('a.js')).toBe('javascript');
    expect(langFromPath('a.json')).toBe('json');
    expect(langFromPath('a.md')).toBe('markdown');
    expect(langFromPath('a.html')).toBe('html');
    expect(langFromPath('a.css')).toBe('css');
    expect(langFromPath('a.py')).toBe('python');
    expect(langFromPath('a.rs')).toBe('rust');
    expect(langFromPath('a.go')).toBe('go');
    expect(langFromPath('a.sh')).toBe('shell');
    expect(langFromPath('a.yaml')).toBe('yaml');
  });

  it('defaults to plaintext for unknown extensions', () => {
    expect(langFromPath('file.xyz')).toBe('plaintext');
    expect(langFromPath('Makefile')).toBe('plaintext');
  });
});

describe('baseName', () => {
  it('returns the last path segment', () => {
    expect(baseName('src/main.ts')).toBe('main.ts');
    expect(baseName('/a/b/c.js')).toBe('c.js');
    expect(baseName('root')).toBe('root');
  });
});

describe('cleanNamePath', () => {
  it('strips leading slashes and normalizes backslashes', () => {
    expect(cleanNamePath('/src/a.ts')).toBe('src/a.ts');
    expect(cleanNamePath('src\\a.ts')).toBe('src/a.ts');
  });
});

describe('joinPath', () => {
  it('joins a dir and name', () => {
    expect(joinPath('src', 'a.ts')).toBe('src/a.ts');
    expect(joinPath('', 'a.ts')).toBe('a.ts');
  });
});