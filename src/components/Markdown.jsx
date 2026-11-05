import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CopyButton from './CopyButton.jsx'

// Fenced code arrives as <pre><code>text</code></pre>; inline code never goes through here.
function FencedCode({ children }) {
  return (
    <div className="copyable">
      <pre>{children}</pre>
      <CopyButton text={String(children?.props?.children ?? '').replace(/\n$/, '')} />
    </div>
  )
}

export default function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: FencedCode }}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
