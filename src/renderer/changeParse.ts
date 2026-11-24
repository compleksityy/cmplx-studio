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

// Find the index just past the closing brace of the JSON object that begins
// at content[start], balancing nested braces while skipping over string
// literals (so braces inside a file's source text don't confuse us).
// Returns -1 if the object is unbalanced.
function findJsonObjectEnd(content: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

// The assistant emits a change set in either form:
//   1. fenced:  ```json\nPROPOSED_CHANGES\n{...}\n```
//   2. inline:  PROPOSED_CHANGES {...}
// Return the {start, end} span of the JSON object (start is the '{', end is
// just past the matching '}'), or null if no change set is present.
function findChangeJson(content: string): { start: number; end: number } | null {
  const idx = content.indexOf('PROPOSED_CHANGES');
  if (idx < 0) return null;
  // The object may be a few spaces after the marker.
  const start = content.indexOf('{', idx);
  if (start < 0) return null;
  const end = findJsonObjectEnd(content, start);
  if (end < 0) return null;
  return { start, end };
}

export function parseChangeSet(content: string): FileChangeSet | null {
  if (!content || typeof content !== 'string') return null;
  const span = findChangeJson(content);
  if (!span) return null;
  let parsed: { message?: string; edits?: RawEdit[] };
  try {
    parsed = JSON.parse(content.slice(span.start, span.end).trim());
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

// Remove a PROPOSED_CHANGES block from a message so only the model's prose
// (and any prose after the block) is shown in the chat; the change set is
// surfaced via the review card / auto-apply status instead of as raw JSON.
// Handles both the fenced and inline forms, including while the JSON is still
// streaming in (cut the whole tail from the marker onward when incomplete).
export function stripChangeBlock(content: string): string {
  if (!content || typeof content !== 'string') return content;
  const idx = content.indexOf('PROPOSED_CHANGES');
  if (idx < 0) return content.trim();

  const span = findChangeJson(content);
  if (span) {
    // Complete block: remove just the JSON object, plus an opening fence and
    // a trailing ``` marker so no fence residue remains.
    const before = content.slice(0, idx);
    const opened = content.lastIndexOf('```', idx);
    let keep = opened > 0 ? content.slice(0, opened) : before;
    let after = content.slice(span.end);
    const fence = after.match(/^\s*```/);
    if (fence) after = after.slice(fence[0].length);
    return (keep + after).replace(/\n{3,}/g, '\n\n').trim();
  }

  // Incomplete (still streaming / truncated): hide everything from the marker
  // onward, including a lone opening fence just before it.
  let cut = idx;
  const pipeFence = content.lastIndexOf('```', idx);
  if (pipeFence > 0) {
    const lineStart = content.lastIndexOf('\n', pipeFence - 1) + 1;
    const above = content.slice(lineStart, idx).trim();
    if (/^```(?:json|changes)?\s*/i.test(above) || above.length < 20) {
      cut = lineStart;
    }
  }
  return content.slice(0, cut).replace(/\n{3,}/g, '\n\n').trim();
}