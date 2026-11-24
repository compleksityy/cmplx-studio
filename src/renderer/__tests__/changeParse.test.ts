import { describe, it, expect } from 'vitest';
import { parseChangeSet, isDeleteEdit, DELETE_MARKER, stripChangeBlock } from '../changeParse';

describe('parseChangeSet', () => {
  it('parses a valid PROPOSED_CHANGES block', () => {
    const content = `Here you go:

\`\`\`json
PROPOSED_CHANGES
{
  "message": "Add a greeting util",
  "edits": [
    { "path": "src/utils.ts", "content": "export const hi = 1;", "summary": "added util" }
  ]
}
\`\`\`
Done.`;
    const change = parseChangeSet(content);
    expect(change).not.toBeNull();
    expect(change!.edits).toHaveLength(1);
    expect(change!.edits[0].path).toBe('src/utils.ts');
    expect(change!.edits[0].content).toBe('export const hi = 1;');
    expect(change!.message).toBe('Add a greeting util');
  });

  it('supports multiple file edits with a leading path', () => {
    const content = [
      '```json',
      'PROPOSED_CHANGES',
      '{',
      '  "message": "multi",',
      '  "edits": [', 
      '    { "path": "a.ts", "content": "a", "summary": "1" },',
      '    { "path": "/b/c.ts", "content": "c", "summary": "2" }',
      '  ]',
      '}',
      '```'
    ].join('\n');
    const change = parseChangeSet(content);
    expect(change).not.toBeNull();
    expect(change!.edits).toHaveLength(2);
    // leading slash is stripped
    expect(change!.edits[1].path).toBe('b/c.ts');
  });

  it('returns null when there is no marker', () => {
    expect(parseChangeSet('just some prose')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const content = '```json\nPROPOSED_CHANGES\n{ not valid json\n```';
    expect(parseChangeSet(content)).toBeNull();
  });

  it('returns null when edits is empty', () => {
    const content = '```json\nPROPOSED_CHANGES\n{"message":"x","edits":[]}\n```';
    expect(parseChangeSet(content)).toBeNull();
  });

  it('returns null when edits have no path or no content', () => {
    const content = '```json\nPROPOSED_CHANGES\n{"edits":[{"path":"","content":"x"}]}\n```';
    expect(parseChangeSet(content)).toBeNull();
  });

  it('handles an unmarked plain json fence with PROPOSED_CHANGES on second line', () => {
    const content = [
      '```',
      'PROPOSED_CHANGES',
      '{"edits":[{"path":"x.ts","content":"z"}]}',
      '```'
    ].join('\n');
    const change = parseChangeSet(content);
    expect(change).not.toBeNull();
    expect(change!.edits[0].path).toBe('x.ts');
  });

  it('parses the inline (unfenced) form with nested braces in the JSON', () => {
    const content =
      'PROPOSED_CHANGES {"message": "Created a Fibonacci generator", "edits": [ { "path": "test/fib.py", "content": "def fibonacci(n):\\n    if n <= 0:\\n        return []", "summary": "created" } ]}';
    const change = parseChangeSet(content);
    expect(change).not.toBeNull();
    expect(change!.edits).toHaveLength(1);
    expect(change!.edits[0].path).toBe('test/fib.py');
    expect(change!.edits[0].content).toContain('def fibonacci(n):');
  });
});

describe('isDeleteEdit', () => {
  it('detects the delete marker', () => {
    expect(isDeleteEdit({ content: DELETE_MARKER })).toBe(true);
    expect(isDeleteEdit({ content: 'real code' })).toBe(false);
  });
});

describe('stripChangeBlock', () => {
  it('removes the PROPOSED_CHANGES block and keeps prose', () => {
    const content = [
      "I'll create a lightweight test framework.",
      '```json',
      'PROPOSED_CHANGES',
      '{',
      '  "message": "add util",',
      '  "edits": [ { "path": "a.py", "content": "x", "summary": "s" } ]',
      '}',
      '```',
      'Done.'
    ].join('\n');
    const stripped = stripChangeBlock(content);
    expect(stripped).toContain("I'll create a lightweight test framework.");
    expect(stripped).toContain('Done.');
    expect(stripped).not.toContain('PROPOSED_CHANGES');
    expect(stripped).not.toContain('"edits"');
  });

  it('leaves plain prose unchanged', () => {
    const content = 'Just explaining something, no file changes.';
    expect(stripChangeBlock(content)).toBe(content);
  });

  it('handles the raw JSON with escaped newlines the model can emit', () => {
    const content =
      'Here is the project.\n```json\nPROPOSED_CHANGES\n{"message":"m","edits":[{"path":"test/__init__.py","content":"# Lightweight Test\\nFramework # Author: CMPLX","summary":"s"}]}\n```';
    const stripped = stripChangeBlock(content);
    expect(stripped).toContain('Here is the project.');
    expect(stripped).not.toContain('PROPOSED_CHANGES');
  });

  it('strips the inline (unfenced) form and keeps surrounding prose', () => {
    const content =
      'I have created the project.\n\nPROPOSED_CHANGES {"message":"fine","edits":[{"path":"test/fib.py","content":"# code"}]}\n\nLet me know if you want more.';
    const stripped = stripChangeBlock(content);
    expect(stripped).toContain('I have created the project.');
    expect(stripped).toContain('Let me know if you want more.');
    expect(stripped).not.toContain('PROPOSED_CHANGES');
    expect(stripped).not.toContain('"edits"');
  });

  it('hides a partial in-progress block while streaming', () => {
    const content = 'Creating:\nPROPOSED_CHANGES {"message"; // still streaming, no complete JSON';
    const stripped = stripChangeBlock(content);
    expect(stripped).not.toContain('PROPOSED_CHANGES');
    expect(stripped).toContain('Creating:');
  });
});