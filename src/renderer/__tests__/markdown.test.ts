import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../components/Markdown';

const render = (content: string) =>
  renderToStaticMarkup(createElement(Markdown, { content }));

// Server-side render through the real component to verify the full
// react-markdown + remark-gfm + rehype-highlight pipeline.
describe('Markdown', () => {
  it('renders headings, bold and inline code', () => {
    const html = render('# Title\n\nSome **bold** and `code` here.');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders lists and GFM tables', () => {
    const html = render('- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>x</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('syntax-highlights a fenced code block', () => {
    const html = render('```python\ndef hello():\n    return 42\n```');
    expect(html).toContain('hljs');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('def');
  });

  it('does not render a stripped PROPOSED_CHANGES block', () => {
    const block = /```(?:json)?\s*\n?\s*PROPOSED_CHANGES\s*\n[\s\S]*?```/;
    const stripped = "Here is the project.\n\n```json\nPROPOSED_CHANGES\n{\"edits\":[]}\n```".replace(block, '');
    const html = render(stripped);
    expect(html).not.toContain('PROPOSED_CHANGES');
  });
});