import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownProps {
  content: string;
}

// Renders a chat message body as Markdown with GitHub-flavoured tables,
// code-block syntax highlighting and the app's glassmorphism styling.
export const Markdown: React.FC<MarkdownProps> = ({ content }) => {
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Keep code blocks as compact glass surfaces.
          pre: ({ children }) => <pre className="md-pre">{children}</pre>,
          p: ({ children }) => <p>{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};