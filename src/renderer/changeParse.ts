import type { FileChangeSet } from '../shared/types';

// Marker the AI uses to propose file changes; content equal to DELETE_MARKER
// signals that the file should be deleted rather than written.
export const CHANGE_MARKER = 'PROPOSED_CHANGES';
export const DELETE_MARKER = '__CMPLX_DELETE_FILE__';

export interface RawEdit {
  path: string;
  content: string;
  summary?: string;
}

export function parseChangeSet(content: string): FileChangeSet | null {
  if (!content || typeof content !== 'string') return null;
  // Find a fenced block that starts with our JSON marker.
  const marker = /```(?:json|changes)?[\s]*\n?\s*(?:PROPOSED_CHANGES)\s*\n([\s\S]*?)```/;
  const m = content.match(marker);
  if (!m) return null;
  let parsed: { message?: string; edits?: RawEdit[] };
  try {
    parsed = JSON.parse(m[1].trim());
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.edits) || parsed.edits.length === 0) return null;

  const edits = parsed.edits
    .filter((e) => e && typeof e.path === 'string' && e.path.trim() && typeof e.content === 'string')
    .map((e) => ({
      path: e.path.replace(/^[\\/]+/, '').replace(/\\/g, '/'),
      content: e.content,
      summary: typeof e.summary === 'string' ? e.summary : ''
    }));

  if (edits.length === 0) return null;

  return {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)),
    edits,
    message: typeof parsed.message === 'string' ? parsed.message : ''
  };
}

// True when a proposed edit means "delete this file" rather than "write it".
export function isDeleteEdit(edit: { content: string }): boolean {
  return edit.content === DELETE_MARKER;
}