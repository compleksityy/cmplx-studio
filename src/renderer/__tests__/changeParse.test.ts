import { describe, it, expect } from 'vitest';
import { parseChangeSet, isDeleteEdit, DELETE_MARKER } from '../changeParse';

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
});

describe('isDeleteEdit', () => {
  it('detects the delete marker', () => {
    expect(isDeleteEdit({ content: DELETE_MARKER })).toBe(true);
    expect(isDeleteEdit({ content: 'real code' })).toBe(false);
  });
});